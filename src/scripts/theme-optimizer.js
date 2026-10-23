/**
 * 主题切换综合性能优化器
 *
 * 整合功能：
 * 1. 代码块主题切换优化（Intersection Observer + 分批更新）
 * 2. 重型元素优化（临时禁用动画、隐藏屏幕外元素、GPU 加速）
 *
 * 核心优化策略：
 * - 只更新可见代码块，延迟屏幕外代码块
 * - 主题切换期间临时禁用重型元素动画和过渡
 * - 强制 GPU 合成层，减少重绘重排
 * - 使用 content-visibility 隐藏屏幕外元素
 */

class ThemeOptimizer {
	constructor() {
		// 代码块优化相关
		this.visibleBlocks = new Set();
		this.pendingThemeUpdate = null;
		this.codeBlockObserver = null;
		this.pageVersion = 0;
		this.batchFrame = this.batchTimer = null;
		this.restoreFrame = this.restoreNextFrame = null;
		this.swup = null;
		this.destroyed = false;

		// 从配置中获取是否在主题切换时隐藏代码块的设置
		this.hideCodeBlocksDuringTransition = true; // 默认值为true
		this.initFromConfig();

		// 性能优化相关
		this.isOptimizing = false;
		this.heavySelectors = [
			".float-panel",
			"#navbar",
			".music-player",
			"#mobile-toc-panel",
			"#nav-menu-panel",
			"#search-panel",
			".dropdown-content",
			".widget",
			".post-card",
			".custom-md",
		];

		this.init();
	}

	init() {
		// 从配置中初始化
		this.initFromConfig();

		// 初始化代码块优化
		this.initCodeBlockOptimization();

		// 初始化主题切换拦截
		this.interceptThemeSwitch();

		// 应用代码块过渡行为设置
		this.applyCodeBlockTransitionBehavior();

		// 设置 Swup 钩子以确保在页面切换时重新初始化
		this.setupSwupHooks();

		// 通知其他组件主题优化器已准备就绪
		document.dispatchEvent(new CustomEvent("themeOptimizerReady"));
	}

	// ==================== Swup 钩子设置 ====================

	setupSwupHooks() {
		this.beforeReplace = () => {
			this.cancelPageWork();
			this.cancelRestore();
			this.restoreStyles();
			this.isOptimizing = false;
		};
		this.refreshPage = () => {
			this.observeCodeBlocks();
			this.applyCodeBlockTransitionBehavior();
			this.forceApplyThemeTransitionStyles();
			if (document.documentElement.classList.contains("is-theme-transitioning"))
				this.optimizeThemeSwitch(document.documentElement.classList.contains("use-view-transition"));
		};
		this.connectSwup = () => {
			if (!window.swup || this.swup === window.swup || this.destroyed) return;
			this.disconnectSwup();
			this.swup = window.swup;
			this.swup.hooks.before("content:replace", this.beforeReplace);
			this.swup.hooks.on("content:replace", this.refreshPage);
		};
		this.connectSwup();
		document.addEventListener("swup:enable", this.connectSwup);
	}

	disconnectSwup() {
		this.swup?.hooks.off("content:replace", this.beforeReplace);
		this.swup?.hooks.off("content:replace", this.refreshPage);
		this.swup = null;
	}

	forceApplyThemeTransitionStyles() {
		// 强制应用主题切换样式，确保在页面切换后也能正确工作
		const codeBlocks = document.querySelectorAll(".expressive-code");

		codeBlocks.forEach((block) => {
			// 确保代码块有正确的类
			if (this.hideCodeBlocksDuringTransition) {
				block.classList.add("hide-during-transition");
			} else {
				block.classList.remove("hide-during-transition");
			}

		});

		// 检查当前是否处于主题切换状态
		const isTransitioning = document.documentElement.classList.contains(
			"is-theme-transitioning",
		);

		if (isTransitioning) {
			// 如果正在切换主题，确保样式立即应用
			codeBlocks.forEach((block) => {
				if (block.classList.contains("hide-during-transition")) {
					block.style.setProperty(
						"content-visibility",
						"hidden",
						"important",
					);
					block.style.setProperty("opacity", "0.99", "important");
				}
			});
		} else {
			// 如果不在切换状态，确保样式恢复正常
			codeBlocks.forEach((block) => {
				block.style.removeProperty("content-visibility");
				block.style.removeProperty("opacity");
			});
		}
	}

	// ==================== 配置初始化 ====================

	initFromConfig() {
		try {
			// 尝试从配置中获取设置
			// 检查是否已经有从配置中传递的设置
			const configCarrier = document.getElementById("config-carrier");
			if (
				configCarrier &&
				configCarrier.dataset.hideCodeBlocksDuringTransition !==
					undefined
			) {
				this.hideCodeBlocksDuringTransition =
					configCarrier.dataset.hideCodeBlocksDuringTransition ===
					"true";
			}
		} catch (error) {
			this.hideCodeBlocksDuringTransition = true; // 默认启用隐藏
		}
	}

	applyCodeBlockTransitionBehavior() {
		// 应用代码块在主题切换期间的行为设置
		const codeBlocks = document.querySelectorAll(".expressive-code");

		codeBlocks.forEach((block) => {
			if (this.hideCodeBlocksDuringTransition) {
				// 默认行为：添加类以便在主题切换时隐藏
				block.classList.add("hide-during-transition");
			} else {
				// 如果配置为不隐藏，移除类
				block.classList.remove("hide-during-transition");
			}
		});

		// 确保临时样式表中的规则与当前设置一致
		this.updateTempStyleSheet();
	}

	updateTempStyleSheet() {
		// 如果临时样式表存在，更新其内容以反映当前设置
		if (this.tempStyleSheet) {
			// 获取当前内容
			let content = this.tempStyleSheet.textContent;

			// 更新代码块隐藏规则
			const hideRule = `.is-theme-transitioning .expressive-code {
        content-visibility: hidden !important;
        /* 避免闪烁 */
        opacity: 0.99;
      }`;

			const showRule = `.is-theme-transitioning .expressive-code:not(.hide-during-transition) {
        /* 保持代码块可见，但禁用过渡效果 */
        content-visibility: visible !important;
        opacity: 1 !important;
      }`;

			// 检查是否已存在这些规则，如果不存在则添加
			if (!content.includes(".is-theme-transitioning .expressive-code")) {
				content += "\n" + hideRule + "\n" + showRule;
				this.tempStyleSheet.textContent = content;
			}
		}
	}

	// ==================== 代码块优化 ====================

	initCodeBlockOptimization() {
		// 创建 Intersection Observer 追踪可见代码块
		this.codeBlockObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (this.destroyed || !entry.target.isConnected) return;
					if (entry.isIntersecting) {
						this.visibleBlocks.add(entry.target);
						// 如果有待处理的主题更新，立即应用
						if (this.pendingThemeUpdate) {
							this.applyThemeToBlock(
								entry.target,
								this.pendingThemeUpdate,
							);
						}
					} else {
						this.visibleBlocks.delete(entry.target);
					}
				});
			},
			{
				rootMargin: "50px 0px",
				threshold: 0.01,
			},
		);

		// 观察所有代码块
		this.observeCodeBlocks();

		// 监听主题变化
		this.setupThemeListener();

	}

	observeCodeBlocks() {
		this.cancelPageWork();
		for (const block of document.querySelectorAll(".expressive-code")) {
			this.codeBlockObserver.observe(block);
			block.classList.toggle("hide-during-transition", this.hideCodeBlocksDuringTransition);
		}
	}

	cancelPageWork() {
		this.pageVersion++;
		this.codeBlockObserver?.disconnect();
		this.visibleBlocks.clear();
		if (this.batchFrame !== null) cancelAnimationFrame(this.batchFrame);
		if (this.batchTimer !== null) clearTimeout(this.batchTimer);
		this.batchFrame = this.batchTimer = null;
	}

	setupThemeListener() {
		// 监听 data-theme 属性变化
		this.themeObserver = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (
					mutation.type === "attributes" &&
					mutation.attributeName === "data-theme"
				) {
					const newTheme =
						document.documentElement.getAttribute("data-theme");
					this.handleThemeChange(newTheme);
					break;
				}
			}
		});

		this.themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});
	}

	handleThemeChange(newTheme) {
		this.pendingThemeUpdate = newTheme;

		const visibleBlocksArray = Array.from(this.visibleBlocks);

		if (visibleBlocksArray.length === 0) return;

		// 分批更新可见代码块
		this.batchUpdateBlocks(visibleBlocksArray, newTheme);
	}

	batchUpdateBlocks(blocks, theme) {
		if (this.batchFrame !== null) cancelAnimationFrame(this.batchFrame);
		if (this.batchTimer !== null) clearTimeout(this.batchTimer);
		const version = this.pageVersion;
		let currentIndex = 0;
		const processBatch = () => {
			this.batchTimer = null;
			this.batchFrame = requestAnimationFrame(() => {
				this.batchFrame = null;
				if (this.destroyed || version !== this.pageVersion) return;
				for (const block of blocks.slice(currentIndex, currentIndex + 3))
					if (block.isConnected) this.applyThemeToBlock(block, theme);
				currentIndex += 3;
				if (currentIndex < blocks.length) this.batchTimer = setTimeout(processBatch, 0);
			});
		};
		processBatch();
	}

	applyThemeToBlock(block, theme) {
		// 标记该代码块已更新
		block.dataset.themeUpdated = theme;
	}

	// ==================== 重型元素优化 ====================

	interceptThemeSwitch() {
		// 监听 class 变化来拦截主题切换
		this.classObserver = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (
					mutation.type === "attributes" &&
					mutation.attributeName === "class" &&
					mutation.target === document.documentElement
				) {
					const classList = document.documentElement.classList;
					const isTransitioning = classList.contains(
						"is-theme-transitioning",
					);
					const useViewTransition = classList.contains(
						"use-view-transition",
					);

					if (isTransitioning && !this.isOptimizing) {
						this.optimizeThemeSwitch(useViewTransition);
					} else if (!isTransitioning && this.isOptimizing) {
						this.restoreAfterThemeSwitch(useViewTransition);
					}
				}
			}
		});

		this.classObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
	}

	optimizeThemeSwitch(useViewTransition = false) {
		this.cancelRestore();
		this.restoreStyles();
		this.isOptimizing = true;
		this.useViewTransition = useViewTransition;

		// 如果使用 View Transitions，不需要额外的优化，让浏览器处理
		if (useViewTransition) {
			return;
		}

		// 1. 临时禁用重型元素动画
		this.disableHeavyAnimations();

		// 2. 隐藏视口外的重型元素
		this.hideOffscreenHeavyElements();

		// 3. 强制 GPU 合成层
		this.forceCompositing();
	}

	disableHeavyAnimations() {
		if (!this.tempStyleSheet) {
			this.tempStyleSheet = document.createElement("style");
			this.tempStyleSheet.id = "theme-optimizer-temp";
			document.head.appendChild(this.tempStyleSheet);
		}

		this.tempStyleSheet.textContent = `
      /* 临时禁用重型元素的过渡和动画 */
      .is-theme-transitioning .float-panel:not(.float-panel-closed),
      .is-theme-transitioning .music-player,
      .is-theme-transitioning .widget,
      .is-theme-transitioning .post-card,
      .is-theme-transitioning #navbar *,
      .is-theme-transitioning .dropdown-content,
      .is-theme-transitioning .custom-md * {
        transition: none !important;
        animation: none !important;
      }
      
      /* 强制隔离渲染上下文 */
      .is-theme-transitioning .float-panel,
      .is-theme-transitioning .post-card,
      .is-theme-transitioning .widget {
        contain: layout style paint !important;
      }
      
      /* 隐藏装饰性元素 */
      .is-theme-transitioning .gradient-overlay,
      .is-theme-transitioning .decoration,
      .is-theme-transitioning .animation-element {
        visibility: hidden !important;
      }
      
      /* 在主题切换期间临时隐藏代码块以提升性能 */
      /* 这个行为可以通过配置文件中的 expressiveCodeConfig.hideDuringThemeTransition 控制 */
      .is-theme-transitioning .expressive-code {
        content-visibility: hidden !important;
        /* 避免闪烁 */
        opacity: 0.99;
      }
      
      /* 当禁用隐藏代码块功能时（通过JavaScript动态控制） */
      .is-theme-transitioning .expressive-code:not(.hide-during-transition) {
        /* 保持代码块可见，但禁用过渡效果 */
        content-visibility: visible !important;
        opacity: 1 !important;
      }
      
      /* 确保打开的TOC面板在主题切换期间保持可点击 */
      .is-theme-transitioning .float-panel:not(.float-panel-closed) {
        pointer-events: auto !important;
      }
    `;
	}

	hideOffscreenHeavyElements() {
		const viewportHeight = window.innerHeight;
		// Read all geometry before writing any styles. A comma selector also deduplicates matches.
		this.hiddenElements = Array.from(document.querySelectorAll(this.heavySelectors.join(",")))
			.filter(element => {
				const rect = element.getBoundingClientRect();
				return rect.bottom < -200 || rect.top > viewportHeight + 200;
			}).map(element => ({element, originalVisibility: element.style.contentVisibility}));
		for (const {element} of this.hiddenElements) element.style.contentVisibility = "hidden";
	}

	forceCompositing() {
		const criticalElements = document.querySelectorAll(`
      .expressive-code,
      .post-card,
      .widget,
      #navbar
    `);

		this.compositedElements = [];

		criticalElements.forEach((element) => {
			const original = element.style.transform;
			const originalWillChange = element.style.willChange;
			element.style.transform = "translateZ(0)";
			element.style.willChange = "transform";

			this.compositedElements.push({ element, original, originalWillChange });
		});
	}

	restoreAfterThemeSwitch(useViewTransition = false) {
		this.isOptimizing = false;
		this.cancelRestore();
		if (useViewTransition) { this.useViewTransition = false; return; }
		this.restoreFrame = requestAnimationFrame(() => {
			this.restoreFrame = null;
			this.restoreNextFrame = requestAnimationFrame(() => {
				this.restoreNextFrame = null;
				if (!this.isOptimizing) this.restoreStyles();
			});
		});
	}

	cancelRestore() {
		if (this.restoreFrame !== null) cancelAnimationFrame(this.restoreFrame);
		if (this.restoreNextFrame !== null) cancelAnimationFrame(this.restoreNextFrame);
		this.restoreFrame = this.restoreNextFrame = null;
	}

	restoreStyles() {
		this.tempStyleSheet?.remove();
		this.tempStyleSheet = null;
		for (const {element, originalVisibility} of this.hiddenElements || [])
			element.style.contentVisibility = originalVisibility || "";
		for (const {element, original, originalWillChange} of this.compositedElements || []) {
			element.style.transform = original || "";
			element.style.willChange = originalWillChange || "";
		}
		this.hiddenElements = this.compositedElements = null;
	}

	destroy() {
		this.destroyed = true;
		this.cancelPageWork();
		this.cancelRestore();
		this.restoreStyles();
		this.themeObserver?.disconnect();
		this.classObserver?.disconnect();
		this.disconnectSwup();
		document.removeEventListener("swup:enable", this.connectSwup);
	}

}

// 初始化优化器
window.themeOptimizer?.destroy();
const themeOptimizer = new ThemeOptimizer();

// 导出到全局（统一API）
window.themeOptimizer = themeOptimizer;

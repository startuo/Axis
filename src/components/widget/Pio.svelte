<script>
import { onDestroy, onMount } from "svelte";
import { pioConfig } from "@/config";

// 将配置转换为 Pio 插件需要的格式
const pioOptions = {
	mode: pioConfig.mode,
	hidden: pioConfig.hiddenOnMobile,
	content: pioConfig.dialog || {},
	model: pioConfig.models || ["/pio/models/pio/model.json"],
};

// 全局Pio实例引用
let pioInstance = null;
let pioInitialized = false;
let pioContainer;
let pioCanvas;
let mounted = false;
let initTimer;
let assetsController;

// 样式已通过 Layout.astro 静态引入，无需动态加载

function cleanupPio() {
	if (typeof document === "undefined") return;
	mounted = false;
	clearTimeout(initTimer);
	assetsController?.abort();

	pioInstance = null;
	pioInitialized = false;
	document
		.querySelectorAll(".pio-container, #pio, #pio-container, canvas#live2d, canvas.pio-live2d")
		.forEach((node) => node.remove());
}

// 等待 DOM 加载完成后再初始化 Pio
function initPio() {
	if (!mounted) return;
	if (typeof window !== "undefined" && typeof Paul_Pio !== "undefined") {
		try {
			// 确保DOM元素存在
			if (pioContainer && pioCanvas && !pioInitialized) {
				pioInstance = new Paul_Pio(pioOptions);
				pioInitialized = true;
				console.log("Pio initialized successfully (Svelte)");
			}
		} catch (e) {
			console.error("Pio initialization error:", e);
		}
	}
}

// 样式已通过 Layout.astro 静态引入，无需动态加载函数

// 加载必要的脚本
function loadPioAssets() {
	if (typeof window === "undefined") return;

	// 样式已通过 Layout.astro 静态引入

	// 加载JS脚本
	const loadScript = (src, id, ready) => {
		return new Promise((resolve, reject) => {
			if (ready()) {
				resolve();
				return;
			}
			const existing = document.getElementById(id);
			const script = existing || document.createElement("script");
			script.id = id;
			script.src = src;
			const signal = assetsController.signal;
			const finish = (error) => {
				clearTimeout(timeout);
				script.removeEventListener("load", loaded);
				script.removeEventListener("error", failed);
				signal.removeEventListener("abort", aborted);
				if (error) reject(error);
				else resolve();
			};
			const loaded = () => finish(ready() ? null : new Error(`Pio script unavailable: ${src}`));
			const failed = () => { if (!existing) script.remove(); finish(new Error(`Failed to load ${src}`)); };
			const aborted = () => finish(new DOMException("Pio unmounted", "AbortError"));
			const timeout = setTimeout(() => finish(new Error(`Pio script timed out: ${src}`)), 15000);
			script.addEventListener("load", loaded, { once: true });
			script.addEventListener("error", failed, { once: true });
			signal.addEventListener("abort", aborted, { once: true });
			if (signal.aborted) { aborted(); return; }
			if (!existing) {
				script.setAttribute("data-swup-ignore-script", "");
				document.head.appendChild(script);
			}
		});
	};

	// 按顺序加载脚本
	loadScript("/pio/static/l2d.js", "pio-l2d-script", () => typeof window.loadlive2d === "function")
		.then(() => {
			if (!mounted) return;
			return loadScript("/pio/static/pio.js", "pio-main-script", () => typeof window.Paul_Pio === "function");
		})
		.then(() => {
			// 脚本加载完成后初始化
			if (mounted) initTimer = setTimeout(initPio, 100);
		})
		.catch((error) => {
			if (mounted) console.error("Failed to load Pio scripts:", error);
		});
}

// 样式已通过 Layout.astro 静态引入，无需页面切换监听

onMount(() => {
	if (!pioConfig.enable) return;
	mounted = true;
	assetsController = new AbortController();

	window.__starCleanupPio = cleanupPio;

	// 如果配置了手机端隐藏，且当前屏幕宽度小于 1280px (平板/手机)，则直接终止，不加载脚本
    if (pioConfig.hiddenOnMobile && window.matchMedia("(max-width: 1280px)").matches) {
        return;
    }

	// 加载资源并初始化
	loadPioAssets();
});

onDestroy(() => {
	mounted = false;
	clearTimeout(initTimer);
	assetsController?.abort();
	if (typeof document === "undefined") return;

	if (document.body.classList.contains("admin-mode")) {
		cleanupPio();
		return;
	}

	// 前台内部页面切换时保持 Pio 状态，进入后台时由 AdminLayout 强制清理。
	console.log("Pio Svelte component destroyed (keeping instance alive)");
});
</script>

{#if pioConfig.enable}
  <div class={`pio-container ${pioConfig.position || 'right'}`} bind:this={pioContainer}>
    <div class="pio-action"></div>
    <canvas 
      id="pio" 
      bind:this={pioCanvas}
      width={pioConfig.width || 280} 
      height={pioConfig.height || 250}
    ></canvas>
  </div>
{/if}

<style>
  /* Pio 相关样式将通过外部CSS文件加载 */
</style>

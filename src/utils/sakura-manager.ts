import type { SakuraConfig } from "../types/config";

// 樱花对象类
class Sakura {
	x: number;
	y: number;
	s: number;
	r: number;
	a: number;
	fn: {
		x: (x: number, y: number) => number;
		y: (x: number, y: number) => number;
		r: (r: number) => number;
		a: (a: number) => number;
	};
	idx: number;
	img: HTMLImageElement;
	limitArray: number[];
	config: SakuraConfig;

	constructor(
		x: number,
		y: number,
		s: number,
		r: number,
		a: number,
		fn: {
			x: (x: number, y: number) => number;
			y: (x: number, y: number) => number;
			r: (r: number) => number;
			a: (a: number) => number;
		},
		idx: number,
		img: HTMLImageElement,
		limitArray: number[],
		config: SakuraConfig,
	) {
		this.x = x;
		this.y = y;
		this.s = s;
		this.r = r;
		this.a = a;
		this.fn = fn;
		this.idx = idx;
		this.img = img;
		this.limitArray = limitArray;
		this.config = config;
	}

	draw(cxt: CanvasRenderingContext2D) {
		cxt.save();
		cxt.translate(this.x, this.y);
		cxt.rotate(this.r);
		cxt.globalAlpha = this.a;
		cxt.drawImage(this.img, 0, 0, 40 * this.s, 40 * this.s);
		cxt.restore();
	}

	update() {
		this.x = this.fn.x(this.x, this.y);
		this.y = this.fn.y(this.y, this.y);
		this.r = this.fn.r(this.r);
		this.a = this.fn.a(this.a);

		// 如果樱花越界或完全透明，重新调整位置
		if (
			this.x > window.innerWidth ||
			this.x < 0 ||
			this.y > window.innerHeight ||
			this.y < 0 ||
			this.a <= 0
		) {
			// 如果樱花不做限制
			if (this.limitArray[this.idx] === -1) {
				this.resetPosition();
			}
			// 否则樱花有限制
			else {
				if (this.limitArray[this.idx] > 0) {
					this.resetPosition();
					this.limitArray[this.idx]--;
				}
			}
		}
	}

	private resetPosition() {
		this.r = getRandom("fnr", this.config);
		if (Math.random() > 0.4) {
			this.x = getRandom("x", this.config);
			this.y = 0;
			this.s = getRandom("s", this.config);
			this.r = getRandom("r", this.config);
			this.a = getRandom("a", this.config);
		} else {
			this.x = window.innerWidth;
			this.y = getRandom("y", this.config);
			this.s = getRandom("s", this.config);
			this.r = getRandom("r", this.config);
			this.a = getRandom("a", this.config);
		}
	}
}

// 樱花列表类
class SakuraList {
	list: Sakura[];

	constructor() {
		this.list = [];
	}

	push(sakura: Sakura) {
		this.list.push(sakura);
	}

	update() {
		for (let i = 0, len = this.list.length; i < len; i++) {
			this.list[i].update();
		}
	}

	draw(cxt: CanvasRenderingContext2D) {
		for (let i = 0, len = this.list.length; i < len; i++) {
			this.list[i].draw(cxt);
		}
	}

	get(i: number) {
		return this.list[i];
	}

	size() {
		return this.list.length;
	}
}

// 获取随机值的函数
function getRandom(option: string, config: SakuraConfig): any {
	let ret: any;
	let random: number;

	switch (option) {
		case "x":
			ret = Math.random() * window.innerWidth;
			break;
		case "y":
			ret = Math.random() * window.innerHeight;
			break;
		case "s":
			ret =
				config.size.min +
				Math.random() * (config.size.max - config.size.min);
			break;
		case "r":
			ret = Math.random() * 6;
			break;
		case "a":
			ret =
				config.opacity.min +
				Math.random() * (config.opacity.max - config.opacity.min);
			break;
		case "fnx":
			random =
				config.speed.horizontal.min +
				Math.random() *
					(config.speed.horizontal.max - config.speed.horizontal.min);
			ret = (x: number, _y: number) => x + random;
			break;
		case "fny":
			random =
				config.speed.vertical.min +
				Math.random() *
					(config.speed.vertical.max - config.speed.vertical.min);
			ret = (_x: number, y: number) => y + random;
			break;
		case "fnr":
			ret = (r: number) => r + config.speed.rotation;
			break;
		case "fna":
			ret = (alpha: number) => alpha - config.speed.fadeSpeed * 0.01;
			break;
	}
	return ret;
}

// 樱花管理器类
export class SakuraManager {
	private config: SakuraConfig;
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private sakuraList: SakuraList | null = null;
	private animationId: number | null = null;
	private img: HTMLImageElement | null = null;
	private isRunning = false;
	private pendingInit: Promise<void> | null = null;
	private cancelLoad: (() => void) | null = null;
	private generation = 0;
	private readonly onResize = () => this.handleResize();
	private readonly onVisibilityChange = () => {
		if (document.hidden) this.pauseAnimation();
		else this.startAnimation();
	};

	constructor(config: SakuraConfig) {
		this.config = config;
	}

	// 初始化樱花特效
	init(): Promise<void> {
		if (!this.config.enable || this.isRunning) return Promise.resolve();
		if (this.pendingInit) return this.pendingInit;
		const generation = this.generation;
		const img = new Image();
		this.img = img;
		this.pendingInit = new Promise<boolean>((resolve, reject) => {
			const finish = (loaded: boolean, error?: Error) => {
				img.onload = img.onerror = null;
				this.cancelLoad = null;
				if (error) reject(error);
				else resolve(loaded);
			};
			this.cancelLoad = () => finish(false);
			img.onload = () => finish(true);
			img.onerror = () => finish(false, new Error("Failed to load sakura image"));
			img.src = "/sakura.png";
		}).then((loaded) => {
			if (!loaded || generation !== this.generation) return;
			this.createCanvas();
			this.createSakuraList();
			this.isRunning = true;
			document.addEventListener("visibilitychange", this.onVisibilityChange);
			this.startAnimation();
		}).finally(() => {
			if (generation === this.generation) this.pendingInit = null;
		});
		return this.pendingInit;
	}

	// 创建画布
	private createCanvas(): void {
		this.canvas = document.createElement("canvas");
		this.canvas.setAttribute(
			"style",
			`position: fixed; left: 0; top: 0; pointer-events: none; z-index: ${this.config.zIndex};`,
		);
		this.canvas.setAttribute("id", "canvas_sakura");
		document.body.appendChild(this.canvas);
		this.ctx = this.canvas.getContext("2d");
		this.handleResize();

		// 监听窗口大小变化
		window.addEventListener("resize", this.onResize);
	}

	// 创建樱花列表
	private createSakuraList(): void {
		if (!this.img || !this.ctx) return;

		this.sakuraList = new SakuraList();
		const limitArray = new Array(this.config.sakuraNum).fill(
			this.config.limitTimes,
		);

		for (let i = 0; i < this.config.sakuraNum; i++) {
			const randomX = getRandom("x", this.config);
			const randomY = getRandom("y", this.config);
			const randomS = getRandom("s", this.config);
			const randomR = getRandom("r", this.config);
			const randomA = getRandom("a", this.config);
			const randomFnx = getRandom("fnx", this.config);
			const randomFny = getRandom("fny", this.config);
			const randomFnR = getRandom("fnr", this.config);
			const randomFnA = getRandom("fna", this.config);

			const sakura = new Sakura(
				randomX,
				randomY,
				randomS,
				randomR,
				randomA,
				{
					x: randomFnx,
					y: randomFny,
					r: randomFnR,
					a: randomFnA,
				},
				i,
				this.img,
				limitArray,
				this.config,
			);

			sakura.draw(this.ctx);
			this.sakuraList.push(sakura);
		}
	}

	// 开始动画
	private startAnimation(): void {
		if (!this.isRunning || document.hidden || this.animationId !== null ||
			!this.ctx || !this.canvas || !this.sakuraList) return;

		const animate = () => {
			this.animationId = null;
			if (!this.isRunning || document.hidden || !this.ctx || !this.canvas || !this.sakuraList) return;

			this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
			this.sakuraList.update();
			this.sakuraList.draw(this.ctx);
			this.animationId = requestAnimationFrame(animate);
		};

		this.animationId = requestAnimationFrame(animate);
	}

	// 处理窗口大小变化
	private handleResize(): void {
		if (this.canvas) {
			const dpr = window.devicePixelRatio || 1;
			this.canvas.style.width = `${window.innerWidth}px`;
			this.canvas.style.height = `${window.innerHeight}px`;
			this.canvas.width = Math.round(window.innerWidth * dpr);
			this.canvas.height = Math.round(window.innerHeight * dpr);
			this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
	}

	private pauseAnimation(): void {
		if (this.animationId !== null) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
	}

	// 停止时也取消尚未完成的加载，旧回调不能重新创建 Canvas。
	stop(): void {
		this.generation++;
		this.cancelLoad?.();
		this.pendingInit = null;
		this.pauseAnimation();

		if (this.canvas) {
			this.canvas.remove();
			this.canvas = null;
		}

		window.removeEventListener("resize", this.onResize);
		document.removeEventListener("visibilitychange", this.onVisibilityChange);
		this.ctx = null;
		this.sakuraList = null;
		this.img = null;
		this.isRunning = false;
	}

	// 切换樱花特效
	toggle(): void {
		if (this.isRunning || this.pendingInit) {
			this.stop();
		} else {
			void this.init().catch(console.error);
		}
	}

	// 更新配置
	updateConfig(newConfig: SakuraConfig): void {
		if (this.config === newConfig) return;
		const wasRunning = this.isRunning || this.pendingInit !== null;
		const wasEnabled = this.config.enable;
		if (wasRunning) {
			this.stop();
		}
		this.config = newConfig;
		if ((wasRunning || !wasEnabled) && newConfig.enable) {
			void this.init().catch(console.error);
		}
	}

	// 获取运行状态
	getIsRunning(): boolean {
		return this.isRunning;
	}
}

// 创建全局樱花管理器实例
let globalSakuraManager: SakuraManager | null = null;

// 初始化樱花特效
export function initSakura(config: SakuraConfig): void {
	if (globalSakuraManager) {
		globalSakuraManager.updateConfig(config);
	} else {
		globalSakuraManager = new SakuraManager(config);
		if (config.enable) {
			void globalSakuraManager.init().catch(console.error);
		}
	}
}

// 切换樱花特效
export function toggleSakura(): void {
	if (globalSakuraManager) {
		globalSakuraManager.toggle();
	}
}

// 停止樱花特效
export function stopSakura(): void {
	if (globalSakuraManager) {
		globalSakuraManager.stop();
		globalSakuraManager = null;
	}
}

// 获取樱花特效运行状态
export function getSakuraStatus(): boolean {
	return globalSakuraManager ? globalSakuraManager.getIsRunning() : false;
}

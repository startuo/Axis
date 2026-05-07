<script lang="ts">
	import { onDestroy, onMount, tick } from "svelte";

	export let isTyping = false;
	export let isPasswordFocused = false;
	export let passwordLength = 0;
	export let passwordVisible = false;

	const instanceId = `star-mascot-${Math.random().toString(36).slice(2)}`;
	const purpleGradientId = `${instanceId}-purple`;
	const orangeGradientId = `${instanceId}-orange`;
	const yellowGradientId = `${instanceId}-yellow`;
	const shadowFilterId = `${instanceId}-shadow`;

	let svgElement: SVGSVGElement;
	let eyeElements: SVGGraphicsElement[] = [];
	let pupilElements: SVGCircleElement[] = [];
	let animationFrame: number | undefined;
	let blinkTimer: number | undefined;
	let mediaQuery: MediaQueryList | null = null;
	let reducedMotion = false;
	let blink = false;
	let pointerX = 0;
	let pointerY = 0;

	$: covering = isPasswordFocused && !passwordVisible;
	$: peeking = isPasswordFocused && passwordVisible;
	$: mood = covering ? "covering" : peeking ? "peeking" : isTyping ? "typing" : "idle";
	$: if (covering || reducedMotion) {
		resetPupils();
	}

	onMount(() => {
		pointerX = window.innerWidth / 2;
		pointerY = window.innerHeight / 2;
		mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		reducedMotion = mediaQuery.matches;

		void tick().then(() => {
			collectEyes();
			queuePupilUpdate();
		});
		scheduleBlink();

		const handleMouseMove = (event: MouseEvent) => {
			pointerX = event.clientX;
			pointerY = event.clientY;
			queuePupilUpdate();
		};

		const handleResize = () => {
			collectEyes();
			queuePupilUpdate();
		};

		const handleMotionPreference = (event: MediaQueryListEvent) => {
			reducedMotion = event.matches;
			if (reducedMotion) {
				resetPupils();
				return;
			}

			queuePupilUpdate();
		};

		window.addEventListener("mousemove", handleMouseMove, { passive: true });
		window.addEventListener("resize", handleResize, { passive: true });
		mediaQuery.addEventListener("change", handleMotionPreference);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("resize", handleResize);
			mediaQuery?.removeEventListener("change", handleMotionPreference);
			clearAnimationFrame();
			clearBlinkTimer();
		};
	});

	onDestroy(() => {
		clearAnimationFrame();
		clearBlinkTimer();
	});

	function collectEyes() {
		if (!svgElement) {
			eyeElements = [];
			pupilElements = [];
			return;
		}

		eyeElements = Array.from(svgElement.querySelectorAll<SVGGraphicsElement>(".eye"));
		pupilElements = Array.from(svgElement.querySelectorAll<SVGCircleElement>(".pupil"));
	}

	function queuePupilUpdate() {
		if (animationFrame !== undefined) {
			return;
		}

		animationFrame = window.requestAnimationFrame(() => {
			animationFrame = undefined;
			updatePupilPositions(pointerX, pointerY);
		});
	}

	function updatePupilPositions(clientX: number, clientY: number) {
		if (reducedMotion || covering) {
			resetPupils();
			return;
		}

		if (eyeElements.length === 0 || eyeElements.length !== pupilElements.length) {
			collectEyes();
		}

		const maxRadius = peeking ? 2.2 : 4;

		eyeElements.forEach((eye, index) => {
			const pupil = pupilElements[index];
			if (!pupil) {
				return;
			}

			const rect = eye.getBoundingClientRect();
			const eyeCenterX = rect.left + rect.width / 2;
			const eyeCenterY = rect.top + rect.height / 2;
			const angle = Math.atan2(clientY - eyeCenterY, clientX - eyeCenterX);
			const distance = Math.min(
				Math.hypot(clientX - eyeCenterX, clientY - eyeCenterY),
				maxRadius,
			);
			const moveX = Math.cos(angle) * distance;
			const moveY = Math.sin(angle) * distance;

			pupil.style.transform = `translate(${moveX}px, ${moveY}px)`;
		});
	}

	function resetPupils() {
		pupilElements.forEach((pupil) => {
			pupil.style.transform = "translate(0px, 0px)";
		});
	}

	function scheduleBlink() {
		clearBlinkTimer();
		if (reducedMotion) {
			return;
		}

		blinkTimer = window.setTimeout(
			() => {
				if (!covering) {
					blink = true;
					window.setTimeout(() => {
						blink = false;
					}, 130);
				}
				scheduleBlink();
			},
			Math.random() * 2400 + 2800,
		);
	}

	function clearAnimationFrame() {
		if (animationFrame !== undefined) {
			window.cancelAnimationFrame(animationFrame);
			animationFrame = undefined;
		}
	}

	function clearBlinkTimer() {
		if (blinkTimer !== undefined) {
			window.clearTimeout(blinkTimer);
			blinkTimer = undefined;
		}
	}
</script>

<div
	class:covering
	class:peeking
	class:typing={isTyping}
	class:reduced-motion={reducedMotion}
	class="mascot-stage"
	data-mood={mood}
	aria-hidden="true"
>
	<svg bind:this={svgElement} viewBox="0 0 560 400" role="img" focusable="false">
		<defs>
			<linearGradient id={purpleGradientId} x1="0%" x2="100%" y1="0%" y2="100%">
				<stop offset="0%" stop-color="#7c3dff" />
				<stop offset="100%" stop-color="#5317f0" />
			</linearGradient>
			<linearGradient id={orangeGradientId} x1="0%" x2="100%" y1="0%" y2="100%">
				<stop offset="0%" stop-color="#ff9d3f" />
				<stop offset="100%" stop-color="#ff7a2d" />
			</linearGradient>
			<linearGradient id={yellowGradientId} x1="0%" x2="100%" y1="0%" y2="100%">
				<stop offset="0%" stop-color="#ffe400" />
				<stop offset="100%" stop-color="#f4cc00" />
			</linearGradient>
			<filter id={shadowFilterId} color-interpolation-filters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
				<feDropShadow dx="0" dy="22" stdDeviation="18" flood-color="#0c0d13" flood-opacity="0.22" />
			</filter>
		</defs>

		<path class="ground" d="M36 377H524" />

		<g class="shape purple-shape" filter={`url(#${shadowFilterId})`}>
			<rect x="168" y="76" width="170" height="301" rx="7" fill={`url(#${purpleGradientId})`} />
			<g class:blink-active={blink} class="eye purple-eye-left">
				<circle class="sclera" cx="222" cy="125" r="10" />
				<circle class="pupil" cx="222" cy="125" r="3.4" />
			</g>
			<g class:blink-active={blink} class="eye purple-eye-right">
				<circle class="sclera" cx="274" cy="121" r="10" />
				<circle class="pupil" cx="274" cy="121" r="3.4" />
			</g>
			<path class="smile" d="M228 158Q249 171 272 154" />
			<path class="cover-arm purple-left-arm" d="M183 138C203 121 223 116 249 116" />
			<path class="cover-arm purple-right-arm" d="M321 138C300 121 279 116 253 116" />
			<path class="closed-eye" d="M214 126Q224 132 234 126M262 123Q274 129 286 123" />
		</g>

		<g class="shape black-shape" filter={`url(#${shadowFilterId})`}>
			<rect x="321" y="179" width="105" height="198" rx="5" fill="#17191f" />
			<g class:blink-active={blink} class="eye black-eye-left">
				<circle class="sclera" cx="346" cy="214" r="13" />
				<circle class="pupil" cx="346" cy="214" r="4.6" />
			</g>
			<g class:blink-active={blink} class="eye black-eye-right">
				<circle class="sclera" cx="385" cy="216" r="13" />
				<circle class="pupil" cx="385" cy="216" r="4.6" />
			</g>
			<path class="cover-arm black-left-arm" d="M331 228C351 210 371 207 395 211" />
			<path class="cover-arm black-right-arm" d="M415 229C400 211 382 207 360 211" />
			<path class="closed-eye" d="M334 214Q347 222 359 214M373 216Q386 224 398 216" />
		</g>

		<g class="shape orange-shape" filter={`url(#${shadowFilterId})`}>
			<path d="M31 377V362C31 292 89 246 178 246C268 246 331 292 331 362V377H31Z" fill={`url(#${orangeGradientId})`} />
			<g class="eye orange-eye-left">
				<circle class="sclera orange-sclera" cx="111" cy="300" r="8.5" />
				<circle class="pupil" cx="111" cy="300" r="4.1" />
			</g>
			<g class="eye orange-eye-right">
				<circle class="sclera orange-sclera" cx="222" cy="300" r="8.5" />
				<circle class="pupil" cx="222" cy="300" r="4.1" />
			</g>
			<path class="orange-mouth" d="M140 326Q168 357 205 326" />
			<path class="closed-eye orange-closed" d="M100 300Q111 306 122 300M211 300Q222 306 233 300" />
		</g>

		<g class="shape yellow-shape" filter={`url(#${shadowFilterId})`}>
			<path d="M407 377V274C407 238 433 211 468 211H492C520 211 538 230 538 260V377H407Z" fill={`url(#${yellowGradientId})`} />
			<g class="eye yellow-eye">
				<circle class="sclera yellow-sclera" cx="474" cy="270" r="7.4" />
				<circle class="pupil" cx="474" cy="270" r="3.7" />
			</g>
			<path class="yellow-mouth" d="M409 302H491" />
			<path class="closed-eye yellow-closed" d="M462 270Q474 277 486 270" />
		</g>
	</svg>

	<div class="stage-caption">
		<span>{covering ? "Password cover" : peeking ? "Password visible" : "Eye tracking"}</span>
		<strong>{passwordLength > 0 ? `${passwordLength} chars` : "STAR Mascot"}</strong>
	</div>
</div>

<style>
	.mascot-stage {
		position: relative;
		width: min(34rem, 100%);
		aspect-ratio: 1.4;
		margin: 0 auto;
		overflow: hidden;
		border-radius: 2rem;
		background:
			radial-gradient(circle at 80% 12%, rgba(255, 255, 255, 0.72), transparent 16%),
			linear-gradient(135deg, #f7f7f5 0%, #e9e9e7 100%);
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.72),
			0 26px 60px rgba(0, 0, 0, 0.18);
	}

	.mascot-stage::before {
		content: "";
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, rgba(0, 0, 0, 0.035) 1px, transparent 1px),
			linear-gradient(0deg, rgba(0, 0, 0, 0.025) 1px, transparent 1px);
		background-size: 32px 32px;
		mask-image: linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent);
		pointer-events: none;
	}

	svg {
		position: relative;
		z-index: 1;
		display: block;
		width: 100%;
		height: 100%;
	}

	.shape {
		transform-box: fill-box;
		transform-origin: center bottom;
		transition:
			transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
			filter 240ms ease;
		will-change: transform;
	}

	.typing .purple-shape,
	.typing .black-shape,
	.typing .orange-shape,
	.typing .yellow-shape {
		transform: translateY(-3px);
	}

	.sclera {
		fill: #fff;
		transition:
			opacity 130ms ease,
			transform 130ms ease;
		transform-box: fill-box;
		transform-origin: center;
	}

	.orange-sclera,
	.yellow-sclera {
		fill: rgba(255, 255, 255, 0.92);
	}

	.pupil {
		fill: #15171d;
		transform-box: fill-box;
		transform-origin: center;
		transition:
			transform 48ms linear,
			opacity 130ms ease;
		will-change: transform;
	}

	.blink-active .sclera {
		transform: scaleY(0.08);
	}

	.blink-active .pupil,
	.covering .pupil,
	.covering .sclera {
		opacity: 0;
	}

	.smile,
	.orange-mouth {
		fill: none;
		stroke: #15171d;
		stroke-linecap: round;
		stroke-width: 8;
	}

	.yellow-mouth {
		stroke: #15171d;
		stroke-linecap: round;
		stroke-width: 8;
	}

	.ground {
		fill: none;
		stroke: rgba(0, 0, 0, 0.08);
		stroke-linecap: round;
		stroke-width: 10;
	}

	.cover-arm,
	.closed-eye {
		fill: none;
		opacity: 0;
		stroke-linecap: round;
		transition:
			opacity 180ms ease,
			transform 260ms ease;
		transform-box: fill-box;
		transform-origin: center;
	}

	.cover-arm {
		stroke: rgba(21, 23, 29, 0.92);
		stroke-width: 16;
		transform: translateY(22px) scaleX(0.76);
	}

	.closed-eye {
		stroke: rgba(21, 23, 29, 0.82);
		stroke-width: 7;
	}

	.orange-closed,
	.yellow-closed {
		stroke-width: 6;
	}

	.covering .cover-arm,
	.covering .closed-eye {
		opacity: 1;
		transform: translateY(0) scaleX(1);
	}

	.peeking .pupil {
		opacity: 0.78;
	}

	.stage-caption {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		z-index: 3;
		display: flex;
		gap: 0.45rem;
		align-items: center;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.72);
		color: #17191f;
		padding: 0.42rem 0.68rem;
		font-size: 0.72rem;
		backdrop-filter: blur(12px);
	}

	.stage-caption span {
		color: rgba(23, 25, 31, 0.62);
	}

	@media (max-width: 760px) {
		.mascot-stage {
			border-radius: 1.4rem;
		}

		.stage-caption {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.shape,
		.cover-arm,
		.closed-eye,
		.pupil {
			transition: none;
		}
	}
</style>

// One clock for the current article; its module survives Swup's main replacement.
let timer: ReturnType<typeof setInterval> | null = null;

function stop() {
	if (timer !== null) clearInterval(timer);
	timer = null;
}

function update() {
	const source = document.getElementById("last-modified");
	const output = document.getElementById("modifiedtime");
	if (!source || !output) { stop(); return; }
	const data = source.dataset;
	const seconds = Math.floor((Date.now() - new Date(data.lastModified || "").getTime()) / 1000);
	if (!Number.isFinite(seconds)) return;
	const days = Math.floor(seconds / 86400);
	const years = Math.floor(days / 365);
	const months = Math.floor((days % 365) / 30);
	const remainingDays = days % 30;
	let text = `${data.prefix} `;
	if (years > 0) text += `${years} ${data.year} `;
	if (months > 0) text += `${months} ${data.month} `;
	if (remainingDays > 0) text += `${remainingDays} ${data.day} `;
	text += `${Math.floor((seconds % 86400) / 3600)} ${data.hour} `;
	text += `${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")} ${data.minute} `;
	text += `${String(seconds % 60).padStart(2, "0")} ${data.second}`;
	output.textContent = text;
}

function sync() {
	stop();
	if (document.hidden || !document.getElementById("last-modified")) return;
	update();
	timer = setInterval(update, 1000);
}

document.addEventListener("astro:before-swap", stop);
document.addEventListener("astro:page-load", sync);
document.addEventListener("visibilitychange", sync);
window.addEventListener("pagehide", stop);
window.addEventListener("pageshow", sync);
sync();

// Project data configuration file
// Used to manage data for the project display page

export interface Project {
	id: string;
	title: string;
	description: string;
	image: string;
	category: "web" | "mobile" | "desktop" | "other";
	techStack: string[];
	status: "completed" | "in-progress" | "planned";
	liveDemo?: string;
	sourceCode?: string;
	startDate: string;
	endDate?: string;
	featured?: boolean;
	tags?: string[];
	visitUrl?: string; // 添加前往项目链接字段
}

export const projectsData: Project[] = [
	{
		id: "star-blog-admin",
		title: "STAR's Blog 后端与实时 Admin 驾驶舱",
		description:
			"基于 Astro + Svelte 前端接入 NestJS、PostgreSQL、Redis 与 Socket.io，完成登录注册、管理员文章管理、PV/UV、在线人数和热门文章实时看板。",
		image: "",
		category: "web",
		techStack: ["Astro", "Svelte", "NestJS", "TypeScript", "PostgreSQL", "Prisma", "Redis", "Socket.io"],
		status: "in-progress",
		visitUrl: "/admin",
		startDate: "2026-04-01",
		featured: true,
		tags: ["Blog", "Admin", "Realtime", "Full Stack"],
	},
	{
		id: "robot-vision-following",
		title: "商服机器人视觉与跟随系统",
		description:
			"作为视觉负责人，基于 Python/OpenCV 搭建图像预处理与目标识别流程，参与串口通信与 PID 联调，检测帧率稳定在 30 FPS 左右，目标丢失率控制在 8% 以下。",
		image: "",
		category: "other",
		techStack: ["Python", "OpenCV", "PID", "Serial", "Computer Vision"],
		status: "completed",
		startDate: "2025-10-01",
		endDate: "2025-11-30",
		featured: true,
		tags: ["Vision", "Robot", "OpenCV"],
	},
	{
		id: "python-image-inpaint",
		title: "Python 图像修复程序开发",
		description:
			"基于 OpenCV 形态学与滤波算法完成图像自动修复，在 500+ 张缺陷样本上持续迭代，单张 1080P 图像处理耗时 < 1.5s，修复结果 SSIM 达 90% 以上。",
		image: "",
		category: "desktop",
		techStack: ["Python", "OpenCV", "Image Processing", "Automation"],
		status: "completed",
		startDate: "2025-09-01",
		endDate: "2025-12-31",
		featured: true,
		tags: ["Image Repair", "OpenCV", "Automation"],
	},
	{
		id: "ai-tools-workflow",
		title: "AI 工具辅助学习与项目协作",
		description:
			"长期使用 ChatGPT、Claude、Gemini、Cursor、GitHub Copilot 等工具辅助资料整理、代码调试、Prompt 编写与文档输出，提升学习与项目协作效率。",
		image: "",
		category: "other",
		techStack: ["ChatGPT", "Claude", "Gemini", "Cursor", "GitHub Copilot", "Prompt Engineering"],
		status: "in-progress",
		startDate: "2025-09-01",
		tags: ["AI", "Workflow", "Productivity"],
	},
	{
		id: "game-media-private-traffic",
		title: "游戏推荐自媒体与私域运营",
		description:
			"独立运营抖音及快手内容矩阵，累计精准粉丝 1.8 万；完成选题、脚本、发布、复盘与社群承接，搭建约 1 万人高粘性玩家社群并跑通私域变现闭环。",
		image: "",
		category: "other",
		techStack: ["Content Strategy", "Douyin", "Kuaishou", "Community Operation", "Growth"],
		status: "completed",
		startDate: "2024-06-01",
		endDate: "2025-08-31",
		tags: ["Content", "Growth", "Private Traffic"],
	},
	{
		id: "stm32-basic-design",
		title: "STM32 嵌入式基础设计",
		description:
			"基于 C 语言使用 Codex 辅助完成 GPIO、UART、Timer 等 5 大核心外设驱动编写，完成功能与时序仿真、引脚约束与上板调试，实现 8 种流水灯模式和毫秒级精准计时。",
		image: "",
		category: "other",
		techStack: ["C", "STM32", "GPIO", "UART", "Timer", "Embedded"],
		status: "completed",
		startDate: "2025-10-01",
		endDate: "2025-12-31",
		tags: ["Embedded", "STM32", "Hardware"],
	},
];

// Get project statistics
export const getProjectStats = () => {
	const total = projectsData.length;
	const completed = projectsData.filter(
		(p) => p.status === "completed",
	).length;
	const inProgress = projectsData.filter(
		(p) => p.status === "in-progress",
	).length;
	const planned = projectsData.filter((p) => p.status === "planned").length;

	return {
		total,
		byStatus: {
			completed,
			inProgress,
			planned,
		},
	};
};

// Get projects by category
export const getProjectsByCategory = (category?: string) => {
	if (!category || category === "all") {
		return projectsData;
	}
	return projectsData.filter((p) => p.category === category);
};

// Get featured projects
export const getFeaturedProjects = () => {
	return projectsData.filter((p) => p.featured);
};

// Get all tech stacks
export const getAllTechStack = () => {
	const techSet = new Set<string>();
	projectsData.forEach((project) => {
		project.techStack.forEach((tech) => {
			techSet.add(tech);
		});
	});
	return Array.from(techSet).sort();
};

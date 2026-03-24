// 设备数据配置文件

export interface Device {
	name: string;
	image: string;
	specs: string;
	description: string;
	link: string;
}

// 设备类别类型，支持品牌和自定义类别
export type DeviceCategory = {
	[categoryName: string]: Device[];
} & {
	自定义?: Device[];
};

export const devicesData: DeviceCategory = {
	Apple: [
		{
			name: "iPhone 17 Pro",
			image: "/images/device/iphone17pro.png",
			specs: "A19 Pro芯片 / 256GB",
			description: "苹果旗舰智能手机，配备先进的影像系统和强大的处理性能",
			link: "https://www.apple.com.cn/iphone-17-pro/",
		},
		{
			name: "Mac mini M4",
			image: "/images/device/macminim4.png",
			specs: "Apple M4芯片 / 16GB / 512GB",
			description: "紧凑型台式机，搭载M4芯片，适合日常办公和创意工作",
			link: "https://www.apple.com.cn/mac-mini/",
		},
		{
			name: "iPad 11",
			image: "/images/device/ipad11.png",
			specs: "Liquid视网膜显示屏 / Apple A16芯片 / 256GB",
			description: "轻薄便携的平板电脑，适合娱乐和学习使用",
			link: "https://www.apple.com.cn/ipad/",
		},
	],
	联想: [
		{
			name: "拯救者Y9000P",
			image: "/images/device/y9000p.png",
			specs: "Intel i9-14900HX / RTX 4060 / 32GB DDR5",
			description: "专业游戏笔记本电脑，配备高刷新率屏幕和强劲散热系统",
			link: "https://item.jd.com/10097244048273.html",
		},
	],
	Redmi: [
		{
			name: "Redmi K60 Ultra",
			image: "/images/device/k60ultra.png",
			specs: "天玑9200+ / 12GB / 256GB / 120W快充",
			description: "高性价比旗舰手机，搭载联发科旗舰处理器和超快充电技术",
			link: "https://www.mi.com/redmi-k60-ultra/",
		},
	],
};

/// <reference path="../workers/env.d.ts" />
/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
	readonly PUBLIC_API_BASE_URL?: string;
	readonly PUBLIC_SOCKET_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

/// <reference types="@astrojs/cloudflare" />
type AxisRuntime = import('@astrojs/cloudflare').Runtime<Env>;
declare namespace App { interface Locals extends AxisRuntime {} }
interface ImportMetaEnv {readonly AXIS_TARGET?:string;readonly PUBLIC_MAIN_SITE_URL?:string;}

declare const __AXIS_TARGET__: string;

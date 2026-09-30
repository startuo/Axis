// Development entry; production requests are routed by workers/entry.mjs.
import type {APIRoute} from 'astro';
export const ALL:APIRoute=()=>new Response('API unavailable in static builds',{status:503});

export function getStaticPaths(){return [];}

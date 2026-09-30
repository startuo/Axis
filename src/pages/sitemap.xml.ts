import type {APIRoute} from 'astro';
import {getSortedPosts} from '../utils/content-utils';
import {getPostUrl} from '../utils/url-utils';
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export const GET:APIRoute=async({site})=>new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+(await getSortedPosts()).map(post=>`<url><loc>${escape(new URL(getPostUrl(post),site).href)}</loc></url>`).join('')+'</urlset>',{headers:{'Content-Type':'application/xml'}});

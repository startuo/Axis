<script lang="ts">
 import {onMount} from 'svelte';import {api,token} from './api';import {API_ENABLED} from '../../utils/api-config';
 export let id:string;let saved=false,error='';
 onMount(()=>{if(API_ENABLED&&token()){void api('/me/history/'+id,'PUT').catch(()=>{});void api<{items:{id:string}[]}>('/me/favorites').then(result=>saved=result.items.some(item=>item.id===id)).catch(()=>{});}});
 async function favorite(){if(!token()){location.href='/user/';return;}try{await api('/me/favorites/'+id,saved?'DELETE':'PUT');saved=!saved;error='';}catch(e){error=String(e);}}
</script>
{#if API_ENABLED}<div class="article-actions"><button onclick={favorite}>{saved?'已收藏 · 取消':'收藏文章'}</button>{#if error}<span role="alert">{error}</span>{/if}</div>{/if}
<style>.article-actions{display:flex;gap:12px;margin:12px 0;font-size:13px}.article-actions button{padding:6px 12px;border:1px solid var(--primary);border-radius:6px;color:var(--primary)}</style>

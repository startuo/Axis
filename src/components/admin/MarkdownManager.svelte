<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiUrl } from '../../utils/api-config';
  export let token: string;
  type Entry = {path:string; sha:string; size:number};
  let items: Entry[] = [];
  let keyword = '';
  let path = '';
  let sha = '';
  let source = '';
  let original = '';
  let canWrite = false;
  let busy = false;
  let error = '';
  let notice = '';
  let commitUrl = '';
  $: dirty = source !== original;
  $: visible = items.filter(item=>item.path.toLowerCase().includes(keyword.toLowerCase()));

  async function request(query = '', options: RequestInit = {}) {
    const response = await fetch(apiUrl('/content/admin') + query, {...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
    const data = await response.json().catch(()=>null);
    if(!response.ok) throw new Error(data?.message ?? '请求失败，请检查网络后重试。');
    return data;
  }
  async function loadList() {
    busy=true; error='';
    try { const result=await request(); items=result.items; canWrite=result.canWrite; }
    catch(err) { error=err instanceof Error ? err.message : '读取失败'; }
    finally { busy=false; }
  }
  async function openFile(next: string) {
    if(dirty && !confirm('当前修改尚未保存。确定放弃修改并读取文件吗？')) return;
    busy=true; error=''; notice=''; commitUrl='';
    try { const result=await request('?path='+encodeURIComponent(next)); path=result.path; sha=result.sha; source=result.source; original=result.source; canWrite=result.canWrite; }
    catch(err) { error=err instanceof Error ? err.message : '读取失败'; }
    finally { busy=false; }
  }
  async function save() {
    if(!dirty || busy || !canWrite) return;
    if(!confirm('将修改提交到 GitHub main 分支，并触发网站自动部署？')) return;
    busy=true; error=''; notice=''; commitUrl='';
    try {
      const result=await request('',{method:'PUT',body:JSON.stringify({path,sha,source})});
      sha=result.sha; original=source; commitUrl=result.commitUrl ?? '';
      notice=result.unchanged ? '文件内容没有变化。' : '已提交到 GitHub。网站将在自动部署成功后更新，通常需要几分钟。';
    } catch(err) { error=err instanceof Error ? err.message : '保存失败；请保留修改并重试。'; }
    finally { busy=false; }
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if(dirty) { event.preventDefault(); event.returnValue=''; }
  }
  onMount(()=>{ void loadList(); window.addEventListener('beforeunload',beforeUnload); });
  onDestroy(()=>{ if(typeof window!=='undefined') window.removeEventListener('beforeunload',beforeUnload); });
</script>

<section class="markdown-panel" id="markdown">
  <header><div><h2>Markdown 文章</h2><p>编辑原始文件及 Front Matter，保存后提交到 GitHub 并自动部署。</p></div><button disabled={busy} onclick={loadList}>刷新列表</button></header>
  {#if !canWrite && !busy}<p class="notice">当前为只读模式。请在 Cloudflare Worker 中设置加密变量 GITHUB_TOKEN，授权 startuo/Axis 的 Contents 读写权限，然后刷新列表。</p>{/if}
  {#if error}<p class="error" role="alert">{error} 你的编辑内容仍保留在输入框中。</p>{/if}
  {#if notice}<p class="notice" role="status">{notice} {#if commitUrl}<a href={commitUrl} target="_blank" rel="noreferrer">查看提交</a>{/if}</p>{/if}
  <div class="editor-grid">
    <aside><label>查找文件<input bind:value={keyword} placeholder="文件名或路径" /></label><p>{visible.length} 个文件</p><nav aria-label="Markdown 文件列表">{#each visible as item}<button class:selected={path===item.path} disabled={busy} onclick={()=>openFile(item.path)}>{item.path.replace('src/content/','')}</button>{/each}</nav></aside>
    <div class="source-pane">
      {#if path}
        <div class="file-heading"><code>{path}</code><span>{dirty ? '未保存' : '已同步'}</span></div>
        <label for="markdown-source">Markdown 源文（含 Front Matter）</label>
        <textarea id="markdown-source" bind:value={source} disabled={busy} spellcheck="false"></textarea>
        <div class="actions"><button disabled={busy} onclick={()=>openFile(path)}>重新读取</button><button class="save" disabled={busy || !dirty || !canWrite} onclick={save}>{busy ? '处理中…' : '保存并部署'}</button></div>
        <p>保持 permalink、alias 和图片路径可保留现有链接。Obsidian 同步文章若在此编辑，也请同步修改 Vault 原文，避免以后从 Vault 导入时覆盖。</p>
      {:else}<p class="empty">{busy ? '正在读取 GitHub 文件…' : '选择左侧 Markdown 文件开始编辑。'}</p>{/if}
    </div>
  </div>
</section>

<style>
  .markdown-panel{padding:1.5rem;border:1px solid #ffffff20;border-radius:1.25rem;background:#21151dcc;margin:1.5rem 0;color:#fff}header,.file-heading,.actions{display:flex;justify-content:space-between;gap:1rem;align-items:center}h2{font-size:1.2rem;margin:0}p{font-size:.85rem;color:#c5b9c2;line-height:1.6}button,input,textarea{font:inherit;border:1px solid #ffffff25;border-radius:.6rem;background:#ffffff08;color:inherit;padding:.65rem}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}button:hover:not(:disabled),button.selected{background:#fb78ad30}.editor-grid{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(0,3fr);gap:1rem;margin-top:1rem}aside{min-width:0}aside input{display:block;width:100%;box-sizing:border-box;margin-top:.4rem}nav{max-height:34rem;overflow:auto}nav button{display:block;width:100%;text-align:left;overflow-wrap:anywhere;margin-bottom:.4rem;font-size:.8rem}label{font-size:.8rem}textarea{display:block;width:100%;min-height:30rem;resize:vertical;box-sizing:border-box;font-family:ui-monospace,monospace;font-size:.85rem;line-height:1.6;margin:.5rem 0 1rem}.file-heading{margin-bottom:1rem;overflow-wrap:anywhere;font-size:.8rem}.save{background:#fb78ad;color:#201019}.notice{padding:.8rem;background:#fb78ad15;border-radius:.5rem}.error{color:#ffb4b4}.empty{padding:4rem 1rem;text-align:center}a{color:#ffb3d1}@media(max-width:800px){.editor-grid{grid-template-columns:1fr}nav{max-height:12rem}header{align-items:flex-start}}
</style>

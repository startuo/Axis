import { parseDocument } from 'yaml';

const REPO = 'startuo/Axis';
const BRANCH = 'main';
const MAX_BYTES = 200000;
const encoder = new TextEncoder();
export class ContentError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const reject = (status, message) => { throw new ContentError(status, message); };
export function contentPath(value) {
  if(typeof value !== 'string' || !value.startsWith('src/content/') || !value.endsWith('.md') ||
    value.length > 500 || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value) ||
    value.split('/').some(part => !part || part === '.' || part === '..')) reject(400,'只能编辑 src/content/ 下的 Markdown 文件。');
  return value;
}
export function validateMarkdown(path, source) {
  if(typeof source !== 'string' || (path.startsWith('src/content/posts/') && !source.trim()) || source.includes('\0') || encoder.encode(source).length > MAX_BYTES)
    reject(400,'Markdown 内容不能为空，且不能超过 200 KB。');
  const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!match) {
    if(!path.startsWith('src/content/posts/') && !/^\uFEFF?---/.test(source)) return;
    reject(400,'请保留文件开头完整的 YAML Front Matter。');
  }
  let data;
  try {
    const doc = parseDocument(match[1]);
    if(doc.errors.length) throw new Error();
    data = doc.toJS({maxAliasCount:20}) ?? {};
  } catch { reject(400,'Front Matter YAML 格式无效。'); }
  if(!data || typeof data !== 'object' || Array.isArray(data)) reject(400,'Front Matter 必须是字段对象。');
  if(path.startsWith('src/content/posts/')) {
    if(typeof data.title !== 'string' || !data.title.trim()) reject(400,'文章必须有 title。');
    for(const key of ['published','updated']) {
      if(key === 'updated' && data[key] === undefined) continue;
      if(typeof data[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(data[key]) || !Number.isFinite(Date.parse(data[key]))) reject(400,`${key} 必须是有效日期。`);
    }
    for(const key of ['draft','pinned','comment','encrypted']) if(data[key] !== undefined && typeof data[key] !== 'boolean') reject(400,`${key} 必须为 true 或 false。`);
    if(data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.some(tag=>typeof tag !== 'string'))) reject(400,'tags 必须是字符串列表。');
    for(const key of ['description','image','lang','author','sourceLink','licenseName','licenseUrl','password','alias','permalink'])
      if(data[key] !== undefined && typeof data[key] !== 'string') reject(400,`${key} 必须是字符串。`);
    if(data.category != null && typeof data.category !== 'string') reject(400,'category 必须是字符串。');
    if(data.priority !== undefined && typeof data.priority !== 'number') reject(400,'priority 必须是数字。');
  }
}
const encode = (source) => {
  let binary = ''; for(const byte of encoder.encode(source)) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const decode = (source) => new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(source.replace(/\s/g,'')),c=>c.charCodeAt(0)));

// Repository, branch and API origin are fixed: never accept arbitrary destinations from clients.
export function contentService(env, request = fetch) {
  async function github(endpoint, options = {}) {
    const headers = {'Accept':'application/vnd.github+json','User-Agent':'Axis-Markdown-Editor','X-GitHub-Api-Version':'2022-11-28',...options.headers};
    if(env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    let response;
    try { response = await request(`https://api.github.com/repos/${REPO}/${endpoint}`, {...options,headers,redirect:'error',signal:AbortSignal.timeout(15000)}); }
    catch { reject(502,'GitHub 连接失败；如正在保存，请重新读取文件核对提交结果后再重试。'); }
    if(!response.ok) {
      if(response.status === 409 || response.status === 422) reject(409,'文件已被更新，或分支规则拒绝提交。请保留编辑内容，重新读取后合并。');
      if(response.status === 404) reject(404,'GitHub 文件不存在或 Token 无权访问仓库。');
      if(response.status === 401 || response.status === 403 || response.status === 429) reject(503,'GitHub 权限不足、Token 失效或请求额度已用尽，请检查 Worker 配置。');
      reject(502,'GitHub 暂时无法处理请求。');
    }
    return response.json();
  }
  async function list() {
    const result = await github(`git/trees/${BRANCH}?recursive=1`);
    if(result.truncated) reject(503,'仓库目录过大，无法安全列出全部文章。');
    const items = result.tree.filter(entry=>entry.type === 'blob' && entry.mode === '100644' && entry.path.startsWith('src/content/') && entry.path.endsWith('.md'))
      .map(entry=>({path:entry.path,sha:entry.sha,size:entry.size}));
    return {items,canWrite:Boolean(env.GITHUB_TOKEN),repository:REPO,branch:BRANCH};
  }
  async function read(path) {
    path = contentPath(path);
    const result = await github(`contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${BRANCH}`);
    if(result.type !== 'file' || result.path !== path || result.submodule_git_url || result.target) reject(400,'不能编辑链接或子模块。');
    // Contents API can dereference symlinks: verify the Git tree entry is a regular file.
    const entry = (await list()).items.find(item=>item.path === path);
    if(!entry) reject(400,'目标不是普通 Markdown 文件。');
    if(result.encoding !== 'base64' || result.size > MAX_BYTES) reject(400,'文件超过编辑器的 200 KB 限制。');
    let source; try { source=decode(result.content); } catch { reject(400,'文件不是有效 UTF-8 文本。'); }
    return {path,sha:result.sha,source,canWrite:Boolean(env.GITHUB_TOKEN)};
  }
  async function save(input) {
    if(!env.GITHUB_TOKEN) reject(503,'尚未配置 Worker 加密变量 GITHUB_TOKEN，当前仅可读取。');
    const path = contentPath(input.path);
    if(typeof input.sha !== 'string' || !/^[a-f0-9]{40}$/.test(input.sha)) reject(400,'缺少有效的文件版本 SHA。');
    validateMarkdown(path,input.source);
    const current = await read(path);
    if(current.sha !== input.sha) reject(409,'文件已被其他提交修改。请保留编辑内容，重新读取并合并后保存。');
    if(current.source === input.source) return {unchanged:true,sha:current.sha};
    const result = await github(`contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:`docs: 更新 ${path}`,content:encode(input.source),sha:input.sha,branch:BRANCH}),
    });
    return {sha:result.content.sha,commitUrl:`https://github.com/${REPO}/commit/${result.commit.sha}`,unchanged:false};
  }
  return {list,read,save};
}

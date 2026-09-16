import { hashPassword, verifyPassword, issueToken, tokenSubject, fingerprint } from './auth.mjs';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const now = () => new Date().toISOString();
const day = () => new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const stmt = (db, sql, ...values) => db.prepare(sql).bind(...values);
const one = (db, sql, ...values) => stmt(db, sql, ...values).first();
const rows = async (db, sql, ...values) => (await stmt(db, sql, ...values).all()).results;
const safeUser = ({passwordHash, ...user}) => user;
const articleSelect = 'SELECT a.*, u.username AS authorName FROM articles a JOIN users u ON u.id=a.authorId';
const feedbackSelect = 'SELECT f.*, u.username AS authorName, u.email AS authorEmail FROM feedback_messages f JOIN users u ON u.id=f.authorId';
function article(row, publicList = false) {
  if(!row) fail(404,'Article not found');
  const {authorId,authorName,...result} = row;
  result.tags = JSON.parse(result.tags);
  result.author = {id:authorId,username:authorName};
  if(publicList) { delete result.content; delete result.status; }
  return result;
}
function feedback(row, publicOnly = false) {
  if(!row) fail(404,'Message not found');
  const result = {id:row.id,text:row.text,color:row.color,timestamp:Date.parse(row.createdAt)};
  return publicOnly ? result : {...result,status:row.status,createdAt:row.createdAt,updatedAt:row.updatedAt,author:{id:row.authorId,username:row.authorName,email:row.authorEmail}};
}
function text(value, name, min, max, trim = true) {
  if(typeof value !== 'string') fail(400,`${name} must be a string`);
  const result = trim ? value.trim() : value;
  if(result.length < min || result.length > max) fail(400,`${name} must contain ${min}-${max} characters`);
  return result;
}
function choice(value, values, name) {
  if(!values.includes(value)) fail(400,`Invalid ${name}`);
  return value;
}
function integer(value, fallback, max) {
  if(value === null) return fallback;
  const n = Number(value);
  if(!Number.isSafeInteger(n) || n < 1 || n > max) fail(400,'Invalid pagination');
  return n;
}
async function body(request) {
  if(!request.headers.get('content-type')?.includes('application/json')) fail(415,'Expected application/json');
  // Stream with a cap: do not buffer arbitrarily large unauthenticated bodies.
  const reader = request.body?.getReader();
  if(!reader) fail(400,'Missing JSON body');
  let size = 0; const chunks = [];
  for(;;) {
    const {value,done} = await reader.read();
    if(done) break;
    size += value.byteLength;
    if(size > 262144) { await reader.cancel(); fail(413,'Request body too large'); }
    chunks.push(value);
  }
  const data = new Uint8Array(size); let offset=0;
  for(const chunk of chunks) { data.set(chunk,offset); offset+=chunk.length; }
  let result;
  try { result = JSON.parse(new TextDecoder().decode(data)); } catch { fail(400,'Invalid JSON'); }
  if(!result || Array.isArray(result) || typeof result !== 'object') fail(400,'Expected JSON object');
  return result;
}
async function limit(db, key, max, seconds = 60) {
  const time = Math.floor(Date.now()/1000);
  const result = await one(db, `INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,
    expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count`,key,time+seconds,time,time);
  if(result.count > max) fail(429,'Too many requests. Please try again later.');
}
async function currentUser(request, env, admin = false) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([^ ]+)$/)?.[1];
  if(!token || token.length>4096) fail(401,'Please log in');
  const id = await tokenSubject(token,env.JWT_SECRET);
  const user = id ? await one(env.DB,'SELECT * FROM users WHERE id=?',id) : null;
  if(!user) fail(401,'Session expired');
  if(admin && user.role !== 'ADMIN') fail(403,'Administrator access required');
  return safeUser(user);
}
async function auth(request,env,path,ip) {
  if(path === '/auth/me' && request.method === 'GET') return json(await currentUser(request,env));
  if(!['/auth/login','/auth/register'].includes(path) || request.method !== 'POST') return null;
  await limit(env.DB,'auth-global',200,60);
  await limit(env.DB,'auth:'+ip,20,900);
  const input = await body(request);
  const password = text(input.password,'password',8,128,false);
  let user;
  if(path === '/auth/register') {
    const username = text(input.username,'username',3,50);
    if(!/^[\p{L}\p{N}_-]+$/u.test(username)) fail(400,'Invalid username');
    const email = text(input.email,'email',3,255).toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'Invalid email');
    const id = crypto.randomUUID(); const date = now();
    // Validate the signing configuration before inserting an account.
    await issueToken(id,env.JWT_SECRET);
    await stmt(env.DB,'INSERT INTO users(id,username,email,passwordHash,role,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',id,username,email,await hashPassword(password),'USER',date,date).run();
    user = await one(env.DB,'SELECT * FROM users WHERE id=?',id);
  } else {
    const account = text(input.account,'account',1,255);
    await limit(env.DB,'account:'+await fingerprint(account.toLowerCase()),10,900);
    user = await one(env.DB,'SELECT * FROM users WHERE email=? OR username=?',account,account);
    // Perform password derivation even for an unknown account.
    const dummy = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    if(!await verifyPassword(password,user?.passwordHash ?? dummy) || !user) fail(401,'Invalid account or password');
  }
  return json({accessToken:await issueToken(user.id,env.JWT_SECRET),tokenType:'Bearer',expiresIn:'7d',user:safeUser(user)});
}
function articleInput(input, existing = {}) {
  const output = {};
  for(const [key,min,max] of [['title',1,255],['content',1,200000],['summary',1,500]]) output[key]=text(input[key] ?? existing[key],key,min,max,key!=='content');
  for(const key of ['category','coverImage']) {
    const value = input[key] === undefined ? existing[key] : input[key];
    output[key] = value == null || value === '' ? null : text(value,key,1,key==='category'?100:500);
  }
  if(output.coverImage && !/^(https?:\/\/|\/(?!\/))/.test(output.coverImage)) fail(400,'Invalid cover image URL');
  const tags = input.tags ?? existing.tags ?? [];
  if(!Array.isArray(tags) || tags.length>20) fail(400,'Invalid tags');
  output.tags = JSON.stringify([...new Set(tags.map(t=>text(t,'tag',1,50)))]);
  output.status = choice(input.status ?? existing.status ?? 'DRAFT',['DRAFT','PUBLISHED'],'status');
  output.publishedAt = output.status === 'DRAFT' ? null : input.publishedAt || existing.publishedAt || now();
  if(output.publishedAt) {
    if(typeof output.publishedAt !== 'string' || !Number.isFinite(Date.parse(output.publishedAt))) fail(400,'Invalid publishedAt');
    output.publishedAt = new Date(output.publishedAt).toISOString();
  }
  const slug = input.slug || existing.slug || output.title;
  output.slug = text(slug,'slug',1,255).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'') || crypto.randomUUID();
  return output;
}
async function articleRoutes(request,env,path,url,ip) {
  if(!path.startsWith('/articles/')) return null;
  const admin = path === '/articles/admin' || path.startsWith('/articles/admin/');
  const user = admin ? await currentUser(request,env,true) : null;
  const base = admin ? '/articles/admin' : '/articles/public';
  if(path === base && request.method === 'GET') {
    const p=url.searchParams; const page=integer(p.get('page'),1,100000); const pageSize=integer(p.get('pageSize'),admin?20:6,100);
    const where=[]; const args=[];
    if(!admin) { where.push("a.status='PUBLISHED'"); }
    else if(p.has('status')) { where.push('a.status=?'); args.push(choice(p.get('status'),['DRAFT','PUBLISHED'],'status')); }
    if(p.has('keyword')) { where.push('(a.title LIKE ? OR a.summary LIKE ?)'); const key=text(p.get('keyword'),'keyword',0,200); args.push('%'+key+'%','%'+key+'%'); }
    if(p.has('category')) { where.push('a.category=?'); args.push(text(p.get('category'),'category',0,100)); }
    if(p.has('tag')) { where.push('EXISTS(SELECT 1 FROM json_each(a.tags) WHERE value=?)'); args.push(text(p.get('tag'),'tag',1,50)); }
    const clause=where.length?' WHERE '+where.join(' AND '):'';
    const {total}=await one(env.DB,'SELECT COUNT(*) AS total FROM articles a'+clause,...args);
    const items=await rows(env.DB,articleSelect+clause+` ORDER BY a.${admin?'updatedAt':'publishedAt'} DESC, a.id LIMIT ? OFFSET ?`,...args,pageSize,(page-1)*pageSize);
    return json({items:items.map(r=>article(r,!admin)),meta:{page,pageSize,total,totalPages:Math.ceil(total/pageSize)}});
  }
  if(admin && path===base && request.method==='POST') {
    const data=articleInput(await body(request)); const id=crypto.randomUUID(); const date=now();
    const keys=Object.keys(data);
    await stmt(env.DB,`INSERT INTO articles(id,authorId,createdAt,updatedAt,${keys.join(',')}) VALUES(${Array(4+keys.length).fill('?').join(',')})`,id,user.id,date,date,...Object.values(data)).run();
    return json(article(await one(env.DB,articleSelect+' WHERE a.id=?',id)),201);
  }
  if(!path.startsWith(base+'/')) return null;
  let id; try { id=decodeURIComponent(path.slice(base.length+1)); } catch { fail(400,'Invalid path'); }
  if(!id || id.includes('/')) fail(404,'Not found');
  const existing=await one(env.DB,articleSelect+` WHERE a.${admin?'id':'slug'}=?`+(!admin?" AND a.status='PUBLISHED'":''),id);
  const result=article(existing);
  if(request.method==='GET') {
    if(!admin) {
      // Use Cloudflare's trusted IP rather than a freely rotating client visitor ID.
      await limit(env.DB,'read-global',600);
      await limit(env.DB,'read:'+ip,60);
      await env.DB.batch([
        stmt(env.DB,'UPDATE articles SET viewCount=viewCount+1 WHERE id=?',result.id),
        stmt(env.DB,`INSERT INTO article_reads(day,articleId,visitor,views) VALUES(?,?,?,1)
          ON CONFLICT(day,articleId,visitor) DO UPDATE SET views=views+1`,day(),result.id,ip),
        stmt(env.DB,'INSERT INTO visitors(id,lastSeen) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET lastSeen=excluded.lastSeen',ip,Date.now()),
      ]);
      result.viewCount++;
      delete result.status;
    }
    return json(result);
  }
  if(admin && request.method==='PATCH') {
    const data=articleInput(await body(request),result);
    await stmt(env.DB,`UPDATE articles SET ${Object.keys(data).map(k=>k+'=?').join(',')},updatedAt=? WHERE id=?`,...Object.values(data),now(),id).run();
    return json(article(await one(env.DB,articleSelect+' WHERE a.id=?',id)));
  }
  if(admin && request.method==='DELETE') {
    await stmt(env.DB,'DELETE FROM articles WHERE id=?',id).run();
    return json({id,title:result.title,slug:result.slug,deleted:true});
  }
  fail(405,'Method not allowed');
}
async function feedbackRoutes(request,env,path,url) {
  const base='/feedback/messages';
  if(!path.startsWith(base)) return null;
  if(path===base+'/public' && request.method==='GET') {
    const data=await rows(env.DB,"SELECT * FROM feedback_messages WHERE status='APPROVED' ORDER BY createdAt DESC LIMIT ?",integer(url.searchParams.get('limit'),80,100));
    return json(data.reverse().map(r=>feedback(r,true)));
  }
  const admin=path.startsWith(base+'/admin');
  const user=await currentUser(request,env,admin);
  if(path===base && request.method==='POST') {
    await limit(env.DB,'feedback:'+user.id,5);
    await limit(env.DB,'feedback-global',100);
    const data=await body(request); const message=text(data.text,'text',1,50); const color=data.color ?? '#fb78ad';
    if(typeof color!=='string' || !/^#[0-9a-f]{6}$/i.test(color)) fail(400,'Invalid color');
    const id=crypto.randomUUID(); const date=now();
    await stmt(env.DB,'INSERT INTO feedback_messages(id,text,color,authorId,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',id,message,color,user.id,date,date).run();
    return json(feedback(await one(env.DB,feedbackSelect+' WHERE f.id=?',id)),201);
  }
  if(path===base+'/admin' && request.method==='GET') {
    const p=url.searchParams; const page=integer(p.get('page'),1,100000); const pageSize=integer(p.get('pageSize'),20,100);
    const status=p.has('status')?choice(p.get('status'),['PENDING','APPROVED','REJECTED'],'status'):null;
    const clause=status?' WHERE f.status=?':''; const args=status?[status]:[];
    const {total}=await one(env.DB,'SELECT COUNT(*) AS total FROM feedback_messages f'+clause,...args);
    const data=await rows(env.DB,feedbackSelect+clause+' ORDER BY f.createdAt DESC LIMIT ? OFFSET ?',...args,pageSize,(page-1)*pageSize);
    return json({items:data.map(r=>feedback(r)),meta:{page,pageSize,total,totalPages:Math.ceil(total/pageSize)}});
  }
  const match=path.match(/^\/feedback\/messages\/admin\/([^/]+)\/status$/);
  if(match && request.method==='PATCH') {
    const status=choice((await body(request)).status,['PENDING','APPROVED','REJECTED'],'status');
    await stmt(env.DB,'UPDATE feedback_messages SET status=?,updatedAt=? WHERE id=?',status,now(),match[1]).run();
    return json(feedback(await one(env.DB,feedbackSelect+' WHERE f.id=?',match[1])));
  }
  fail(404,'Not found');
}
async function dashboard(request,env,path,ip) {
  if(path==='/dashboard/presence' && request.method==='POST') {
    await limit(env.DB,'presence-global',600);
    await limit(env.DB,'presence:'+ip,3);
    await stmt(env.DB,'INSERT INTO visitors(id,lastSeen) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET lastSeen=excluded.lastSeen',ip,Date.now()).run();
    return json({ok:true});
  }
  if(path!=='/dashboard/snapshot' || request.method!=='GET') return null;
  await currentUser(request,env,true);
  const date=day();
  const {onlineVisitors}=await one(env.DB,'SELECT COUNT(*) AS onlineVisitors FROM visitors WHERE lastSeen>?',Date.now()-90000);
  const counts=await one(env.DB,'SELECT COALESCE(SUM(views),0) AS todayPageViews,COUNT(DISTINCT visitor) AS todayUniqueVisitors FROM article_reads WHERE day=?',date);
  const hotArticles=await rows(env.DB,`SELECT a.id AS articleId,a.slug,a.title,SUM(r.views) AS todayViewCount,a.viewCount AS totalViewCount
    FROM article_reads r JOIN articles a ON a.id=r.articleId WHERE r.day=? AND a.status='PUBLISHED'
    GROUP BY a.id ORDER BY todayViewCount DESC LIMIT 5`,date);
  return json({onlineVisitors,...counts,todayNewReadCount:counts.todayPageViews,hotArticles,generatedAt:now()});
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if(!url.pathname.startsWith('/api/v1/')) fail(404,'API not found');
      if(!env.DB) fail(503,'D1 database binding DB is missing');
      const path=url.pathname.slice('/api/v1'.length).replace(/\/$/,'');
      // Same-origin API. No permissive CORS headers or cookie-based authentication.
      if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{Allow:'GET, POST, PATCH, DELETE, OPTIONS'}});
      if(path==='/health' && request.method==='GET') {
        await one(env.DB,'SELECT id FROM users LIMIT 1');
        return json({status:'ok',database:'D1'});
      }
      const ip=await fingerprint(day()+':'+(request.headers.get('CF-Connecting-IP') || 'local'));
      return await auth(request,env,path,ip) || await articleRoutes(request,env,path,url,ip) || await feedbackRoutes(request,env,path,url) || await dashboard(request,env,path,ip) || json({message:'API not found'},404);
    } catch(error) {
      if(error instanceof HttpError) return json({message:error.message},error.status);
      if(String(error.message).includes('UNIQUE constraint failed')) return json({message:'Username, email or slug already exists'},409);
      console.error('API error',error.message);
      return json({message:'Service unavailable. Check database migrations and Worker secrets.'},503);
    }
  },
  async scheduled(_event,env) {
    // Daily cleanup keeps bounded operational data; article lifetime counts remain intact.
    await env.DB.batch([
      stmt(env.DB,'DELETE FROM rate_limits WHERE expires<?',Math.floor(Date.now()/1000)),
      stmt(env.DB,'DELETE FROM visitors WHERE lastSeen<?',Date.now()-90000),
      stmt(env.DB,'DELETE FROM article_reads WHERE day<?',new Date(Date.now()-7*86400000).toISOString().slice(0,10)),
    ]);
  },
};

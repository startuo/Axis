import { entryRoutes, publishedEntries, publicationStatements } from './entries.mjs';
import { profileRoutes } from './profile.mjs';
import { mediaRoutes, serveMedia } from './media.mjs';
import { mirrorRoutes, dispatchMirror } from './mirror.mjs';
import { hashPassword, verifyPassword, issueToken, tokenSubject, fingerprint } from './auth.mjs';

import { HttpError, fail, json, now, day, stmt, one, rows, safeUser, feedback, text, choice, integer, body, limit, currentUser } from './core.mjs';
const feedbackSelect = 'SELECT f.*, u.username AS authorName, u.email AS authorEmail FROM feedback_messages f JOIN users u ON u.id=f.authorId';
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
async function articleRoutes(request,env,path,url,ip) {
  if(!path.startsWith('/articles/')) return null;
  if(path.startsWith('/articles/admin')) { await currentUser(request,env,true); fail(410,'文章管理已迁移至 /content/manage/posts，请刷新后台。'); }
  if(request.method!=='GET') fail(405,'Method not allowed');
  const entries=await publishedEntries(env.DB,'posts');
  if(path==='/articles/public') return json({items:entries.map(e=>({...e,summary:e.description,coverImage:e.image,publishedAt:e.published,author:{username:'STAR'}})),meta:{page:1,pageSize:entries.length,total:entries.length,totalPages:1}});
  const slug=decodeURIComponent(path.slice('/articles/public/'.length));
  const entry=entries.find(e=>e.slug===slug);
  if(!entry) fail(404,'Article not found');
  return json({...entry,summary:entry.description,coverImage:entry.image,publishedAt:entry.published,author:{username:'STAR'}});
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
    if(!await one(env.DB,'SELECT id FROM feedback_messages WHERE id=?',match[1])) fail(404,'Message not found');
    await env.DB.batch([stmt(env.DB,'UPDATE feedback_messages SET status=?,updatedAt=? WHERE id=?',status,now(),match[1]),...publicationStatements(env.DB)]);
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
    if(url.pathname.startsWith('/media/')) return serveMedia(request,env);
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
      if(path === '/content/admin') { await currentUser(request,env,true); fail(410,'Markdown 编辑已迁移至统一文章管理。'); }
      return await entryRoutes(request,env,path,url) || await profileRoutes(request,env,path) || await mediaRoutes(request,env,path) || await mirrorRoutes(request,env,path) || await auth(request,env,path,ip) || await articleRoutes(request,env,path,url,ip) || await feedbackRoutes(request,env,path,url) || await dashboard(request,env,path,ip) || json({message:'API not found'},404);
    } catch(error) {
      if(error instanceof HttpError) return json({message:error.message},error.status);
      if(String(error.message).includes('UNIQUE constraint failed')) return json({message:'Username, email or slug already exists'},409);
      console.error('API error',error.message);
      return json({message:'Service unavailable. Check database migrations and Worker secrets.'},503);
    }
  },
  async scheduled(_event,env) {
    await dispatchMirror(env);
    // Daily cleanup keeps bounded operational data; article lifetime counts remain intact.
    await env.DB.batch([
      stmt(env.DB,'DELETE FROM rate_limits WHERE expires<?',Math.floor(Date.now()/1000)),
      stmt(env.DB,'DELETE FROM visitors WHERE lastSeen<?',Date.now()-90000),
      stmt(env.DB,'DELETE FROM article_reads WHERE day<?',new Date(Date.now()-7*86400000).toISOString().slice(0,10)),
    ]);
  },
};

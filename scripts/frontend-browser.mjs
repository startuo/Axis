// Local, isolated browser regression. No production writes or credentials.
// AXIS_PLAYWRIGHT_MODULE may point to a preinstalled playwright/index.mjs.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, stat, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';

const label = process.argv[2] || 'after';
const root = resolve(process.env.AXIS_TEST_DIST || 'dist');
const output = resolve('output/playwright/frontend', label);
await mkdir(output, {recursive:true});
const {chromium} = await import(process.env.AXIS_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.AXIS_PLAYWRIGHT_MODULE).href : 'playwright');
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.woff2':'font/woff2','.ttf':'font/ttf','.moc':'application/octet-stream'};
const server = createServer(async(req,res)=>{
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let file = resolve(root, '.' + pathname);
    if(file !== root && !file.startsWith(root+sep)) throw new Error('path');
    if((await stat(file)).isDirectory()) file=resolve(file,'index.html');
    const body=await readFile(file);
    res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'public,max-age=3600'}).end(body);
  } catch {res.writeHead(404).end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:process.env.AXIS_TEST_HEADED!=='1',
  ...(process.env.AXIS_TEST_HEADED==='1'?{ignoreDefaultArgs:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']}:{}),
  args:['--autoplay-policy=no-user-gesture-required',...(process.env.AXIS_TEST_HEADED==='1'?['--window-position=-32000,-32000']:[])]});
const browserCDP=await browser.newBrowserCDPSession();
const ownedNativeBrowsers=[],ownedNativeProcesses=[];
const results={label,root,completed:false,browser:browser.version(),conditions:'isolated Edge; local static build; warm navigation cache; actual local images/Pio; deterministic local music transport',scenarios:[],errors:[],failures:[]};

function instrument() {
  const timers=new Map(),rafs=new Set(),observers=[];
  const native=Object.fromEntries(['setInterval','clearInterval','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame'].map(key=>[key,window[key].bind(window)]));
  window.setInterval=(fn,delay,...args)=>{const id=native.setInterval(fn,delay,...args);timers.set(id,{kind:'interval',delay});return id;};
  window.clearInterval=id=>{timers.delete(id);native.clearInterval(id);};
  window.setTimeout=(fn,delay,...args)=>{
    const id=native.setTimeout((...values)=>{timers.delete(id);typeof fn==='function'?fn(...values):eval(fn);},delay,...args);
    timers.set(id,{kind:'timeout',delay});return id;
  };
  window.clearTimeout=id=>{timers.delete(id);native.clearTimeout(id);};
  window.requestAnimationFrame=fn=>{const id=native.requestAnimationFrame(t=>{rafs.delete(id);fn(t);});rafs.add(id);return id;};
  window.cancelAnimationFrame=id=>{rafs.delete(id);native.cancelAnimationFrame(id);};
  for(const name of ['IntersectionObserver','ResizeObserver','MutationObserver']) {
    const Base=window[name];
    window[name]=class extends Base {
      constructor(...args){super(...args);this.record={kind:name,targets:new Set(),instance:new WeakRef(this)};observers.push(this.record);}
      observe(target,...args){if(![...this.record.targets].some(r=>r.deref()===target))this.record.targets.add(new WeakRef(target));return super.observe(target,...args);}
      unobserve(target){for(const ref of this.record.targets)if(ref.deref()===target)this.record.targets.delete(ref);return super.unobserve(target);}
      disconnect(){this.record.targets.clear();return super.disconnect();}
    };
  }
  const vital={lcp:0,cls:0,longTasks:[]},frames=[];
  new PerformanceObserver(list=>{for(const e of list.getEntries())vital.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
  new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)vital.cls+=e.value;}).observe({type:'layout-shift',buffered:true});
  new PerformanceObserver(list=>{for(const e of list.getEntries())vital.longTasks.push(e.duration);}).observe({type:'longtask',buffered:true});
  window.__frontendProbe={vital,frames,snapshot:()=>({timers:[...timers.values()],rafs:rafs.size,
    observers:observers.filter(o=>o.instance.deref()).map(o=>({kind:o.kind,targets:[...o.targets].filter(r=>r.deref()).length,detached:[...o.targets].filter(r=>r.deref()&&!r.deref().isConnected).length})),
    visibleThemeBlocks:window.themeOptimizer?.visibleBlocks?.size??0,
    detachedThemeBlocks:[...(window.themeOptimizer?.visibleBlocks??[])].filter(b=>!b.isConnected).length})};
}
async function sample(page,cdp,name){
  await cdp.send('HeapProfiler.collectGarbage');
  const dom=await cdp.send('Memory.getDOMCounters');
  const metrics=(await cdp.send('Performance.getMetrics')).metrics;
  let processes=null;
  try {
    const list=(await browserCDP.send('SystemInfo.getProcessInfo')).processInfo;
    const ids=list.map(p=>Number(p.id)).filter(Number.isSafeInteger);
    const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`],{windowsHide:true});
    processes=JSON.parse(stdout);
  } catch {}
  return {name,...dom,browserNodes:dom.nodes,heap:metrics.find(m=>m.name==='JSHeapUsedSize')?.value,processes,
    rendering:Object.fromEntries(metrics.filter(m=>/Layout|RecalcStyle|TaskDuration/.test(m.name)).map(m=>[m.name,m.value])),
    ...await page.evaluate(()=>({probe:window.__frontendProbe.snapshot(),nodes:document.querySelectorAll('*').length,
      sakura:document.querySelectorAll('#canvas_sakura').length,pio:document.querySelectorAll('#pio').length,audio:document.querySelectorAll('audio').length,
      audioState:(()=>{const audio=document.querySelector('audio');return audio?{currentTime:audio.currentTime,paused:audio.paused,volume:audio.volume,src:audio.currentSrc}:null;})(),
      fullscreenHints:[...document.querySelectorAll('[data-fullscreen-wallpaper] img')].filter(e=>getComputedStyle(e).willChange!=='auto').length,
      images:performance.getEntriesByType('resource').filter(e=>/\.(webp|jpg|png)(\?|$)/.test(e.name)).map(e=>({url:new URL(e.name).pathname,transfer:e.transferSize,decoded:e.decodedBodySize})),
      vitals:window.__frontendProbe.vital}))};
}
const check=(condition,message)=>{if(!condition)results.failures.push(message);};
const screenshotStyle='#canvas_sakura, .pio-container, .pio-dialog, .banner-text-overlay, .music-player, .fixed.bottom-20.right-4.z-60 {visibility:hidden !important;}';
async function frames(page,ms){return page.evaluate(ms=>new Promise(resolve=>{
  const values=[];let last,start;
  const frame=time=>{start??=time;if(last!==undefined)values.push(time-last);last=time;
    if(time-start<ms)requestAnimationFrame(frame);
    else {values.sort((a,b)=>a-b);resolve({count:values.length,p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],max:values.at(-1),over50:values.filter(v=>v>50).length});}};
  requestAnimationFrame(frame);
}),ms);}
async function run(viewport){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block'});
  await context.addInitScript(instrument);
  // Third-party availability must not change the lifecycle workload between runs.
  const wav=Buffer.alloc(44+8000*2*120);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  await context.route('https://api.injahow.cn/**',route=>route.fulfill({json:[{id:1,name:'Lifecycle fixture',artist:'Local',pic:origin+'/favicon/favicon-32x32.png',url:origin+'/__fixture.wav',duration:120}]}));
  await context.route('**/__fixture.wav',route=>route.fulfill({body:wav,contentType:'audio/wav'}));
  await context.route(/google|umami|googletagmanager|clarity\.ms/,route=>route.abort());
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  page.on('pageerror',error=>results.errors.push({viewport,message:error.message,stack:error.stack}));
  const run={viewport,samples:[],carousel:[],requests:[],screenshots:[]};
  page.on('request',r=>run.requests.push({url:r.url().replace(origin,''),type:r.resourceType()}));
  await page.goto(origin,{waitUntil:'load'});
  await page.waitForFunction(()=>window.swup&&window.themeOptimizer&&document.querySelector('#canvas_sakura'));
  await page.waitForTimeout(1500);
  const identities=await page.evaluate(()=>{window.__persistentNodes={banner:document.querySelector('#banner-carousel'),audio:document.querySelector('audio'),pio:document.querySelector('#pio')};return !!window.__persistentNodes.audio;});
  check(identities,'music mounted');
  await page.mouse.move(viewport.width-5,viewport.height-5);
  run.samples.push(await sample(page,cdp,'initial'));
  const capture=async name=>{const path=resolve(output,`${viewport.width}-${name}.png`);await page.screenshot({path,animations:'disabled',style:screenshotStyle});run.screenshots.push(path);};
  await capture('banner');
  await page.evaluate(()=>{
    window.__switches=[];
    const observer=new MutationObserver(entries=>{for(const e of entries){const el=e.target;if(el.matches('.carousel-item')&&el.classList.contains('opacity-100'))window.__switches.push({time:performance.now(),ready:[...el.querySelectorAll('img')].filter(i=>i.getClientRects().length).every(i=>i.complete&&i.naturalWidth>0)});}});
    observer.observe(document.querySelector('#banner-carousel'),{subtree:true,attributes:true,attributeFilter:['class']});
  });
  run.bannerFrames=await frames(page,8000);
  run.carousel=await page.evaluate(()=>window.__switches);
  const setMode=async mode=>{await page.evaluate(mode=>{localStorage.setItem('wallpaperMode',mode);window.dispatchEvent(new CustomEvent('wallpaper-mode-change',{detail:{mode}}));},mode);await page.waitForTimeout(1200);};
  await setMode('fullscreen');
  await capture('fullscreen');
  run.samples.push(await sample(page,cdp,'fullscreen'));
  await page.evaluate(()=>{
    window.__fullSwitches=[];let last;
    const observer=new MutationObserver(entries=>{for(const {target} of entries){if(!(target instanceof HTMLImageElement)||target.style.opacity!=='1'||!target.getClientRects().length)continue;
      if(target===last)continue;last=target;window.__fullSwitches.push({time:performance.now(),src:target.src,ready:target.complete&&target.naturalWidth>0});}});
    observer.observe(document.querySelector('[data-fullscreen-wallpaper]'),{subtree:true,attributes:true,attributeFilter:['style']});
  });
  run.fullscreenFrames=await frames(page,10500);
  run.fullscreenSwitches=await page.evaluate(()=>window.__fullSwitches);
  run.fullscreen=await page.evaluate(()=>[...document.querySelectorAll('[data-fullscreen-wallpaper] img')].filter(i=>i.style.opacity==='1').map(i=>({src:i.src,ready:i.complete&&i.naturalWidth>0})));
  for(let i=0;i<3;i++)for(const mode of ['none','banner','fullscreen'])await setMode(mode);
  await setMode('none');run.samples.push(await sample(page,cdp,'none'));await capture('none');
  await setMode('banner');
  for(let i=0;i<4;i++){await page.locator('#scheme-switch').click();await page.waitForTimeout(600);}
  await capture('theme');
  // Actual Swup navigation, without reloading the document.
  const navigate=async path=>{
    await page.evaluate(path=>window.swup.navigate(path),path);
    await page.waitForFunction(path=>location.pathname.replace(/\/$/,'')===path.replace(/\/$/,'')&&!document.documentElement.classList.contains('is-changing'),path);
    await page.waitForTimeout(350);
  };
  const post=await page.locator('main a[href*="/posts/"]').first().getAttribute('href');
  assert.ok(post,'existing post route');
  await navigate(post);
  run.audioAfterFirstNavigation=await page.evaluate(()=>{const a=document.querySelector('audio');return {same:a===window.__persistentNodes.audio,time:a.currentTime,paused:a.paused};});
  const codeRoute='/posts/markdown-tutorial/';
  if((await page.request.get(origin+codeRoute)).ok())await navigate(codeRoute);
  await capture('article');
  if(viewport.width<768){
    await page.locator('#mobile-toc-switch').click();await page.waitForTimeout(250);
    run.mobileTocArticleItems=await page.locator('#mobile-toc-panel .toc-item').count();
    check(run.mobileTocArticleItems>0,'mobile TOC opens with current article headings');
    await page.locator('#mobile-toc-panel [aria-label="Close TOC"]').click();
  }
  run.samples.push(await sample(page,cdp,'article'));
  for(let i=0;i<20;i++){
    await navigate(i%2===0?'/archive/':'/albums/');
    await navigate('/');
    if([4,9,19].includes(i))run.samples.push(await sample(page,cdp,`round-${i+1}`));
  }
  run.persistence=await page.evaluate(()=>Object.fromEntries(Object.entries(window.__persistentNodes).map(([k,n])=>[k,n?.isConnected&&n===document.querySelector(k==='banner'?'#banner-carousel':k==='audio'?'audio':'#pio')])));
  run.mobileTocHomeItems=await page.locator('#mobile-toc-panel .post-item').count();
  check(run.mobileTocHomeItems>0,'mobile TOC returns to the home post list');
  check(run.persistence.banner&&run.persistence.audio,'Banner and audio remain the same nodes through Swup');
  if(viewport.width>1280)check(run.persistence.pio,'Pio remains the same node through Swup');
  run.articleSamples=[];
  for(let i=0;i<10;i++){
    await navigate(codeRoute);await navigate('/');
    if([0,4,9].includes(i))run.articleSamples.push(await sample(page,cdp,`article-round-${i+1}`));
  }
  await navigate('/albums/');
  const album=await page.locator('main a[href*="/albums/"]').first().getAttribute('href');
  if(album){await navigate(album);await page.locator('.photo-gallery').scrollIntoViewIfNeeded();await page.waitForTimeout(500);await capture('album');
    const link=page.locator('.photo-gallery a').first();run.original=await link.getAttribute('data-src');await link.click();
    await page.waitForSelector('.fancybox__container');await page.waitForTimeout(800);
    run.lightbox=await page.evaluate(()=>[...document.querySelectorAll('.fancybox__container img')].map(i=>({src:i.src,width:i.naturalWidth})));
    await capture('fancybox');await page.keyboard.press('Escape');}
  await navigate('/');
  // Real visibilitychange using Chromium lifecycle (not a synthetic event).
  await cdp.send('Emulation.setIdleOverride',{isUserActive:false,isScreenUnlocked:false});
  const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
  await page.waitForTimeout(1000);run.background=await page.evaluate(()=>({hidden:document.hidden,probe:window.__frontendProbe.snapshot()}));
  try {
    const {windowId}=await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'minimized'}});
    await page.waitForTimeout(500);run.minimized=await page.evaluate(()=>({hidden:document.hidden,probe:window.__frontendProbe.snapshot()}));
    await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});
  } catch(error){run.minimized={unavailable:error.message};}
  await page.bringToFront();await other.close();await cdp.send('Emulation.clearIdleOverride');await page.waitForTimeout(500);
  run.samples.push(await sample(page,cdp,'final'));results.scenarios.push(run);
  if(label.startsWith('after')){
    const byName=name=>run.samples.find(s=>s.name===name);
    check(byName('round-10').documents===byName('round-20').documents,'parsed document count remains stable after warm navigation');
    check(byName('round-20').browserNodes<=byName('round-10').browserNodes+50,'DOM count remains bounded after warm navigation');
    check(byName('round-20').jsEventListeners<=byName('round-10').jsEventListeners+5,'event listeners remain bounded after warm navigation');
    for(const sample of run.articleSamples)check(sample.probe.observers.every(o=>o.detached===0),'article round trip releases all detached observer targets');
  }
  await context.close();
}
async function visual(viewport,mode,theme){
  if(process.env.AXIS_TEST_VISUAL_MATCH&&!new RegExp(process.env.AXIS_TEST_VISUAL_MATCH).test(`${viewport.width}-${mode}-${theme}`))return;
  const context=await browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block'});
  await context.addInitScript(({mode,theme})=>{
    // Keep calendar / elapsed-day text comparable across baseline and later runs.
    // This fixture affects only stills; the navigation and animation workload uses real time.
    const NativeDate=window.Date,fixed=NativeDate.UTC(2026,9,22,4);
    window.Date=class extends NativeDate {
      constructor(...args){super(...(args.length?args:[fixed]));}
      static now(){return fixed;}
    };
    localStorage.setItem('wallpaperMode',mode);localStorage.setItem('theme',theme);sessionStorage.setItem('mizuki_wallpaper_index','0');
    // Hold carousel timers only for reproducible stills; the workload above uses real timers.
    const interval=window.setInterval.bind(window);
    window.setInterval=(fn,delay,...args)=>interval(fn,delay===2500||delay===5000?3600000:delay,...args);
  },{mode,theme});
  await context.route(/google|umami|googletagmanager|clarity\.ms|api\.injahow\.cn/,r=>r.abort());
  const page=await context.newPage();await page.goto(origin,{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('#canvas_sakura'));
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>Promise.all([...document.querySelectorAll('#banner-carousel img,[data-fullscreen-wallpaper] img')].map(img=>{img.loading='eager';return img.decode().catch(()=>{});})));
  await page.waitForTimeout(1600);
  await page.evaluate(async()=>{
    await Promise.all([...document.images].filter(image=>{
      const r=image.getBoundingClientRect();return r.width&&r.height&&r.bottom>0&&r.top<innerHeight;
    }).map(image=>image.decode().catch(()=>{})));
    await document.fonts.ready;
    const finite=document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations!==Infinity);
    await Promise.race([Promise.all(finite.map(animation=>animation.finished.catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,3000))]);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  const path=resolve(output,`visual-${viewport.width}-${mode}-${theme}.png`);
  await page.screenshot({path,animations:'disabled',style:screenshotStyle});
  results.visual??=[];results.visual.push({viewport,mode,theme,path,geometry:await page.evaluate(()=>Object.fromEntries(['#banner-wrapper','#main-grid','#navbar','[data-fullscreen-wallpaper]'].map(sel=>{const el=document.querySelector(sel),r=el.getBoundingClientRect(),s=getComputedStyle(el);return [sel,{x:r.x,y:r.y,width:r.width,height:r.height,opacity:s.opacity,display:s.display}];})))});
  await context.close();
}
async function mediaRegression(){
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.addInitScript(()=>{
    const active=new Set(),create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{const url=create(blob);active.add(url);return url;};
    URL.revokeObjectURL=url=>{active.delete(url);revoke(url);};window.__blobUrls=active;
    localStorage.setItem('theme','light');localStorage.setItem('wallpaperMode','banner');
  });
  await context.route(/google|umami|googletagmanager|clarity\.ms|api\.injahow\.cn/,r=>r.abort());
  const albumHTML=await readFile(resolve(root,'albums/AcgExample/index.html'),'utf8');
  const figures=[...albumHTML.matchAll(/<figure\b[\s\S]*?<\/figure>/g)].map(m=>m[0]);
  assert.ok(figures.length);
  const imagePath=figures[0].match(/data-src="([^"]+)"/)[1];
  const gallery=Array.from({length:80},(_,i)=>figures[0].replace('<figure ','<figure style="aspect-ratio:1" ').replaceAll(imagePath,imagePath+`?lazy-fixture=${i}`)).join('');
  let fixture=albumHTML.replace(figures.join(''),gallery);
  // Whitespace separates generated figures, so replace their whole span.
  fixture=albumHTML.slice(0,albumHTML.indexOf(figures[0]))+gallery+albumHTML.slice(albumHTML.lastIndexOf(figures.at(-1))+figures.at(-1).length);
  await context.route(origin+'/albums/AcgExample/',r=>r.fulfill({body:fixture,contentType:'text/html'}));
  const page=await context.newPage(),requests=[];const media={errors:[],fixture:'80 repeated actual album figures, fixed square only in test HTML, unique query strings; same original image bytes'};
  results.media=media;
  page.on('pageerror',e=>media.errors.push(e.stack));page.on('request',r=>{if(r.url().includes('lazy-fixture='))requests.push(r.url());});
  await page.goto(origin+'/albums/AcgExample/',{waitUntil:'load'});await page.waitForTimeout(1800);
  media.lazyInitial=new Set(requests).size;
  await page.locator('.photo-gallery a').first().click();await page.waitForSelector('.fancybox__container');await page.waitForTimeout(500);
  media.lightboxOriginal=await page.locator('.fancybox__container img').first().getAttribute('src');
  media.fancyboxControls=await page.locator('.fancybox__container button').evaluateAll(buttons=>buttons.map(b=>({title:b.title,action:b.getAttribute('data-panzoom-action')})));
  let zoom=page.locator('.fancybox__container [data-panzoom-action="zoomIn"]');
  if(!await zoom.count())zoom=page.locator('.fancybox__container [data-panzoom-action="toggleFull"]');
  if(await zoom.count()){
    const imageArea=()=>page.locator('.fancybox__container img').evaluateAll(images=>Math.max(...images.map(i=>{const r=i.getBoundingClientRect();return r.width*r.height;})));
    const before=await imageArea();await zoom.first().click();await page.waitForTimeout(500);const after=await imageArea();media.zoom={before,after};
    if(label.startsWith('after'))check(after>before,'Fancybox zoom increases the original image display area');
  }
  await page.evaluate(()=>window.swup.navigate('/albums/'));
  try {await page.waitForFunction(()=>location.pathname.replace(/\/$/,'')==='/albums'&&!document.documentElement.classList.contains('is-changing'));}
  catch(error){media.navigationFailure=await page.evaluate(()=>({url:location.href,classes:document.documentElement.className,lightboxes:document.querySelectorAll('.fancybox__container').length}));throw error;}
  await page.waitForTimeout(500);
  media.lightboxesAfterNavigation=await page.locator('.fancybox__container').count();
  if(label.startsWith('after'))check(media.lightboxesAfterNavigation===0,'navigation closes the previous page lightbox');
  if(label.startsWith('after'))check(media.lazyInitial<80,'album fixture retains native lazy loading');
  await page.goto(origin+'/posts/markdown-tutorial/',{waitUntil:'load'});
  await page.locator('[aria-label="Generate Share Poster"]').click();await page.waitForSelector('img[alt="Poster"]');
  const poster=page.locator('img[alt="Poster"]');await poster.evaluate(i=>i.decode());
  const bytes=await poster.evaluate(async image=>Array.from(new Uint8Array(await (await fetch(image.src)).arrayBuffer())));
  media.poster=resolve(output,'poster.png');await writeFile(media.poster,Buffer.from(bytes));
  media.posterState=await poster.evaluate(i=>({width:i.naturalWidth,height:i.naturalHeight,blob:i.src.startsWith('blob:'),activeBlobUrls:window.__blobUrls.size}));
  await page.evaluate(()=>window.swup.navigate('/'));await page.waitForFunction(()=>location.pathname==='/'&&!document.documentElement.classList.contains('is-changing'));await page.waitForTimeout(600);
  media.blobsAfterUnmount=await page.evaluate(()=>window.__blobUrls.size);
  check(media.blobsAfterUnmount===0,'poster Blob URL is revoked after unmount');
  media.modeTransitions=[];
  for(const mode of ['fullscreen','none','banner']){
    const frames=await page.evaluate(mode=>new Promise(resolve=>{
      localStorage.setItem('wallpaperMode',mode);window.dispatchEvent(new CustomEvent('wallpaper-mode-change',{detail:{mode}}));
      const samples=[];let start;
      const read=time=>{start??=time;const root=document.querySelector('.absolute.w-full.z-30.pointer-events-none'),r=root.getBoundingClientRect();
        samples.push({time:time-start,top:r.top,left:r.left,width:r.width});
        if(time-start<1000)requestAnimationFrame(read);else resolve(samples);};requestAnimationFrame(read);
    }),mode);media.modeTransitions.push({mode,frames});
  }
  results.media=media;await context.close();
}
async function diagnose(){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route(/google|umami|googletagmanager|clarity\.ms|api\.injahow\.cn/,r=>r.abort());
  await context.addInitScript(()=>{
    const records=[],add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener=function(type,fn,options){
      const capture=typeof options==='boolean'?options:!!options?.capture;
      if(fn&&!records.some(r=>r.target.deref()===this&&r.fn.deref()===fn&&r.type===type&&r.capture===capture))
        records.push({target:new WeakRef(this),fn:new WeakRef(fn),type,capture,stack:new Error().stack});
      return add.call(this,type,fn,options);
    };
    EventTarget.prototype.removeEventListener=function(type,fn,options){
      const capture=typeof options==='boolean'?options:!!options?.capture;
      for(let i=records.length-1;i>=0;i--)if(records[i].target.deref()===this&&records[i].fn.deref()===fn&&records[i].type===type&&records[i].capture===capture)records.splice(i,1);
      return remove.call(this,type,fn,options);
    };
    window.__listeners=()=>{
      const groups={};for(const r of records){const target=r.target.deref(),fn=r.fn.deref();if(!target||!fn)continue;
        const source=String(fn).slice(0,250),name=target===window?'window':target===document?'document':target.nodeName||target.constructor.name;
        const key=r.type+' '+name+' '+source;groups[key]??={key,count:0,stack:r.stack,detached:0};groups[key].count++;
        if(target.nodeType&&target!==document&&!target.isConnected)groups[key].detached++;
      }return Object.values(groups).sort((a,b)=>b.count-a.count);
    };
  });
  const page=await context.newPage(),cdp=await context.newCDPSession(page);await page.goto(origin,{waitUntil:'load'});await page.waitForFunction(()=>window.swup);await page.waitForTimeout(600);
  results.diagnosis=[];
  for(let i=0;i<=20;i++){
    if(i){for(const path of ['/archive/','/']){await page.evaluate(path=>window.swup.navigate(path),path);await page.waitForFunction(()=>!document.documentElement.classList.contains('is-changing'));await page.waitForTimeout(200);}}
    if([0,5,10,20].includes(i)){await cdp.send('HeapProfiler.collectGarbage');results.diagnosis.push({round:i,dom:await cdp.send('Memory.getDOMCounters'),listeners:await page.evaluate(()=>window.__listeners())});}
  }
  await page.waitForTimeout(3000);await cdp.send('HeapProfiler.collectGarbage');results.diagnosis.push({round:'settled',dom:await cdp.send('Memory.getDOMCounters'),listeners:await page.evaluate(()=>window.__listeners())});
  if(process.env.AXIS_TEST_HEAP==='1'){
    const chunks=[];cdp.on('HeapProfiler.addHeapSnapshotChunk',({chunk})=>chunks.push(chunk));
    await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false});await writeFile(resolve(output,'retainers.heapsnapshot'),chunks.join(''));
  }
  await context.close();
}
async function backgroundRegression(){
  // A separately owned default context avoids Playwright's forced focus override.
  let nativeBrowser=null, child=null;
  let context;
  if(process.env.AXIS_TEST_NATIVE_CONTEXT==='1'){
    const profile=resolve(output,'browser-profile');await mkdir(profile,{recursive:true});
    child=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
      '--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--disable-extensions',
      '--window-position=-32000,-32000','about:blank'],{windowsHide:true,stdio:'ignore'});
    ownedNativeProcesses.push(child);
    let port;
    for(let i=0;i<100;i++){try{port=(await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
    assert.ok(port,'isolated native browser started');
    nativeBrowser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{noDefaults:true});ownedNativeBrowsers.push(nativeBrowser);context=nativeBrowser.contexts()[0];
  } else context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(instrument);
  await context.route(/google|umami|googletagmanager|clarity\.ms|api\.injahow\.cn/,r=>r.abort());
  const page=nativeBrowser?context.pages()[0]:await context.newPage(),cdp=await context.newCDPSession(page);
  if(nativeBrowser){const {windowId}=await cdp.send('Browser.getWindowForTarget');await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});await cdp.send('Browser.setWindowBounds',{windowId,bounds:{left:20,top:20,width:1440,height:1000}});await page.bringToFront();}
  await page.goto(origin,{waitUntil:'load'});await page.waitForFunction(()=>window.swup&&document.querySelector('#canvas_sakura'));await page.waitForTimeout(800);
  // Playwright normally forces every tab focused, masking native visibilitychange.
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  const {windowId}=await cdp.send('Browser.getWindowForTarget');results.background=[];
  for(const mode of ['banner','fullscreen']){
    await page.evaluate(mode=>{localStorage.setItem('wallpaperMode',mode);window.dispatchEvent(new CustomEvent('wallpaper-mode-change',{detail:{mode}}));},mode);await page.waitForTimeout(100);
    const capture=()=>page.evaluate(()=>({hidden:document.hidden,probe:window.__frontendProbe.snapshot(),sakura:document.querySelectorAll('#canvas_sakura').length}));
    const visible=await capture();await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'minimized'}});await page.waitForTimeout(600);const hidden=await capture();
    await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});await page.bringToFront();await page.waitForTimeout(300);const resumed=await capture();
    results.background.push({mode,visible,hidden,resumed});
    if(label.startsWith('after')){check(hidden.hidden,'headed minimized tab is actually hidden');check(hidden.probe.timers.filter(t=>t.kind==='interval'&&[2500,5000].includes(t.delay)).length===0,'background carousel timers stop');check(resumed.probe.timers.filter(t=>t.kind==='interval'&&[2500,5000].includes(t.delay)).length===1,'foreground resumes one carousel timer');check(hidden.sakura===1&&resumed.sakura===1,'background preserves the same Sakura canvas');}
  }
  if(nativeBrowser){await (await nativeBrowser.newBrowserCDPSession()).send('Browser.close');await nativeBrowser.close().catch(()=>{});}
  else await context.close();
}
async function controlledVisibility(){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(instrument);
  await context.addInitScript(()=>{
    let hidden=false;
    Object.defineProperty(document,'hidden',{get:()=>hidden});
    window.__setHidden=value=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));};
  });
  await context.route(/google|umami|googletagmanager|clarity\.ms|api\.injahow\.cn/,r=>r.abort());
  const page=await context.newPage();await page.goto(origin,{waitUntil:'load'});await page.waitForFunction(()=>window.swup&&document.querySelector('#canvas_sakura'));await page.waitForTimeout(1000);
  results.controlledVisibility={method:'browser JS visibility getter/event fixture; native minimize remains N/A on this host',samples:[]};
  for(const mode of ['banner','fullscreen']){
    await page.evaluate(mode=>{localStorage.setItem('wallpaperMode',mode);window.dispatchEvent(new CustomEvent('wallpaper-mode-change',{detail:{mode}}));},mode);
    await page.waitForTimeout(100);const capture=()=>page.evaluate(()=>({hidden:document.hidden,probe:window.__frontendProbe.snapshot(),canvases:document.querySelectorAll('#canvas_sakura').length}));
    const visible=await capture();await page.evaluate(()=>{window.__setHidden(true);window.__setHidden(true);});await page.waitForTimeout(100);const hidden=await capture();
    await page.evaluate(()=>{window.__setHidden(false);window.__setHidden(false);});await page.waitForTimeout(100);const resumed=await capture();
    const carouselTimers=s=>s.probe.timers.filter(t=>t.kind==='interval'&&[2500,5000].includes(t.delay)).length;
    if(label.startsWith('after')){check(carouselTimers(hidden)===0,'controlled visibility pauses all carousel timers');check(carouselTimers(resumed)===1,'controlled visibility resumes one carousel timer');check(hidden.probe.rafs<visible.probe.rafs,'controlled visibility pauses Sakura RAF');check(visible.canvases===1&&hidden.canvases===1&&resumed.canvases===1,'visibility preserves one Sakura canvas');}
    results.controlledVisibility.samples.push({mode,visible,hidden,resumed});
  }
  await context.close();
}
async function loadSamples(){
  results.loadSamples=[];
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}])for(let run=0;run<5;run++){
    const context=await browser.newContext({viewport,serviceWorkers:'block'});await context.addInitScript(instrument);
    await context.route(/google|umami|googletagmanager|clarity\.ms|api\.injahow\.cn/,r=>r.abort());
    const page=await context.newPage(),cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');await page.goto(origin,{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('#canvas_sakura'));await page.waitForTimeout(1200);
    const value=await sample(page,cdp,'load-'+run);results.loadSamples.push({viewport,run,heap:value.heap,vitals:value.vitals,images:value.images,rendering:value.rendering});await context.close();
  }
}
try {
  const html=await readFile(resolve(root,'index.html'),'utf8');
  results.serverAudio=html.match(/<audio\b[^>]*>/)?.[0];
  if(label.startsWith('after'))check(!/<audio\b[^>]*\bsrc="\/"/.test(html),'SSR empty audio URL must not become a media request to /');
  if(process.env.AXIS_TEST_VISUAL_ONLY!=='1'){await run({width:1440,height:1000});if(process.env.AXIS_TEST_MOBILE!=='0')await run({width:390,height:844});}
  if(process.env.AXIS_TEST_VISUAL!=='0')for(const viewport of [{width:1440,height:1000},{width:900,height:1000},{width:390,height:844}])for(const mode of ['banner','fullscreen','none'])for(const theme of ['light','dark'])await visual(viewport,mode,theme);
  if(process.env.AXIS_TEST_MEDIA==='1')await mediaRegression();
  if(process.env.AXIS_TEST_DIAGNOSE==='1')await diagnose();
  if(process.env.AXIS_TEST_BACKGROUND==='1')await backgroundRegression();
  if(process.env.AXIS_TEST_VISIBILITY_FIXTURE==='1')await controlledVisibility();
  if(process.env.AXIS_TEST_LOAD_SAMPLES==='1')await loadSamples();
  results.completed=true;
}
finally {
  for(const native of ownedNativeBrowsers){try{await (await native.newBrowserCDPSession()).send('Browser.close');}catch{}await native.close().catch(()=>{});}
  for(const child of ownedNativeProcesses)if(child.exitCode===null)child.kill();
  await browser.close();await new Promise(r=>server.close(r));await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
}
console.log(JSON.stringify({output,scenarios:results.scenarios.length,errors:results.errors,failures:results.failures}));
if(label.startsWith('after')&&(results.errors.length||results.failures.length))process.exitCode=1;

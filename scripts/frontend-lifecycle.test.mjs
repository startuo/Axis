import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const config={enable:true,sakuraNum:21,limitTimes:-1,zIndex:100,
  size:{min:.5,max:1.1},opacity:{min:.3,max:.9},
  speed:{horizontal:{min:-1.7,max:-1.2},vertical:{min:1.5,max:2.2},rotation:.03,fadeSpeed:.03}};
function sakuraEnvironment(){
  const listeners=new Map(),canvases=new Set(),frames=new Map(),images=[];
  const target=()=>({addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);}});
  let id=0;
  const ctx={save(){},restore(){},translate(){},rotate(){},drawImage(){},clearRect(){},setTransform(...args){this.transform=args;}};
  const document={...target(),hidden:false,body:{appendChild(c){canvases.add(c);},removeChild(c){canvases.delete(c);}},
    createElement(){return {width:0,height:0,style:{},setAttribute(){},getContext(){return ctx;},remove(){canvases.delete(this);}};}};
  const window={...target(),innerWidth:1440,innerHeight:1000,devicePixelRatio:2};
  const sandbox={exports:{},document,window,console,Image:class{constructor(){images.push(this);}},
    requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);}};
  const source=readFileSync(process.env.AXIS_SAKURA_SOURCE||'src/utils/sakura-manager.ts','utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
  return {...sandbox,listeners,canvases,frames,images,ctx,manager:new sandbox.exports.SakuraManager(config),
    async load(){const promise=this.manager.init();this.images.at(-1).onload();await promise;},
    visibility(hidden){document.hidden=hidden;for(const fn of listeners.get('visibilitychange')??[])fn();}};
}
test('Sakura: 25 enable/disable cycles release canvas, listeners and RAF',async()=>{
  const e=sakuraEnvironment();
  for(let i=0;i<25;i++){
    await e.load();assert.equal(e.canvases.size,1);assert.equal(e.frames.size,1);
    e.manager.stop();assert.equal(e.canvases.size,0);assert.equal(e.frames.size,0);
    assert.equal(e.listeners.get('resize')?.size??0,0);
    assert.equal(e.listeners.get('visibilitychange')?.size??0,0);
  }
});
test('Sakura: concurrent init shares one load; stop during loading prevents resurrection',async()=>{
  const e=sakuraEnvironment(),first=e.manager.init(),second=e.manager.init();
  assert.equal(e.images.length,1);e.manager.stop();await Promise.all([first,second]);
  assert.equal(e.canvases.size,0);assert.equal(e.frames.size,0);assert.equal(e.manager.getIsRunning(),false);
  await e.load();assert.equal(e.canvases.size,1);e.manager.stop();
});
test('Sakura: background pause/resume is idempotent and preserves particles; DPR matches CSS viewport',async()=>{
  const e=sakuraEnvironment();await e.load();
  const canvas=[...e.canvases][0];assert.equal(canvas.width,2880);assert.equal(canvas.style.width,'1440px');
  assert.deepEqual(Array.from(e.ctx.transform),[2,0,0,2,0,0]);
  e.visibility(true);assert.equal(e.frames.size,0);assert.equal(e.canvases.size,1);assert.equal(e.manager.getIsRunning(),true);
  e.visibility(false);e.visibility(false);assert.equal(e.frames.size,1);e.manager.stop();
});
test('Sakura: failed image load permits a later successful init',async()=>{
  const e=sakuraEnvironment(),pending=e.manager.init();e.images[0].onerror();await assert.rejects(pending,/Failed to load/);
  await e.load();assert.equal(e.frames.size,1);e.manager.stop();
});

function carouselEnvironment(mode='banner') {
  const intervals=new Map(),timeouts=new Map(),storage=new Map();let id=0;
  const classes=initial=>{const values=new Set(initial);return {contains:v=>values.has(v),add:(...v)=>v.forEach(x=>values.add(x)),remove:(...v)=>v.forEach(x=>values.delete(x)),toggle(v,on){on?values.add(v):values.delete(v);}};};
  class Element extends EventTarget {
    constructor(){super();this.isConnected=true;this.dataset={};this.style={removeProperty(key){delete this[key.replace(/-([a-z])/g,(_,v)=>v.toUpperCase())];}};this.classList=classes([]);}
    querySelectorAll(){return [];}
  }
  const images=()=>Array.from({length:6},()=>new Element());
  const desktop=images(),mobile=images();
  const groups=['desktop','mobile'].map((key,i)=>{const group=new Element();group.dataset.wallpaperGroup=key;group.querySelectorAll=()=>i?mobile:desktop;return group;});
  const root=new Element();root.dataset.carouselInterval='5';
  const items=desktop.map((image,i)=>{const item=new Element();item.querySelector=()=>true;item.querySelectorAll=()=>[image,mobile[i]];return item;});
  root.querySelectorAll=selector=>selector==='[data-wallpaper-group]'?groups:selector==='[data-carousel-item]'?[...desktop,...mobile]:selector==='.carousel-item'?items:[...desktop,...mobile];
  const document=new EventTarget();document.hidden=false;document.body={classList:classes([mode==='banner'?'enable-banner':'wallpaper-transparent','is-home'])};
  const media=new EventTarget();media.matches=true;
  const window=new EventTarget();window.innerWidth=1440;window.matchMedia=()=>media;
  let ready=Promise.resolve(true);
  const sandbox={exports:{},require:()=>({prepareImage:()=>ready,prepareSlide:()=>ready}),window,document,AbortController,console,
    sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    setInterval(fn,delay){intervals.set(++id,{fn,delay});return id;},clearInterval:id=>intervals.delete(id),
    setTimeout(fn,delay){timeouts.set(++id,{fn,delay});return id;},clearTimeout:id=>timeouts.delete(id)};
  function load(file){const source=readFileSync(file,'utf8');sandbox.exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;}
  return {load,root,desktop,mobile,items,document,media,window,intervals,timeouts,
    defer(){let resolve;ready=new Promise(r=>resolve=r);return resolve;},
    async tick(){for(const {fn} of intervals.values())fn();await Promise.resolve();await Promise.resolve();},
    mode(mode){document.body.classList.toggle('enable-banner',mode==='banner');document.body.classList.toggle('wallpaper-transparent',mode==='fullscreen');window.dispatchEvent(new Event('wallpaper-mode-applied'));}};
}
test('Banner: repeated init owns one 2500ms timer; hover, modes, visibility and destroy release it',async()=>{
  const e=carouselEnvironment(),{initBannerCarousel}=e.load('src/utils/banner-carousel.ts');
  const controller=initBannerCarousel(e.root,2.5);
  assert.equal(initBannerCarousel(e.root,2.5),controller);assert.equal(e.intervals.size,1);assert.equal([...e.intervals.values()][0].delay,2500);
  e.root.dispatchEvent(new Event('mouseenter'));assert.equal(e.intervals.size,0);
  e.root.dispatchEvent(new Event('mouseleave'));assert.equal(e.intervals.size,1);
  e.mode('none');assert.equal(e.intervals.size,0);e.mode('banner');assert.equal(e.intervals.size,1);
  e.document.hidden=true;e.document.dispatchEvent(new Event('visibilitychange'));assert.equal(e.intervals.size,0);
  e.document.hidden=false;e.document.dispatchEvent(new Event('visibilitychange'));assert.equal(e.intervals.size,1);
  await e.tick();assert.equal(e.items[1].classList.contains('opacity-100'),true);
  controller.destroy();assert.equal(e.intervals.size,0);e.mode('banner');assert.equal(e.intervals.size,0);
  const replacement=initBannerCarousel(e.root,2.5);assert.notEqual(replacement,controller);assert.equal(e.intervals.size,1);replacement.destroy();
});
test('Banner: decoding completion after pause/destroy cannot change the slide',async()=>{
  const e=carouselEnvironment(),{initBannerCarousel}=e.load('src/utils/banner-carousel.ts');
  const controller=initBannerCarousel(e.root,2.5),resolve=e.defer();await e.tick();e.mode('none');resolve(true);await Promise.resolve();
  assert.equal(e.items[0].classList.contains('opacity-100'),true);controller.destroy();
});
test('Fullscreen: hidden groups do not schedule; one active timer and two temporary hints retain full preloading',async()=>{
  const e=carouselEnvironment('banner'),{initFullscreenWallpaper}=e.load('src/utils/fullscreen-wallpaper.ts');
  const controller=initFullscreenWallpaper(e.root);assert.equal(e.intervals.size,0);
  assert.equal([...e.desktop,...e.mobile].every(i=>i.loading==='eager'),true);
  assert.equal(initFullscreenWallpaper(e.root),controller);e.mode('fullscreen');assert.equal(e.intervals.size,1);
  assert.equal([...e.intervals.values()][0].delay,5000);
  await e.tick();assert.equal(e.desktop[1].style.opacity,'1');assert.equal(e.mobile[0].style.opacity,'1');
  assert.equal([...e.desktop,...e.mobile].filter(i=>i.style.willChange==='opacity').length,2);
  for(const {fn} of [...e.timeouts.values()])fn();assert.equal(e.timeouts.size,0);
  assert.equal([...e.desktop,...e.mobile].filter(i=>i.style.willChange==='opacity').length,0);
  e.mode('none');assert.equal(e.intervals.size,0);controller.destroy();assert.equal(e.timeouts.size,0);
});
test('Fullscreen: slow decode plus viewport/mode changes cannot commit a stale transition',async()=>{
  const e=carouselEnvironment('fullscreen'),{initFullscreenWallpaper}=e.load('src/utils/fullscreen-wallpaper.ts');
  const controller=initFullscreenWallpaper(e.root),resolve=e.defer();await e.tick();
  e.media.matches=false;e.media.dispatchEvent(new Event('change'));resolve(true);await Promise.resolve();
  assert.equal(e.desktop[0].style.opacity,'1');assert.equal(e.mobile[0].style.opacity,'1');
  assert.equal(e.intervals.size,1);controller.destroy();assert.equal(e.intervals.size,0);
});

function uploadEnvironment({statuses=[200,200],decodeFails=false,originalFails=false}={}) {
  const original={id:'local-original',url:'/media/local-original',name:'fixture.png',type:'image/png',size:8};
  const bitmap={width:2400,height:1200,closed:false,close(){this.closed=true;}},canvases=[],requests=[];
  const sandbox={exports:{},Blob,console,localStorage:{getItem:()=>''},
    require:specifier=>specifier.includes('media.mjs')?{uploadOriginal:async()=>{if(originalFails)throw new Error('original failed');return original;}}:{apiUrl:path=>path},
    createImageBitmap:async()=>{if(decodeFails)throw new Error('cannot decode');return bitmap;},
    document:{createElement(){const canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toBlob:fn=>fn(new Blob(['variant'],{type:'image/webp'}))};canvases.push(canvas);return canvas;}},
    fetch:async(url)=>{const status=statuses[requests.length];requests.push(url);return {ok:status<300,status};}};
  const source=readFileSync('src/components/console/api.ts','utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
  return {...sandbox,bitmap,canvases,requests,original};
}
test('Upload: HTTP variant failures are returned as partial success and all bitmap/canvas resources are released',async()=>{
  const e=uploadEnvironment({statuses:[503,200]}),result=await e.exports.upload(new Blob(['original']));
  assert.equal(result.url,e.original.url);assert.equal(result.variantWarnings.length,1);assert.match(result.variantWarnings[0],/HTTP 503/);
  assert.equal(e.requests.length,2);assert.equal(e.bitmap.closed,true);assert.equal(e.canvases.every(c=>c.width===0&&c.height===0),true);
});
test('Upload: decode failure preserves original with a warning; original failure still rejects',async()=>{
  const e=uploadEnvironment({decodeFails:true}),result=await e.exports.upload(new Blob());
  assert.equal(result.url,e.original.url);assert.equal(result.variantWarnings.length,1);assert.equal(e.requests.length,0);
  const failed=uploadEnvironment({originalFails:true});await assert.rejects(failed.exports.upload(new Blob()),/original failed/);
});

function themeEnvironment(){
  let blocks=[];const observers=[],frames=new Map(),timers=new Map();let id=0;
  const classList=()=>{const values=new Set();return {contains:k=>values.has(k),add:k=>values.add(k),remove:k=>values.delete(k),toggle(k,on){on?values.add(k):values.delete(k);}};};
  const root={classList:classList(),getAttribute:()=> 'github-light'};
  const hooks={entries:new Set(),on(hook,fn){this.entries.add(fn);},before(hook,fn){this.entries.add(fn);},off(hook,fn){this.entries.delete(fn);}};
  const document=new EventTarget();Object.assign(document,{documentElement:root,getElementById:()=>null,
    querySelectorAll:selector=>selector==='.expressive-code'?blocks:[],head:{appendChild(){}},createElement:()=>({remove(){}})});
  const window={swup:{hooks},innerHeight:1000};
  class Observer{constructor(fn){this.callback=fn;this.targets=new Set();observers.push(this);}observe(el){this.targets.add(el);}disconnect(){this.targets.clear();}}
  const sandbox={window,document,console,CustomEvent,IntersectionObserver:Observer,MutationObserver:Observer,
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(readFileSync('src/scripts/theme-optimizer.js','utf8'),sandbox);
  return {optimizer:window.themeOptimizer,document,window,hooks,observers,frames,timers,
    block(){return {isConnected:true,dataset:{},classList:classList(),style:{removeProperty(){}}};},
    setBlocks(value){blocks=value;}};
}
test('Theme: replacement disconnects old code blocks; Swup enable is idempotent; destroy owns every observer and hook',()=>{
  const e=themeEnvironment(),first=e.block();e.setBlocks([first]);e.optimizer.observeCodeBlocks();assert.equal(e.observers[0].targets.size,1);
  first.isConnected=false;e.setBlocks([e.block()]);e.optimizer.observeCodeBlocks();
  assert.equal(e.observers[0].targets.has(first),false);assert.equal(e.observers[0].targets.size,1);
  e.document.dispatchEvent(new Event('swup:enable'));e.document.dispatchEvent(new Event('swup:enable'));assert.equal(e.hooks.entries.size,2);
  e.optimizer.destroy();assert.equal(e.hooks.entries.size,0);assert.equal(e.observers.every(o=>o.targets.size===0),true);
  e.document.dispatchEvent(new Event('swup:enable'));assert.equal(e.hooks.entries.size,0);
});
test('Theme: rapid changes cancel stale batches and page replacement cancels deferred work',()=>{
  const e=themeEnvironment(),blocks=Array.from({length:8},()=>e.block());
  e.optimizer.batchUpdateBlocks(blocks,'old');e.optimizer.batchUpdateBlocks(blocks,'new');assert.equal(e.frames.size,1);
  for(const [id,fn] of [...e.frames]){e.frames.delete(id);fn();}
  assert.equal(blocks[0].dataset.themeUpdated,'new');assert.equal(e.timers.size,1);
  e.optimizer.beforeReplace();assert.equal(e.timers.size,0);assert.equal(e.frames.size,0);e.optimizer.destroy();
});

test('Swup parsed media: discard inert media activities without touching the live document/player',()=>{
  const actions=[],source={removeAttribute:key=>actions.push('source:'+key)};
  const inert={pause:()=>actions.push('pause'),removeAttribute:key=>actions.push('remove:'+key),querySelectorAll:()=>[source],
    load(){assert.equal(this.disableRemotePlayback,true);assert.equal(this.srcObject,null);actions.push('load');},remove:()=>actions.push('detach')};
  const document={querySelectorAll(){throw new Error('live document must not be touched');}};
  const sandbox={exports:{},document};vm.runInNewContext(ts.transpileModule(readFileSync('src/utils/parsed-media.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
  sandbox.exports.releaseParsedMedia(undefined);sandbox.exports.releaseParsedMedia(document);assert.equal(actions.length,0);
  sandbox.exports.releaseParsedMedia({querySelectorAll:()=>[inert]});assert.deepEqual(actions,['pause','remove:src','source:src','load','detach']);
});

function pioEnvironment(){
  const timers=new Map(),scripts=new Map(),mount=[],destroy=[];let id=0,instances=0;
  class Script extends EventTarget{setAttribute(){}remove(){scripts.delete(this.id);}}
  const sandbox={console:{log(){},warn(){},error(){}},AbortController,DOMException,
    pioConfig:{enable:true,hiddenOnMobile:false},onMount:fn=>mount.push(fn),onDestroy:fn=>destroy.push(fn),
    window:{matchMedia:()=>({matches:false})},
    document:{getElementById:id=>scripts.get(id),createElement:()=>new Script(),head:{appendChild:script=>scripts.set(script.id,script)},body:{classList:{contains:()=>false}},querySelectorAll:()=>[]},
    setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)};
  const source=readFileSync('src/components/widget/Pio.svelte','utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm,'');
  vm.createContext(sandbox);vm.runInContext(source,sandbox);vm.runInContext('pioContainer = {}; pioCanvas = {};',sandbox);
  return {mount:()=>mount[0](),destroy:()=>destroy[0](),timers,scripts,sandbox,
    readyLibrary(){sandbox.window.loadlive2d=()=>{};scripts.get('pio-l2d-script').dispatchEvent(new Event('load'));},
    readyPio(){sandbox.Paul_Pio=function(){instances++;};sandbox.window.Paul_Pio=sandbox.Paul_Pio;scripts.get('pio-main-script').dispatchEvent(new Event('load'));},
    instances:()=>instances};
}
test('Pio: unloading during script load aborts callbacks and never creates an instance or retry timer',async()=>{
  const e=pioEnvironment();e.mount();assert.equal(e.scripts.size,1);assert.equal(e.timers.size,1);
  e.destroy();assert.equal(e.timers.size,0);e.readyLibrary();await Promise.resolve();await Promise.resolve();
  assert.equal(e.instances(),0);assert.equal(e.scripts.has('pio-main-script'),false);assert.equal(e.timers.size,0);
});
test('Pio: shared asset readiness leads to one bounded initialization and no recursive polling',async()=>{
  const e=pioEnvironment();e.mount();e.readyLibrary();await Promise.resolve();await Promise.resolve();assert.equal(e.scripts.size,2);
  e.readyPio();await Promise.resolve();await Promise.resolve();assert.equal(e.timers.size,1);
  for(const [id,fn] of [...e.timers]){e.timers.delete(id);fn();}assert.equal(e.instances(),1);assert.equal(e.timers.size,0);
  e.destroy();assert.equal(e.instances(),1); // A normal frontend unmount keeps the intentional Pio instance.
});

test('Mobile TOC: returning home releases article headings; unmount removes only its own hooks and pending callbacks',()=>{
  const timers=new Map(),observers=[],mount=[];let id=0;
  const hooks={events:new Map(),on(event,fn){if(!this.events.has(event))this.events.set(event,new Set());this.events.get(event).add(fn);},before(event,fn){this.on(event,fn);},off(event,fn){assert.ok(fn,'must provide the owned callback');this.events.get(event)?.delete(fn);}};
  const other=()=>{};hooks.on('page:view',other);
  const window=new EventTarget();Object.assign(window,{location:{pathname:'/posts/fixture/'},swup:{hooks},scrollY:0});
  const heading={id:'fixture',tagName:'H2',textContent:'Heading',offsetTop:20,isConnected:true};
  const document=new EventTarget();document.querySelectorAll=selector=>selector.startsWith('h1')?[heading]:[];
  class Observer{constructor(){this.targets=new Set();observers.push(this);}observe(node){this.targets.add(node);}disconnect(){this.targets.clear();}}
  const sandbox={exports:{},require:path=>path==='svelte'?{onMount:fn=>mount.push(fn)}:{},window,document,console,IntersectionObserver:Observer,
    setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)};
  const source=readFileSync('src/components/MobileTOC.svelte','utf8').match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
  const cleanup=mount[0]();for(const [id,fn] of [...timers]){timers.delete(id);fn();}
  assert.equal(observers[0].targets.size,1);heading.isConnected=false;window.location.pathname='/';
  for(const fn of hooks.events.get('page:view'))fn();for(const [id,fn] of [...timers]){timers.delete(id);fn();}
  assert.equal(observers.every(o=>o.targets.size===0),true);
  for(const fn of hooks.events.get('page:view'))fn();assert.equal(timers.size,1);cleanup();assert.equal(timers.size,0);
  assert.deepEqual([...hooks.events.get('page:view')],[other]);assert.equal(hooks.events.get('content:replace').size,0);
  assert.equal(window.mobileTOCInit,undefined);
});

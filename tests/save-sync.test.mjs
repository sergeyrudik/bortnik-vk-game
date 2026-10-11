import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHarness,fakeEnvironment,flush} from './helpers/production-storage-harness.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const repo=()=>path.resolve(dir,'..');
function surface(){const listeners=new Map();return{setTimeout(fn){fn();return 1;},clearTimeout(){},addEventListener(key,fn){const set=listeners.get(key)||new Set();set.add(fn);listeners.set(key,set);},removeEventListener(key,fn){listeners.get(key)?.delete(fn);},emit(key,e){listeners.get(key)?.forEach(fn=>fn(e));}};}
const rootKeys={bortnik:'bortnik-save-v1',rodnik:'rodnik-save-v1',terem:'terem-save-v1',yantar:'yantar-save-v2'};
function reset(h,slug){h.button('Итоги').props.onClick();h.button('Сбросить').props.onClick();if(slug==='bortnik')h.button('Да, начать заново').props.onClick();if(slug==='rodnik')h.button('Сбросить',1).props.onClick();}
const persist=(h,slug)=>h.runEffect(slug==='bortnik'?'const save =':'saveGuardRef.current.persist');
const capturePersist=(h,slug)=>h.effect(slug==='bortnik'?'const save =':'saveGuardRef.current.persist');
for(const slug of ['bortnik'])test(`${slug}: actual reset must not be overwritten by a stale tab's production persistence/flush`,async()=>{
 const env=fakeEnvironment(),originalWindow=window;try{
  const aSurface=surface(),bSurface=surface(),surfaces=[aSurface,bSurface];
  const nativeWrite=localStorage.setItem.bind(localStorage);localStorage.setItem=(key,value)=>{const oldValue=localStorage.getItem(key);nativeWrite(key,value);for(const target of surfaces)if(target!==window){const previous=window;globalThis.window=target;try{target.emit('storage',{key,newValue:value,oldValue,storageArea:localStorage});}finally{globalThis.window=previous;}}};
  const options={hydrated:true,started:true,vkReady:false,adAvailable:false};
  globalThis.window=aSurface;const a=createHarness(repo(slug),options);const save=a.engine.createDefaultSave();save.coins=177;
  localStorage.setItem(rootKeys[slug],a.engine.serializeSave(save));
  globalThis.window=bSurface;const b=createHarness(repo(slug),{...options,...(['bortnik','rodnik'].includes(slug)?{coins:177}:{save})});
  // Register only production cross-tab/flush effects when present, using real window listeners.
  for(const h of [a,b]){globalThis.window=h===a?aSurface:bSurface;try{h.runEffect('"storage"');}catch(e){if(!e.message.includes('"storage"'))throw e;}if(slug==='bortnik')h.runEffect('flushLatestSave');}
  globalThis.window=bSurface;persist(b,slug);await flush();
  globalThis.window=aSurface;reset(a,slug);persist(a,slug);await flush();
  const fresh=a.engine.migrateSave(localStorage.getItem(rootKeys[slug]));assert.equal(fresh.coins,a.engine.createDefaultSave().coins);
  globalThis.window=bSurface;
  // A background Bortnik page flushes on pagehide; the other three persist when
  // the player changes mute, a harmless visible action that must not revive deleted progress.
  if(slug==='bortnik')bSurface.emit('pagehide');
  else{b.set('tab','play');const sound=b.render().find(n=>n.type==='button'&&(['Выключить звук','Включить звук'].includes(n.props['aria-label'])||n.props.children==='🔊'));assert.ok(sound);sound.props.onClick();persist(b,slug);}
  await flush();const after=b.engine.migrateSave(localStorage.getItem(rootKeys[slug]));

  assert.equal(after.coins,fresh.coins,'A stale tab must adopt reset progress before a write or pagehide flush');
 }finally{globalThis.window=originalWindow;env.restore();}
});

for(const slug of ['bortnik'])test(`${slug}: a persistence effect captured before reset is invalidated even after storage adoption`,async()=>{
 const env=fakeEnvironment(),originalWindow=window;try{
  const aSurface=surface(),bSurface=surface();globalThis.window=aSurface;
  const initial=createHarness(repo(slug)).engine.createDefaultSave();initial.coins=177;localStorage.setItem(rootKeys[slug],JSON.stringify(initial));
  const options={hydrated:true,started:true,vkReady:false,adAvailable:false,...(['bortnik','rodnik'].includes(slug)?{...initial}:{save:initial})};if(slug==='bortnik')delete options.levelState;
  const a=createHarness(repo(slug),options);globalThis.window=bSurface;const b=createHarness(repo(slug),options);b.runEffect('"storage"');const staleEffect=capturePersist(b,slug);
  globalThis.window=aSurface;reset(a,slug);persist(a,slug);await flush();const rawReset=localStorage.getItem(rootKeys[slug]);
  globalThis.window=bSurface;bSurface.emit('storage',{key:rootKeys[slug],newValue:rawReset});staleEffect();await flush();
  const saved=b.engine.migrateSave(localStorage.getItem(rootKeys[slug]));assert.equal(saved.coins,b.engine.createDefaultSave().coins);
 }finally{globalThis.window=originalWindow;env.restore();}
});

for(const deliverStorageEvents of [true,false])for(const slug of ['bortnik'])test(`${slug}: deferred mocked SDK uses fresh reset quota with storage event delivery ${deliverStorageEvents}`,async()=>{
 const env=fakeEnvironment(),originalWindow=window;try{
  const aSurface=surface(),bSurface=surface(),surfaces=[aSurface,bSurface];
  const nativeWrite=localStorage.setItem.bind(localStorage);localStorage.setItem=(key,value)=>{const oldValue=localStorage.getItem(key);nativeWrite(key,value);for(const target of surfaces)if(deliverStorageEvents && target!==window){const previous=window;globalThis.window=target;try{target.emit('storage',{key,newValue:value,oldValue,storageArea:localStorage});}finally{globalThis.window=previous;}}};
  globalThis.window=aSurface;const defaults=createHarness(repo(slug)).engine.createDefaultSave();
  const save={...defaults,coins:177,rewards:{...defaults.rewards,count:7}};
  localStorage.setItem(rootKeys[slug],JSON.stringify(save));
  let release,shows=0;const bridge={send:async(method,params)=>{if(method==='VKWebAppShowNativeAds'&&params?.ad_format==='reward'){shows++;return new Promise(resolve=>{release=resolve;});}return{result:true};}};
  const options={hydrated:true,started:true,vkReady:true,adAvailable:true,...(['bortnik','rodnik'].includes(slug)?{...save,levelState:save.levelState??undefined}:{save})};
  // Bortnik default component generates an active board; do not override it with undefined.
  if(slug==='bortnik')delete options.levelState;
  const a=createHarness(repo(slug),options,bridge);globalThis.window=bSurface;const b=createHarness(repo(slug),options,bridge);
  for(const h of [a,b]){globalThis.window=h===a?aSurface:bSurface;h.runEffect('"storage"');}
  const reward=h=>h.button(slug==='bortnik'?'+5 ходов за рекламу':slug==='rodnik'?'Отмены: +3 за рекламу':slug==='terem'?'Новые блоки за рекламу':'📺 Убрать ряд').props.onClick();
  globalThis.window=aSurface;reward(a);await flush();assert.equal(shows,1);
  globalThis.window=bSurface;reset(b,slug);persist(b,slug);await flush();const fresh=b.engine.migrateSave(localStorage.getItem(rootKeys[slug]));assert.equal(fresh.rewards.count,7);
  globalThis.window=aSurface;release({result:true});await flush();persist(a,slug);await flush();const granted=a.engine.migrateSave(localStorage.getItem(rootKeys[slug]));
  assert.equal(granted.rewards.count,8,'A real successful completion must be counted despite external reset');
  assert.equal(granted.coins,defaults.coins+(slug==='yantar'?3:0),'Old wallet177 must not return; only the explicit new reward is allowed');
  assert.equal(granted.rewards.lastRewardAt,env.now());
  env.advance(180001);a.set('tab',slug==='bortnik'?'hive':'play');a.set('adAvailable',true);reward(a);await flush();assert.equal(shows,1,'Ninth same-day SDK request must be blocked');
 }finally{globalThis.window=originalWindow;env.restore();}
});

for(const slug of ['bortnik'])test(`${slug}: storage-adoption render is a semantic no-op but identical default reset produces a newer commit`,async()=>{
 const env=fakeEnvironment();try{
  const h=createHarness(repo(slug),{hydrated:true,started:true});const initial=h.engine.createDefaultSave();const raw=JSON.stringify(initial);localStorage.setItem(rootKeys[slug],raw);
  const guard=h.ref('saveGuardRef').current;guard.initialize(raw);const observed=guard.latest();env.advance(5000);const noEcho=await guard.persist(observed);assert.equal(noEcho.value,null);assert.equal(localStorage.getItem(rootKeys[slug]),raw);
  guard.initialize(raw,true);const reset=await guard.persist(observed);assert.ok(reset.value);assert.notEqual(reset.value,raw);assert.ok(JSON.parse(reset.value).updatedAt>initial.updatedAt);
  const after=await guard.persist(guard.latest());assert.equal(after.value,null,'Even the forced reset must not echo from adoption renders');
 }finally{env.restore();}
});

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness, fakeEnvironment, flush } from "./helpers/production-storage-harness.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAVE_KEY = "bortnik-save-v1", VK_SAVE_KEY = "bortnik_save";
for (const phase of ["init-currency", "cloud-reset"]) test(`bortnik: actual hydration adopts external ${phase} committed during SDK await`, async () => {
 const env = fakeEnvironment();
 try {
  globalThis.setTimeout = () => 1;
  window.setTimeout = (fn, ms) => { if (ms === 250) fn(); return 1; };
  let release; const pending = new Promise(resolve => { release = resolve; });
  let initCalls = 0, cloudCalls = 0;
  const h = createHarness(repo, {}, { send: async method => {
   if (method === "VKWebAppInit") { initCalls++; return phase === "init-currency" ? pending : { result: true }; }
   if (method === "VKWebAppStorageGet") { cloudCalls++; return phase === "cloud-reset" ? pending : { keys: [{ key: VK_SAVE_KEY, value: oldRaw }] }; }
   return { result: true };
  } });
  const initial = h.engine.createDefaultSave(); initial.coins = 177; initial.updatedAt = env.now();
  const oldRaw = h.engine.serializeSave(initial); localStorage.setItem(SAVE_KEY, oldRaw);
  h.runEffect("VKWebAppInit"); await flush();
  assert.equal(initCalls, 1); assert.equal(h.get("hydrated"), false);
  if (phase === "cloud-reset") assert.equal(cloudCalls, 1);
  env.advance(1000);
  const external = phase === "init-currency" ? { ...initial, coins: 8, updatedAt: env.now() } : h.engine.createDefaultSave();
  external.updatedAt = env.now(); const externalRaw = h.engine.serializeSave(external); localStorage.setItem(SAVE_KEY, externalRaw);
  release(phase === "init-currency" ? { result: true } : { keys: [{ key: VK_SAVE_KEY, value: oldRaw }] });
  await flush(); assert.equal(h.get("hydrated"), true);
  assert.equal(h.get("coins"), external.coins);
  h.runEffect("const save ="); await flush();
  assert.equal(h.engine.migrateSave(localStorage.getItem(SAVE_KEY)).coins, external.coins);
  assert.equal(h.engine.migrateSave(localStorage.getItem(SAVE_KEY)).rewards.count, external.rewards.count);
 } finally { env.restore(); }
});

test("bortnik: an external commit between final local read and guard initialization cannot be overwritten", async () => {
 const env = fakeEnvironment();
 try {
  globalThis.setTimeout = () => 1;
  window.setTimeout = (fn, ms) => { if (ms === 250) fn(); return 1; };
  let release; const pending = new Promise(resolve => { release = resolve; });
  const h = createHarness(repo, {}, { send: async method => method === "VKWebAppInit" ? pending : { result: true } });
  const initial = h.engine.createDefaultSave(); initial.coins = 177;
  const oldRaw = h.engine.serializeSave(initial); localStorage.setItem(SAVE_KEY, oldRaw);
  h.runEffect("VKWebAppInit"); await flush(); assert.equal(h.get("hydrated"), false);
  env.advance(1000); const externalRaw = h.engine.serializeSave({ ...initial, coins: 8, updatedAt: env.now() });
  const nativeRead = localStorage.getItem.bind(localStorage), nativeWrite = localStorage.setItem.bind(localStorage);
  let committed = false;
  localStorage.getItem = key => {
    const value = nativeRead(key);
    if (key === SAVE_KEY && !committed) { committed = true; nativeWrite(key, externalRaw); }
    return value;
  };
  release({ result: true }); await flush(); assert.equal(h.get("hydrated"), true); assert.equal(committed, true);
  h.runEffect("const save ="); await flush();
  assert.equal(h.engine.migrateSave(localStorage.getItem(SAVE_KEY)).coins, 8, "A selected old save must not be paired with a newer observed guard snapshot");
  assert.equal(h.get("coins"), 8);
 } finally { env.restore(); }
});

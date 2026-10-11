import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness, fakeEnvironment, flush } from "./helpers/production-storage-harness.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("bortnik: actual unsupported ad gate explains refusal without SDK, grant or loading lock", async () => {
  const env = fakeEnvironment();
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    let sdkShows = 0;
    const bridge = { send: async (method) => { if (method === "VKWebAppShowNativeAds") sdkShows++; return { result: true }; } };
    const h = createHarness(repo, { hydrated: true, started: true, vkReady: true, adAvailable: true }, bridge);
    const resources = () => ({ coins: h.get("coins"), crystals: h.get("crystals"), rewards: h.get("rewards"), level: h.get("levelState") });
    const before = structuredClone(resources());
    h.button("+5 ходов за рекламу").props.onClick(); await flush();
    assert.equal(sdkShows, 0);
    assert.deepEqual(resources(), before);
    assert.equal(h.ref("adPolicyRef").current.isBusy(), false);
    assert.equal(h.get("message"), "Реклама пока недоступна");
    assert.ok(!h.get("adPending"));
  } finally { env.restore(); }
});

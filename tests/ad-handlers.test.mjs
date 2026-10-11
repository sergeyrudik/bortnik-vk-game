import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createHarness, fakeEnvironment, flush } from "./helpers/actual-handlers.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function ready(bridge, overrides = {}) {
  return createHarness(repo, { hydrated: true, started: false, vkReady: true, adAvailable: true, sound: false, ...overrides }, bridge);
}
function terminal(h, status) {
  h.set("levelState", { ...h.get("levelState"), status, movesLeft: status === "lost" ? 0 : 5 });
  if (status === "won") h.set("pendingReward", { coins: 48, crystals: 0 });
}
function start(h) { h.button("В улей").props.onClick(); }

test("actual next/retry handlers enforce first180s and spacing after successful completion", async () => {
  const clock = fakeEnvironment();
  try {
    const calls = [];
    const h = ready({ send: async (method, params) => { if (params?.ad_format) calls.push([method, params.ad_format]); return { result: true }; } });
    start(h); terminal(h, "won"); clock.advance(179999);
    h.button("Следующая лужайка").props.onClick(); await flush();
    assert.equal(calls.length, 0); assert.equal(h.get("level"), 2);
    terminal(h, "won"); clock.advance(1);
    h.button("Следующая лужайка").props.onClick(); await flush();
    assert.deepEqual(calls.map(c => c[0]), ["VKWebAppCheckNativeAds", "VKWebAppShowNativeAds"]);
    assert.equal(h.get("level"), 3);
    assert.equal(h.get("lastInterstitialAt"), clock.now());
    terminal(h, "lost"); clock.advance(1000);
    h.button("Ещё раз").props.onClick(); await flush();
    assert.equal(calls.length, 2); assert.equal(h.get("levelState").status, "playing");
  } finally { clock.restore(); }
});

test("actual win action gives rewards and waits for chosen next boundary instead of auto ad", async () => {
  const clock = fakeEnvironment();
  try {
    let calls = 0;
    const h = ready({ send: async (_method, params) => { if (params?.ad_format) calls++; return { result: true }; } });
    start(h); clock.advance(180000);
    const state = h.get("levelState");
    h.set("levelState", { ...state, goals: [{ type: "honey", target: 1 }] });
    const swap = h.engine.findAvailableSwap(state.board);
    assert.ok(swap);
    const cell = position => h.render().find(n => n.type === "button" && n.props["aria-label"]?.includes(`ряд ${position.row + 1}, столбец ${position.col + 1}`));
    cell(swap.from).props.onClick(); cell(swap.to).props.onClick(); await flush();
    assert.equal(h.get("levelState").status, "won");
    assert.equal(h.get("coins"), 168); assert.equal(calls, 0);
  } finally { clock.restore(); }
});

test("loss keeps board until interstitial settles; duplicate clicks do not show twice", async () => {
  const clock = fakeEnvironment();
  try {
    let release, shows = 0;
    const h = ready({ send: async method => {
      if (method === "VKWebAppShowNativeAds") { shows++; return new Promise(resolve => { release = resolve; }); }
      return { result: true };
    } });
    start(h); terminal(h, "lost"); clock.advance(180000);
    const retry = h.button("Ещё раз"); retry.props.onClick(); retry.props.onClick(); await flush();
    assert.equal(shows, 1); assert.equal(h.get("levelState").status, "lost");
    assert.equal(h.get("interstitialBusy"), true); assert.equal(h.button("Ещё раз").props.disabled, true);
    clock.advance(30000); release({ result: true }); await flush();
    assert.equal(h.get("levelState").status, "playing"); assert.equal(h.get("lastInterstitialAt"), clock.now());
    assert.equal(h.get("interstitialBusy"), false);
  } finally { clock.restore(); }
});

test("cancelled automatic ad always allows free retry and does not write success", async () => {
  const clock = fakeEnvironment();
  try {
    const h = ready({ send: async method => ({ result: method !== "VKWebAppShowNativeAds" }) });
    start(h); terminal(h, "lost"); clock.advance(180000);
    h.button("Ещё раз").props.onClick(); await flush();
    assert.equal(h.get("levelState").status, "playing"); assert.equal(h.get("lastInterstitialAt"), 0);
    assert.equal(clock.stored.size, 0); assert.equal(h.get("interstitialBusy"), false);
  } finally { clock.restore(); }
});

test("successful moves reward is useful; pending/free retry and immediate auto ad are blocked", async () => {
  const clock = fakeEnvironment();
  try {
    let release, shows = 0;
    const h = ready({ send: async (method, params) => {
      if (method === "VKWebAppShowNativeAds") { shows++; assert.equal(params.ad_format, "reward"); return new Promise(resolve => { release = resolve; }); }
      return { result: true };
    } });
    start(h); terminal(h, "lost"); clock.advance(180000);
    h.button("+5 ходов за рекламу").props.onClick(); await flush();
    h.button("Ещё раз").props.onClick(); await flush();
    assert.equal(h.get("levelState").status, "lost"); assert.equal(shows, 1);
    release({ result: true }); await flush();
    assert.equal(h.get("levelState").movesLeft, 5); assert.equal(h.get("levelState").status, "playing");
    assert.equal(h.get("rewards").count, 1);
    h.button("Понятно").props.onClick();
    terminal(h, "won"); h.button("Следующая лужайка").props.onClick(); await flush();
    assert.equal(shows, 1); assert.equal(h.get("level"), 2);
  } finally { clock.restore(); }
});

test("won/no-effect moves offer does not call SDK or spend quota", async () => {
  const clock = fakeEnvironment();
  try {
    let shows = 0;
    const h = ready({ send: async method => { if (method === "VKWebAppShowNativeAds") shows++; return { result: true }; } });
    start(h); terminal(h, "won");
    h.button("+5 ходов за рекламу").props.onClick(); await flush();
    assert.equal(shows, 0); assert.equal(h.get("rewards").count, 0);
  } finally { clock.restore(); }
});


test("actual deferred rewarded completion across local midnight counts the new day", async () => {
  const clock = fakeEnvironment(new Date(2026, 9, 10, 23, 59, 50).getTime());
  try {
    let release;
    const h = ready({ send: async method => {
      if (method === "VKWebAppShowNativeAds") return new Promise(resolve => { release = resolve; });
      return { result: true };
    } }); start(h); terminal(h, "lost");
    const previous = { date: "2026-10-10", count: 7, lastRewardAt: 0 };
    h.set("rewards", previous);
    h.button("+5 ходов за рекламу").props.onClick(); await flush();
    assert.equal(h.get("rewards").count, 7);
    clock.advance(20000); release({ result: true }); await flush();
    const completed = h.get("rewards");
    assert.equal(completed.date, "2026-10-11"); assert.equal(completed.count, 1);
    assert.equal(completed.lastRewardAt, clock.now());
    assert.equal(h.ref("adPolicyRef").current.rewardWaitMs(), 180000);
  } finally { clock.restore(); }
});


test("winning swap animation cannot start a deferred moves video or spend reward quota", async () => {
  const clock = fakeEnvironment();
  try {
    let finishSwap, completeVideo, shows = 0;
    const h = ready({ send: async method => {
      if (method === "VKWebAppShowNativeAds") {
        shows++;
        return new Promise(resolve => { completeVideo = resolve; });
      }
      return { result: true };
    } }); start(h); clock.advance(180000);
    const state = h.get("levelState");
    h.set("levelState", { ...state, goals: [{ type: "honey", target: 1 }] });
    const swap = h.engine.findAvailableSwap(state.board); assert.ok(swap);
    const oldRewardButton = h.button("+5 ходов за рекламу");
    window.setTimeout = (fn, ms) => { if (ms === 180) { finishSwap = fn; return 1; } fn(); return 1; };
    const cell = position => h.render().find(n => n.type === "button" && n.props["aria-label"]?.includes(`ряд ${position.row + 1}, столбец ${position.col + 1}`));
    cell(swap.from).props.onClick(); cell(swap.to).props.onClick(); await flush();
    assert.equal(h.ref("busyRef").current, true); assert.equal(h.get("levelState").status, "playing");
    const disabledDuringSwap = h.button("+5 ходов за рекламу").props.disabled;
    oldRewardButton.props.onClick(); await flush();
    assert.equal(shows, 0); assert.equal(completeVideo, undefined); assert.equal(disabledDuringSwap, true);
    assert.equal(h.get("rewards").count, 0); assert.equal(h.get("stats").adsWatched, 0);
    finishSwap(); await flush();
    assert.equal(h.get("levelState").status, "won"); assert.equal(h.ref("busyRef").current, false);
    h.button("+5 ходов за рекламу").props.onClick(); await flush();
    assert.equal(shows, 0); assert.equal(h.get("rewards").count, 0); assert.equal(h.get("stats").adsWatched, 0);
    assert.notEqual(h.get("message"), "+5 ходов");
  } finally { clock.restore(); }
});

test("pending next/retry boundary rejects reward handler even before policy acquires its SDK lock", async () => {
  const clock = fakeEnvironment();
  try {
    let shows = 0;
    const h = ready({ send: async method => { if (method === "VKWebAppShowNativeAds") shows++; return { result: true }; } }); start(h);
    h.ref("boundaryPendingRef").current = true;
    h.button("+5 ходов за рекламу").props.onClick(); await flush();
    assert.equal(shows, 0); assert.equal(h.get("rewards").count, 0);
  } finally { clock.restore(); }
});


test("reset during winning swap animation cancels stale board and payout", async () => {
  const clock = fakeEnvironment();
  try {
    const h = ready(undefined, { started: true });
    const state = h.get("levelState");
    h.set("levelState", { ...state, goals: [{ type: "honey", target: 1 }] });
    let finishSwap;
    window.setTimeout = (fn, ms) => { if (ms === 180) { finishSwap = fn; return 1; } fn(); return 1; };
    const move = h.engine.findAvailableSwap(state.board);
    const cell = p => h.render().find(node => node.type === "button" && node.props["aria-label"]?.includes(`ряд ${p.row + 1}, столбец ${p.col + 1}`));
    cell(move.from).props.onClick(); cell(move.to).props.onClick(); await flush();
    h.button("Итоги").props.onClick(); h.button("Сбросить прогресс").props.onClick(); h.button("Да, начать заново").props.onClick();
    const fresh = structuredClone(h.get("levelState"));
    finishSwap(); await flush();
    assert.deepEqual(h.get("levelState"), fresh);
    assert.equal(h.get("coins"), 120); assert.equal(h.get("stats").levelsWon, 0);
    assert.equal(h.get("pendingReward"), null); assert.equal(h.get("busy"), false);
  } finally { clock.restore(); }
});

// Actual component handlers with seeded unit save and mocked SDK transport;
// this is not a native VK or live browser test.
const resetQuotaSlug = 'bortnik';
const currentQuota = h => ['bortnik', 'rodnik'].includes(resetQuotaSlug) ? h.get('rewards') : h.get('save').rewards;
function putQuota(h, rewards) {
  if (['bortnik', 'rodnik'].includes(resetQuotaSlug)) h.set('rewards', rewards);
  else h.set('save', { ...h.get('save'), rewards });
}
function resetViaActualButtons(h) {
  h.button('Итоги').props.onClick(); h.button('Сбросить').props.onClick();
  if (resetQuotaSlug === 'bortnik') h.button('Да, начать заново').props.onClick();
  if (resetQuotaSlug === 'rodnik') h.button('Сбросить', 1).props.onClick();
}
function rewardViaActualButton(h) {
  h.button(resetQuotaSlug === 'bortnik' ? '+5 ходов за рекламу' :
    resetQuotaSlug === 'rodnik' ? 'Отмены: +3 за рекламу' :
    resetQuotaSlug === 'terem' ? 'Новые блоки за рекламу' : '📺 Убрать ряд').props.onClick();
}
function resumeResetGame(h) { if (h.get('started') === false) start(h); h.set('tab', resetQuotaSlug === 'bortnik' ? 'hive' : 'play'); }

test('actual progress reset cannot reopen eight exhausted same-day rewarded views after cooldown', async () => {
  const clock = fakeEnvironment();
  try {
    let shows = 0;
    const h = ready({ send: async (method, params) => { if (method === 'VKWebAppShowNativeAds' && params?.ad_format === 'reward') shows++; return { result: true }; } }); start(h);
    const original = { ...currentQuota(h), count: 8, lastRewardAt: clock.now() };
    putQuota(h, original); h.ref('adPolicyRef').current.seedLastAdAt(clock.now());
    resetViaActualButtons(h); resumeResetGame(h); clock.advance(180000);
    rewardViaActualButton(h); await flush();
    assert.equal(shows, 0, 'A ninth same-day view must be rejected before SDK even after a gameplay reset');
    assert.deepEqual(currentQuota(h), original);
    const serialized = h.engine.serializeSave({ ...h.engine.createDefaultSave(), rewards: currentQuota(h) });
    assert.deepEqual(h.engine.migrateSave(serialized).rewards, original);
  } finally { clock.restore(); }
});

test('actual reset rolls an expired reward day forward without losing successful-ad timestamp', () => {
  const clock = fakeEnvironment(new Date(2026, 9, 11, 12).getTime());
  try {
    const h = ready(); start(h);
    const old = { date: '2026-10-10', count: 8, lastRewardAt: clock.now() - 60000 };
    putQuota(h, old); resetViaActualButtons(h);
    assert.deepEqual(currentQuota(h), { date: '2026-10-11', count: 0, lastRewardAt: old.lastRewardAt });
  } finally { clock.restore(); }
});

test('actual reset during deferred reward must preserve the round and count the successful video', async () => {
  const clock = fakeEnvironment();
  try {
    let release, shows = 0;
    const h = ready({ send: async (method, params) => {
      if (method === 'VKWebAppShowNativeAds' && params?.ad_format === 'reward') {
        shows++; return new Promise(resolve => { release = resolve; });
      }
      return { result: true };
    } }); start(h);
    const before = { ...currentQuota(h), count: 3, lastRewardAt: 0 }; putQuota(h, before);
    rewardViaActualButton(h); await flush(); assert.equal(shows, 1);
    const epoch = h.ref(resetQuotaSlug === 'bortnik' || resetQuotaSlug === 'rodnik' ? 'progressEpochRef' : 'roundEpochRef').current;
    resetViaActualButtons(h);
    assert.equal(h.ref(resetQuotaSlug === 'bortnik' || resetQuotaSlug === 'rodnik' ? 'progressEpochRef' : 'roundEpochRef').current, epoch, 'Pending reward prevents reset and stale-epoch cancellation');
    assert.deepEqual(currentQuota(h), before);
    release({ result: true }); await flush();
    assert.equal(currentQuota(h).count, 4); assert.equal(currentQuota(h).lastRewardAt, clock.now());
    assert.equal(h.ref('adPolicyRef').current.isBusy(), false);
  } finally { clock.restore(); }
});

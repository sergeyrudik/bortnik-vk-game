import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object") return text(node.props?.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

// These are unit tests of the actual component handlers, not real UI or native VK tests.
export function createHarness(repo, overrides = {}, bridge = { send: async () => ({ result: true }) }) {
  const require = createRequire(path.join(repo, "package.json"));
  const ts = require("typescript");
  const source = fs.readFileSync(path.join(repo, "app/page.tsx"), "utf8");
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const stateNames = [], refNames = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
      const kind = node.initializer.expression.getText(ast);
      if (kind === "useState" && ts.isArrayBindingPattern(node.name)) stateNames.push(node.name.elements[0].name.getText(ast));
      if (kind === "useRef" && ts.isIdentifier(node.name)) refNames.push(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const state = [], refs = [], effects = [], sdkListeners = []; let stateIndex = 0, refIndex = 0;
  const sdk = { ...bridge, subscribe: fn => sdkListeners.push(fn), unsubscribe: fn => { const i = sdkListeners.indexOf(fn); if (i >= 0) sdkListeners.splice(i, 1); } };
  const react = {
    useState(initial) {
      const i = stateIndex++, name = stateNames[i];
      if (!(i in state)) state[i] = Object.hasOwn(overrides, name) ? overrides[name] : typeof initial === "function" ? initial() : initial;
      return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }];
    },
    useRef(initial) {
      const i = refIndex++;
      if (!(i in refs)) refs[i] = { current: refNames[i] === "bridgeRef" ? bridge : initial };
      return refs[i];
    },
    useEffect(fn) { effects.push(fn); }, useCallback: fn => fn, useMemo: fn => fn(),
  };
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const mod = { exports: {} }; modules.set(file, mod.exports);
    const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const local = name => {
      if (name === "react") return react;
      if (name === "next/link") return { default: "a" };
      if (name === "@vkontakte/vk-bridge") return { default: sdk };
      if (name === "./vk-runtime") return { writeStoredValue: () => true, readStoredValue: () => null };
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name + ".ts"));
      return require(name);
    };
    new Function("require", "module", "exports", compiled)(local, mod, mod.exports);
    modules.set(file, mod.exports); return mod.exports;
  }
  const app = load(path.join(repo, "app/page.tsx"));
  function render() {
    stateIndex = 0; refIndex = 0; effects.length = 0;
    const tree = app.default(), nodes = [];
    function walk(node) {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node && typeof node === "object" && node.props) { nodes.push(node); walk(node.props.children); }
    }
    walk(tree); return nodes;
  }
  render();
  return {
    runEffect(fragment) { render(); const fn = effects.find(fn => fn.toString().includes(fragment)); assert.ok(fn, fragment); return fn(); },
    emitBridge(event) { sdkListeners.forEach(fn => fn(event)); },
    render, engine: load(path.join(repo, "app/game-engine.ts")),
    get: name => state[stateNames.indexOf(name)],
    set(name, value) { assert.ok(stateNames.includes(name), name); state[stateNames.indexOf(name)] = value; },
    ref: name => refs[refNames.indexOf(name)],
    button(label, index = 0) {
      const buttons = render().filter(n => n.type === "button" && text(n).includes(label));
      assert.ok(buttons[index], `Missing button: ${label}`); return buttons[index];
    },
  };
}

export const flush = () => new Promise(resolve => setImmediate(resolve));


// Controlled same-origin Web Locks used by unit fixtures, never native VK proof.
export function fakeWebLocks() {
  const held = new Set(); const tails = new Map();
  return { request(name, options, callback) {
    const run = typeof options === "function" ? options : callback;
    if (options?.ifAvailable) {
      if (held.has(name)) return Promise.resolve(run(null));
      held.add(name);
      return Promise.resolve().then(() => run({ name })).finally(() => held.delete(name));
    }
    const queued = (tails.get(name) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      held.add(name); try { return await run({ name }); } finally { held.delete(name); }
    });
    tails.set(name, queued); return queued;
  } };
}

export function fakeEnvironment(start = 1_800_000_000_000) {
  let time = start;
  const NativeDate = Date;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originals = { Date: NativeDate, now: Date.now, window: globalThis.window, document: globalThis.document, storage: globalThis.localStorage, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const listeners = new Map();
  const stored = new Map();
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: fakeWebLocks() } });
  globalThis.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
  };
  globalThis.window = { setTimeout(fn) { fn(); return 1; }, clearTimeout() {} };
  globalThis.setTimeout = fn => { fn(); return 1; };
  globalThis.clearTimeout = () => {};
  globalThis.document = { hidden: false, addEventListener(name, fn) { const entries = listeners.get(name) ?? new Set(); entries.add(fn); listeners.set(name, entries); }, removeEventListener(name, fn) { listeners.get(name)?.delete(fn); } };
  globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  return {
    emit(name) { listeners.get(name)?.forEach(fn => fn()); },
    stored, advance(ms) { time += ms; }, now: () => time,
    restore() { if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else delete globalThis.navigator; globalThis.Date = originals.Date; Date.now = originals.now; globalThis.window = originals.window; globalThis.document = originals.document; globalThis.localStorage = originals.storage; globalThis.setTimeout = originals.setTimeout; globalThis.clearTimeout = originals.clearTimeout; },
  };
}

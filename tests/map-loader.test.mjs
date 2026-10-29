import test from 'node:test';
import assert from 'node:assert/strict';

let serial = 0;
async function fixture() {
  const scripts = [];
  const old = {window: globalThis.window, document: globalThis.document, location: globalThis.location};
  globalThis.window = {};
  globalThis.location = {origin: 'https://class.example.test'};
  globalThis.document = {createElement: () => ({remove() {this.removed = true;}}), head: {append(script) {scripts.push(script);}}};
  const module = await import(`../gathering/static/gathering/map.js?test=${serial++}`);
  return {scripts, loadMap: module.loadMap, restore() {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }};
}
const readySDK = () => ({Map: function(){}, DistrictLayer: {World:function(){}, Country:function(){}, Province:function(){}},
  DistrictSearch:function(){}, Geocoder:function(){}, ToolBar:function(){}, Scale:function(){}});

test('SDK bootstrap and plugin callbacks both precede map readiness', async () => {
  const f = await fixture();
  try {
    let resolved = false, finishPlugins;
    const promise = f.loadMap({key:'test-key',security_js_code:'test-code'});
    promise.then(() => {resolved = true;});
    assert.strictEqual(f.loadMap({key:'test-key'}), promise);
    assert.equal(f.scripts.length, 1);
    const script = f.scripts[0], callback = new URL(script.src).searchParams.get('callback');
    assert.ok(callback);
    script.onload?.();
    await Promise.resolve();
    assert.equal(resolved, false, 'bootstrap script onload must not resolve before provider callback');
    window.AMap = {Map:function(){}, plugin(names, done) {assert.ok(names.includes('AMap.DistrictLayer')); finishPlugins = done;}};
    window[callback]();
    await Promise.resolve();
    assert.equal(resolved, false, 'provider callback must wait for required plugins');
    Object.assign(window.AMap, readySDK()); finishPlugins();
    assert.strictEqual(await promise, window.AMap);
    assert.equal(window[callback], undefined);
    await f.loadMap({key:'test-key'});
    assert.equal(f.scripts.length, 1);
  } finally {f.restore();}
});

test('network failure cleans up and allows a fresh attempt', async () => {
  const f = await fixture();
  try {
    const promise = f.loadMap({key:'test-key',service_host:'/_AMapService'});
    const callback = new URL(f.scripts[0].src).searchParams.get('callback');
    const rejection = assert.rejects(promise, /无法连接高德地图/);
    f.scripts[0].onerror(); await rejection;
    assert.equal(f.scripts[0].removed, true);
    assert.equal(window[callback], undefined);
    assert.equal(window._AMapSecurityConfig.serviceHost, 'https://class.example.test/_AMapService');
    const retry = f.loadMap({key:'test-key'});
    assert.equal(f.scripts.length, 2);
    const again = assert.rejects(retry); f.scripts[1].onerror(); await again;
  } finally {f.restore();}
});

test('missing key rejects without inserting a provider script', async () => {
  const f = await fixture();
  try {await assert.rejects(f.loadMap({}), /地图尚未配置/); assert.equal(f.scripts.length, 0);}
  finally {f.restore();}
});

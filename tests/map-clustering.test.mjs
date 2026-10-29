import test from 'node:test';
import assert from 'node:assert/strict';
import {ClassMap} from '../gathering/static/gathering/map.js';
import {consistentCounts, presetRange} from '../gathering/static/gathering/filter.js';

// Stub of the slice of the AMap 1.4.15 SDK that ClassMap touches. Screen projection is
// a plain scale so tests can push points together or apart by changing `scale`.
function stubSDK() {
  class MapStub {
    constructor(element, options) {this.options = options; this.events = {}; this.scale = 10; this.added = []; this.fits = [];}
    addControl() {}
    on(name, callback) {this.events[name] = callback;}
    off(name) {delete this.events[name];}
    add(items) {this.added.push(...[].concat(items));}
    remove(items) {const gone = new Set([].concat(items)); this.added = this.added.filter(item => !gone.has(item));}
    setZoomAndCenter() {}
    setFitView(markers, immediately, padding, maxZoom) {this.fits.push({markers, padding, maxZoom});}
    lngLatToContainer([lng, lat]) {return {x: lng * this.scale, y: -lat * this.scale};}
    destroy() {this.destroyed = true;}
  }
  class Layer {constructor(options) {this.options = options;} setStyles(styles) {this.options.styles = styles;}}
  return {Map: MapStub, ToolBar: class {}, Scale: class {},
    DistrictLayer: {World: Layer, Country: Layer, Province: Layer},
    LngLat: class extends Array {constructor(lng, lat) {super(lng, lat);}},
    Pixel: class {constructor(x, y) {this.x = x; this.y = y;}},
    Marker: class {constructor(options) {Object.assign(this, options);}}};
}

const divisions = {
  cities: new Map([['420100', {name: '武汉市', center: [114.3, 30.6]}], ['430100', {name: '长沙市', center: [112.9, 28.2]}],
    ['110000', {name: '北京市', center: [116.4, 39.9]}]]),
  provinces: new Map([['420000', {name: '湖北省', center: [114.3, 30.5]}]]),
};
const at = '2026-01-15T12:00:00+08:00';
const loc = (city, extra = {}) => ({country_code: 'CHN', province_code: city.slice(0, 2) + '0000', city_code: city, confirmed_at: at, ...extra});
const people = [
  ...Array.from({length: 5}, (_, i) => ({id: i + 1, name: `汉${i}`, location: loc('420100')})),
  {id: 10, name: '湘', location: loc('430100')},
  {id: 11, name: '京', location: loc('110000', {longitude: '116.40', latitude: '39.90'})},
  {id: 12, name: '鄂', location: loc('', {province_code: '420000'})},
  {id: 13, name: '旧', location: loc('420100', {confirmed_at: '2015-09-01T12:00:00+08:00'})},
  {id: 20, name: '狮城', location: {country_code: 'SGP', country_name: '新加坡', province_code: '', city_code: '', confirmed_at: at}},
  {id: 21, name: '空', location: null},
];
const range = presetRange('3y', '2026-10-29', '2015-09-01');

function withDocument(run) {
  const old = globalThis.document;
  globalThis.document = {createElement: tag => ({tag, setAttribute(k, v) {this[k] = v;}, addEventListener(name, fn) {this['on' + name] = fn;}})};
  try {return run();} finally {globalThis.document = old;}
}
const countOf = marker => Number(marker.content.innerHTML.match(/class="d"[^>]*>(\d+)</)[1]);
const labelOf = marker => marker.content.innerHTML.match(/class="nm">([^<]*)</)[1];

test('count markers sum to the filtered domestic count and drop out-of-range people', () => withDocument(() => {
  const map = new ClassMap(stubSDK(), 'map', {divisions});
  map.update(people, range);
  const total = map.markers.reduce((sum, marker) => sum + countOf(marker), 0);
  assert.equal(total, consistentCounts(people, range).china);
  assert.equal(total, 8);
}));

test('province-only people get their own labelled point', () => withDocument(() => {
  const map = new ClassMap(stubSDK(), 'map', {divisions});
  map.map.scale = 1000;
  map.update(people, range);
  const province = map.markers.find(marker => labelOf(marker) === '湖北 · 未填城市');
  assert.ok(province);
  assert.notDeepEqual([...province.position], [...map.markers.find(marker => labelOf(marker) === '武汉').position],
    'the province-only dot must not sit exactly on the capital');
}));

test('close cities merge into a cluster that splits when zoomed in', () => withDocument(() => {
  const map = new ClassMap(stubSDK(), 'map', {divisions});
  map.map.scale = 10;  // Wuhan, Changsha and the Hubei point sit within a few pixels
  map.update(people, range);
  const merged = map.markers.find(marker => marker.content.className.includes('cl'));
  assert.ok(merged, 'a cluster marker exists');
  assert.match(labelOf(merged), /等 \d 城$/);
  map.map.scale = 1000; map.map.events.zoomend();
  assert.equal(map.markers.filter(marker => marker.content.className.includes('cl')).length, 0);
  assert.equal(map.markers.length, 4);
}));

test('clicking a city picks it; clicking a cluster zooms to its points', () => withDocument(() => {
  const picks = [], clusters = [];
  const map = new ClassMap(stubSDK(), 'map', {divisions, onPick: (key, level) => picks.push([key, level]), onClusterPick: keys => clusters.push(keys)});
  map.update(people, range);
  map.markers.find(marker => marker.content.className.includes('cl')).content.onclick({stopPropagation() {}});
  assert.equal(clusters.length, 1);
  assert.equal(map.map.fits.length, 1);
  assert.ok(map.map.fits[0].maxZoom <= 9, 'a cluster tap zooms to city level, not street level');
  map.map.scale = 1000; map.map.events.zoomend();
  map.markers.find(marker => labelOf(marker) === '武汉').content.onclick({stopPropagation() {}});
  assert.deepEqual(picks, [['420100', 'china']]);
}));

test('selection marks the point without changing its count colour', () => withDocument(() => {
  const map = new ClassMap(stubSDK(), 'map', {divisions});
  map.map.scale = 1000;
  map.update(people, range);
  const before = map.markers.find(marker => labelOf(marker) === '武汉').content.innerHTML;
  map.select('420100');
  const after = map.markers.find(marker => labelOf(marker) === '武汉');
  assert.match(after.content.className, /\bsel\b/);
  assert.equal(after.content.innerHTML.match(/background:[^;"]+/)[0], before.match(/background:[^;"]+/)[0]);
}));

test('world level counts only overseas people, placed at the country centre', () => withDocument(() => {
  const map = new ClassMap(stubSDK(), 'map', {divisions});
  map.setLevel('world');
  map.update(people, range);
  assert.equal(map.markers.length, 1);
  assert.equal(labelOf(map.markers[0]), '新加坡');
  assert.deepEqual([...map.markers[0].position], [103.82, 1.35]);
}));

test('fit leaves room for the bottom sheet and destroy unhooks events', () => withDocument(() => {
  const map = new ClassMap(stubSDK(), 'map', {divisions});
  map.update(people, range);
  map.setBottomInset(300);
  map.fit();
  assert.equal(map.map.fits.at(-1).padding[1], 320);  // AMap order: top, bottom, left, right
  map.destroy();
  assert.equal(map.map.destroyed, true);
  assert.equal(map.map.events.zoomend, undefined);
}));

test('a world view too wide for one screen centres on the biggest country instead of the midpoint', () => withDocument(() => {
  const sdk = stubSDK();
  const map = new ClassMap(sdk, 'map', {divisions});
  map.map.setZoomAndCenter = (zoom, center) => {map.map.centred = {zoom, center};};
  map.setLevel('world');
  const abroad = (id, code, lng, lat) => ({id, name: code, location: {country_code: code, country_name: code, province_code: '', city_code: '', confirmed_at: at, longitude: String(lng), latitude: String(lat)}});
  map.update([abroad(1, 'USA', -74, 40.7), abroad(2, 'SGP', 103.8, 1.35), abroad(3, 'SGP', 103.8, 1.35)], range);
  map.fit();
  assert.deepEqual(map.map.centred, {zoom: 3, center: [103.8, 1.35]});
}));

test('focus centres the map on a city dot', () => withDocument(() => {
  const map = new ClassMap(stubSDK(), 'map', {divisions});
  map.map.scale = 1000;
  map.map.setCenter = center => {map.map.centre = center;};
  map.update(people, range);
  map.focus('420100');
  assert.deepEqual(map.map.centre, [114.3, 30.6]);
}));

test('people without a known position are reported, never dropped silently or thrown on', () => withDocument(() => {
  const reports = [];
  const map = new ClassMap(stubSDK(), 'map', {divisions: null, onUnplaced: n => reports.push(n)});
  map.map.scale = 1000;
  map.update([{id: 1, name: 'a', location: loc('420100')}, {id: 2, name: 'b', location: loc('110000', {longitude: '116.4', latitude: '39.9'})}], range);
  assert.equal(map.markers.length, 1);
  assert.deepEqual(reports.at(-1), 1);
  map.setLevel('world');
  assert.doesNotThrow(() => map.update([{id: 3, name: 'c', location: {country_code: 'XXX', country_name: '某地', confirmed_at: at}}], range));
  assert.deepEqual(reports.at(-1), 1);
  map.setDivisions(divisions);
  map.setLevel('china');
  map.update([{id: 1, name: 'a', location: loc('420100')}], range);
  assert.deepEqual(reports.at(-1), 0);
}));

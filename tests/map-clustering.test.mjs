import test from 'node:test';
import assert from 'node:assert/strict';
import {ClassMap} from '../gathering/static/gathering/map.js';

test('map reclusters on zoom and keeps active filters, random list order and click handlers', () => {
  const oldDocument = globalThis.document;
  globalThis.document = {createElement() {return {setAttribute() {}, addEventListener(name, handler) {this[name] = handler;}};}};
  class MapStub {
    constructor() {this.events = {}; this.scale = 100; this.layers = [];}
    addControl() {}
    on(name, callback) {this.events[name] = callback;}
    off(name) {delete this.events[name];}
    add() {}
    remove() {}
    setZoomAndCenter() {}
    lngLatToContainer([lng, lat]) {return {x: lng * this.scale, y: lat * this.scale};}
    destroy() {this.destroyed = true;}
  }
  class Layer {setStyles() {}}
  const A = {Map: MapStub, ToolBar: class {}, Scale: class {},
    DistrictLayer: {World: Layer, Country: Layer, Province: Layer},
    LngLat: class extends Array {constructor(lng, lat) {super(lng, lat);}},
    Pixel: class {}, Marker: class {constructor(options) {Object.assign(this, options);}}};
  try {
    let clicked;
    const map = new ClassMap(A, 'map', () => {}, people => {clicked = people.map(p => p.id);});
    const member = (id, lng, country = 'CHN') => ({id, name: `同学${id}`, location: {longitude: lng, latitude: 0, country_code: country}});
    const rows = [member(2, 0.1), member(1, 0), member(3, 0, 'JPN')];
    map.update({level: 'china'}, rows);
    assert.equal(map.markers.length, 1);
    assert.equal(map.markers[0].content.textContent, '2');
    map.markers[0].content.click({stopPropagation() {}});
    assert.deepEqual(clicked, [2, 1]);
    map.map.scale = 1000; map.map.events.zoomend();
    assert.equal(map.markers.length, 2);
    map.update({level: 'china', search: '同学2'}, rows);
    assert.equal(map.markers.length, 1);
    map.map.events.moveend();
    assert.equal(map.markers.length, 1);
    map.update({level: 'china'}, []);
    assert.equal(map.markers.length, 0);
    map.destroy(); assert.equal(map.map.destroyed, true);
    assert.equal(map.map.events.zoomend, undefined);
  } finally {globalThis.document = oldDocument;}
});

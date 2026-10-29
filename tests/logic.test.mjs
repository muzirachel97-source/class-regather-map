import test from 'node:test';
import assert from 'node:assert/strict';
import {chinaCountry, cityKey, provinceKey, scopeMembers, regionCounts, dayNumber, dayString} from '../gathering/static/gathering/logic.js';
const members = [
  {id: 1, name: '甲', location: {country_code: 'CHN', province_code: '330000', city_code: '330100', city_name: '杭州'}},
  {id: 2, name: '乙', location: {country_code: 'CHN', province_code: '330000', city_code: '330200', city_name: '宁波'}},
  {id: 3, name: '丙', location: {country_code: 'JPN', city_name: 'Tokyo'}},
  {id: 4, name: '丁', location: null},
];
test('China orientation folds provider regional aliases into China', () => {
  for (const code of ['CHN', 'TWN', 'HKG', 'MAC']) assert.equal(chinaCountry(code), 'CHN');
  assert.equal(chinaCountry('JPN'), 'JPN');
  assert.equal(provinceKey({adcode: 330100}), '330000');
  assert.equal(cityKey('110100', '110000'), '110000');
});
test('world, country and province filters select the right students', () => {
  assert.equal(scopeMembers(members, {level: 'world'}).length, 4);
  assert.deepEqual(scopeMembers(members, {level: 'world', selected: 'JPN'}).map(x => x.id), [3]);
  assert.deepEqual(scopeMembers(members, {level: 'china'}).map(x => x.id), [1, 2]);
  assert.deepEqual(scopeMembers(members, {level: 'province', province: '330000', selected: '330100'}).map(x => x.id), [1]);
  assert.deepEqual(scopeMembers(members, {level: 'china', unknown: true}).map(x => x.id), [4]);
});
test('group counts stay scoped and include no duplicates', () => {
  assert.deepEqual([...regionCounts(members, {level: 'world'})], [['CHN', 2], ['JPN', 1]]);
  assert.deepEqual([...regionCounts(members, {level: 'province', province: '330000'})], [['330100', 1], ['330200', 1]]);
});
test('search works with missing locations and non-ASCII city names', () => {
  assert.deepEqual(scopeMembers(members, {level: 'world', search: '杭州'}).map(x => x.id), [1]);
  assert.deepEqual(scopeMembers(members, {level: 'world', search: 'tokyo'}).map(x => x.id), [3]);
});
test('date timeline is invariant across daylight saving and leap years', () => {
  for (const day of ['2020-02-29', '2024-03-10', '2025-11-02']) assert.equal(dayString(dayNumber(day)), day);
  assert.equal(dayString(dayNumber('2024-02-28') + 1), '2024-02-29');
});

test('member order is shuffled once, stable across history and searches, without mutating inputs', async () => {
  const {createMemberOrder} = await import('../gathering/static/gathering/logic.js');
  const order = createMemberOrder(() => 0);
  const first = order(members);
  assert.deepEqual(first.map(m => m.id), [2, 3, 4, 1]);
  assert.deepEqual(members.map(m => m.id), [1, 2, 3, 4]);
  assert.deepEqual(order([...members].reverse()).map(m => m.id), [2, 3, 4, 1]);
  assert.deepEqual(order([members[0], members[2]]).map(m => m.id), [3, 1]);
  assert.deepEqual(order([...members, {id: 5}]).map(m => m.id), [2, 3, 4, 1, 5]);
});

test('nearby points merge at small scales and split when enlarged, identical points stay together', async () => {
  const {clusterMembers} = await import('../gathering/static/gathering/logic.js');
  const rows = [0, 0.1, 2, 0].map((lng, i) => ({id: i, location: {longitude: lng, latitude: 0}}));
  const project = scale => ([lng, lat]) => ({x: lng * scale, y: lat * scale});
  assert.deepEqual(clusterMembers(rows, project(100)).map(c => c.people.map(m => m.id)), [[0, 1, 3], [2]]);
  assert.deepEqual(clusterMembers(rows, project(1000)).map(c => c.people.map(m => m.id)), [[0, 3], [1], [2]]);
  assert.equal(clusterMembers([{id: 9, location: null}, {id: 10, location: {longitude: 'NaN', latitude: 0}}], project(1)).length, 0);
  assert.deepEqual(clusterMembers([...rows].reverse(), project(100)).map(c => c.people.map(m => m.id)), [[3, 1, 0], [2]]);
});

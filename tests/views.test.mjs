import test from 'node:test';
import assert from 'node:assert/strict';
import {memberRow, regionTitle, sectionTitle, summaryLine} from '../gathering/static/gathering/views.js';
import {monthIndex} from '../gathering/static/gathering/filter.js';

const person = (confirmed, loc = {}) => ({id: 7, name: '林<小满>', bio: '', location: {country_code: 'CHN', country_name: '中国', province_code: '420000',
  province_name: '湖北省', city_code: '420100', city_name: '武汉市', label: '光谷', note: '做芯片', confirmed_at: confirmed, ...loc}});
const range = {from: monthIndex('2023-10-01'), to: null};

test('fresh row shows the confirm month tag; text is escaped', () => {
  const html = memberRow(person('2026-10-03T12:00:00+08:00'), range, {showPlace: true});
  assert.match(html, /2026\.10 确认/);
  assert.match(html, /林&lt;小满&gt;/);
  assert.match(html, /武汉 · 光谷 · 做芯片/);
  assert.doesNotMatch(html, /class="mem old"/);
});

test('out-of-range row is greyed and says which year the info is from', () => {
  const html = memberRow(person('2015-09-01T12:00:00+08:00'), range, {});
  assert.match(html, /class="mem old"/);
  assert.match(html, /2015 年的信息/);
  assert.match(memberRow(person(null), range, {}), /还没确认过/);
});

test('region and section copy follow the spec', () => {
  assert.equal(regionTitle('武汉', 5), '武汉 · 5 人');
  assert.equal(sectionTitle(true), '这段时间确认过');
  assert.equal(summaryLine(66), '这段时间确认过位置 · 全班 66 人');
});

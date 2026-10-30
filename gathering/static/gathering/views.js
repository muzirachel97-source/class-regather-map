import {inRange} from './filter.js';

// HTML builders for the sheet lists (spec 5.1–5.4). Pure: data in, escaped HTML out.

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const shortName = name => String(name || '').replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|盟|省|市)$/, '');
const TONES = ['#ffd84d', '#ffa9cf', '#86e3bd', '#a8cbff', '#ffbd8a', '#cdb2ff'];
const CHEVRON = '<svg class="chev" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const regionTitle = (name, n) => `${name} · ${n} 人`;
export const sectionTitle = fresh => fresh ? '这段时间确认过' : '更早的记录';
// Name of the second group on any list: "older" only when the range runs to today.
export const otherGroup = (toToday, place = '') => toToday
  ? {title: '更早的记录', note: place ? `可能已经不在${place}了` : '可能已经搬走了'}
  : {title: '其他记录', note: '不在这段时间里'};
export const summaryLine = total => `这段时间确认过位置 · 全班 ${total} 人`;

export function placeOf(loc) {
  if (!loc) return '';
  return loc.country_code === 'CHN' ? shortName(loc.city_name) || `${shortName(loc.province_name)} · 未填城市` : loc.country_name || loc.country_code;
}

export function memberRow(member, range, {showPlace = false} = {}) {
  const loc = member.location;
  const fresh = loc && inRange(loc.confirmed_at, range);
  const tag = !loc ? '还没填位置' : !loc.confirmed_at ? '还没确认过' : fresh ? `${loc.confirmed_at.slice(0, 4)}.${loc.confirmed_at.slice(5, 7)} 确认` : `${loc.confirmed_at.slice(0, 4)} 年的信息`;
  const line = [showPlace ? placeOf(loc) : '', loc?.label].filter(Boolean).join(' · ');  // empty stays empty
  const note = member.bio || loc?.note;  // the personal note follows the person; old stays may still carry a note
  return `<button type="button" class="mem${fresh ? '' : ' old'}" data-member="${member.id}">` +
    `<span class="av" style="background:${TONES[member.id % TONES.length]}" aria-hidden="true">${escapeHTML(member.name.slice(0, 1))}</span>` +
    `<span class="tx"><b>${escapeHTML(member.name)}</b><span class="tag">${tag}</span>${line ? `<span class="s">${escapeHTML(line)}</span>` : ''}` +
    `${note ? `<span class="bio">${escapeHTML(note)}</span>` : ''}</span>${CHEVRON}</button>`;
}

// Pinyin initials without a dictionary: the zh collator sorts hanzi by pinyin, so each
// character falls between the first characters of two initial letters (no I, U, V).
const LETTERS = 'abcdefghjklmnopqrstwxyz';
const BOUNDS = '阿八嚓哒妸发旮哈讥咔垃妈拏噢妑七呥仨他屲夕丫帀';
const collator = new Intl.Collator('zh-Hans-CN');
export function initials(text) {
  return [...String(text || '')].map(char => {
    if (!/[\u4e00-\u9fff]/.test(char)) return char.toLowerCase();
    let letter = '';
    for (let i = 0; i < BOUNDS.length && collator.compare(char, BOUNDS[i]) >= 0; i++) letter = LETTERS[i];
    return letter;
  }).join('');
}

// A query matches text directly ("晓", "深圳") or by pinyin initials ("lx", "sz").
export function textMatches(text, query) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const value = String(text || '');
  return value.toLowerCase().includes(q) || /^[a-z]+$/.test(q) && initials(value).includes(q);
}

// Search over what a classmate would type: name, place, label, note, bio.
export function matches(member, query) {
  const loc = member.location || {};
  return [member.name, member.bio, loc.city_name, loc.province_name, loc.country_name, loc.label, loc.note].some(text => textMatches(text, query));
}

export const section = (title, count, note = '') => `<div class="sec"><span>${title} · ${count}</span>${note ? `<small>${note}</small>` : ''}</div>`;

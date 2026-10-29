export const municipalities = new Set(['110000', '120000', '310000', '500000', '810000', '820000']);
export const chinaCountry = code => ['CHN', 'CN', 'TWN', 'HKG', 'MAC', 'TW', 'HK', 'MO'].includes(code) ? 'CHN' : code;
export const provinceKey = props => String(props.adcode_pro || props.adcode || '').slice(0, 2) + '0000';
export const cityKey = (code, province) => municipalities.has(province) ? province : String(code || '');
export const regionKey = (location, level) => level === 'world' ? location.country_code : level === 'china' ? location.province_code : location.city_code || 'unknown-city';
export function inScope(location, state) {
  if (!location) return state.unknown || (state.level === 'world' && !state.selected);
  if (state.unknown) return false;
  if (state.level !== 'world' && location.country_code !== 'CHN') return false;
  if (state.level === 'province' && location.province_code !== state.province) return false;
  return !state.selected || regionKey(location, state.level) === state.selected;
}
export function scopeMembers(members, state) {
  const search = (state.search || '').trim().toLocaleLowerCase();
  return members.filter(member => inScope(member.location, state) && (!search ||
    [member.name, member.bio, member.location?.city_name, member.location?.province_name, member.location?.country_name, member.location?.label]
      .some(text => String(text || '').toLocaleLowerCase().includes(search))));
}
export function regionCounts(members, state) {
  const counts = new Map();
  for (const member of members) {
    if (!member.location || !inScope(member.location, {...state, selected: '', unknown: false})) continue;
    const key = regionKey(member.location, state.level);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}
export const dayNumber = date => Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
export const dayString = day => new Date(day * 86400000).toISOString().slice(0, 10);
export const placeName = loc => loc ? [loc.country_code === 'CHN' ? loc.province_name : loc.country_name,
  loc.city_name !== loc.province_name ? loc.city_name : '', loc.label].filter(Boolean).join(' · ') : '还没有填写位置';

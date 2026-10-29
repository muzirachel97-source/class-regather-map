import {cityKey, createMemberOrder, dayNumber, dayString, municipalities, placeName, regionCounts, scopeMembers} from './logic.js';
import {ClassMap, createFootprintMap, districtChildren, loadMap} from './map.js';
import {buildEntryLink, readEntryLink} from './links.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const options = (items, selected = '') => Object.entries(items).map(([value, name]) => `<option value="${escape(value)}" ${value === selected ? 'selected' : ''}>${escape(name)}</option>`).join('');
const state = {level: 'china', province: '', selected: '', selectedName: '', unknown: false, search: '', members: [], at: '', boot: null};
let map, modalMap, snapshotRequest = 0, toastTimer, modalGeneration = 0;
const apiRoot = new URL('api/', location.href);
const orderMembers = createMemberOrder();
const entryLink = readEntryLink(location.href);
const entry = entryLink.values;
if (entryLink.consumed) history.replaceState(history.state, '', entryLink.cleanUrl);
let pendingClaim = !!entry.claim_code;
$('#unlock-form [name="password"]').value = entry.view_code;

async function api(path, method = 'GET', data) {
  const token = document.cookie.split('; ').find(item => item.startsWith('csrftoken='))?.split('=').slice(1).join('=') || '';
  const response = await fetch(new URL(path, apiRoot), {method, credentials: 'same-origin', cache: 'no-store',
    headers: {'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(token)},
    ...(data === undefined ? {} : {body: JSON.stringify(data)})});
  let result;
  try {result = await response.json();} catch {throw new Error('服务暂时不可用，请稍后重试。');}
  if (!response.ok) throw new Error(result.error || '请求失败，请刷新重试。');
  return result;
}
function notify(message, error = false) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.toggle('error', error); $('#toast').hidden = false;
  toastTimer = setTimeout(() => {$('#toast').hidden = true;}, error ? 8000 : 4500);
}
function run(task) {Promise.resolve().then(task).catch(error => notify(error.message, true));}
function closeModal() {$('#modal').close(); modalMap?.destroy(); modalMap = null; modalGeneration++;}
function openModal(title, html, wide = false) {
  modalMap?.destroy(); modalMap = null; modalGeneration++;
  $('#modal-title').textContent = title; $('#modal-body').innerHTML = html;
  $('#modal').classList.toggle('wide', wide);
  if (!$('#modal').open) $('#modal').showModal();
}
function bindForm(selector, handler) {
  $(selector).addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget;
    const buttons = [...form.querySelectorAll('button[type="submit"]')]; buttons.forEach(button => button.disabled = true);
    let error = form.querySelector('.form-error');
    if (!error) {error = document.createElement('p'); error.className = 'form-error'; error.setAttribute('role', 'alert'); form.append(error);}
    error.textContent = '';
    try {await handler(Object.fromEntries(new FormData(form)), form);} catch (err) {error.textContent = err.message;}
    finally {buttons.forEach(button => button.disabled = false);}
  });
}

async function boot() {
  state.boot = await api('bootstrap');
  const boot = state.boot;
  $('#class-title').textContent = boot.classroom.name;
  $('#class-description').textContent = boot.classroom.description || '看看大家落脚在哪座城，为下一次相聚留个坐标。';
  $('#gate').hidden = boot.unlocked; $('#workspace').hidden = !boot.unlocked;
  $('#account-nav').innerHTML = `${boot.me ? `<button id="my-profile">${escape(boot.me.name)} · 我的足迹</button><button id="my-password" class="text-button">改密码</button>` : '<button id="auth-open">认领 / 登录</button>'}
    ${boot.is_admin ? '<button id="admin-open">班级管理</button>' : `<a class="quiet-link" href="/admin/login/?next=${encodeURIComponent(location.pathname)}">管理员</a>`}
    ${boot.authenticated || boot.unlocked && boot.has_password ? '<button id="logout" class="text-button">退出</button>' : ''}`;
  $('#auth-open')?.addEventListener('click', () => authDialog('login'));
  $('#my-profile')?.addEventListener('click', () => run(() => memberDialog(boot.me.id)));
  $('#my-password')?.addEventListener('click', passwordDialog);
  $('#admin-open')?.addEventListener('click', () => run(adminDialog));
  $('#logout')?.addEventListener('click', () => run(async () => {await api('logout', 'POST', {}); location.reload();}));
  if (!boot.unlocked) {
    $('#overview').textContent = '';
    $('#entry-hint').textContent = pendingClaim ? '认领信息已填好，请先输入查看码打开地图。' : entry.view_code ? '查看码已填好，点击打开班级地图即可。' : '';
    return;
  }
  $('#unlock-form [name="password"]').value = ''; entry.view_code = '';
  if (pendingClaim && !boot.me) {pendingClaim = false; authDialog('claim');}
  $('#province-view').innerHTML = '<option value="">各省 / 市</option>' + options(boot.provinces, state.province);
  state.at ||= boot.today; $('#snapshot-date').max = boot.today; $('#snapshot-date').value = state.at;
  await refresh();
  if (!map) {
    $('#map-status').hidden = false; $('#map-status').textContent = '正在载入地图…';
    try {
      const A = await loadMap(boot.map);
      if (!map) map = new ClassMap(A, 'map', pickRegion, people => run(() => people.length === 1 ? memberDialog(people[0].id) : markerPeopleDialog(people)));
      $('#map-status').hidden = true; render();
    } catch (error) {$('#map-status').textContent = error.message;}
  }
}
async function refresh() {
  const request = ++snapshotRequest;
  const result = await api(`snapshot?at=${encodeURIComponent(state.at)}`);
  if (request !== snapshotRequest) return;
  state.members = orderMembers(result.members);
  state.timelineStart = result.timeline_start || state.boot.today;
  render();
}
function setLevel(level, province = '') {
  Object.assign(state, {level, province, selected: '', selectedName: '', unknown: false});
  $('#province-view').value = province; render();
}
function pickRegion(key, name = '') {
  state.unknown = false;
  if (state.level === 'world' && key === 'CHN') setLevel('china');
  else if (state.level === 'china' && state.boot.provinces[key]) setLevel('province', key);
  else {state.selected = key; state.selectedName = name; render();}
}
function render() {
  const located = state.members.filter(member => member.location);
  const countries = new Set(located.map(member => member.location.country_code));
  const cities = new Set(located.map(member => `${member.location.country_code}:${member.location.city_code || member.location.city_name || member.location.province_code}`));
  $('#overview').innerHTML = `<div><strong>${state.members.length}</strong><span>位同学</span></div><div><strong>${countries.size}</strong><span>个国家</span></div><div><strong>${cities.size}</strong><span>处落脚地</span></div>`;
  $('#date-label').textContent = state.at === state.boot.today ? '现在的我们' : '那时的我们';
  $('.live-dot').classList.toggle('history', state.at !== state.boot.today);
  $('#snapshot-date').value = state.at;
  document.querySelectorAll('[data-level]').forEach(button => {button.classList.toggle('active', button.dataset.level === state.level); button.setAttribute('aria-pressed', String(button.dataset.level === state.level));});
  const scopeName = state.level === 'world' ? '世界' : state.level === 'china' ? '中国' : state.boot.provinces[state.province];
  const regionName = state.selectedName || (state.level === 'world' ? state.boot.countries[state.selected] : '') || scopeName;
  $('#directory-title').textContent = state.unknown ? '还没留下坐标的同学' : `在${regionName}的同学`;
  $('#breadcrumbs').innerHTML = `<button data-nav="world">世界</button>${state.level !== 'world' ? '<span>/</span><button data-nav="china">中国</button>' : ''}${state.level === 'province' ? `<span>/</span><strong>${escape(scopeName)}</strong>` : ''}${state.selected ? `<span>/</span><strong>${escape(regionName)}</strong>` : ''}`;
  $('#breadcrumbs').querySelectorAll('button').forEach(button => button.onclick = () => setLevel(button.dataset.nav));
  const counts = regionCounts(state.members, state);
  let regions = state.level === 'china' ? Object.entries(state.boot.provinces) : [...counts.keys()].map(key => [key, state.level === 'world' ? state.boot.countries[key] : state.members.find(member => member.location?.city_code === key)?.location.city_name || '城市未填写']);
  regions.sort((a, b) => (counts.get(b[0]) || 0) - (counts.get(a[0]) || 0) || a[1].localeCompare(b[1], 'zh-CN'));
  $('#region-list').innerHTML = regions.map(([key, name]) => `<button class="region ${state.selected === key ? 'selected' : ''}" data-region="${escape(key)}" data-name="${escape(name)}"><span>${escape(name)}</span><b>${counts.get(key) || 0}</b></button>`).join('') || '<p class="empty-small">这个区域还没有位置记录。</p>';
  $('#region-list').querySelectorAll('button').forEach(button => button.onclick = () => pickRegion(button.dataset.region, button.dataset.name));
  const members = scopeMembers(state.members, state);
  $('#member-count').textContent = `${members.length} 位同学${state.at !== state.boot.today ? ' · 历史位置' : ''}`;
  $('#unknown-button').textContent = `未填位置 ${state.members.length - located.length}`;
  $('#unknown-button').classList.toggle('selected', state.unknown);
  $('#member-list').innerHTML = members.map(member => `<button class="member-card" data-member="${member.id}"><span class="avatar tone-${member.id % 4}">${escape(member.name.slice(0, 1))}</span><span class="member-info"><span class="member-name">${escape(member.name)}${state.boot.me?.id === member.id ? '<small>我</small>' : ''}</span><span class="member-place">${escape(placeName(member.location))}</span><span class="member-note">${escape(member.location?.note || member.bio || '下次见面，一起吃饭。')}</span></span><span class="chevron" aria-hidden="true">›</span></button>`).join('') || '<div class="empty"><span>⌂</span><p>这里暂时还没有同学</p><small>换个地区或日期再看看。</small></div>';
  $('#member-list').querySelectorAll('button').forEach(button => button.onclick = () => run(() => memberDialog(Number(button.dataset.member))));
  const min = dayNumber(state.timelineStart), max = dayNumber(state.boot.today);
  $('#timeline').min = Math.min(min, dayNumber(state.at)); $('#timeline').max = max; $('#timeline').value = dayNumber(state.at); $('#timeline').disabled = min === max;
  $('#timeline-caption').textContent = `${state.timelineStart} 起的班级足迹`; $('#timeline-date').textContent = state.at;
  map?.update(state, state.members);
}
function markerPeopleDialog(people) {
  openModal(`附近的 ${people.length} 位同学`, `<p class="muted">放大地图可展开附近点位。</p><div class="simple-list">${people.map(person => `<button data-id="${person.id}">${escape(person.name)} <span>查看足迹 →</span></button>`).join('')}</div>`);
  $('#modal-body').querySelectorAll('button').forEach(button => button.onclick = () => run(() => memberDialog(Number(button.dataset.id))));
}
function authDialog(mode, draft = entry, useCode = !draft.name && !!draft.student_code) {
  const claim = mode === 'claim';
  openModal(claim ? '认领我的身份' : '同学，欢迎回来', `<div class="segmented auth-tabs"><button id="tab-login" class="${claim ? '' : 'active'}">个人登录</button><button id="tab-claim" class="${claim ? 'active' : ''}">首次认领</button></div>
    <p class="muted">${claim ? '填写姓名和管理员发给你的一次性认领码，再设置自己的密码，长短、全数字都可以。' : '使用名单中的姓名和自己设置的密码登录。'}</p>
    <form id="auth-form"><label>${useCode ? '班级编号' : '姓名'}<input name="${useCode ? 'student_code' : 'name'}" value="${escape(useCode ? draft.student_code : draft.name)}" autocomplete="username" maxlength="${useCode ? 64 : 60}" required></label>${claim ? `<label>一次性认领码<input name="claim_code" value="${escape(draft.claim_code)}" autocomplete="off" maxlength="200" required></label>` : ''}
    <label>${claim ? '设置个人密码' : '个人密码'}<input name="password" type="password" autocomplete="${claim ? 'new-password' : 'current-password'}" maxlength="200" required></label>
    ${claim && !state.boot.unlocked ? '<p class="form-error">认领前请先关闭窗口，输入班级查看码。</p>' : ''}<button type="submit" class="primary" ${claim && !state.boot.unlocked ? 'disabled' : ''}>${claim ? '认领并进入' : '登录'}</button></form>
    <details><summary>同名或使用原来的班级编号</summary><p class="muted">同名同学可凭各自的认领码认领；登录时请使用管理员提供的班级编号。</p><button id="identity-toggle" class="text-button">${useCode ? '改用姓名' : '使用班级编号'}</button></details><p class="muted">忘记个人密码可联系管理员重新发放认领码。</p>`);
  const remember = () => {
    const values = Object.fromEntries(new FormData($('#auth-form')));
    const saved = {...draft, ...values}; delete saved.password;
    Object.assign(entry, {name: saved.name || '', student_code: saved.student_code || '', claim_code: saved.claim_code || ''});
    if (claim && !state.boot.unlocked) pendingClaim = !!entry.claim_code;
    return saved;
  };
  $('#auth-form').addEventListener('input', remember);
  $('#tab-login').onclick = () => authDialog('login', remember(), useCode);
  $('#tab-claim').onclick = () => authDialog('claim', remember(), useCode);
  $('#identity-toggle').onclick = () => authDialog(mode, remember(), !useCode);
  bindForm('#auth-form', async data => {
    await api(claim ? 'claim' : 'login', 'POST', data);
    entry.claim_code = ''; pendingClaim = false;
    closeModal(); await boot(); notify(claim ? '认领成功，可以更新自己的位置了。' : '已登录');
  });
}
function passwordDialog() {
  openModal('修改个人密码', `<form id="password-form"><label>原密码<input type="password" name="old_password" autocomplete="current-password" required></label><label>新密码${state.boot.is_admin ? '（至少 10 位）' : ''}<input type="password" name="password" autocomplete="new-password" ${state.boot.is_admin ? 'minlength="10"' : ''} maxlength="200" required></label><button class="primary" type="submit">保存新密码</button></form>`);
  bindForm('#password-form', async data => {await api('password', 'POST', data); closeModal(); notify('个人密码已更新，其他设备需要重新登录。');});
}
async function memberDialog(id) {
  const detail = await api(`members/${id}`), member = detail.member;
  const chronological = detail.locations;
  openModal(`${member.name}的足迹`, `<div class="profile-summary"><span class="avatar large tone-${member.id % 4}">${escape(member.name.slice(0, 1))}</span><div><h3>${escape(member.name)}</h3><p>${escape(member.bio || '下次路过，记得约一顿饭。')}</p><small>${detail.locations.length} 段足迹</small></div></div>
    ${detail.editable ? '<div class="actions"><button id="add-location" class="primary">＋ 更新位置 / 补录历史</button><button id="edit-profile">编辑资料</button></div>' : ''}
    <div id="footprint-map" class="mini-map"><p class="map-inline-status">正在加载足迹地图…</p></div><p class="muted small">编号按时间排序；连线表示足迹顺序，不代表实际行程。没有坐标的记录仍显示在下方。</p>
    <div class="footprint-list">${[...chronological].reverse().map((loc, i) => `<article class="footprint"><span class="step">${chronological.length - i}</span><div><h3>${escape(placeName(loc))}</h3><div class="stay-date">${loc.started_on} → ${loc.ended_on || '至今'}${loc.ended_on ? '（离开当天起不计入）' : ''}</div><p>${escape(loc.note)}</p><small>资料更新于 ${escape(new Date(loc.updated_at).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'}))}</small>${detail.editable ? `<div class="record-actions"><button class="text-button" data-edit="${loc.id}">编辑</button><button class="text-button danger" data-delete="${loc.id}">删除</button></div>` : ''}</div></article>`).join('') || '<p class="empty-small">还没有足迹，留下第一个坐标吧。</p>'}</div>`, true);
  const generation = modalGeneration;
  $('#add-location')?.addEventListener('click', () => locationDialog(member));
  $('#edit-profile')?.addEventListener('click', () => profileDialog(member));
  $('#modal-body').querySelectorAll('[data-edit]').forEach(button => button.onclick = () => locationDialog(member, detail.locations.find(loc => loc.id === Number(button.dataset.edit))));
  $('#modal-body').querySelectorAll('[data-delete]').forEach(button => button.onclick = () => {
    const loc = detail.locations.find(loc => loc.id === Number(button.dataset.delete));
    openModal('删除这段足迹？', `<p>${escape(placeName(loc))} · ${loc.started_on}</p><p class="muted">这段记录会从当前与历史地图中移除。其他记录的日期不会自动延长。</p><div class="actions"><button id="delete-confirm" class="danger-button">确认删除</button><button id="delete-cancel">取消</button></div>`);
    $('#delete-cancel').onclick = () => run(() => memberDialog(id));
    $('#delete-confirm').onclick = () => run(async () => {await api(`members/${id}/locations/${loc.id}`, 'DELETE', {version: loc.version}); await refresh(); await memberDialog(id); notify('足迹已删除');});
  });
  try {const A = await loadMap(state.boot.map); if (generation === modalGeneration && $('#modal').open) modalMap = createFootprintMap(A, 'footprint-map', chronological);}
  catch (error) {if (generation === modalGeneration) $('#footprint-map').textContent = error.message;}
}
function profileDialog(member) {
  openModal('编辑我的资料', `<form id="profile-form"><label>姓名 / 昵称<input name="name" maxlength="60" value="${escape(member.name)}" required></label><p class="muted">修改后请使用新的姓名登录。</p><label>一句近况<textarea name="bio" maxlength="240">${escape(member.bio)}</textarea></label><button type="submit" class="primary">保存资料</button></form>`);
  bindForm('#profile-form', async data => {await api(`members/${member.id}`, 'PATCH', {...data, version: member.updated_at}); await refresh(); await memberDialog(member.id); notify('资料已保存');});
}

function locationDialog(member, loc = {}) {
  const isEdit = !!loc.id;
  openModal(isEdit ? '编辑这段足迹' : '留一个相聚的坐标', `<form id="location-form">
    <p class="muted">可以只填写城市，也可以在地图上选一个方便见面的点；无需填写家庭住址。</p>
    <div class="form-grid"><label>国家<select name="country_code" id="country-select">${options(state.boot.countries, loc.country_code || 'CHN')}</select></label><label id="province-label">省级行政区<select name="province_code" id="province-select"><option value="">请选择省份</option>${options(state.boot.provinces, loc.province_code || '')}</select></label></div>
    <label id="city-picker-label">选择城市<select id="city-select"><option value="">先选择省份，也可在下方手工填写</option></select></label>
    <div class="form-grid"><label>城市名称<input name="city_name" id="city-name" maxlength="80" value="${escape(loc.city_name || '')}" placeholder="如：杭州市 / Tokyo"></label><label id="city-code-label">城市行政区代码<input name="city_code" id="city-code" maxlength="6" inputmode="numeric" value="${escape(loc.city_code || '')}" placeholder="如：330100"></label></div>
    <label>地点备注<input name="label" maxlength="120" value="${escape(loc.label || '')}" placeholder="如：滨江 / 市中心 / 常去的咖啡店"></label>
    <div class="form-grid"><label>到达日期<input name="started_on" type="date" max="${state.boot.today}" value="${loc.started_on || state.boot.today}" required></label><label>离开日期（当天起不计入）<input name="ended_on" type="date" value="${loc.ended_on || ''}"></label></div>
    ${!isEdit ? '<label class="checkbox"><input type="checkbox" name="close_previous" checked>将上一个未结束的常住地结束于此次到达日</label>' : ''}
    <div class="point-tools"><span>可选：在地图上点选位置</span><button type="button" id="gps-button">使用设备位置</button><button type="button" id="clear-point">仅记录城市</button></div>
    <div id="editor-map" class="mini-map"><p class="map-inline-status">正在加载选点地图…</p></div><p id="point-status" class="muted small" role="status">点选后请核对城市与行政区，位置只在保存时提交。</p>
    <details class="coordinate-details"><summary>经纬度与坐标系</summary><div class="form-grid"><label>经度<input name="longitude" id="longitude" type="number" step="0.000001" min="-180" max="180" value="${loc.longitude ?? ''}"></label><label>纬度<input name="latitude" id="latitude" type="number" step="0.000001" min="-90" max="90" value="${loc.latitude ?? ''}"></label></div><label>坐标系<select name="coordinate_system" id="coordinate-system">${options({gcj02: 'GCJ-02（高德 / 中国内地）', wgs84: 'WGS84（境外）'}, loc.coordinate_system || 'gcj02')}</select></label></details>
    <label>这段时间的近况<textarea name="note" maxlength="500" placeholder="如：在杭州工作，周末一般有空。">${escape(loc.note || '')}</textarea></label>
    <button type="submit" class="primary">保存${isEdit ? '修改' : '足迹'}</button></form>`, true);
  const generation = modalGeneration;
  let A, marker, cityRequest = 0, pointRequest = 0;
  const active = () => generation === modalGeneration && $('#modal').open;
  function clearPoint() {
    pointRequest++;
    $('#longitude').value = ''; $('#latitude').value = ''; marker?.setMap(null);
    $('#point-status').textContent = '只记录城市；如需共享位置点，请重新选点。';
  }
  const updateCountry = () => {
    const china = $('#country-select').value === 'CHN';
    ['#province-label', '#city-code-label', '#city-picker-label'].forEach(id => $(id).hidden = !china);
    $('#province-select').required = china;
    $('#coordinate-system').value = china ? 'gcj02' : 'wgs84';
  };
  async function updateCities(clear = true) {
    const request = ++cityRequest;
    const province = $('#province-select').value;
    if (clear) {$('#city-name').value = ''; $('#city-code').value = '';}
    $('#city-select').innerHTML = '<option value="">可以只记录省份，或选择城市</option>';
    if (municipalities.has(province)) {$('#city-name').value = state.boot.provinces[province]; $('#city-code').value = province; return;}
    if (!province || !A) return;
    try {
      const cities = await districtChildren(A, province);
      if (!active() || request !== cityRequest) return;
      $('#city-select').innerHTML += cities.map(city => `<option value="${escape(city.adcode)}" data-name="${escape(city.name)}">${escape(city.name)}</option>`).join('');
      if (!clear) $('#city-select').value = $('#city-code').value;
    } catch (error) {if (active()) $('#point-status').textContent = error.message;}
  }
  function setPoint(lng, lat) {
    if (!active()) return;
    const request = ++pointRequest;
    $('#longitude').value = Number(lng).toFixed(6); $('#latitude').value = Number(lat).toFixed(6);
    marker?.setMap(null); marker = new A.Marker({map: modalMap, position: [Number(lng), Number(lat)]});
    $('#point-status').textContent = '已选点，保存后才会更新班级地图。请核对下方所属城市。';
    if ($('#country-select').value === 'CHN') {
      new A.Geocoder().getAddress([Number(lng), Number(lat)], (status, result) => {
        if (!active() || request !== pointRequest || status !== 'complete' || !result.regeocode?.addressComponent) return;
        const address = result.regeocode.addressComponent;
        const province = String(address.adcode || '').slice(0, 2) + '0000';
        if (!state.boot.provinces[province]) return;
        $('#province-select').value = province;
        const adcode = String(address.adcode);
        $('#city-code').value = cityKey(adcode.slice(2, 4) === '90' ? adcode : adcode.slice(0, 4) + '00', province);
        $('#city-name').value = municipalities.has(province) ? state.boot.provinces[province] : (Array.isArray(address.city) ? address.district : address.city) || address.district;
        run(() => updateCities(false));
      });
    }
  }
  $('#country-select').onchange = () => {
    clearPoint(); updateCountry(); $('#city-name').value = ''; $('#city-code').value = '';
    $('#province-select').value = ''; run(() => updateCities());
  }; updateCountry();
  if (loc.coordinate_system) $('#coordinate-system').value = loc.coordinate_system;
  $('#province-select').onchange = () => {clearPoint(); run(() => updateCities()); if (modalMap && $('#province-select').value) modalMap.setCity($('#province-select').value);};
  $('#city-select').onchange = () => {clearPoint(); const option = $('#city-select').selectedOptions[0]; $('#city-code').value = option.value; $('#city-name').value = option.dataset.name || ''; if (option.value) modalMap?.setCity(option.value);};
  $('#clear-point').onclick = clearPoint;
  $('#gps-button').onclick = () => {
    if (!A) {notify('请先等待地图加载完成', true); return;}
    if (!navigator.geolocation) {notify('当前浏览器不支持设备定位', true); return;}
    $('#point-status').textContent = '等待设备定位授权…';
    navigator.geolocation.getCurrentPosition(position => {
      if (!active()) return;
      const point = [position.coords.longitude, position.coords.latitude];
      if ($('#country-select').value === 'CHN' && !['710000', '810000', '820000'].includes($('#province-select').value)) {
        A.convertFrom(point, 'gps', (status, result) => {
          if (!active()) return;
          if (status !== 'complete' || !result.locations?.length) {$('#point-status').textContent = '坐标转换失败，请手工在地图上选点。'; return;}
          const p = result.locations[0]; $('#coordinate-system').value = 'gcj02'; setPoint(p.lng, p.lat); modalMap.setZoomAndCenter(12, [p.lng, p.lat]);
        });
      } else {$('#coordinate-system').value = 'wgs84'; setPoint(...point); modalMap.setZoomAndCenter(12, point);}
    }, () => {if (active()) $('#point-status').textContent = '未能获取设备位置，可以直接在地图上选点。';}, {timeout: 15000, maximumAge: 0});
  };
  bindForm('#location-form', async data => {
    data.close_previous = data.close_previous === 'on';
    if (isEdit) data.version = loc.version;
    await api(`members/${member.id}/locations${isEdit ? '/' + loc.id : ''}`, isEdit ? 'PATCH' : 'POST', data);
    await refresh(); await memberDialog(member.id); notify('足迹已保存');
  });
  run(async () => {
    try {
      A = await loadMap(state.boot.map); if (!active()) return;
      $('#editor-map').replaceChildren();
      modalMap = new A.Map('editor-map', {zoom: loc.longitude != null ? 10 : 4, center: loc.longitude != null ? [Number(loc.longitude), Number(loc.latitude)] : [104, 35], resizeEnable: true});
      if (loc.longitude != null) marker = new A.Marker({map: modalMap, position: [Number(loc.longitude), Number(loc.latitude)]});
      modalMap.on('click', event => setPoint(event.lnglat.lng, event.lnglat.lat));
      await updateCities(false);
    } catch (error) {if (active()) $('#editor-map').textContent = error.message;}
  });
}

const importTemplate = 'student_code,name,bio,country_code,province_code,city_code,city_name,label,longitude,latitude,coordinate_system,started_on,ended_on,note\n001,示例同学甲,,CHN,330000,330100,杭州市,,,,gcj02,2024-07-01,,在杭州工作\n002,示例同学乙,,,,,,,,,,,,\n';
function download(name, content, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['\ufeff', content], {type}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function adminDialog() {
  const settings = await api('admin/settings');
  openModal('班级管理', `<div class="admin-tabs"><button id="import-open" class="primary">导入同学与已知位置</button><button id="template-download">下载 CSV 模板</button><button id="share-view">分享查看链接</button></div>
    <details><summary>班级名称与解锁密码</summary><form id="settings-form"><label>班级名称<input name="name" maxlength="80" required value="${escape(settings.name)}"></label><label>班级说明<input name="description" maxlength="240" value="${escape(settings.description)}"></label><label>新的班级密码<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="200" placeholder="留空则不修改"></label><label class="checkbox"><input type="checkbox" name="remove_password">取消班级解锁密码，允许任何访客查看</label><p class="muted">目前${settings.has_password ? '已设置' : '未设置'}班级密码。修改密码会使之前的访客解锁失效。</p><button type="submit">保存班级设置</button></form></details>
    <div class="list-heading"><span>身份认领 · ${state.members.length} 位同学</span></div><p class="muted">认领码有效期 7 天，仅在生成时显示。请单独发给本人；重新认领会立即撤销原登录。</p>
    <div class="admin-members">${state.members.map(member => `<div><span><strong>${escape(member.name)}</strong><small>${escape(member.student_code || '')} · ${member.claimed ? '已认领' : '待认领'}</small></span><div class="actions"><button data-edit-member="${member.id}">编辑</button><button data-invite="${member.id}" data-claimed="${member.claimed}">${member.claimed ? '重新认领' : '生成认领码'}</button></div></div>`).join('') || '<p>还没有同学，请先导入班级名单。</p>'}</div>`, true);
  $('#template-download').onclick = () => download('class-import-template.csv', importTemplate);
  $('#import-open').onclick = importDialog;
  $('#share-view').onclick = () => {
    openModal('分享班级地图', `<form id="view-link-form">${settings.has_password ? '<label>当前班级查看码<input name="view_code" type="password" maxlength="200" autocomplete="off" required></label>' : ''}<p class="muted">${settings.has_password ? '填入当前查看码，接收者打开链接后只需点击“打开班级地图”。请只发给允许查看的同学。' : '当前班级允许访客直接查看。'}</p><button type="submit" class="primary">生成查看链接</button></form><div id="view-link-result"></div>`);
    bindForm('#view-link-form', async data => {
      const link = buildEntryLink(location.href, data);
      $('#view-link-result').innerHTML = `<label>查看链接<input readonly value="${escape(link)}"></label><button id="copy-view-link">复制查看链接</button>`;
      $('#copy-view-link').onclick = () => run(async () => {await navigator.clipboard.writeText(link); notify('已复制查看链接');});
    });
  };
  bindForm('#settings-form', async data => {
    if (data.remove_password === 'on') data.password = '';
    else if (!data.password) delete data.password;
    delete data.remove_password;
    await api('admin/settings', 'PATCH', data); closeModal(); await boot(); notify('班级设置已更新');
  });
  $('#modal-body').querySelectorAll('[data-edit-member]').forEach(button => button.onclick = () => run(() => memberDialog(Number(button.dataset.editMember))));
  $('#modal-body').querySelectorAll('[data-invite]').forEach(button => button.onclick = () => {
    const id = Number(button.dataset.invite), reset = button.dataset.claimed === 'true';
    const member = state.members.find(member => member.id === id);
    openModal(reset ? '重新发放认领码' : '生成认领码', `<p>为 ${escape(member.name)}（${escape(member.student_code)}）${reset ? '重置身份认领' : '发放一次性认领码'}。</p>${reset ? '<p class="form-error">原个人密码和所有登录会话将立即失效，资料与足迹保留。</p>' : '<p class="muted">新认领码会替换此前尚未使用的认领码。</p>'}<button class="primary" id="issue-confirm">${reset ? '确认重置' : '生成'}</button>`);
    $('#issue-confirm').onclick = () => run(async () => {
      $('#issue-confirm').disabled = true;
      try {
        const invitation = await api(`admin/members/${id}/invite`, 'POST', {reset});
        const linkValues = {name: invitation.name, claim_code: invitation.claim_code};
        openModal('认领码已生成', `<p>请单独交给 ${escape(invitation.name)}，关闭后无法再次查看。</p><label>一次性认领码<input id="claim-value" readonly value="${escape(invitation.claim_code)}"></label>${settings.has_password ? '<label>同时预填查看码（可选）<input id="invite-view-code" type="password" maxlength="200" autocomplete="off" placeholder="填入当前班级查看码"></label>' : ''}<label>认领链接<input id="invite-link" readonly value="${escape(buildEntryLink(location.href, linkValues))}"></label><p class="muted">打开链接会预填姓名和认领码。有效至 ${escape(new Date(invitation.expires_at).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'}))}</p><button id="copy-invite" class="primary">复制认领链接</button><details><summary>同名同学的登录备用信息</summary><p>班级编号：${escape(invitation.student_code)}</p></details>`);
        $('#invite-view-code')?.addEventListener('input', event => {$('#invite-link').value = buildEntryLink(location.href, {...linkValues, view_code: event.target.value});});
        $('#copy-invite').onclick = () => run(async () => {await navigator.clipboard.writeText($('#invite-link').value); notify('已复制认领链接');});
      } catch (error) {$('#issue-confirm').disabled = false; throw error;}
    });
  });
}
function importDialog() {
  openModal('导入同学与已知位置', `<p class="muted">CSV（UTF-8）或 JSON 数组，最多 1000 行。同一编号对应同一同学，同一到达日期更新原足迹。请先预览；有错误时整批不导入。</p><button id="import-template">下载字段模板</button><form id="import-form"><label>选择文件<input id="import-file" type="file" accept=".csv,.json,text/csv,application/json"></label><label>或粘贴 CSV / JSON<textarea id="import-content" rows="10" spellcheck="false" placeholder="student_code,name,..." required></textarea></label><button type="submit" class="primary">检查并预览</button></form><div id="import-preview" aria-live="polite"></div>`, true);
  let payload, token;
  $('#import-template').onclick = () => download('class-import-template.csv', importTemplate);
  const invalidate = () => {token = null; $('#import-preview').textContent = '';};
  $('#import-content').oninput = invalidate;
  $('#import-file').onchange = () => run(async () => {
    const file = $('#import-file').files[0]; if (!file) return;
    if (file.size > 1_000_000) throw new Error('文件太大，请拆分到 1 MB 以内。');
    $('#import-content').value = await file.text(); invalidate();
  });
  bindForm('#import-form', async () => {
    const text = $('#import-content').value.trim();
    payload = text.startsWith('[') ? {rows: JSON.parse(text)} : {csv: text};
    const result = await api('admin/import', 'POST', payload); token = result.preview_token;
    $('#import-preview').innerHTML = `<div class="preview-box"><h3>检查通过</h3><p>新增 ${result.created} 位同学 · 更新 ${result.updated} 位同学 · 写入 ${result.locations} 段足迹</p><p class="muted">尚未保存。确认后将以本次内容更新相同编号和到达日期的记录。</p><button id="import-commit" class="primary">确认导入 ${result.rows} 行</button></div>`;
    $('#import-commit').onclick = () => run(async () => {
      if (!token) throw new Error('内容已变化，请重新预览。');
      $('#import-commit').disabled = true;
      try {await api('admin/import', 'POST', {...payload, commit: true, preview_token: token}); await refresh(); await adminDialog(); notify('导入成功');}
      catch (error) {$('#import-commit').disabled = false; throw error;}
    });
  });
}

$('#modal-close').onclick = closeModal;
$('#modal').addEventListener('cancel', () => {modalMap?.destroy(); modalMap = null; modalGeneration++;});
$('#gate-login').onclick = () => authDialog('login');
bindForm('#unlock-form', async data => {await api('unlock', 'POST', data); await boot();});
document.querySelectorAll('[data-level]').forEach(button => button.onclick = () => setLevel(button.dataset.level));
$('#province-view').onchange = () => {if ($('#province-view').value) setLevel('province', $('#province-view').value);};
$('#search').oninput = () => {state.search = $('#search').value; render();};
$('#clear-filter').onclick = () => {state.selected = ''; state.selectedName = ''; state.unknown = false; state.search = ''; $('#search').value = ''; render();};
$('#unknown-button').onclick = () => {state.unknown = !state.unknown; state.selected = ''; render();};
$('#snapshot-date').onchange = () => run(async () => {if (!$('#snapshot-date').value) return; state.at = $('#snapshot-date').value; await refresh();});
$('#today-button').onclick = () => run(async () => {state.at = state.boot.today; await refresh();});
$('#timeline').oninput = () => {$('#timeline-date').textContent = dayString(Number($('#timeline').value));};
$('#timeline').onchange = () => run(async () => {state.at = dayString(Number($('#timeline').value)); await refresh();});
$('#map-reset').onclick = () => map?.reset();
run(boot);

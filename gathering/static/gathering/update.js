import {municipalities} from './logic.js';
import {monthPicker} from './pickers.js';
import {escapeHTML, shortName, textMatches} from './views.js';

// "Update my location" flow inside the sheet (spec 5.5, 5.8): confirm-in-place first,
// otherwise move to a searched city/country. No native selects or date inputs.

const monthIndex = iso => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const monthStart = month => `${Math.floor(month / 12)}-${String(month % 12 + 1).padStart(2, '0')}-01`;

function ageText(confirmedAt, today) {
  if (!confirmedAt) return '还没确认过';
  const months = monthIndex(today) - monthIndex(confirmedAt);
  if (months < 12) return months <= 0 ? '这个月刚确认过' : `${months} 个月前确认`;
  return `${confirmedAt.slice(0, 4)} 年的信息，已经 ${Math.floor(months / 12)} 年没确认了`;
}

// Type-to-search over prefecture cities (from one DistrictSearch) or ISO countries.
export function placeSearch(input, list, {mode, divisions, countries, onPick}) {
  const candidates = () => mode() === 'china'
    ? (divisions()?.list || []).map(city => ({kind: 'china', city, label: shortName(city.name), detail: municipalities.has(city.adcode) ? '' : city.province.name}))
    : Object.entries(countries).filter(([code]) => code !== 'CHN').map(([code, name]) => ({kind: 'world', code, label: name, detail: code}));
  let shown = [];
  const draw = () => {
    const query = input.value.trim();
    shown = query ? candidates().filter(item => textMatches(item.label, query) || textMatches(item.detail, query)).slice(0, 6) : [];
    list.innerHTML = shown.map((item, i) => `<button type="button" data-place="${i}">${escapeHTML(item.label)}<span>${escapeHTML(item.detail)}</span></button>`).join('');
  };
  input.addEventListener('input', () => {onPick(null); draw();});
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-place]');
    if (!button) return;
    const item = shown[Number(button.dataset.place)];
    input.value = item.label;
    list.innerHTML = '';
    onPick(item);
  });
  return {redraw: draw};
}

let teardown = () => {};

// The fields a stay PATCH must resend (the server validates the whole stay).
const STAY_FIELDS = ['country_code', 'province_code', 'city_code', 'city_name', 'label', 'longitude', 'latitude', 'coordinate_system', 'started_on', 'ended_on', 'note'];
const stayFields = stay => Object.fromEntries(STAY_FIELDS.map(key => [key, stay[key] ?? '']));

export function renderUpdate(root, ctx) {
  teardown();
  // Everything this view hangs on window/visualViewport goes away with it.
  const lifetime = new AbortController();
  let locateToken = 0;  // bumped by any newer choice, so a late device location is ignored
  teardown = () => {lifetime.abort(); locateToken++;};
  const {me, current, today, api, notify, onDone, onNotMe} = ctx;
  const where = current ? (current.country_code === 'CHN' ? shortName(current.city_name) || shortName(current.province_name) : current.country_name) : '';
  const who = `<p class="who">正在更新：<b>${escapeHTML(me.name)}</b><button type="button" class="text-button">不是我</button></p>`;

  const fields = (label = '', bio = '') => `
      <label>在哪工作 / 上学（选填）<input id="update-label" type="text" maxlength="120" value="${escapeHTML(label)}" placeholder="比如：华为 · 坂田 / 武汉大学"></label>
      <label>个人备注（选填，大家都能看到）<input id="update-bio" type="text" maxlength="240" value="${escapeHTML(bio)}" placeholder="比如：周末有空，来了喊我"></label>`;

  // Save the personal note only when it changed; it lives on the member, so it needs the
  // member's own version.
  async function saveBio(bio) {
    if (bio === (ctx.bio || '')) return;
    const {member} = await api(`members/${me.id}`);
    await api(`members/${me.id}`, 'PATCH', {name: member.name, bio, version: member.updated_at});
  }

  function ask() {
    root.innerHTML = `${who}<div class="card"><p class="s">地图上显示你在</p><p class="big">${escapeHTML(where)}</p><p class="s">${ageText(current.confirmed_at, today)}</p></div>
      <button id="update-confirm" class="primary block" type="button">我还在${escapeHTML(where)}</button>
      <button id="update-move" class="secondary block" type="button">我搬家了</button>
      <p class="note">只有输入过班级查看码的同学能看到</p>`;
    bindWho();
    root.querySelector('#update-confirm').onclick = still;
    root.querySelector('#update-move').onclick = move;
  }

  // Still here: the city stays, but workplace and note have likely changed since 2015.
  function still() {
    root.innerHTML = `${who}<div class="card"><p class="s">还在</p><p class="big">${escapeHTML(where)}</p><p class="s">顺便看看下面两项还对不对</p></div>
      ${fields(current.label, ctx.bio)}
      <p class="field-error" role="alert"></p>
      <div class="savebar"><button id="update-still-save" class="primary block" type="button">确认还在${escapeHTML(where)}</button></div>`;
    bindWho();
    const save = root.querySelector('#update-still-save'), error = root.querySelector('.field-error');
    save.onclick = () => {
      const label = root.querySelector('#update-label').value.trim(), bio = root.querySelector('#update-bio').value.trim();
      root.querySelectorAll('input, button').forEach(control => {control.disabled = true;});
      save.textContent = '正在保存…'; error.textContent = '';
      // A changed workplace is an edit of this stay (which, by the member, also confirms it);
      // otherwise the confirm endpoint refreshes the confirmation alone.
      const location = label === (current.label || '')
        ? api(`members/${me.id}/locations/${current.id}/confirm`, 'POST', {version: current.version})
        : api(`members/${me.id}/locations/${current.id}`, 'PATCH', {...stayFields(current), label, version: current.version});
      location.then(() => saveBio(bio)).then(async () => {
        notify(`已确认还在${where}`);
        await onDone();
      }, err => {
        root.querySelectorAll('input, button').forEach(control => {control.disabled = false;});
        save.textContent = `确认还在${where}`;
        error.textContent = `没保存成功：${err.message}`;
        notify(err.message, true);
        if (/更新/.test(err.message)) ctx.onStale();  // version conflict: reload, then retry with fresh data
      });
    };
  }

  function move() {
    let mode = 'china', picked = null, movedAt = null;
    root.innerHTML = `${who}
      <div class="tog" role="group" aria-label="国内或海外"><button type="button" data-mode="china" class="on">国内 · 城市</button><button type="button" data-mode="world">海外 · 国家</button></div>
      <label>现在在哪<input id="place-input" type="text" inputmode="search" autocomplete="off" placeholder="输入城市名，比如 深圳"></label>
      <p class="hint">点选下面的结果后才能保存</p>
      <div class="sugg"></div>
      <button id="locate" class="text-button" type="button">用我现在的定位（只取到城市）</button>
      <div class="opt"><span>什么时候搬来的</span><button id="moved-at" type="button" class="text-button">选填 · 未填写</button></div>
      <p class="field-error" role="alert"></p>
      ${fields('', ctx.bio)}
      <div class="savebar"><button id="update-save" class="primary block" type="button" disabled>保存</button></div>`;
    bindWho();
    const input = root.querySelector('#place-input'), save = root.querySelector('#update-save'), error = root.querySelector('.field-error');
    const sync = () => {save.disabled = !picked; root.querySelector('.hint').hidden = !!picked;};
    const search = placeSearch(input, root.querySelector('.sugg'), {mode: () => mode, divisions: ctx.divisions, countries: ctx.countries,
      onPick: item => {if (item) locateToken++; picked = item; sync();}});
    const controls = () => root.querySelectorAll('input, [data-mode], #locate, #moved-at, #update-save');
    const setBusy = busy => {controls().forEach(control => {control.disabled = busy;}); if (!busy) sync();};
    root.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => {
      locateToken++;
      mode = button.dataset.mode; picked = null; input.value = ''; sync(); search.redraw();
      root.querySelectorAll('[data-mode]').forEach(other => other.classList.toggle('on', other === button));
      input.placeholder = mode === 'china' ? '输入城市名，比如 深圳' : '输入国家名，比如 日本';
      root.querySelector('#locate').hidden = mode !== 'china';
    });
    root.querySelector('#moved-at').onclick = event => monthPicker(event.currentTarget.closest('.opt'), {
      value: movedAt ?? monthIndex(today), min: monthIndex(today) - 12 * 15, max: monthIndex(today),
      onPick: month => {movedAt = month; event.target.textContent = `${Math.floor(month / 12)}.${String(month % 12 + 1).padStart(2, '0')}`; error.textContent = '';}});
    root.querySelector('#locate').onclick = () => {
      const token = ++locateToken;
      ctx.locate().then(city => {
      if (!city || token !== locateToken || !input.isConnected) return;
      picked = {kind: 'china', city, label: shortName(city.name)}; input.value = picked.label; sync();
      }, err => {if (token === locateToken) notify(err.message, true);});
    };

    save.onclick = () => {
      const started = movedAt === null ? today : monthStart(movedAt);
      // Same rule the server enforces (no overlap); checked here so the reason names the old city.
      if (current && started <= current.started_on) {error.textContent = `这个时间比你在${where}的开始时间还早`; return;}
      const body = picked.kind === 'china'
        ? {country_code: 'CHN', province_code: municipalities.has(picked.city.adcode) ? picked.city.adcode : picked.city.province.adcode,
          city_code: picked.city.adcode, city_name: picked.city.name}
        : {country_code: picked.code, city_name: ''};
      // Freeze what is being saved: the form is locked, and the toast names this place.
      const label = picked.label, bio = root.querySelector('#update-bio').value.trim();
      const payload = {...body, started_on: started, label: root.querySelector('#update-label').value.trim(), close_previous: true};
      setBusy(true); save.textContent = '正在保存…'; error.textContent = '';
      api(`members/${me.id}/locations`, 'POST', payload).then(() => saveBio(bio)).then(async () => {
        notify(`已更新到${label} · 最近确认：今天${ctx.todayInRange() ? '' : '（不在当前筛选的时间段里）'}`);
        await onDone();
      }, err => {
        setBusy(false); save.textContent = '保存';
        error.textContent = `没保存成功：${err.message}。内容已保留，可以再点一次保存重试。`;
      });
    };
    // With the keyboard up the sheet is short: lift the field to the top so its suggestions
    // sit between it and the save bar instead of underneath the bar.
    const lift = () => {if (input.isConnected && document.activeElement === input) input.closest('label').scrollIntoView({block: 'start'});};
    input.addEventListener('input', lift);
    input.addEventListener('focus', lift);
    for (const target of [window, window.visualViewport].filter(Boolean)) target.addEventListener('resize', () => requestAnimationFrame(lift), {signal: lifetime.signal});
    input.focus();
  }

  function bindWho() {root.querySelector('.who button').onclick = onNotMe;}

  // Disable while working, restore on failure; the input stays as typed.
  async function run(button, task, busyText, onFail) {
    const label = button.textContent;
    button.disabled = true; if (busyText) button.textContent = busyText;
    try {await task();} catch (err) {
      button.disabled = false; button.textContent = label;
      if (onFail) onFail(err); else notify(err.message, true);
    }
  }

  if (current) ask(); else move();
}

export const closeUpdate = () => teardown();

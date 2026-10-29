import {municipalities} from './logic.js';
import {monthPicker} from './pickers.js';
import {escapeHTML, shortName} from './views.js';

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
    shown = query ? candidates().filter(item => item.label.includes(query) || item.detail.includes(query)).slice(0, 6) : [];
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

export function renderUpdate(root, ctx) {
  const {me, current, today, api, notify, onDone, onNotMe} = ctx;
  const where = current ? (current.country_code === 'CHN' ? shortName(current.city_name) || shortName(current.province_name) : current.country_name) : '';
  const who = `<p class="who">正在更新：<b>${escapeHTML(me.name)}</b><button type="button" class="text-button">不是我</button></p>`;

  function ask() {
    root.innerHTML = `${who}<div class="card"><p class="s">地图上显示你在</p><p class="big">${escapeHTML(where)}</p><p class="s">${ageText(current.confirmed_at, today)}</p></div>
      <button id="update-confirm" class="primary block" type="button">我还在${escapeHTML(where)}</button>
      <button id="update-move" class="secondary block" type="button">我搬家了</button>
      <p class="note">只有输入过班级查看码的同学能看到</p>`;
    bindWho();
    root.querySelector('#update-confirm').onclick = event => run(event.currentTarget, async () => {
      await api(`members/${me.id}/locations/${current.id}/confirm`, 'POST', {version: current.version});
      notify(`已确认还在${where}`);
      await onDone();
    });
    root.querySelector('#update-move').onclick = move;
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
      <label>在做什么（选填）<input id="update-note" type="text" maxlength="500" placeholder="比如：南山 · 做游戏"></label>
      <div class="savebar"><button id="update-save" class="primary block" type="button" disabled>保存</button></div>`;
    bindWho();
    const input = root.querySelector('#place-input'), save = root.querySelector('#update-save'), error = root.querySelector('.field-error');
    const sync = () => {save.disabled = !picked; root.querySelector('.hint').hidden = !!picked;};
    const search = placeSearch(input, root.querySelector('.sugg'), {mode: () => mode, divisions: ctx.divisions, countries: ctx.countries,
      onPick: item => {picked = item; sync();}});
    root.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => {
      mode = button.dataset.mode; picked = null; input.value = ''; sync(); search.redraw();
      root.querySelectorAll('[data-mode]').forEach(other => other.classList.toggle('on', other === button));
      input.placeholder = mode === 'china' ? '输入城市名，比如 深圳' : '输入国家名，比如 日本';
      root.querySelector('#locate').hidden = mode !== 'china';
    });
    root.querySelector('#moved-at').onclick = event => monthPicker(event.currentTarget.closest('.opt'), {
      value: movedAt ?? monthIndex(today), min: monthIndex(today) - 12 * 15, max: monthIndex(today),
      onPick: month => {movedAt = month; event.target.textContent = `${Math.floor(month / 12)}.${String(month % 12 + 1).padStart(2, '0')}`; error.textContent = '';}});
    root.querySelector('#locate').onclick = () => ctx.locate().then(city => {
      if (!city) return;
      picked = {kind: 'china', city, label: shortName(city.name)}; input.value = picked.label; sync();
    }, err => notify(err.message, true));

    save.onclick = () => {
      const started = movedAt === null ? today : monthStart(movedAt);
      // Same rule the server enforces (no overlap); checked here so the reason names the old city.
      if (current && started <= current.started_on) {error.textContent = `这个时间比你在${where}的开始时间还早`; return;}
      const body = picked.kind === 'china'
        ? {country_code: 'CHN', province_code: municipalities.has(picked.city.adcode) ? picked.city.adcode : picked.city.province.adcode,
          city_code: picked.city.adcode, city_name: picked.city.name}
        : {country_code: picked.code, city_name: ''};
      run(save, async () => {
        await api(`members/${me.id}/locations`, 'POST', {...body, started_on: started, note: root.querySelector('#update-note').value.trim(), close_previous: true});
        notify(`已更新到${picked.label} · 最近确认：今天${ctx.todayInRange() ? '' : '（不在当前筛选的时间段里）'}`);
        await onDone();
      }, '正在保存…', () => {error.textContent = '没保存成功，内容已保留。可以再点一次保存重试。';});
    };
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

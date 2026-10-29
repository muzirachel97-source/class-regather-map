import {chinaCountry, cityKey, provinceKey, regionCounts, scopeMembers} from './logic.js';

let loading;
export function loadMap(config) {
  if (window.AMap?.DistrictLayer) return Promise.resolve(window.AMap);
  if (!config?.key) return Promise.reject(new Error('地图尚未配置。管理员填写高德 JS API Key 后即可显示地图；同学列表与历史记录仍可使用。'));
  if (loading) return loading;
  window._AMapSecurityConfig = config.security_js_code ? {securityJsCode: config.security_js_code} :
    {serviceHost: new URL(config.service_host, location.origin).href};
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => {loading = null; script.remove(); reject(new Error('地图加载超时，请检查网络、Key 和域名白名单。'));}, 18000);
    // v1.4.15 retains the documented district picking API for all three levels.
    script.src = `https://webapi.amap.com/maps?v=1.4.15&key=${encodeURIComponent(config.key)}&plugin=Map3D,AMap.DistrictLayer,AMap.DistrictSearch,AMap.Geocoder,AMap.ToolBar,AMap.Scale`;
    script.onload = () => {
      clearTimeout(timer);
      if (window.AMap?.DistrictLayer) resolve(window.AMap);
      else {loading = null; reject(new Error('高德地图初始化失败，请检查 Key、服务代理和 WebGL 支持。'));}
    };
    script.onerror = () => {clearTimeout(timer); loading = null; script.remove(); reject(new Error('无法连接高德地图，请稍后重试。'));};
    document.head.append(script);
  });
  return loading;
}

export class ClassMap {
  constructor(A, element, onRegion, onMember) {
    this.A = A;
    this.map = new A.Map(element, {zoom: 4, center: [104, 35], viewMode: '3D', pitch: 0,
      resizeEnable: true, showIndoorMap: false, isHotspot: false});
    this.map.addControl(new A.ToolBar({position: 'RB'}));
    this.map.addControl(new A.Scale());
    this.markers = [];
    this.onMember = onMember;
    this.map.on('click', event => {
      const props = this.layer?.getDistrictByContainerPos(event.pixel);
      if (!props || !this.state) return;
      if (this.state.level === 'world') onRegion(chinaCountry(props.SOC), props.NAME_CHN);
      else if (this.state.level === 'china') onRegion(provinceKey(props), props.NAME_CHN);
      else onRegion(cityKey(props.adcode_cit || props.adcode, this.state.province), props.NAME_CHN);
    });
  }
  update(state, members, reset = false) {
    this.state = {...state};
    const layerId = `${state.level}:${state.province}`;
    const counts = regionCounts(members, state);
    const maximum = Math.max(1, ...counts.values());
    const fill = props => {
      const key = state.level === 'world' ? chinaCountry(props.SOC) : state.level === 'china' ? provinceKey(props) : cityKey(props.adcode_cit || props.adcode, state.province);
      const count = counts.get(key) || 0;
      return count ? `rgba(30,116,88,${0.12 + 0.45 * count / maximum})` : 'rgba(247,246,240,0.08)';
    };
    if (layerId !== this.layerId) {
      if (this.layer) this.map.remove(this.layer);
      const options = {zIndex: 10, styles: {fill}};
      this.layer = state.level === 'world' ? new this.A.DistrictLayer.World(options) : state.level === 'china' ?
        new this.A.DistrictLayer.Country({...options, SOC: 'CHN', depth: 1}) :
        new this.A.DistrictLayer.Province({...options, adcode: [state.province], depth: 1});
      this.map.add(this.layer);
      this.layerId = layerId;
      reset = true;
    } else this.layer.setStyles({fill});
    // Leave the provider's boundary geometry, line styles, attribution and review number intact.
    this.map.remove(this.markers);
    this.markers = [];
    const grouped = new Map();
    for (const member of scopeMembers(members, {...state, search: ''})) {
      const loc = member.location;
      if (loc?.longitude == null || loc.latitude == null) continue;
      const key = `${loc.longitude},${loc.latitude}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(member);
    }
    for (const people of grouped.values()) {
      const loc = people[0].location;
      const content = document.createElement('button');
      content.className = 'map-marker';
      content.textContent = people.length > 1 ? String(people.length) : people[0].name.slice(0, 1);
      content.setAttribute('aria-label', people.map(p => p.name).join('、'));
      content.addEventListener('click', event => {event.stopPropagation(); this.onMember(people);});
      const marker = new this.A.Marker({position: [Number(loc.longitude), Number(loc.latitude)], content, offset: new this.A.Pixel(-17, -17), zIndex: 120});
      this.markers.push(marker);
    }
    this.map.add(this.markers);
    if (reset) this.reset();
  }
  reset() {
    if (this.state.level === 'world') this.map.setZoomAndCenter(2, [105, 28]);
    else if (this.state.level === 'china') this.map.setZoomAndCenter(4, [104, 35]);
    else this.map.setCity(this.state.province);
  }
  destroy() {this.map.destroy();}
}

export function districtChildren(A, province) {
  return new Promise((resolve, reject) => {
    new A.DistrictSearch({subdistrict: 1, extensions: 'base', level: 'province'}).search(province, (status, result) => {
      if (status !== 'complete' || !result.districtList?.length) reject(new Error('城市列表暂不可用，可手工填写城市名和行政区代码。'));
      else resolve(result.districtList[0].districtList || []);
    });
  });
}

export function createFootprintMap(A, element, locations) {
  document.getElementById(element).replaceChildren();
  const map = new A.Map(element, {center: [104, 35], zoom: 3, resizeEnable: true});
  const points = [];
  locations.forEach((loc, index) => {
    if (loc.longitude == null || loc.latitude == null) return;
    const content = document.createElement('span');
    content.className = 'map-marker'; content.textContent = String(index + 1);
    const marker = new A.Marker({position: [Number(loc.longitude), Number(loc.latitude)], content, offset: new A.Pixel(-17, -17)});
    points.push(marker); map.add(marker);
    const previous = locations[index - 1];
    if (previous?.longitude != null && Math.abs(Number(previous.longitude) - Number(loc.longitude)) < 180) {
      map.add(new A.Polyline({path: [[Number(previous.longitude), Number(previous.latitude)], [Number(loc.longitude), Number(loc.latitude)]], strokeColor: '#277661', strokeWeight: 2, strokeStyle: 'dashed'}));
    }
  });
  if (points.length) map.setFitView(points, false, [45, 45, 45, 45], 10);
  return map;
}

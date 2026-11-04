/* FreeParkingBA. Všetky dáta sa načítajú zo súborov v data/, ktoré každú noc sťahuje GitHub Action
   z oficiálneho GIS mesta, GIS Petržalky a OpenStreetMap. Nič nie je vymyslené ani simulované. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hav = (a, b) => {const R = 6371, t = Math.PI / 180, dl = (b.lat - a.lat) * t, dn = (b.lng - a.lng) * t;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x));};
const fmtKm = v => v.toFixed(1).replace('.', ',') + ' km';
const CENTER = {lat: 48.1436, lng: 17.1092};
const COL = {paas: '#cf3434', rez: '#cf3434', plan: '#d98a16', pps: '#7a4fd0', pr: '#1c9450', priv: '#5a6672'};

/* ---------- geometry ---------- */
function inRing(p, r) {let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) {const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
  if (((yi > p.lat) !== (yj > p.lat)) && (p.lng < (xj - xi) * (p.lat - yi) / (yj - yi) + xi)) ins = !ins;} return ins;}
function inGeom(p, g) {if (!g) return false; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some(pl => inRing(p, pl[0]) && !pl.slice(1).some(h => inRing(p, h)));}

/* ---------- zone helpers ---------- */
const pick = (p, keys) => {for (const k of keys) {const v = p[k]; if (v != null && String(v).trim()) return String(v).trim();} return '';};
function petrCat(p) {const n = (p.poznamka || '').toLowerCase();
  if (n.includes('záchytné')) return 'pr'; if (n.startsWith('paas') && n.includes('aktív')) return 'paas';
  if (n.includes('plánov')) return 'plan'; if (n.includes('súkromné')) return 'priv'; return 'pps';}
function petrLabel(p) {const z = (p.zona || '').trim().replace(/\s*\(spustené\)/, '');
  const k = {paas: 'PAAS aktívna', plan: 'plánovaná', pps: 'PPS', pr: 'P+R', priv: 'súkromné, nočná tarifa'}[petrCat(p)];
  return z ? `${z} · ${k}` : k;}

/* ---------- state ---------- */
const S = {filter: true, q: '', view: 'map', sel: null, pos: null, posLabel: 'Hlavné námestie', nav: null, pick: false, gpsId: null, inZone: null};
let SPOTS = [], ACTIVE = [], META = null, ZONECODES = new Map();
const spot = id => SPOTS.find(s => s.id === id);
const start = () => S.pos || CENTER;
const activeAt = p => ACTIVE.find(z => inGeom(p, z.geometry));

/* ---------- map ---------- */
const map = L.map('map', {zoomControl: true}).setView([48.152, 17.12], 12);
map.zoomControl.setPosition('topright');
const BASE = {
  map: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> prispievatelia'}),
  sat: L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom: 19, attribution: 'Snímky &copy; Esri, Maxar, Earthstar Geographics'}),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {maxZoom: 19}),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {maxZoom: 19, attribution: 'Popisy &copy; Esri'})
  ])
};
let base = 'map'; BASE.map.addTo(map);
const G = {zony: L.layerGroup(), rez: L.layerGroup(), plan: L.layerGroup(), petr: L.layerGroup(), pr: L.layerGroup(), oc: L.layerGroup(), route: L.layerGroup(), me: L.layerGroup()};
['zony', 'rez', 'plan', 'petr', 'pr', 'oc', 'route', 'me'].forEach(k => G[k].addTo(map));
const zc = () => {const z = map.getZoom(), el = $('#map'); el.classList.toggle('lbl-spots', z >= 13); el.classList.toggle('lbl-zones', z >= 13); el.classList.toggle('lbl-areas', z >= 16);};
map.on('zoomend', zc); zc();
map.on('click', e => {if (!S.pick) return; S.pick = false; $('#pick').setAttribute('aria-pressed', 'false'); setPos({lat: e.latlng.lat, lng: e.latlng.lng}, 'zvolená poloha');});

function srcLink(k) {const r = SOURCES[k]; return r ? `<a href="${r.u}" target="_blank" rel="noopener">${esc(r.t)}</a>` : esc(k);}
function addPoly(group, feature, style, label, labelClass, popup) {
  const lyr = L.geoJSON(feature, {style});
  if (label) lyr.bindTooltip(esc(label), {permanent: true, direction: 'center', className: 'lbl ' + labelClass});
  if (popup) lyr.bindPopup(popup);
  lyr.addTo(group); return lyr;
}

function drawZones(d) {
  // 1. City PAAS zones (large containers)
  (d.zony?.features || []).forEach(f => {const code = pick(f.properties, ['zona', 'ZONA', 'nazov']);
    ZONECODES.set(code, (ZONECODES.get(code) || 0) + 1);
    ACTIVE.push({geometry: f.geometry, label: 'zóna ' + code, src: 'zony'});
    addPoly(G.zony, f, {color: COL.paas, weight: 3, fillColor: COL.paas, fillOpacity: .12}, code, 'zone-code',
      `<b>Zóna PAAS ${esc(code)}</b><div>Regulované parkovanie. Návštevník platí parkovné cez PAAS.</div><div class="pop-src">Zdroj: ${srcLink('zony')}</div>`);});
  // 2. Resident parking areas (detail inside zones)
  (d.rezidentske?.features || []).forEach(f => {const p = f.properties; const code = pick(p, ['zona', 'ZONA']); const pm = p.pocetPM;
    addPoly(G.rez, f, {color: COL.rez, weight: 1, fillColor: COL.rez, fillOpacity: .28}, `${code}${pm ? ' · ' + pm + ' PM' : ''}`, 'area',
      `<b>Rezidentský úsek ${esc(code)}</b>${pm ? `<div>Počet parkovacích miest: <b>${esc(pm)}</b></div>` : ''}<div class="pop-src">Zdroj: ${srcLink('rezidentske')}</div>`);});
  // 3. City zone plan (upcoming)
  (d.plan_zon?.features || []).forEach(f => {const p = f.properties; const code = pick(p, ['zona', 'ZONA', 'nazov', 'NAZOV', 'Name', 'name', 'popis', 'Popis']);
    addPoly(G.plan, f, {color: COL.plan, weight: 2, dashArray: '6 5', fillColor: COL.plan, fillOpacity: .1}, code ? code + ' · plán' : 'plán', 'zone-code plan',
      `<b>Plánovaná zóna ${esc(code)}</b><div>${Object.entries(p).filter(([k, v]) => v != null && !/^(OBJECTID|GlobalID|Shape|_layer|FID)/i.test(k)).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</div><div class="pop-src">Zdroj: ${srcLink('plan_zon')}</div>`);});
  // 4. Petržalka detailed layer
  (d.petrzalka?.features || []).forEach(f => {const p = f.properties; const c = petrCat(p); const lbl = petrLabel(p);
    const g = c === 'plan' ? G.plan : c === 'pr' ? G.pr : G.petr;
    if (c === 'paas') ACTIVE.push({geometry: f.geometry, label: lbl, src: 'petrzalka'});
    addPoly(g, f, {color: COL[c], weight: 2, dashArray: c === 'plan' ? '6 5' : null, fillColor: COL[c], fillOpacity: c === 'paas' ? .25 : .15}, lbl, 'area',
      `<b>${esc(lbl)}</b><div>${esc(p.poznamka || '')}</div><div class="pop-src">Zdroj: ${srcLink('petrzalka')}</div>`);});
}

function buildSpots(d) {const seen = new Set();
  (d.miesta?.features || []).forEach(f => {const p = f.properties; const [lng, lat] = f.geometry.coordinates;
    if (p.kind === 'oc' && !p.name) return;
    const name = p.name || 'P+R (bez názvu v OSM)'; const key = p.kind + name.toLowerCase();
    if (p.name && seen.has(key)) return; seen.add(key);
    const s = {id: p.osm.replace('/', '_'), kind: p.kind, name, lat, lng, tags: p, osm: 'https://www.openstreetmap.org/' + p.osm};
    s.fact = FACTS.find(x => x.kind === s.kind && x.k.test(name)) || null; SPOTS.push(s);});
  SPOTS.forEach(s => {s.inZone = activeAt(s) || null;});
}
function drawSpots() {G.pr.eachLayer(l => {if (l._spot) G.pr.removeLayer(l);}); G.oc.clearLayers();
  SPOTS.forEach(s => {if (S.filter && s.inZone && !S.q) return;
    const icon = L.divIcon({className: '', html: `<div class="mk ${s.kind}${s.inZone ? ' inzone' : ''}${S.sel === s.id ? ' sel' : ''}">${s.kind === 'pr' ? 'P+R' : 'OC'}</div>`, iconSize: [30, 30], iconAnchor: [15, 15]});
    const m = L.marker([s.lat, s.lng], {icon, title: s.name}).bindTooltip(esc(s.name), {permanent: true, direction: 'right', offset: [16, 0], className: 'lbl sp'}).on('click', () => openDetail(s.id));
    m._spot = true; m.addTo(s.kind === 'pr' ? G.pr : G.oc);});
}
let meMarker = null;
function drawMe() {if (!S.pos) return; if (!meMarker) {meMarker = L.marker([S.pos.lat, S.pos.lng], {icon: L.divIcon({className: '', html: '<div class="car"></div>', iconSize: [22, 22], iconAnchor: [11, 11]}), interactive: false, zIndexOffset: 1000})
  .bindTooltip('Vaša poloha', {permanent: true, direction: 'bottom', offset: [0, 10], className: 'lbl me'}).addTo(G.me);} else meMarker.setLatLng([S.pos.lat, S.pos.lng]);}

/* ---------- routing ---------- */
async function route(a, b) {const u = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const j = await (await fetch(u)).json(); const r = j.routes[0]; return {coords: r.geometry.coordinates.map(([x, y]) => [y, x]), km: r.distance / 1000, min: Math.round(r.duration / 60)};}

/* ---------- panel ---------- */
function visible() {let l = SPOTS.filter(s => !S.filter || !s.inZone);
  if (S.q) {const q = S.q.toLowerCase(); l = SPOTS.filter(s => s.name.toLowerCase().includes(q));}
  const p = start(); return l.sort((a, b) => hav(p, a) - hav(p, b));}
function cap(s) {if (s.fact?.cap) return `${s.fact.cap} miest`; if (s.tags.capacity) return `${s.tags.capacity} miest (OSM)`; return '';}
function card(s) {const p = start(); return `<button class="card ${s.kind}${s.inZone ? ' inzone' : ''}" data-open="${s.id}"><i class="bar"></i><div class="in">
  <div class="t"><div class="nm">${esc(s.name)}</div><span class="tag ${s.kind}">${s.kind === 'pr' ? 'P+R' : 'OC'}</span></div>
  <div class="meta"><span><b>${fmtKm(hav(p, s))}</b> vzdušnou čiarou</span>${cap(s) ? `<span>${cap(s)}</span>` : ''}${s.fact?.lines ? `<span>MHD ${esc(s.fact.lines)}</span>` : ''}</div>
  ${s.inZone ? `<span class="tag paas" style="justify-self:start">V zóne PAAS</span>` : ''}${s.fact?.free ? `<p style="font-size:13px">${esc(s.fact.free)}</p>` : ''}</div></button>`;}
function zoneHits() {if (!S.q) return ''; const q = S.q.toUpperCase(); const hits = [...ZONECODES.keys()].filter(c => c && c.toUpperCase().includes(q));
  return hits.length ? `<div class="box"><h3>Zóny PAAS</h3><div class="chips">${hits.map(c => `<button class="chip" data-zone="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>` : '';}
function viewMap() {const all = visible(); const shown = S.q ? all.slice(0, 30) : all.slice(0, 8);
  return `<div style="display:grid;gap:4px"><h3>Vzdialenosť od: ${esc(S.posLabel)}</h3><h2>${S.q ? 'Výsledky hľadania' : S.filter ? 'Najbližšie miesta mimo PAAS' : 'Najbližšie miesta'}</h2></div>
  ${zoneHits()}<div class="list">${shown.map(card).join('') || '<p class="muted">Nič sa nenašlo.</p>'}</div>
  <p class="note">${SPOTS.filter(s => s.kind === 'pr').length} P+R a ${SPOTS.filter(s => s.kind === 'oc').length} nákupných centier z OpenStreetMap, ${[...ZONECODES.keys()].length} zón PAAS z GIS mesta.${META ? ' Dáta aktualizované ' + new Date(META.updated).toLocaleString('sk-SK') + '.' : ''}</p>`;}
function viewDetail() {const s = spot(S.sel); const f = s.fact, t = s.tags; const rows = [];
  if (f?.cap) rows.push(['Kapacita', `${f.cap} miest`, f.src]); else if (t.capacity) rows.push(['Kapacita', `${t.capacity} miest`, 'osm']);
  if (f?.free) rows.push(['Parkovanie', f.free, f.src]);
  if (t.fee) rows.push(['Poplatok', {no: 'nie', yes: 'áno'}[t.fee] || t.fee, 'osm']);
  if (t.maxstay) rows.push(['Max. doba', t.maxstay, 'osm']);
  if (t.opening_hours) rows.push(['Otvorené', t.opening_hours, 'osm']);
  if (t.operator) rows.push(['Prevádzkovateľ', t.operator, 'osm']);
  if (t['addr:street']) rows.push(['Adresa', `${t['addr:street']} ${t['addr:housenumber'] || ''}`.trim(), 'osm']);
  if (f?.lines) rows.push(['MHD linky', f.lines, f.src]); if (f?.ride) rows.push(['MHD do centra', f.ride, f.src]);
  return `<button class="back" id="back">← Späť</button>
  <div style="display:grid;gap:6px"><span class="tag ${s.kind}" style="justify-self:start">${s.kind === 'pr' ? 'P+R' : 'Nákupné centrum'}</span><h2>${esc(s.name)}</h2>
  <p class="muted">${fmtKm(hav(start(), s))} vzdušnou čiarou od: ${esc(S.posLabel)}</p></div>
  ${s.inZone ? `<div class="box warn"><h3 style="color:var(--paas)">Leží v zóne PAAS</h3><p>${esc(s.inZone.label)}. Parkovanie mimo vyhradených plôch môže byť spoplatnené.</p></div>` : ''}
  ${rows.length ? `<div class="box"><h3>Údaje</h3><dl class="kv">${rows.map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl></div>` : `<div class="box"><p>K tomuto miestu nie sú overené podmienky parkovania.</p></div>`}
  <p class="src">Zdroje: ${[...new Set(['osm', ...rows.map(r => r[2])])].map(srcLink).join(' · ')}</p>
  ${f?.lines ? `<div class="box"><h3>Odchody MHD</h3><p>Aktuálne odchody na <a class="linkbtn" href="https://imhd.sk/ba" target="_blank" rel="noopener">imhd.sk</a> · lístok cez <a class="linkbtn" href="https://www.idsbk.sk" target="_blank" rel="noopener">IDS BK</a></p></div>` : ''}
  <button class="cta" data-nav="${s.id}">Navigovať sem</button>
  <a class="linkbtn" href="${s.osm}" target="_blank" rel="noopener">Objekt v OpenStreetMap</a>`;}
function viewNav() {if (!S.nav) return `<h2>Navigácia</h2><p class="muted">Vyberte miesto a stlačte Navigovať sem. Štart: ${esc(S.posLabel)}. Zmeníte ho tlačidlom Moja poloha (GPS) alebo Zvoliť polohu na mape.</p>`;
  const s = spot(S.nav.to); return `<span class="tag ${s.kind}" style="justify-self:start">${S.nav.loading ? 'Hľadám trasu…' : 'Trasa'}</span><h2>${esc(s.name)}</h2>
  ${S.nav.err ? `<div class="box warn"><p>${esc(S.nav.err)}</p></div>` : ''}
  ${S.nav.km ? `<div class="stats"><div class="stat"><b>${fmtKm(S.nav.km)}</b><span>po cestách</span></div><div class="stat"><b>${S.nav.min} min</b><span>bez dopravy (OSRM)</span></div></div>` : ''}
  <div class="box"><h3>Upozornenie na zóny PAAS</h3><p>${S.gpsId ? 'GPS je zapnuté. Pri vstupe do zóny PAAS sa zobrazí upozornenie.' : 'Zapnite Moja poloha (GPS). Pri vstupe do zóny PAAS sa zobrazí upozornenie.'}</p></div>
  <button class="cta ghost" id="stop">Ukončiť navigáciu</button><p class="src">Trasa: ${srcLink('osrm')}</p>`;}
function viewSrc() {const m = META?.sources || {}; const row = k => {const x = m[k]; return `<p>${srcLink(k)}<br><span class="note">${x ? (x.ok ? `${x.count} objektov` : `chyba pri poslednom sťahovaní${x.count ? `, zobrazujú sa staršie dáta (${x.count})` : ''}`) : 'zatiaľ nestiahnuté'}</span></p>`;};
  return `<h2>Zdroje dát</h2>
  <div class="box"><h3>Sťahované každú noc</h3>${['zony', 'rezidentske', 'plan_zon', 'petrzalka', 'osm'].map(row).join('')}
   <p class="note">Posledná aktualizácia: ${META ? new Date(META.updated).toLocaleString('sk-SK') : 'neznáma'}</p></div>
  <div class="box"><h3>Ručne overené údaje</h3>${['paas', 'aupark', 'avion', 'autotrip', 'guide'].map(k => `<p>${srcLink(k)}</p>`).join('')}</div>
  <div class="box"><h3>Čo aplikácia nezobrazuje</h3><p>Živú obsadenosť parkovísk a živé odchody MHD. Verejný zdroj pre ne nie je, preto sa nezobrazujú. Odchody MHD nájdete na imhd.sk.</p></div>`;}
function renderPanel() {$('#panelIn').innerHTML = S.view === 'detail' ? viewDetail() : S.view === 'nav' ? viewNav() : S.view === 'src' ? viewSrc() : viewMap();
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === (S.view === 'detail' ? 'map' : S.view))));}
function render() {drawSpots(); drawMe(); renderPanel();}

/* ---------- actions ---------- */
function openDetail(id) {S.sel = id; S.view = 'detail'; const s = spot(id); map.flyTo([s.lat, s.lng], Math.max(map.getZoom(), 15), {duration: .6}); openSheet(true); render(); $('#panel').scrollTop = 0;}
async function startNav(id) {const s = spot(id); S.nav = {to: id, loading: true}; S.view = 'nav'; renderPanel();
  try {const r = await route(start(), s); if (S.nav?.to !== id) return; Object.assign(S.nav, r, {loading: false}); G.route.clearLayers();
    L.polyline(r.coords, {color: '#ffffff', weight: 11, opacity: .9}).addTo(G.route); L.polyline(r.coords, {color: '#2fa8ff', weight: 6}).addTo(G.route);
    map.fitBounds(L.latLngBounds(r.coords), {padding: [40, 40]});}
  catch (e) {Object.assign(S.nav, {loading: false, err: 'Trasovač OSRM teraz neodpovedá. Skúste to znova o chvíľu.'});} renderPanel();}
function setPos(p, label) {S.pos = p; S.posLabel = label; drawMe(); checkZone(); if (S.view === 'map') renderPanel();}
function checkZone() {const z = activeAt(S.pos);
  if (z && S.inZone !== z) {S.inZone = z; const alt = SPOTS.filter(s => s.kind === 'pr' && !s.inZone).sort((a, b) => hav(S.pos, a) - hav(S.pos, b))[0];
    try {const u = new SpeechSynthesisUtterance('Pozor. Ste v zóne PAAS.'); u.lang = 'sk-SK'; speechSynthesis.speak(u);} catch (e) {}
    modal(`<div class="big">Ste v zóne PAAS</div><p><b>${esc(z.label)}</b>. Návštevník tu musí zaplatiť parkovné, inak hrozí pokuta.</p>
     ${alt ? `<p>Najbližšie P+R mimo zóny: <b>${esc(alt.name)}</b>, ${fmtKm(hav(S.pos, alt))} vzdušnou čiarou.</p>` : ''}
     <div class="btnrow"><button class="cta ghost" data-close>Zavrieť</button>${alt ? `<button class="cta" data-navclose="${alt.id}">Navigovať na P+R</button>` : ''}</div><p class="src">Zóna: ${srcLink(z.src)}</p>`);}
  else if (!z) S.inZone = null;}
function modal(h) {$('#dialog').innerHTML = h; $('#modal').hidden = false; $('#dialog').querySelector('button')?.focus();}
function closeModal() {$('#modal').hidden = true;}
function openSheet(v) {$('#panel').classList.toggle('open', v);}
function focusZone(code) {const b = L.latLngBounds([]); G.zony.eachLayer(l => {l.eachLayer?.(x => {if (x.feature && pick(x.feature.properties, ['zona', 'ZONA', 'nazov']) === code) b.extend(x.getBounds());});}); if (b.isValid()) map.fitBounds(b, {padding: [30, 30]});}

document.addEventListener('click', e => {const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.open) {closeModal(); openDetail(t.dataset.open); return;}
  if (t.dataset.nav) {startNav(t.dataset.nav); return;}
  if (t.dataset.navclose) {closeModal(); startNav(t.dataset.navclose); return;}
  if (t.dataset.zone) {focusZone(t.dataset.zone); return;}
  if (t.dataset.tab) {S.view = t.dataset.tab; if (S.view === 'map') S.sel = null; openSheet(S.view === 'src'); renderPanel(); return;}
  if (t.dataset.base) {if (t.dataset.base !== base) {map.removeLayer(BASE[base]); base = t.dataset.base; BASE[base].addTo(map); BASE[base].bringToBack?.();}
    document.querySelectorAll('[data-base]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.base === base))); return;}
  if (t.hasAttribute('data-close')) {closeModal(); return;}
  switch (t.id) {
    case 'filterBtn': S.filter = !S.filter; t.setAttribute('aria-pressed', S.filter); render(); break;
    case 'back': S.view = 'map'; S.sel = null; render(); break;
    case 'stop': S.nav = null; G.route.clearLayers(); S.view = 'map'; renderPanel(); break;
    case 'handle': openSheet(!$('#panel').classList.contains('open')); break;
    case 'layersHead': {const open = t.getAttribute('aria-expanded') !== 'true'; t.setAttribute('aria-expanded', open); $('#layersBody').hidden = !open; break;}
    case 'pick': S.pick = !S.pick; t.setAttribute('aria-pressed', S.pick); break;
    case 'gps':
      if (S.gpsId != null) {navigator.geolocation.clearWatch(S.gpsId); S.gpsId = null; t.setAttribute('aria-pressed', 'false'); t.textContent = 'Moja poloha (GPS)'; break;}
      S.gpsId = navigator.geolocation.watchPosition(p => setPos({lat: p.coords.latitude, lng: p.coords.longitude}, 'moja poloha (GPS)'),
        err => {modal(`<p>Polohu sa nepodarilo získať: ${esc(err.message)}</p><button class="cta ghost" data-close>OK</button>`); navigator.geolocation.clearWatch(S.gpsId); S.gpsId = null;}, {enableHighAccuracy: true});
      t.setAttribute('aria-pressed', 'true'); t.textContent = 'GPS zapnuté'; break;
  }});
document.querySelectorAll('[data-layer]').forEach(cb => cb.addEventListener('change', () => {const g = G[cb.dataset.layer]; cb.checked ? g.addTo(map) : map.removeLayer(g);}));
$('#modal').addEventListener('click', e => {if (e.target.id === 'modal') closeModal();});
document.addEventListener('keydown', e => {if (e.key === 'Escape') closeModal();});
$('#q').addEventListener('input', e => {S.q = e.target.value.trim(); if (S.view !== 'map') {S.view = 'map'; S.sel = null;} render();});
if (matchMedia('(max-width:760px)').matches) {$('#layersHead').setAttribute('aria-expanded', 'false'); $('#layersBody').hidden = true;}

/* ---------- boot ---------- */
(async function boot() {renderPanel();
  const files = ['zony', 'rezidentske', 'plan_zon', 'petrzalka', 'miesta'];
  const res = await Promise.all(files.map(f => fetch(`data/${f}.geojson`, {cache: 'no-cache'}).then(r => r.ok ? r.json() : null).catch(() => null)));
  try {META = await (await fetch('data/meta.json', {cache: 'no-cache'})).json();} catch (e) {}
  const d = {}; files.forEach((f, i) => d[f] = res[i]);
  drawZones(d); buildSpots(d); render();
  const missing = files.filter((f, i) => !res[i]);
  $('#status').textContent = missing.length ? `Chýbajú dáta: ${missing.join(', ')}` : `${SPOTS.length} miest · ${[...ZONECODES.keys()].length} zón PAAS`;
  if (!missing.length) setTimeout(() => $('#status').hidden = true, 4000);
})();

// Adventuria Itineraries — minimal V1 (no build tools)
// Public pages read JSON from /content.

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function formatDateDDMMM(iso){
  // English DD Month
  const d = new Date(iso+"T00:00:00Z");
  const day = String(d.getUTCDate()).padStart(2,'0');
  const month = d.toLocaleString('en-GB',{month:'short', timeZone:'UTC'});
  return `${day} ${month}`;
}

function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

// ---------- Map helpers (MapLibre) ----------
function createMap(containerId, startView){
  const map = new maplibregl.Map({
    container: containerId,
    style: window.ADVENTURIA_STYLE_URL || 'https://demotiles.maplibre.org/style.json',
    center: [startView.lng, startView.lat],
    zoom: startView.zoom,
    pitch: 35,
    bearing: -10,
    antialias: true,
    attributionControl: true
  });

  map.addControl(new maplibregl.NavigationControl({visualizePitch:true}), 'top-right');

  // Globe projection if supported
  map.on('load', () => {
    try {
      if (typeof map.setProjection === 'function') {
        map.setProjection({ type: 'globe' });
      }
      if (typeof map.setFog === 'function') {
        map.setFog({
          'color': 'rgba(12,18,42,0.65)',
          'high-color': 'rgba(40,72,140,0.55)',
          'space-color': '#03040b',
          'horizon-blend': 0.25
        });
      }
    } catch(e) {
      console.warn('Globe/fog not available in this MapLibre build', e);
    }
  });

  return map;
}

function flyTo(map, lng, lat, zoom){
  map.flyTo({ center: [lng,lat], zoom, speed: 0.9, curve: 1.35, easing: t => t });
}

// Simple circular polygon (urban core)
function circlePolygon(lng, lat, km=12, steps=64){
  const coords = [];
  const R = 6371; // km
  const rad = km / R;
  const latRad = lat * Math.PI/180;
  const lngRad = lng * Math.PI/180;
  for (let i=0;i<=steps;i++){
    const theta = (i/steps) * Math.PI*2;
    const lat2 = Math.asin(Math.sin(latRad)*Math.cos(rad) + Math.cos(latRad)*Math.sin(rad)*Math.cos(theta));
    const lng2 = lngRad + Math.atan2(Math.sin(theta)*Math.sin(rad)*Math.cos(latRad), Math.cos(rad)-Math.sin(latRad)*Math.sin(lat2));
    coords.push([lng2*180/Math.PI, lat2*180/Math.PI]);
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] }
  };
}

function upsertGeoJSON(map, id, featureCollection){
  if (map.getSource(id)){
    map.getSource(id).setData(featureCollection);
  } else {
    map.addSource(id, { type: 'geojson', data: featureCollection });
  }
}

function ensureUrbanCoreLayer(map){
  if (map.getLayer('urban-core-fill')) return;
  map.addLayer({
    id: 'urban-core-fill',
    type: 'fill',
    source: 'urban-core',
    paint: {
      'fill-color': '#5ef2c2',
      'fill-opacity': 0.10
    }
  });
  map.addLayer({
    id: 'urban-core-line',
    type: 'line',
    source: 'urban-core',
    paint: {
      'line-color': '#5ef2c2',
      'line-width': 2.5,
      'line-opacity': 0.85
    }
  });
}

// Markers (HTML)
function makeCityMarker(city){
  const el = document.createElement('div');
  el.style.width = '18px';
  el.style.height = '18px';
  el.style.borderRadius = '999px';
  el.style.background = 'linear-gradient(145deg, #f6c34f, #8a5b10)';
  el.style.border = '2px solid rgba(0,0,0,.35)';
  el.style.boxShadow = '0 10px 20px rgba(0,0,0,.45)';

  const badge = document.createElement('div');
  badge.textContent = '•';
  badge.style.position = 'absolute';
  badge.style.transform = 'translate(14px,-10px)';
  badge.style.background = 'rgba(17,26,51,.85)';
  badge.style.border = '1px solid rgba(255,255,255,.15)';
  badge.style.color = '#ffdd88';
  badge.style.padding = '2px 6px';
  badge.style.borderRadius = '999px';
  badge.style.fontSize = '11px';
  badge.style.fontWeight = '900';
  badge.style.pointerEvents = 'none';
  badge.style.whiteSpace = 'nowrap';
  badge.textContent = city.name_en;
  el.style.position = 'relative';
  el.appendChild(badge);

  return el;
}

function makePlaceMarker(place){
  const el = document.createElement('div');
  el.className = 'placeMarker';
  el.style.width = '14px';
  el.style.height = '14px';
  el.style.borderRadius = '6px';
  el.style.background = 'rgba(94,242,194,.9)';
  el.style.border = '2px solid rgba(0,0,0,.35)';
  el.style.boxShadow = '0 10px 16px rgba(0,0,0,.35)';
  return el;
}

// ---------- Trip Page ----------
async function loadJSON(url){
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Failed to load ${url}`);
  return r.json();
}

function groupDaysByCity(trip){
  const map = new Map();
  for (const d of trip.days){
    if (!map.has(d.city)) map.set(d.city, []);
    map.get(d.city).push(d);
  }
  return map;
}

function badgeClass(type){
  if (type === 'flight') return 'badge flight';
  if (type === 'transfer') return 'badge transfer';
  return 'badge city';
}

function typeLabel(type){
  if (type === 'flight') return 'Flight';
  if (type === 'transfer') return 'Transfer';
  if (type === 'arrival') return 'Arrival';
  return 'Day';
}

function renderAccordion(trip, onSelectDay){
  const wrap = $('#accordion');
  wrap.innerHTML = '';

  trip.days.forEach((d, idx) => {
    const city = trip.cities.find(c => c.id === d.city) || {name_en: d.city};
    const el = document.createElement('div');
    el.className = 'card day';
    const dashed = (idx>0 && trip.days[idx-1].city !== d.city) ? '<div class="transferDash"></div>' : '';

    el.innerHTML = `
      ${dashed}
      <div class="dayTop">
        <div class="dayNum">${d.day}</div>
        <div class="dayInfo">
          <div class="line1">
            <div>
              <div class="city">${city.name_en}</div>
              <div class="date">${formatDateDDMMM(d.date)}</div>
            </div>
            <span class="${badgeClass(d.type)}">${typeLabel(d.type)}</span>
          </div>
          <div class="summary">${(d.morning||'').slice(0,110)}${(d.morning||'').length>110?'…':''}</div>
        </div>
      </div>
      <div class="dayBody">
        <div class="dayBodyInner">
          <div class="slot"><h3>Morning</h3><p>${d.morning || ''}</p></div>
          <div class="slot"><h3>Afternoon</h3><p>${d.afternoon || ''}</p></div>
          <div class="slot"><h3>Evening</h3><p>${d.evening || ''}</p></div>
        </div>
      </div>
    `;

    const top = $('.dayTop', el);
    const body = $('.dayBody', el);

    top.addEventListener('click', () => {
      const open = body.style.maxHeight && body.style.maxHeight !== '0px';
      $$('.dayBody').forEach(b => b.style.maxHeight = '0px');
      if (!open) body.style.maxHeight = body.scrollHeight + 'px';
      onSelectDay(d);
    });

    wrap.appendChild(el);
  });
}

function renderHUD(trip){
  $('#hudTrip').textContent = trip.title;
  $('#hudRange').textContent = '17 Oct → 29 Oct 2026';
}

function showCityHover(city, daysForCity){
  const stack = $('#hoverStack');
  stack.innerHTML = '';
  if (!city) return;

  const head = document.createElement('div');
  head.className = 'hoverCard';
  head.innerHTML = `<div class="t">${city.name_en} <span style="color:var(--muted); font-weight:700">${city.name_local||''}</span></div>
    <div class="s">Hover cards show each day spent here.</div>`;

  const dayRow = document.createElement('div');
  dayRow.className = 'dayRow';

  (daysForCity || []).forEach(d => {
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = `Day ${d.day} · ${formatDateDDMMM(d.date)}`;
    dayRow.appendChild(tag);
  });

  head.appendChild(dayRow);
  stack.appendChild(head);
}

async function initTripPage(){
  const trip = await loadJSON('/content/trips/china-oct-2026.json');
  renderHUD(trip);

  const map = createMap('map', trip.settings.startView);

  const daysByCity = groupDaysByCity(trip);

  // City markers
  const cityMarkers = [];
  trip.cities.forEach(city => {
    if (!Number.isFinite(city.lng) || !Number.isFinite(city.lat)) return;

    const marker = new maplibregl.Marker({ element: makeCityMarker(city), anchor: 'bottom' })
      .setLngLat([city.lng, city.lat])
      .addTo(map);

    marker.getElement().addEventListener('mouseenter', () => {
      showCityHover(city, daysByCity.get(city.id));
    });
    marker.getElement().addEventListener('mouseleave', () => {
      showCityHover(null, null);
    });
    marker.getElement().addEventListener('click', () => {
      flyTo(map, city.lng, city.lat, trip.settings.cityFocusZoom);
      // Urban core
      map.once('load', () => {});
      try {
        const core = circlePolygon(city.lng, city.lat, city.urban_core_km || trip.settings.urbanCoreKmDefault);
        upsertGeoJSON(map, 'urban-core', { type:'FeatureCollection', features:[core] });
        ensureUrbanCoreLayer(map);
      } catch(e) {
        console.warn(e);
      }
    });

    cityMarkers.push(marker);
  });

  // Place markers
  trip.places.forEach(place => {
    if (!Number.isFinite(place.lng) || !Number.isFinite(place.lat)) return;
    const m = new maplibregl.Marker({ element: makePlaceMarker(place), anchor:'bottom' })
      .setLngLat([place.lng, place.lat])
      .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(
        `<strong>${place.name_en}</strong><br/><span style="opacity:.8">${place.name_local||''}</span>`
      ))
      .addTo(map);
  });

  // Sidebar accordion
  renderAccordion(trip, (day) => {
    const city = trip.cities.find(c => c.id === day.city);
    if (city) {
      flyTo(map, city.lng, city.lat, trip.settings.cityFocusZoom);
      const core = circlePolygon(city.lng, city.lat, city.urban_core_km || trip.settings.urbanCoreKmDefault);
      upsertGeoJSON(map, 'urban-core', { type:'FeatureCollection', features:[core] });
      ensureUrbanCoreLayer(map);
    }
  });

  // Presentation mode
  const slider = $('#daySlider');
  slider.min = 0;
  slider.max = trip.days.length - 1;
  slider.value = 0;

  function applyDayIndex(i){
    i = clamp(i, 0, trip.days.length-1);
    slider.value = i;
    const d = trip.days[i];
    const city = trip.cities.find(c => c.id === d.city);
    $('#presentTitle').textContent = `Day ${d.day} — ${city?.name_en || ''}`;
    $('#presentDate').textContent = formatDateDDMMM(d.date);
    $('#presentLine').textContent = d.morning || '';

    if (city) {
      flyTo(map, city.lng, city.lat, trip.settings.cityFocusZoom);
      const core = circlePolygon(city.lng, city.lat, city.urban_core_km || trip.settings.urbanCoreKmDefault);
      upsertGeoJSON(map, 'urban-core', { type:'FeatureCollection', features:[core] });
      ensureUrbanCoreLayer(map);
    }
  }

  slider.addEventListener('input', () => applyDayIndex(Number(slider.value)));
  applyDayIndex(0);

  let playing = false;
  let timer = null;
  $('#btnPlay').addEventListener('click', () => {
    playing = !playing;
    $('#btnPlay').textContent = playing ? 'Pause' : 'Play';
    if (playing) {
      timer = setInterval(() => {
        const next = Number(slider.value) + 1;
        if (next > Number(slider.max)) {
          playing = false;
          $('#btnPlay').textContent = 'Play';
          clearInterval(timer);
          return;
        }
        applyDayIndex(next);
      }, 1800);
    } else {
      clearInterval(timer);
    }
  });

  $('#btnPresent').addEventListener('click', () => {
    document.body.classList.toggle('presentation');
  });
}

// ---------- Home Page ----------
async function initHomePage(){
  const index = await loadJSON('/content/trips.json');
  $('#siteName').textContent = index.site.name;
  $('#siteTag').textContent = index.site.tagline;
  const list = $('#tripList');
  list.innerHTML = '';

  index.trips.forEach(t => {
    const a = document.createElement('a');
    a.href = t.path;
    a.className = 'card tripItem';
    a.innerHTML = `<div class="tripTitle">${t.title}</div><div class="tripMeta">${t.date_range} · ${t.cover_city}</div>`;
    list.appendChild(a);
  });
}

// Router
(function(){
  const page = document.body.dataset.page;
  if (page === 'home') initHomePage();
  if (page === 'trip') initTripPage();
})();

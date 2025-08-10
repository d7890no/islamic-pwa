/* script.js - Enhanced functionality for PWA version
   Features:
   - Fetch prayer times from Aladhan API using geolocation
   - Show circular countdown to next prayer
   - Prayer tracker (localStorage)
   - Fetch a daily hadith (simple random from sample online JSON)
   - Cache last prayer times for offline use
*/

const prayerNames = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
const prayerStorageKey = 'prayerTracker_v1';
const cachedTimesKey = 'lastPrayerTimes_v1';

// UI elements
const nextPrayerNameEl = document.getElementById('nextPrayerName');
const nextPrayerTimeEl = document.getElementById('nextPrayerTime');
const remainingTimeEl = document.getElementById('remainingTime');
const countText = document.getElementById('countText');
const fgRing = document.querySelector('.fg-ring');
const prayerRow = document.getElementById('prayerRow');
const trackerRow = document.getElementById('trackerRow');
const hadithText = document.getElementById('hadithText');
const hadithSource = document.getElementById('hadithSource');

// state
let todayTimings = null;
let nextPrayerIndex = null;
let countdownInterval = null;

// Utilities
function fmtTime24To12(tStr){
  // input "13:21"
  const [h,m] = tStr.split(':').map(Number);
  const am = h < 12;
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2,'0')} ${am ? 'AM' : 'PM'}`;
}
function parseTimeToDate(timeStr){
  // timeStr like "13:21"
  const now = new Date();
  const [h,m] = timeStr.split(':').map(Number);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  return d;
}

// Load cached times if available
function loadCachedTimes(){
  try{
    const raw = localStorage.getItem(cachedTimesKey);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){return null}
}

// Save cached times
function saveCachedTimes(data){
  try{ localStorage.setItem(cachedTimesKey, JSON.stringify(data)); }catch(e){}
}

// Prayer tracker functions
function loadTracker(){
  const raw = localStorage.getItem(prayerStorageKey);
  if(!raw){
    const init = {date: new Date().toISOString().slice(0,10), prayers: {Fajr:false,Dhuhr:false,Asr:false,Maghrib:false,Isha:false}};
    localStorage.setItem(prayerStorageKey, JSON.stringify(init));
    return init;
  }
  const obj = JSON.parse(raw);
  // reset every day
  if(obj.date !== new Date().toISOString().slice(0,10)){
    const init = {date: new Date().toISOString().slice(0,10), prayers: {Fajr:false,Dhuhr:false,Asr:false,Maghrib:false,Isha:false}};
    localStorage.setItem(prayerStorageKey, JSON.stringify(init));
    return init;
  }
  return obj;
}
function togglePrayer(name){
  const st = loadTracker();
  st.prayers[name] = !st.prayers[name];
  localStorage.setItem(prayerStorageKey, JSON.stringify(st));
  renderTracker();
}
function renderTracker(){
  const st = loadTracker();
  trackerRow.innerHTML = '';
  prayerNames.forEach(p => {
    const pill = document.createElement('div');
    pill.className = 'pill' + (st.prayers[p] ? ' checked' : '');
    pill.textContent = p;
    pill.onclick = () => togglePrayer(p);
    trackerRow.appendChild(pill);
  });
}

// Fetch prayer times using Aladhan
async function fetchPrayerTimes(lat, lon){
  try{
    const resp = await fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=2`);
    const data = await resp.json();
    if(data.code !== 200) throw new Error('Bad response');
    const timings = data.data.timings;
    todayTimings = timings;
    saveCachedTimes({ts: Date.now(), timings});
    renderPrayerRow(timings);
    determineNextPrayer(timings);
  }catch(e){
    console.warn('Fetch prayer failed', e);
    const cached = loadCachedTimes();
    if(cached && cached.timings){
      todayTimings = cached.timings;
      renderPrayerRow(todayTimings);
      determineNextPrayer(todayTimings);
    }else{
      prayerRow.innerHTML = '<div style="padding:8px;color:var(--muted)">Cannot load prayer times.</div>';
    }
  }
}

// Render prayer small row
function renderPrayerRow(timings){
  prayerRow.innerHTML = '';
  const order = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
  order.forEach(name => {
    const t = timings[name];
    const el = document.createElement('div');
    el.className = 'pray' + (name === (nextPrayerIndexName()) ? ' active' : '');
    el.innerHTML = `<div style="font-weight:700">${name}</div><div style="font-size:12px;color:var(--muted)">${fmtTime24To12(t)}</div>`;
    prayerRow.appendChild(el);
  });
}

// Determine next prayer and start countdown
function nextPrayerIndexName(){
  return nextPrayerIndex !== null && ['Fajr','Dhuhr','Asr','Maghrib','Isha'][nextPrayerIndex];
}
function determineNextPrayer(timings){
  const now = new Date();
  const order = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
  let nextIdx = null;
  for(let i=0;i<order.length;i++){
    const t = parseTimeToDate(timings[order[i]]);
    if(t.getTime() > now.getTime()){
      nextIdx = i; break;
    }
  }
  if(nextIdx === null) nextIdx = 0; // next day -> Fajr
  nextPrayerIndex = nextIdx;
  nextPrayerNameEl.textContent = order[nextIdx];
  nextPrayerTimeEl.textContent = fmtTime24To12(timings[order[nextIdx]]);
  startCountdown(parseTimeToDate(timings[order[nextIdx]]));
  renderPrayerRow(timings);
}

// Start countdown to target date
function startCountdown(targetDate){
  if(countdownInterval) clearInterval(countdownInterval);
  const totalMs = targetDate.getTime() - Date.now();
  // set initial ring
  updateRing(targetDate);
  countdownInterval = setInterval(()=> {
    const now = new Date();
    let diff = targetDate.getTime() - now.getTime();
    if(diff <= 0){
      clearInterval(countdownInterval);
      remainingTimeEl.textContent = '00:00:00';
      countText.textContent = '00:00:00';
      // refresh prayer times after small delay
      setTimeout(()=> init(), 2000);
      return;
    }
    const hrs = Math.floor(diff/3600000); diff%=3600000;
    const mins = Math.floor(diff/60000); diff%=60000;
    const secs = Math.floor(diff/1000);
    const str = `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    remainingTimeEl.textContent = str;
    countText.textContent = str;
    updateRing(targetDate);
  }, 500);
}

// Update circular ring based on remaining vs total (assumes within same day)
function updateRing(targetDate){
  const now = new Date();
  const total = targetDate.getTime() - now.getTime();
  // find previous prayer time to compute span
  const order = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
  const idx = nextPrayerIndex;
  let prevIdx = (idx -1 + order.length)%order.length;
  let prevTime = parseTimeToDate(todayTimings[order[prevIdx]]);
  if(prevTime.getTime() > targetDate.getTime()){
    // prev is yesterday; shift back one day
    prevTime = new Date(prevTime.getTime() - 24*3600*1000);
  }
  const span = targetDate.getTime() - prevTime.getTime();
  const remaining = targetDate.getTime() - Date.now();
  const ratio = Math.max(0, Math.min(1, remaining / span));
  // circle circumference = 2*pi*r where r=52 -> ~326.7
  const circ = 2 * Math.PI * 52;
  const offset = Math.round(circ * (1 - ratio));
  fgRing.style.strokeDashoffset = offset;
}

// Fetch a small sample hadith (online placeholder JSON)
async function loadHadith(){
  try{
    // using a tiny sample raw gist or fallback to local sample
    const resp = await fetch('https://raw.githubusercontent.com/itsraveen/islamic-samples/main/hadiths.json');
    const data = await resp.json();
    const pick = data[Math.floor(Math.random()*data.length)];
    hadithText.textContent = pick.text;
    hadithSource.textContent = pick.source || '—';
  }catch(e){
    // fallback
    hadithText.textContent = "Actions are judged by intentions.";
    hadithSource.textContent = "Sahih al-Bukhari";
  }
}

// Init - request geolocation and fetch prayer times
async function init(){
  renderTracker();
  loadHadith();
  // set initial ring dasharray
  const circ = 2 * Math.PI * 52;
  const el = document.querySelector('.fg-ring');
  el.style.strokeDasharray = String(Math.round(circ));
  el.style.strokeDashoffset = String(Math.round(circ));
  // Try geolocation
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition((pos)=>{
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      document.getElementById('country').textContent = 'Malaysia'; // placeholder: could reverse geocode
      fetchPrayerTimes(lat, lon);
    }, (err)=>{
      console.warn('geoloc failed', err);
      const cached = loadCachedTimes();
      if(cached && cached.timings){
        todayTimings = cached.timings;
        renderPrayerRow(todayTimings);
        determineNextPrayer(todayTimings);
      }else{
        prayerRow.innerHTML = '<div style="padding:8px;color:var(--muted)">Location denied. Please allow location.</div>';
      }
    }, {timeout:15000});
  }else{
    prayerRow.innerHTML = '<div style="padding:8px;color:var(--muted)">Geolocation not supported.</div>';
  }
}

// Attach tool button actions (simple placeholders opening APIs)
document.addEventListener('DOMContentLoaded', ()=> {
  document.getElementById('btnQuran').onclick = ()=> window.open('https://alquran.cloud', '_blank');
  document.getElementById('btnHadith').onclick = ()=> window.open('https://sunnah.com', '_blank');
  document.getElementById('btnPrayer').onclick = ()=> window.scrollTo({top:0,behavior:'smooth'});
  document.getElementById('btnQibla').onclick = ()=> alert('Qibla feature will be added. For now use an online qibla finder.');
  document.getElementById('btnTasbih').onclick = ()=> alert('Open Tasbih (work in progress).');
  document.getElementById('btnZakat').onclick = ()=> alert('Zakat calculator coming soon.');
  document.getElementById('btnHijri').onclick = ()=> alert('Hijri date feature coming soon.');
});

// start
init();

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
let nextPrayerNameEl = document.getElementById('nextPrayerName');
let nextPrayerTimeEl = document.getElementById('nextPrayerTime');
let remainingTimeEl = document.getElementById('remainingTime');
let countText = document.getElementById('countText');
let fgRing = document.querySelector('.fg-ring');
let prayerRow = document.getElementById('prayerRow');
let trackerRow = document.getElementById('trackerRow');
let hadithText = document.getElementById('hadithText');
let hadithSource = document.getElementById('hadithSource');

// state
let todayTimings = null;
let nextPrayerIndex = null;
let countdownInterval = null;

// Date Utilities
function getHijriDateString() {
  const hijriMonths = [
    'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani",
    'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', "Sha'ban",
    'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah'
  ];

  // Simple Hijri date approximation (for demo purposes)
  function approximateHijriDate(gregorianDate) {
    const hijriEpoch = new Date('622-07-16'); // Approximate start of Hijri calendar
    const daysDiff = Math.floor((gregorianDate - hijriEpoch) / (1000 * 60 * 60 * 24));
    const hijriYear = Math.floor(daysDiff / 354.37) + 1; // Approximate lunar year
    const dayOfYear = daysDiff % 354;
    const hijriMonth = Math.floor(dayOfYear / 29.5) + 1;
    const hijriDay = Math.floor(dayOfYear % 29.5) + 1;

    return {
      year: hijriYear,
      month: Math.min(hijriMonth, 12),
      day: Math.min(hijriDay, 30)
    };
  }

  const today = new Date();
  const hijriToday = approximateHijriDate(today);
  return `${hijriToday.day} ${hijriMonths[hijriToday.month - 1]} ${hijriToday.year} AH`;
}

function getSolarDateString() { return new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }

// Utilities
function fmtTime24To12(tStr){
  // Normalize input like "13:21" or "13:21 (TZ)"
  const clean = extractHHMM(tStr);
  const [h,m] = clean.split(':').map(Number);
  const am = h < 12;
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2,'0')} ${am ? 'AM' : 'PM'}`;
}
function parseTimeToDate(timeStr){
  // Normalize input like "13:21" or "13:21 (TZ)"
  const clean = extractHHMM(timeStr);
  const now = new Date();
  const [h,m] = clean.split(':').map(Number);
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
  // Highlight current prayer based on state from determineNextPrayer
  let currentPrayerName = window.currentPrayerNameForHighlight;
  order.forEach(name => {
    const t = timings[name];
    const el = document.createElement('div');
    el.className = 'pray' + (name === currentPrayerName ? ' active' : '');
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
  const prayerTimes = {
    Fajr: parseTimeToDate(timings.Fajr),
    Sunrise: parseTimeToDate(timings.Sunrise),
    Dhuhr: parseTimeToDate(timings.Dhuhr),
    Asr: parseTimeToDate(timings.Asr),
    Maghrib: parseTimeToDate(timings.Maghrib),
    Isha: parseTimeToDate(timings.Isha),
  };
  const nextDayFajr = new Date(prayerTimes.Fajr.getTime() + 24 * 3600 * 1000);

  const nextPrayerLabelEl = document.querySelector('.next-prayer-label');
  let target, label, name, time, currentPrayerForHighlight = null;

  if (now >= prayerTimes.Fajr && now < prayerTimes.Sunrise) {
    target = prayerTimes.Sunrise;
    label = 'Fajr ends in';
    name = 'Sunrise';
    time = fmtTime24To12(timings.Sunrise);
    currentPrayerForHighlight = 'Fajr';
    nextPrayerIndex = 1; // For ring calculation, next prayer is Dhuhr
  } else if (now >= prayerTimes.Dhuhr && now < prayerTimes.Asr) {
    target = prayerTimes.Asr;
    label = 'Dhuhr ends in';
    name = 'Asr';
    time = fmtTime24To12(timings.Asr);
    currentPrayerForHighlight = 'Dhuhr';
    nextPrayerIndex = 2;
  } else if (now >= prayerTimes.Asr && now < prayerTimes.Maghrib) {
    target = prayerTimes.Maghrib;
    label = 'Asr ends in';
    name = 'Maghrib';
    time = fmtTime24To12(timings.Maghrib);
    currentPrayerForHighlight = 'Asr';
    nextPrayerIndex = 3;
  } else if (now >= prayerTimes.Maghrib && now < prayerTimes.Isha) {
    target = prayerTimes.Isha;
    label = 'Maghrib ends in';
    name = 'Isha';
    time = fmtTime24To12(timings.Isha);
    currentPrayerForHighlight = 'Maghrib';
    nextPrayerIndex = 4;
  } else if (now >= prayerTimes.Isha && now < nextDayFajr) {
    target = nextDayFajr;
    label = 'Isha ends in';
    name = 'Fajr';
    time = fmtTime24To12(timings.Fajr);
    currentPrayerForHighlight = 'Isha';
    nextPrayerIndex = 0;
  } else {
    // Between prayers, find the next one
    label = 'Next prayer';
    let nextPrayerFound = false;
    for(let i = 0; i < order.length; i++) {
        if (prayerTimes[order[i]] > now) {
            const prayerName = order[i];
            target = prayerTimes[prayerName];
            name = prayerName;
            time = fmtTime24To12(timings[prayerName]);
            nextPrayerIndex = i;
            nextPrayerFound = true;
            break;
        }
    }
    if (!nextPrayerFound) {
        target = nextDayFajr;
        name = 'Fajr';
        time = fmtTime24To12(timings.Fajr);
        nextPrayerIndex = 0;
    }
  }

  if (nextPrayerLabelEl) nextPrayerLabelEl.textContent = label;
  nextPrayerNameEl.textContent = name;
  nextPrayerTimeEl.textContent = time;

  window.currentPrayerNameForHighlight = currentPrayerForHighlight;

  startCountdown(target);
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
      setTimeout(()=> initHomePage(), 2000);
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
const arcLength = circ * (3 / 4);
const offset = Math.round(arcLength * (1 - ratio));
  fgRing.style.strokeDashoffset = offset;
}

function extractHHMM(raw){
  const match = String(raw).match(/(\d{1,2}):(\d{2})/);
  if(!match) return '00:00';
  const hh = match[1].padStart(2,'0');
  const mm = match[2];
  return `${hh}:${mm}`;
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
  const greetingEl = document.getElementById('greeting');
  const countryEl = document.getElementById('country');
  if(greetingEl) greetingEl.textContent = getHijriDateString();
  if(countryEl) countryEl.textContent = getSolarDateString();

  renderTracker();
  loadHadith();
  // set initial ring dasharray
  const circ = 2 * Math.PI * 52;
  const el = document.querySelector('.fg-ring');
  const arcLength = circ * (3 / 4); // 270° arc
  el.style.strokeDasharray = `${Math.round(arcLength)} ${Math.round(circ)}`;
  el.style.strokeDashoffset = String(Math.round(arcLength));
  // Try geolocation
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition((pos)=>{
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
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

// Navigation and page management
let currentPage = 'home';
const pages = {
  home: 'home',
  quran: 'quran',
  hadith: 'hadith',
  dua: 'dua',
  qibla: 'qibla',
  tasbih: 'tasbih',
  zakat: 'zakat',
  hijri: 'hijri'
};

// Show specific page content
function showPage(pageName) {
  currentPage = pageName;
  const main = document.querySelector('main');
  
  // Hide all existing content
  main.innerHTML = '';
  
  // Show back button for non-home pages
  const topbar = document.querySelector('.topbar');
  if (pageName === 'home') {
    topbar.innerHTML = `
      <div class="left" id="greeting"></div>
      <div class="right" id="country"></div>
    `;
    showHomePage();
  } else {
    topbar.innerHTML = `
      <div class="left">
        <button onclick="showPage('home')" style="background:none;border:none;color:var(--accent);font-size:16px;cursor:pointer;">← Back</button>
      </div>
      <div class="right">${getPageTitle(pageName)}</div>
    `;
    
    switch(pageName) {
      case 'quran': showQuranPage(); break;
      case 'hadith': showHadithPage(); break;
      case 'dua': showDuaPage(); break;
      case 'qibla': showQiblaPage(); break;
      case 'tasbih': showTasbihPage(); break;
      case 'zakat': showZakatPage(); break;
      case 'hijri': showHijriPage(); break;
    }
  }
}

function getPageTitle(pageName) {
  const titles = {
    quran: 'Al-Quran',
    hadith: 'Hadith',
    dua: 'Dua',
    qibla: 'Qibla',
    tasbih: 'Tasbih',
    zakat: 'Zakat',
    hijri: 'Hijri Calendar'
  };
  return titles[pageName] || pageName;
}

function showHomePage() {
  const main = document.querySelector('main');
  main.innerHTML = `
    <section class="hero card">
      <div class="hero-left">
        <div class="alarm-icon" title="Prayer alarm">🔔</div>
        <div class="next-prayer-label">Next Prayer</div>
        <div class="next-prayer-name" id="nextPrayerName">--</div>
        <div class="next-prayer-time" id="nextPrayerTime">--:--</div>
        <div class="remaining" id="remainingTime">--:--:--</div>
      </div>
      <div class="hero-right">
        <svg id="countdown" viewBox="0 0 120 120" class="countdown-svg">
          <circle cx="60" cy="60" r="52" class="bg-ring"></circle>
          <circle cx="60" cy="60" r="52" class="fg-ring" stroke-dasharray="327" stroke-dashoffset="0"></circle>
          <text x="60" y="62" text-anchor="middle" class="count-text" id="countText">--:--:--</text>
        </svg>
      </div>
    </section>

    <nav class="prayer-row card" id="prayerRow">
      <!-- prayer times injected here -->
    </nav>

    <section class="grid card" id="toolsGrid">
      <!-- icons -->
      <button class="tool" onclick="window.scrollTo({top:0,behavior:'smooth'})">Prayer Time</button>
      <button class="tool" onclick="showPage('quran')">Al-Quran</button>
      <button class="tool" onclick="showPage('hadith')">Hadith</button>
      <button class="tool" onclick="showPage('dua')">Dua</button>
      <button class="tool" onclick="showPage('qibla')">Qibla</button>
      <button class="tool" onclick="showPage('tasbih')">Tasbih</button>
      <button class="tool" onclick="showPage('zakat')">Zakat</button>
      <button class="tool" onclick="showPage('hijri')">Hijri</button>
      <button class="tool" onclick="showProphetStoriesPage()">Prophet Stories</button>
    </section>

    <section class="tracker card">
      <h3>Prayer Tracker</h3>
      <div class="tracker-row" id="trackerRow">
        <!-- tracker pills -->
      </div>
    </section>

    <section class="hadith card" id="hadithCard">
      <div class="quote">"</div>
      <div class="hadith-body">
        <h4>Daily Hadith</h4>
        <p id="hadithText">Loading…</p>
      </div>
      <div class="hadith-badge" id="hadithSource">—</div>
    </section>
  `;
  
  // Re-initialize home page functionality
  initHomePage();
}

async function showQuranPage() {
  try {
    const response = await fetch('./data/quran_surahs.json');
    const surahs = await response.json();
    
    const main = document.querySelector('main');
    main.innerHTML = `
      <section class="hero card">
        <div class="hero-left">
          <div class="alarm-icon" title="Quran">📖</div>
          <div class="next-prayer-label">Holy Quran</div>
          <div class="next-prayer-name">Read & Listen</div>
          <div class="next-prayer-time">114 Surahs</div>
        </div>
      </section>

      <section class="card">
        <h3>Popular Surahs</h3>
        <div class="surah-list" id="surahList">
          ${surahs.map(surah => `
            <div class="surah-item" onclick="openSurah(${surah.number})">
              <div class="surah-number">${surah.number}</div>
              <div class="surah-info">
                <div class="surah-name">${surah.name}</div>
                <div class="surah-details">${surah.english} • ${surah.verses} verses</div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="card">
        <h3>Quick Actions</h3>
        <div class="grid" style="grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <button class="tool" onclick="alert('Full Quran list coming soon')">Browse All Surahs</button>
          <button class="tool" onclick="alert('Search feature coming soon')">Search Verses</button>
          <button class="tool" onclick="alert('Bookmarks feature coming soon')">My Bookmarks</button>
          <button class="tool" onclick="alert('Audio feature coming soon')">Audio Recitation</button>
        </div>
      </section>
    `;
  } catch (error) {
    console.error('Error loading Quran data:', error);
  }
}

async function showHadithPage() {
  try {
    const response = await fetch('./data/hadiths.json');
    const hadiths = await response.json();
    
    const main = document.querySelector('main');
    main.innerHTML = `
      <section class="hero card">
        <div class="hero-left">
          <div class="alarm-icon" title="Hadith">📜</div>
          <div class="next-prayer-label">Hadith Collection</div>
          <div class="next-prayer-name">Prophetic Traditions</div>
          <div class="next-prayer-time">Authentic Sources</div>
        </div>
      </section>

      <section class="hadith card" id="dailyHadith">
        <div class="quote">"</div>
        <div class="hadith-body">
          <h4>Hadith of the Day</h4>
          <p id="currentHadithText">${hadiths[0].text}</p>
        </div>
        <div class="hadith-badge" id="currentHadithSource">${hadiths[0].source}</div>
      </section>

      <section class="card">
        <h3>Hadith Collections</h3>
        <div class="hadith-collections">
          <div class="collection-item" onclick="openCollection('bukhari')">
            <div class="collection-icon">📚</div>
            <div class="collection-info">
              <div class="collection-name">Sahih al-Bukhari</div>
              <div class="collection-details">Most authentic collection</div>
            </div>
          </div>
          <div class="collection-item" onclick="openCollection('muslim')">
            <div class="collection-icon">📖</div>
            <div class="collection-info">
              <div class="collection-name">Sahih Muslim</div>
              <div class="collection-details">Second most authentic</div>
            </div>
          </div>
          <div class="collection-item" onclick="openCollection('tirmidhi')">
            <div class="collection-icon">📝</div>
            <div class="collection-info">
              <div class="collection-name">Jami' at-Tirmidhi</div>
              <div class="collection-details">Comprehensive collection</div>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <h3>Quick Actions</h3>
        <div class="grid" style="grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <button class="tool" onclick="getRandomHadith()">Random Hadith</button>
          <button class="tool" onclick="alert('Search feature coming soon')">Search Hadith</button>
          <button class="tool" onclick="alert('Favorites feature coming soon')">My Favorites</button>
          <button class="tool" onclick="alert('Categories coming soon')">Browse Topics</button>
        </div>
      </section>
    `;
    
    // Store hadiths for random selection
    window.currentHadiths = hadiths;
  } catch (error) {
    console.error('Error loading Hadith data:', error);
  }
}

async function showDuaPage() {
  try {
    const response = await fetch('./data/duas.json');
    const duas = await response.json();
    
    const main = document.querySelector('main');
    main.innerHTML = `
      <section class="hero card">
        <div class="hero-left">
          <div class="alarm-icon" title="Dua">🤲</div>
          <div class="next-prayer-label">Islamic Supplications</div>
          <div class="next-prayer-name">Daily Duas</div>
          <div class="next-prayer-time">Connect with Allah</div>
        </div>
      </section>

      <section class="card">
        <h3>Daily Duas</h3>
        <div class="dua-list">
          ${duas.map(dua => `
            <div class="dua-item" onclick="showDua('${dua.id}')">
              <div class="dua-icon">${dua.icon}</div>
              <div class="dua-info">
                <div class="dua-name">${dua.title}</div>
                <div class="dua-details">${dua.category}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="hadith card" id="duaDisplay" style="display:none;">
        <div class="quote">"</div>
        <div class="hadith-body">
          <h4 id="duaTitle">Dua</h4>
          <p id="duaArabic" style="font-size:18px;text-align:right;line-height:1.8;margin:12px 0;"></p>
          <p id="duaTranslation" style="font-style:italic;color:var(--muted);"></p>
          <p id="duaEnglish"></p>
        </div>
      </section>

      <section class="card">
        <h3>Categories</h3>
        <div class="grid" style="grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <button class="tool" onclick="filterDuas('Protection')">Protection</button>
          <button class="tool" onclick="filterDuas('Daily')">Daily</button>
          <button class="tool" onclick="filterDuas('Travel')">Travel</button>
          <button class="tool" onclick="filterDuas('Meals')">Meals</button>
        </div>
      </section>
    `;
    
    // Store duas for filtering and display
    window.currentDuas = duas;
  } catch (error) {
    console.error('Error loading Dua data:', error);
  }
}

function showQiblaPage() {
  const main = document.querySelector('main');
  main.innerHTML = `
    <section class="hero card">
      <div class="hero-left">
        <div class="alarm-icon" title="Qibla">🧭</div>
        <div class="next-prayer-label">Qibla Finder</div>
        <div class="next-prayer-name">Direction to Kaaba</div>
        <div class="next-prayer-time" id="qiblaDirection">Calculating...</div>
      </div>
    </section>

    <section class="card">
      <h3>Compass</h3>
      <div style="text-align: center; padding: 20px;">
        <div id="compass" style="width: 200px; height: 200px; margin: 0 auto; border: 3px solid var(--accent); border-radius: 50%; position: relative; background: var(--glass);">
          <div id="needle" style="position: absolute; top: 50%; left: 50%; width: 4px; height: 80px; background: var(--accent); transform-origin: bottom center; transform: translate(-50%, -100%) rotate(0deg); border-radius: 2px;"></div>
          <div style="position: absolute; top: 10px; left: 50%; transform: translateX(-50%); color: var(--accent); font-weight: bold;">N</div>
          <div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); color: var(--muted);">S</div>
          <div style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted);">W</div>
          <div style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--muted);">E</div>
        </div>
        <p style="margin-top: 16px; color: var(--muted);">Point your device towards the direction shown</p>
      </div>
    </section>

    <section class="card">
      <h3>Location Info</h3>
      <div class="location-info">
        <div class="info-row">
          <span>Your Location:</span>
          <span id="userLocation">Getting location...</span>
        </div>
        <div class="info-row">
          <span>Distance to Kaaba:</span>
          <span id="distanceToKaaba">Calculating...</span>
        </div>
        <div class="info-row">
          <span>Qibla Bearing:</span>
          <span id="qiblaBearing">Calculating...</span>
        </div>
      </div>
    </section>
  `;
  
  initQibla();
}

function showTasbihPage() {
  const main = document.querySelector('main');
  main.innerHTML = `
    <section class="hero card">
      <div class="hero-left">
        <div class="alarm-icon" title="Tasbih">📿</div>
        <div class="next-prayer-label">Digital Counter</div>
        <div class="next-prayer-name">Dhikr & Remembrance</div>
        <div class="next-prayer-time">Count your prayers</div>
      </div>
    </section>

    <section class="card" style="text-align: center;">
      <h3 id="currentDhikr">SubhanAllah</h3>
      <div style="margin: 20px 0;">
        <div id="counter" style="font-size: 48px; font-weight: bold; color: var(--accent); margin: 20px 0;">0</div>
        <div style="color: var(--muted); margin-bottom: 20px;">
          Target: <span id="target">33</span> | Remaining: <span id="remaining">33</span>
        </div>
      </div>
      
      <button id="countButton" onclick="incrementCounter()" style="
        width: 120px; 
        height: 120px; 
        border-radius: 50%; 
        background: linear-gradient(135deg, var(--accent), var(--accent-2)); 
        border: none; 
        color: white; 
        font-size: 18px; 
        font-weight: bold; 
        cursor: pointer; 
        margin: 20px;
        box-shadow: var(--shadow);
        transition: transform 0.1s;
      " onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'">
        TAP TO COUNT
      </button>
      
      <div style="margin-top: 20px;">
        <button onclick="resetCounter()" style="background: var(--glass); border: 1px solid var(--glass-border); color: var(--white); padding: 8px 16px; border-radius: 8px; margin: 0 8px; cursor: pointer;">Reset</button>
        <button onclick="nextDhikr()" style="background: var(--glass); border: 1px solid var(--glass-border); color: var(--white); padding: 8px 16px; border-radius: 8px; margin: 0 8px; cursor: pointer;">Next Dhikr</button>
      </div>
    </section>

    <section class="card">
      <h3>Common Dhikr</h3>
      <div class="dhikr-list">
        <div class="dhikr-item" onclick="setDhikr('SubhanAllah', 33)">
          <div class="dhikr-text">
            <div class="dhikr-arabic">سُبْحَانَ اللَّهِ</div>
            <div class="dhikr-english">SubhanAllah (Glory be to Allah)</div>
          </div>
          <div class="dhikr-count">33x</div>
        </div>
        <div class="dhikr-item" onclick="setDhikr('Alhamdulillah', 33)">
          <div class="dhikr-text">
            <div class="dhikr-arabic">الْحَمْدُ لِلَّهِ</div>
            <div class="dhikr-english">Alhamdulillah (Praise be to Allah)</div>
          </div>
          <div class="dhikr-count">33x</div>
        </div>
        <div class="dhikr-item" onclick="setDhikr('Allahu Akbar', 34)">
          <div class="dhikr-text">
            <div class="dhikr-arabic">اللَّهُ أَكْبَرُ</div>
            <div class="dhikr-english">Allahu Akbar (Allah is Greatest)</div>
          </div>
          <div class="dhikr-count">34x</div>
        </div>
      </div>
    </section>
  `;
  
  initTasbih();
}

function showZakatPage() {
  const main = document.querySelector('main');
  main.innerHTML = `
    <section class="hero card">
      <div class="hero-left">
        <div class="alarm-icon" title="Zakat">💰</div>
        <div class="next-prayer-label">Zakat Calculator</div>
        <div class="next-prayer-name">Calculate Your Zakat</div>
        <div class="next-prayer-time">2.5% of wealth</div>
      </div>
    </section>

    <section class="card">
      <h3>Wealth Calculator</h3>
      <div class="zakat-form">
        <div class="form-group">
          <label>Cash & Bank Savings ($)</label>
          <input type="number" id="cash" placeholder="0" oninput="calculateZakat()">
        </div>
        <div class="form-group">
          <label>Gold Value ($)</label>
          <input type="number" id="gold" placeholder="0" oninput="calculateZakat()">
        </div>
        <div class="form-group">
          <label>Silver Value ($)</label>
          <input type="number" id="silver" placeholder="0" oninput="calculateZakat()">
        </div>
        <div class="form-group">
          <label>Investments & Stocks ($)</label>
          <input type="number" id="investments" placeholder="0" oninput="calculateZakat()">
        </div>
        <div class="form-group">
          <label>Your Debts ($)</label>
          <input type="number" id="yourDebts" placeholder="0" oninput="calculateZakat()">
        </div>
      </div>
    </section>

    <section class="card">
      <h3>Zakat Calculation</h3>
      <div class="calculation-result">
        <div class="calc-row">
          <span>Total Wealth:</span>
          <span id="totalWealth">$0</span>
        </div>
        <div class="calc-row">
          <span>Minus Debts:</span>
          <span id="minusDebts">$0</span>
        </div>
        <div class="calc-row">
          <span>Zakatable Wealth:</span>
          <span id="zakatableWealth">$0</span>
        </div>
        <div class="calc-row" style="border-top: 1px solid var(--glass-border); padding-top: 12px; margin-top: 12px;">
          <span style="font-weight: bold; color: var(--accent);">Zakat Due (2.5%):</span>
          <span id="zakatDue" style="font-weight: bold; color: var(--accent);">$0</span>
        </div>
        <div id="zakatStatus" style="margin-top: 12px; padding: 8px; border-radius: 6px; text-align: center;"></div>
      </div>
    </section>
  `;
  
  initZakat();
}

function showHijriPage() {
  const main = document.querySelector('main');
  main.innerHTML = `
    <section class="hero card">
      <div class="hero-left">
        <div class="alarm-icon" title="Hijri">🌙</div>
        <div class="next-prayer-label">Islamic Calendar</div>
        <div class="next-prayer-name" id="hijriDate">Loading...</div>
        <div class="next-prayer-time" id="gregorianDate">Loading...</div>
      </div>
    </section>

    <section class="card">
      <h3>Today's Date</h3>
      <div class="date-display">
        <div class="date-row">
          <span>Hijri Date:</span>
          <span id="fullHijriDate">Loading...</span>
        </div>
        <div class="date-row">
          <span>Gregorian Date:</span>
          <span id="fullGregorianDate">Loading...</span>
        </div>
        <div class="date-row">
          <span>Islamic Month:</span>
          <span id="islamicMonth">Loading...</span>
        </div>
      </div>
    </section>

    <section class="card">
      <h3>Important Islamic Events</h3>
      <div class="events-list">
        <div class="event-item">
          <div class="event-date">1 Muharram</div>
          <div class="event-name">Islamic New Year</div>
        </div>
        <div class="event-item">
          <div class="event-date">10 Muharram</div>
          <div class="event-name">Day of Ashura</div>
        </div>
        <div class="event-item">
          <div class="event-date">12 Rabi' al-Awwal</div>
          <div class="event-name">Mawlid an-Nabi</div>
        </div>
        <div class="event-item">
          <div class="event-date">1-30 Ramadan</div>
          <div class="event-name">Holy Month of Ramadan</div>
        </div>
        <div class="event-item">
          <div class="event-date">1 Shawwal</div>
          <div class="event-name">Eid al-Fitr</div>
        </div>
        <div class="event-item">
          <div class="event-date">10 Dhu al-Hijjah</div>
          <div class="event-name">Eid al-Adha</div>
        </div>
      </div>
    </section>
  `;
  
  initHijri();
}

// start
// init();


// Helper functions for page functionality
function initHomePage() {
  // Rebind dynamic elements after DOM rebuild
  nextPrayerNameEl = document.getElementById('nextPrayerName');
  nextPrayerTimeEl = document.getElementById('nextPrayerTime');
  remainingTimeEl = document.getElementById('remainingTime');
  countText = document.getElementById('countText');
  fgRing = document.querySelector('.fg-ring');
  prayerRow = document.getElementById('prayerRow');
  trackerRow = document.getElementById('trackerRow');
  hadithText = document.getElementById('hadithText');
  hadithSource = document.getElementById('hadithSource');

  const greetingEl = document.getElementById('greeting');
  const countryEl = document.getElementById('country');
  if(greetingEl) greetingEl.textContent = getHijriDateString();
  if(countryEl) countryEl.textContent = getSolarDateString();

  renderTracker();
  loadHadith();
  // set initial ring dasharray
  const circ = 2 * Math.PI * 52;
  const arcLength = circ * (3 / 4); // 270° arc
  const el = document.querySelector('.fg-ring');
  if (el) {
  	el.style.strokeDasharray = `${Math.round(arcLength)} ${Math.round(circ)}`;
  	el.style.strokeDashoffset = String(Math.round(arcLength));
  }
  // Try geolocation
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition((pos)=>{
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      fetchPrayerTimes(lat, lon);
    }, (err)=>{
      console.warn('geoloc failed', err);
      const cached = loadCachedTimes();
      if(cached && cached.timings){
        todayTimings = cached.timings;
        renderPrayerRow(todayTimings);
        determineNextPrayer(todayTimings);
      }else{
        const prayerRowEl = document.getElementById('prayerRow');
        if (prayerRowEl) prayerRowEl.innerHTML = '<div style="padding:8px;color:var(--muted)">Location denied. Please allow location.</div>';
      }
    }, {timeout:15000});
  }else{
    const prayerRowEl = document.getElementById('prayerRow');
    if (prayerRowEl) prayerRowEl.innerHTML = '<div style="padding:8px;color:var(--muted)">Geolocation not supported.</div>';
  }
}

function openSurah(number) {
  alert(`Opening Surah ${number}. Full Quran reader coming soon!`);
}

function openCollection(collection) {
  alert(`Opening ${collection} collection. Full hadith reader coming soon!`);
}

function getRandomHadith() {
  if (window.currentHadiths && window.currentHadiths.length > 0) {
    const randomHadith = window.currentHadiths[Math.floor(Math.random() * window.currentHadiths.length)];
    const textEl = document.getElementById('currentHadithText');
    const sourceEl = document.getElementById('currentHadithSource');
    if (textEl) textEl.textContent = randomHadith.text;
    if (sourceEl) sourceEl.textContent = randomHadith.source;
  }
}

function showDua(duaId) {
  if (window.currentDuas) {
    const dua = window.currentDuas.find(d => d.id === duaId);
    if (dua) {
      const titleEl = document.getElementById('duaTitle');
      const arabicEl = document.getElementById('duaArabic');
      const translationEl = document.getElementById('duaTranslation');
      const englishEl = document.getElementById('duaEnglish');
      const displayEl = document.getElementById('duaDisplay');
      
      if (titleEl) titleEl.textContent = dua.title;
      if (arabicEl) arabicEl.textContent = dua.arabic;
      if (translationEl) translationEl.textContent = dua.transliteration;
      if (englishEl) englishEl.textContent = dua.english;
      if (displayEl) {
        displayEl.style.display = 'block';
        displayEl.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }
}

function filterDuas(category) {
  alert(`Filtering duas by ${category} category. Feature coming soon!`);
}

// Qibla functionality
function initQibla() {
  const KAABA_LAT = 21.4225;
  const KAABA_LNG = 39.8262;

  function calculateQiblaDirection(userLat, userLng) {
    const dLng = (KAABA_LNG - userLng) * Math.PI / 180;
    const lat1 = userLat * Math.PI / 180;
    const lat2 = KAABA_LAT * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;
    
    return bearing;
  }

  function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function updateQiblaInfo(lat, lng) {
    const qiblaDirection = calculateQiblaDirection(lat, lng);
    const distance = calculateDistance(lat, lng, KAABA_LAT, KAABA_LNG);
    
    const directionEl = document.getElementById('qiblaDirection');
    const bearingEl = document.getElementById('qiblaBearing');
    const distanceEl = document.getElementById('distanceToKaaba');
    const needleEl = document.getElementById('needle');
    
    if (directionEl) directionEl.textContent = `${Math.round(qiblaDirection)}°`;
    if (bearingEl) bearingEl.textContent = `${Math.round(qiblaDirection)}°`;
    if (distanceEl) distanceEl.textContent = `${Math.round(distance)} km`;
    if (needleEl) needleEl.style.transform = `translate(-50%, -100%) rotate(${qiblaDirection}deg)`;
  }

  // Get user location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const locationEl = document.getElementById('userLocation');
        if (locationEl) locationEl.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        updateQiblaInfo(lat, lng);
      },
      (error) => {
        const locationEl = document.getElementById('userLocation');
        const directionEl = document.getElementById('qiblaDirection');
        const bearingEl = document.getElementById('qiblaBearing');
        const distanceEl = document.getElementById('distanceToKaaba');
        
        if (locationEl) locationEl.textContent = 'Location access denied';
        if (directionEl) directionEl.textContent = 'Enable location';
        if (bearingEl) bearingEl.textContent = 'N/A';
        if (distanceEl) distanceEl.textContent = 'N/A';
      }
    );
  }
}

// Tasbih functionality
let currentCount = 0;
let currentTarget = 33;
let currentDhikrName = 'SubhanAllah';

function initTasbih() {
  updateTasbihDisplay();
}

function incrementCounter() {
  if (currentCount < currentTarget) {
    currentCount++;
    updateTasbihDisplay();
    
    // Vibrate if supported
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    
    if (currentCount === currentTarget) {
      setTimeout(() => {
        alert(`Completed ${currentTarget} ${currentDhikrName}! May Allah accept your dhikr.`);
      }, 100);
    }
  }
}

function resetCounter() {
  currentCount = 0;
  updateTasbihDisplay();
}

function setDhikr(name, target) {
  currentDhikrName = name;
  currentTarget = target;
  currentCount = 0;
  const dhikrEl = document.getElementById('currentDhikr');
  if (dhikrEl) dhikrEl.textContent = name;
  updateTasbihDisplay();
}

function nextDhikr() {
  const dhikrs = [
    {name: 'SubhanAllah', target: 33},
    {name: 'Alhamdulillah', target: 33},
    {name: 'Allahu Akbar', target: 34}
  ];
  
  const currentIndex = dhikrs.findIndex(d => d.name === currentDhikrName);
  const nextIndex = (currentIndex + 1) % dhikrs.length;
  const nextDhikr = dhikrs[nextIndex];
  
  setDhikr(nextDhikr.name, nextDhikr.target);
}

function updateTasbihDisplay() {
  const counterEl = document.getElementById('counter');
  const targetEl = document.getElementById('target');
  const remainingEl = document.getElementById('remaining');
  
  if (counterEl) counterEl.textContent = currentCount;
  if (targetEl) targetEl.textContent = currentTarget;
  if (remainingEl) remainingEl.textContent = currentTarget - currentCount;
}

// Zakat functionality
function initZakat() {
  calculateZakat();
}

function calculateZakat() {
  const NISAB_USD = 4340; // Approximate nisab in USD (based on silver)
  
  const cash = parseFloat(document.getElementById('cash')?.value) || 0;
  const gold = parseFloat(document.getElementById('gold')?.value) || 0;
  const silver = parseFloat(document.getElementById('silver')?.value) || 0;
  const investments = parseFloat(document.getElementById('investments')?.value) || 0;
  const yourDebts = parseFloat(document.getElementById('yourDebts')?.value) || 0;

  const totalWealth = cash + gold + silver + investments;
  const zakatableWealth = totalWealth - yourDebts;
  const zakatDue = zakatableWealth >= NISAB_USD ? zakatableWealth * 0.025 : 0;

  // Update display
  const totalWealthEl = document.getElementById('totalWealth');
  const minusDebtsEl = document.getElementById('minusDebts');
  const zakatableWealthEl = document.getElementById('zakatableWealth');
  const zakatDueEl = document.getElementById('zakatDue');
  const statusEl = document.getElementById('zakatStatus');
  
  if (totalWealthEl) totalWealthEl.textContent = `$${totalWealth.toLocaleString()}`;
  if (minusDebtsEl) minusDebtsEl.textContent = `$${yourDebts.toLocaleString()}`;
  if (zakatableWealthEl) zakatableWealthEl.textContent = `$${zakatableWealth.toLocaleString()}`;
  if (zakatDueEl) zakatDueEl.textContent = `$${zakatDue.toLocaleString()}`;

  // Update status
  if (statusEl) {
    if (zakatableWealth < NISAB_USD) {
      statusEl.textContent = 'Your wealth is below the Nisab threshold. Zakat is not obligatory.';
      statusEl.style.background = 'rgba(255, 193, 7, 0.1)';
      statusEl.style.color = '#ffc107';
    } else if (zakatDue > 0) {
      statusEl.textContent = 'Zakat is obligatory on your wealth. Please pay the calculated amount.';
      statusEl.style.background = 'rgba(40, 167, 69, 0.1)';
      statusEl.style.color = '#28a745';
    } else {
      statusEl.textContent = '';
      statusEl.style.background = 'transparent';
    }
  }
}

// Hijri functionality
function initHijri() {
  const hijriMonths = [
    'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani",
    'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', "Sha'ban",
    'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah'
  ];

  // Simple Hijri date approximation (for demo purposes)
  function approximateHijriDate(gregorianDate) {
    const hijriEpoch = new Date('622-07-16'); // Approximate start of Hijri calendar
    const daysDiff = Math.floor((gregorianDate - hijriEpoch) / (1000 * 60 * 60 * 24));
    const hijriYear = Math.floor(daysDiff / 354.37) + 1; // Approximate lunar year
    const dayOfYear = daysDiff % 354;
    const hijriMonth = Math.floor(dayOfYear / 29.5) + 1;
    const hijriDay = Math.floor(dayOfYear % 29.5) + 1;
    
    return {
      year: hijriYear,
      month: Math.min(hijriMonth, 12),
      day: Math.min(hijriDay, 30)
    };
  }

  const today = new Date();
  const hijriToday = approximateHijriDate(today);
  
  // Update display
  const hijriDateEl = document.getElementById('hijriDate');
  const gregorianDateEl = document.getElementById('gregorianDate');
  const fullHijriDateEl = document.getElementById('fullHijriDate');
  const fullGregorianDateEl = document.getElementById('fullGregorianDate');
  const islamicMonthEl = document.getElementById('islamicMonth');
  
  if (hijriDateEl) hijriDateEl.textContent = `${hijriToday.day} ${hijriMonths[hijriToday.month - 1]}`;
  if (gregorianDateEl) gregorianDateEl.textContent = today.toLocaleDateString();
  if (fullHijriDateEl) fullHijriDateEl.textContent = `${hijriToday.day} ${hijriMonths[hijriToday.month - 1]} ${hijriToday.year} AH`;
  if (fullGregorianDateEl) fullGregorianDateEl.textContent = today.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  if (islamicMonthEl) islamicMonthEl.textContent = hijriMonths[hijriToday.month - 1];
}

// Initialize the app
document.addEventListener('DOMContentLoaded', ()=> {
  showPage('home');
});

// Register service worker for offline capability and cache updates
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW failed', e));
}

// start
// init();



// Prophet Stories functionality
async function showProphetStoriesPage() {
  try {
    const response = await fetch('./data/prophet_stories.json');
    const prophets = await response.json();
    
    const main = document.querySelector('main');
    main.innerHTML = `
      <section class="hero card">
        <div class="hero-left">
          <div class="alarm-icon" title="Prophet Stories">👥</div>
          <div class="next-prayer-label">Prophet Stories</div>
          <div class="next-prayer-name">Stories of the Prophets</div>
          <div class="next-prayer-time">By Ibn Kathir</div>
        </div>
      </section>

      <section class="card">
        <h3>Prophets and Messengers</h3>
        <div class="prophet-list" id="prophetList">
          ${prophets.map(prophet => `
            <div class="prophet-item" onclick="showProphetStory('${prophet.id}')">
              <div class="prophet-info">
                <div class="prophet-name">${prophet.name}</div>
                <div class="prophet-arabic">${prophet.arabic_name}</div>
                <div class="prophet-summary">${prophet.summary}</div>
              </div>
              <div class="prophet-arrow">→</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  } catch (error) {
    console.error('Error loading prophet stories:', error);
    const main = document.querySelector('main');
    main.innerHTML = `
      <section class="card">
        <h3>Prophet Stories</h3>
        <p>Unable to load prophet stories. Please try again later.</p>
      </section>
    `;
  }
}

async function showProphetStory(prophetId) {
  try {
    const response = await fetch('./data/prophet_stories.json');
    const prophets = await response.json();
    const prophet = prophets.find(p => p.id === prophetId);
    
    if (!prophet) {
      alert('Prophet story not found');
      return;
    }
    
    const main = document.querySelector('main');
    main.innerHTML = `
      <section class="hero card">
        <div class="hero-left">
          <div class="alarm-icon" title="Prophet Story">📖</div>
          <div class="next-prayer-label">${prophet.name}</div>
          <div class="next-prayer-name">${prophet.arabic_name}</div>
          <div class="next-prayer-time">Story & Lessons</div>
        </div>
      </section>

      <section class="card prophet-story-content">
        <div class="story-header">
          <h2>${prophet.name}</h2>
          <p class="story-summary">${prophet.summary}</p>
        </div>
        
        <div class="story-text">
          ${prophet.story.split('\n\n').map(paragraph => `<p>${paragraph}</p>`).join('')}
        </div>
        
        ${prophet.quranic_references ? `
          <div class="quranic-references">
            <h4>Quranic References:</h4>
            <ul>
              ${prophet.quranic_references.map(ref => `<li>${ref}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        <div class="story-actions">
          <button class="tool" onclick="showProphetStoriesPage()">← Back to All Prophets</button>
          <button class="tool" onclick="shareProphetStory('${prophet.id}')">Share Story</button>
        </div>
      </section>
    `;
    
    // Update topbar for individual story
    const topbar = document.querySelector('.topbar');
    topbar.innerHTML = `
      <div class="left">
        <button onclick="showProphetStoriesPage()" style="background:none;border:none;color:var(--accent);font-size:16px;cursor:pointer;">← Back</button>
      </div>
      <div class="right">${prophet.name}</div>
    `;
  } catch (error) {
    console.error('Error loading prophet story:', error);
    alert('Unable to load prophet story. Please try again.');
  }
}

function shareProphetStory(prophetId) {
  if (navigator.share) {
    navigator.share({
      title: 'Prophet Story',
      text: `Read the story of ${prophetId} from our Islamic PWA`,
      url: window.location.href
    });
  } else {
    // Fallback for browsers that don't support Web Share API
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied to clipboard!');
    }).catch(() => {
      alert('Unable to share. Please copy the URL manually.');
    });
  }
}


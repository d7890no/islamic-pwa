/* Main app logic for the PWA */
const prayerBtn = document.getElementById('get-times');
const prayerOut = document.getElementById('prayer-output');
const loadSurahBtn = document.getElementById('load-surah');
const surahNumInput = document.getElementById('surah-num');
const surahOut = document.getElementById('surah-output');
const hadithBtn = document.getElementById('random-hadith');
const hadithOut = document.getElementById('hadith-output');
const listProphetsBtn = document.getElementById('list-prophets');
const prophetOut = document.getElementById('prophet-output');

async function fetchPrayerTimes(lat, lon) {
  prayerOut.textContent = 'Loading...';
  try {
    const resp = await fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=2`);
    const data = await resp.json();
    if(!data || data.code !== 200) throw new Error('Prayer API error');
    const times = data.data.timings;
    prayerOut.innerHTML = Object.entries(times).map(([k,v]) => `<div><strong>${k}</strong>: ${v}</div>`).join('');
  } catch (e) {
    prayerOut.textContent = 'Could not get prayer times. ' + e;
  }
}

prayerBtn.onclick = () => {
  if(!navigator.geolocation) {
    prayerOut.textContent = 'Geolocation not supported. Enter coordinates manually in console.';
    return;
  }
  prayerOut.textContent = 'Requesting location...';
  navigator.geolocation.getCurrentPosition((pos) => {
    fetchPrayerTimes(pos.coords.latitude, pos.coords.longitude);
  }, (err) => {
    prayerOut.textContent = 'Location denied or unavailable: ' + err.message;
  }, {timeout:15000});
};

// Load Surah via alquran.cloud
loadSurahBtn.onclick = async () => {
  const n = parseInt(surahNumInput.value) || 1;
  surahOut.textContent = 'Loading...';
  try {
    const resp = await fetch(`https://api.alquran.cloud/v1/surah/${n}/en.asad`);
    const data = await resp.json();
    if(!data || data.code !== 200) throw new Error('Quran API error');
    const ayahs = data.data.ayahs.map(a => `<p><sup>${a.numberInSurah}</sup> ${a.text}</p>`).join('');
    surahOut.innerHTML = `<h3>${data.data.englishName} — ${data.data.englishNameTranslation}</h3>` + ayahs;
  } catch(e) {
    surahOut.textContent = 'Could not load surah. ' + e;
  }
};

// Hadiths & Prophets are bundled offline
async function loadJSON(path) {
  const r = await fetch(path);
  return await r.json();
}

hadithBtn.onclick = async () => {
  hadithOut.textContent = 'Loading...';
  try {
    const data = await loadJSON('data/hadiths.json');
    const pick = data[Math.floor(Math.random()*data.length)];
    hadithOut.innerHTML = `<blockquote>"${pick.text}"</blockquote><p><em>— ${pick.source}</em></p>`;
  } catch(e) {
    hadithOut.textContent = 'Could not load hadiths: ' + e;
  }
};

listProphetsBtn.onclick = async () => {
  prophetOut.textContent = 'Loading...';
  try {
    const data = await loadJSON('data/prophets.json');
    prophetOut.innerHTML = data.map(p => `<details><summary>${p.name}</summary><p>${p.story}</p></details>`).join('');
  } catch(e) {
    prophetOut.textContent = 'Could not load prophet stories: ' + e;
  }
};

// Register service worker for offline capability
if('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(()=>console.log('SW registered')).catch(e=>console.warn('SW failed', e));
}

document.addEventListener('DOMContentLoaded', () => {
  const content = document.getElementById('content');
  const buttons = document.querySelectorAll('.bottom-nav button');
  const pages = {
    home: '<h2>Home</h2><p>Prayer times and tracker will be shown here...</p>',
    quran: '<h2>Al-Quran</h2><p>Load surahs dynamically here...</p>',
    hadith: '<h2>Hadith</h2><p>Daily hadith will appear here...</p>',
    prophets: '<h2>Prophets Stories</h2><p>List of stories will appear here...</p>'
  };
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.getAttribute('data-page');
      content.innerHTML = pages[page] || '<h2>Not Found</h2>';
    });
  });
});

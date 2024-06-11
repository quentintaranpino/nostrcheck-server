  function getServerUptime() {
    fetch(window.location.protocol + "//" + window.location.host + '/api/v2/admin/status')
    .then(res => res.json())
    .then(out =>
      {let uptimes = document.getElementsByClassName('server-uptime');
      Array.prototype.forEach.call(uptimes, function(uptime) {
        uptime.innerHTML = out.uptime;
      })})
    .catch(err => { throw err });
    setTimeout(getServerUptime, 1000);
  }
  getServerUptime();
const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl))


// Smooth scroll and offset by 200px
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        const offsetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - 200;

        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    });
});


// Theme switcher
const themeSelector = document.getElementById('theme-selector');
const body = document.body;
const navbar = document.querySelector('.navbar');

function applyTheme(theme) {
  if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    body.setAttribute('data-bs-theme', 'dark');
  } else {
    body.setAttribute('data-bs-theme', 'light');
  }
}

function setTheme(theme) {
  localStorage.setItem('theme', theme);
  applyTheme(theme);
}

themeSelector.addEventListener('change', () => {
  setTheme(themeSelector.value);
});

const savedTheme = localStorage.getItem('theme') || 'system';
themeSelector.value = savedTheme;
applyTheme(savedTheme);

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem('theme') === 'system') {
    applyTheme('system');
  }
});

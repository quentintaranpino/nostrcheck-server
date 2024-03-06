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
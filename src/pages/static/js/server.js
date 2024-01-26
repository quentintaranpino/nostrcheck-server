  function getServerUptime() {
    fetch('https://nostrcheck.me/api/v2/admin/status')
    .then(res => res.json())
    .then(out =>
      document.getElementById('server-uptime').innerHTML = out.uptime)
    .catch(err => { throw err });
    setTimeout(getServerUptime, 1000);
  }
  getServerUptime();
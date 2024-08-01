const initRegisterForm = async () => {

    await fetch('/api/v2/domains', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('authkey')
        }
      })
      .then(response => response.json())
      .then(async data => {
        const select = document.getElementById('domain-selection');
        const domainLabel = document.getElementById('input-register-domain');
        let counter = 0;
        data.AvailableDomains.forEach(domain => {
          counter == 0 ? domainLabel.innerText = '@' + domain : null;
          const option = document.createElement('option');
          option.value = domain;
          option.text = domain;
          select.appendChild(option);
          counter++;
        });
        await localStorage.setItem('authkey', data.authkey);
      })
      .catch((error) => {
        console.error('Error:', error);
      });
    
   
    // Update domain input when selection changes
    document.getElementById('domain-selection').addEventListener('change', function() {
            const selectedDomain = this.value;
            document.getElementById('input-register-domain').innerText = '@' + selectedDomain;
    });
}

const register_OTC = async () => {

    const domain = document.getElementById('input-register-domain').innerText.split('@')[1]
    const username = document.getElementById('input-register-username').value
    const pubkey = document.getElementById('input-register-pubkey').value
    const password = document.getElementById('input-register-password').value

    if (!domain || !username || !pubkey ) {
        initAlertModal("#register", "Username, public key and domain are required.");
        return;
    }

    if (pubkey.length < 64) {
        initAlertModal("#register", "Public key format is not valid.");
        document.getElementById('input-register-pubkey').focus();
        return;
    }

    await fetch('/api/v2/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: domain,
          username: username,
          pubkey: pubkey,
          password: password
        })



    console.log(domain, username, pubkey, password);
}
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

const register = async (type) => {

  const domain = document.getElementById('input-register-domain').innerText.split('@')[1]
  const username = document.getElementById('input-register-username').value
  const pubkey = document.getElementById('input-register-pubkey').value
  const password = document.getElementById('input-register-password').value

  if (!domain || !username || !pubkey ) {
      initAlertModal("#register", "Username, public key and domain are required.");
      return;
  }

  if (pubkey.length < 64 && pubkey.startsWith('npub') == false) {
      initAlertModal("#register", "Public key format is not valid.");
      document.getElementById('input-register-pubkey').focus();
      return;
  }

  if (pubkey.length < 57 && pubkey.startsWith('npub') == true) {
      initAlertModal("#register", "Public key format is not valid.");
      document.getElementById('input-register-pubkey').focus();
      return;
  }

  if (!/^[a-zA-Z0-9-_]+$/.test(username)) {
    initAlertModal("#register", "Username format is not valid.");
    document.getElementById('input-register-username').focus();
    return;
}

  let body = {
    pubkey: pubkey,
    username: username,
    domain: domain,
    password: password
  }

  let signedAuthEvent;
  if (type == 'nip07'){
    let authEvent = {
      created_at: Math.floor(Date.now() / 1000),
      kind: 27235,
      tags: [
        [
          "method",
          "POST"
        ],
        [
          "u",
          window.location.href
        ]
      ],
      content: "NIP98 auth event - This event is used to check that you can sign with the pubkey you want to register. Will not be published on nostr.",
    }

    signedAuthEvent = await window.nostr.signEvent(authEvent);
    if (!signedAuthEvent) {
      initAlertModal("#register", "Error signing auth event.");
      return;
    }
  }

  await fetch('/api/v2/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Nostr ' + btoa(JSON.stringify(signedAuthEvent))
      },
      body: JSON.stringify(body)
    })
    .then(response => response.json())
    .then(async data => {
      console.log (data.status)
      if (data.status == 'success'){

        document.getElementById('register-form').classList.add('d-none');
        document.getElementById('register-title').classList.add('d-none');
        document.getElementById('register-success').classList.remove('d-none');
      }else{
        initAlertModal("#register", data.message);
      }
      
    })
    
}

const validateOTC = async () => {
  const otc = document.getElementById('input-register-otc').value
  const domain = document.getElementById('input-register-domain').innerText.split('@')[1]

  if (!otc) {
      initAlertModal("#register", "One time code is required.");
      return;
  }

  let body = {
    otc: otc,
    domain: domain
  }

  await fetch('/api/v2/register/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    .then(response => response.json())
    .then(async data => {
      if (data.status == 'success'){

        initAlertModal("#register", "One time code validated successfully, redirecting in 5 seconds to login page. Welcome and enjoy your new account! 🥳🥳🥳", 5000, "alert-success");
        await new Promise(r => setTimeout(r, 5000));
        window.location.href = "login";

      }else{
        initAlertModal("#register", data.message);
      }
      
    })
    
}
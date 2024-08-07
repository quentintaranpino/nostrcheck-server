const initRegisterForm = async () => {

  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
  const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl))

  let domainsData;


  await fetch('/api/v2/domains', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('authkey')
      }
    })
    .then(response => response.json())
    .then(async data => {
      const select = document.getElementById('domain-selection');
      const invitationGroup = document.getElementById('register-invitation');
      let counter = 0;
      domainsData = data;
      Object.keys(data.availableDomains).forEach(domain => {
        if (counter === 0) {
            document.getElementById('input-register-domain').innerText = `@${domain}`;
        }
        const option = document.createElement('option');
        option.value = domain;
        option.text = domain;
        select.appendChild(option);
        const domainInfo = data.availableDomains[domain];

        let icons = '<i class="fa-regular fa-star me-2" style="color:#a06bc9"></i> Free';
        document.getElementById('domain-selection-icons').innerHTML = icons;
        if (domainInfo.requirepayment) { icons = ' <i class="fa-solid fa-bolt ms-2 me-2" style="color:rgb(255, 128, 24)"></i> Paid'; }
        if (domainInfo.requireinvite && !domainInfo.requirepayment) { 
          icons = ' <i class="fa-regular fa-paper-plane ms-2 me-2" style="color:rgb(77, 77, 77)"></i> Invite'; 
        }else if (domainInfo.requireinvite && domainInfo.requirepayment) { icons += ' <i class="fa-solid fa-plus ms-2" style="color:rgb(115, 111, 111)"></i> <i class="fa-regular fa-paper-plane ms-2 me-2" style="color:rgb(77, 77, 77)"></i> Invite'; }
        console.log(document.getElementById('domain-selection-icons').innerHTML)
        counter++;
      });

      select.addEventListener('change', (event) => {
        const selectedDomain = event.target.value;
        const domainInfo = data.availableDomains[selectedDomain];

        if (domainInfo.requireinvite) {
            invitationGroup.classList.remove('d-none');
        } else {
            invitationGroup.classList.add('d-none');
        }
        let icons = '<i class="fa-regular fa-star me-2" style="color:#a06bc9"></i> Free';
        if (domainInfo.requirepayment) { icons = ' <i class="fa-solid fa-bolt ms-2 me-2" style="color:rgb(255, 128, 24)"></i> Paid'; }
        if (domainInfo.requirepayment) { icons = ' <i class="fa-solid fa-bolt ms-2 me-2" style="color:rgb(255, 128, 24)"></i> Paid'; }
        if (domainInfo.requireinvite && !domainInfo.requirepayment) { 
          icons  = ' <i class="fa-regular fa-paper-plane ms-2 me-2" style="color:rgb(77, 77, 77)"></i> Invite'; 
        }else if (domainInfo.requireinvite && domainInfo.requirepayment) { icons += ' <i class="fa-solid fa-plus ms-2" style="color:rgb(115, 111, 111)"></i> <i class="fa-regular fa-paper-plane ms-2 me-2" style="color:rgb(77, 77, 77)"></i> Invite'; }
       document.getElementById('domain-selection-icons').innerHTML = icons;
        document.getElementById('input-register-domain').innerHTML = `@${selectedDomain}`;

      });

      await localStorage.setItem('authkey', data.authkey);

    })
    .catch((error) => {
      console.error('Error:', error);
    });
   
}

const register = async (type) => {

  const domain = document.getElementById('input-register-domain').innerText.split('@')[1]
  const username = document.getElementById('input-register-username').value
  const pubkey = document.getElementById('input-register-pubkey').value
  const password = document.getElementById('input-register-password').value
  const inviteCode = document.getElementById('input-register-invitation').value

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
    password: password,
    inviteCode: inviteCode
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
        document.getElementById('register-second-phase').classList.remove('d-none');

        if (data.otc == true) {
          document.getElementById('register-need-steps').classList.remove('d-none');
          document.getElementById('register-otc-request').classList.remove('d-none');
        }

        if (data.payment_request != "") {
          document.getElementById('register-need-steps').classList.remove('d-none');
          document.getElementById('register-payment-request').classList.remove('d-none');
          document.getElementById("payment-request-satoshi").innerText = data.satoshi;
          const qrcode = new QRCode(document.getElementById("payment-request-qr"), {
            text: data.payment_request,
            width: 250,
            height: 250
          });

          document.getElementById("payment-request").innerText = data.payment_request;

          setInterval(async () => {
            validateInvoice(data.payment_request);
          }, 10000);

        }

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

        showMessage(`One time code validated successfully.`, "alert-success", true);
        document.getElementById('register-otc-request').classList.add('d-none');

        if (document.getElementById('register-payment-request').classList.contains('d-none')){
          document.getElementById('register-need-steps').classList.add('d-none');
          document.getElementById('register-success').classList.remove('d-none');
        }

      }else{
        initAlertModal("#register", data.message);
      }
      
    })
    
}

let validated = false;
const validateInvoice = async (payment_request) => {

  if (validated == true){
    return;
  }

  if (!payment_request) {
    return;
  }

  await fetch(`/api/v2/payments/invoices/${payment_request}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(async data => {
      if (data.status == 'success'){
        if (data.invoice.isPaid == true){
          validated = true;
          showMessage(`Payment for registration received.`, "alert-success",false);
          document.getElementById('register-payment-request').classList.add('d-none');

          if (document.getElementById('register-otc-request').classList.contains('d-none')){
            document.getElementById('register-need-steps').classList.add('d-none');
            document.getElementById('register-success').classList.remove('d-none');
          }

        }
      }
    })
    .catch((error) => {
      console.error('Error:', error);
    });
      
  }

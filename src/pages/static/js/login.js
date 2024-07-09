const logIn = async (type, rememberMe, buttonId) =>{

    console.debug('logIn', type, rememberMe, buttonId);
  const buttonText = document.getElementById(buttonId).innerHTML;
  document.getElementById(buttonId).innerHTML = '<span class="spinner-border spinner-border-sm pe-1" role="status" aria-hidden="true"></span> Logging in...';

  if (type === 'legacy') {
      await fetchServer(JSON.stringify({username: document.getElementById('username').value, 
                                        password:  document.getElementById('password').value, 
                                        rememberMe: rememberMe}
                                      ), 'login').then(response => {
                                          if (response.status === 200) {
                                              response.json().then(data => {
                                                  if (data == true) {
                                                      window.location.href = "/api";
                                                  } else {
                                                      initAlertModal("#login", data.message);
                                                      document.getElementById(buttonId).innerHTML = buttonText;
                                                  }
                                              });
                                          } else {
                                              initAlertModal("#login", response.statusText);
                                              document.getElementById(buttonId).innerHTML = buttonText;
                                          }});
  }

  if (type === 'nostr') {
      if (!window.nostr) {
        initAlertModal("#login", 'NIP07 browser extension not found');
        document.getElementById(buttonId).innerHTML = buttonText;
        return;}
      try {
          const pubKey = await window.nostr.getPublicKey();

          if (!pubKey){console.debug('NIP07 public key not found');return;}

          let event = {
              kind: 30078,
              created_at: Math.floor(Date.now() / 1000),
              tags: [
                    ["cookie", 
                    rememberMe? "true": "false"]
                    ],
              content: 'This will not be published on nostr. Its purpose is to verify that you have control of your pubkey'
          };
          console.log(event);
          const loginEvent = JSON.stringify(await window.nostr.signEvent(event));

          if (loginEvent){
              await fetchServer(loginEvent,'login').then(response => {
                  if (response.status === 200) {
                      response.json().then(data => {
                          if (data == true) {
                              window.location.href = "/api";
                          } else {
                              initAlertModal("#login", data.message);
                              document.getElementById(buttonId).innerHTML = buttonText;
                          }
                      });
                  } else {
                      initAlertModal("#login", response.statusText);
                      document.getElementById(buttonId).innerHTML = buttonText;
                  }
              });
          }
      } catch (error) {
          console.error(error);
          document.getElementById(buttonId).innerHTML = buttonText;
      }
  }
}

const fetchServer = async (data, url) => {
  try {
      const response = await fetch(url, {method: 'POST',headers: {'Content-Type': 'application/json'},body: data});
      return response;
  } catch (error) {
      initAlertModal("#login", error);
  }
}


const logInOtc = async () => {
  if($("#input-otc-login").attr("data-otc") === "pubkey"){

    await fetchServer(JSON.stringify({}), `login/${document.getElementById('input-otc-login').value}`).then(response => {
        if (response.status === 200) {
            response.json().then(data => {
                if (data == true) {
                    document.getElementById('input-otc-login').value = '';
                    $("#input-otc-login").attr("data-otc", "code").attr("placeholder", "Enter verification code");
                    $("#otc_submit").text("Verify and login");
                } else {
                    initAlertModal("#login", data.message);
                    document.getElementById(buttonId).innerHTML = buttonText;
                }
            });
        } else {
            initAlertModal("#login", response.statusText);
            document.getElementById(buttonId).innerHTML = buttonText;
        }});
  } else {

    let data = {
        OTC: document.getElementById('input-otc-login').value,
        rememberMe: document.getElementById('rememberme_otc').checked
    }

    await fetchServer(JSON.stringify(data), `login`).then(response => {
        if (response.status === 200) {
            response.json().then(data => {
                if (data == true) {
                    window.location.href = "/api";
                } else {
                    initAlertModal("#login", data.message);
                    document.getElementById('input-otc-login').innerHTML = 'One time login-code';
                }});
        } else {
            initAlertModal("#login", response.statusText);
            document.getElementById(buttonId).innerHTML = buttonText;
        }});
  }
}

// Show legacy login form
document.getElementById('legacy-login-link').addEventListener('click', function(event) {
    event.preventDefault();
    document.getElementById('legacy-login').classList.remove('d-none'); 
    document.getElementById('legacy-login-text').classList.add('d-none'); 
    document.getElementById('otc-login').classList.add('d-none'); 
    document.getElementById('extension-login').classList.add('d-none'); 
});

// Show nostr login form
document.getElementById('nostr-login-link').addEventListener('click', function(event) {
    event.preventDefault();
    document.getElementById('legacy-login').classList.add('d-none'); 
    document.getElementById('legacy-login-text').classList.remove('d-none'); 
    document.getElementById('otc-login').classList.remove('d-none'); 
    document.getElementById('extension-login').classList.remove('d-none'); 
});
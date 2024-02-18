//NIP07 login
async function logIn(type, rememberMe) {

    if (type === 'legacy') {
        await fetchServer(JSON.stringify({username: document.getElementById('username').value, password:  document.getElementById('password').value, rememberMe: rememberMe}));
    }

    if (type === 'nostr') {
        if (!window.nostr) {console.debug('NIP07 not found');return;}
        try {
            const pubKey = await window.nostr.getPublicKey();

            if (!pubKey){console.debug('NIP07 public key not found');return;}

            let event = {
                kind: 30078,
                created_at: Math.floor(Date.now() / 1000),
                tags: [],
                content: 'This will not be published on nostr. Its purpose is to verify that you have control of your pubkey'
            };

            const signedEvent = JSON.stringify(await window.nostr.signEvent(event));

            if (signedEvent){
                await fetchServer(signedEvent);
            }
        } catch (error) {
            console.error(error);
        }
    }
}

async function fetchServer(data) {
    try {
        const response = await fetch('login', {method: 'POST',headers: {'Content-Type': 'application/json'},body: data});
        //read responsoe, no json
        console.log(response);
        if (response.status === 200){
            window.location.replace('/api');
        }else{
            initAlertModal("#login", 'Login failed');
        }
    } catch (error) {
        console.error(error);
        initAlertModal("#login", error);
    }
}

const ShowPasswordToggle = () =>{
    document.querySelector("[type='password']").classList.add("input-password");
    document.getElementById("toggle-password").classList.remove("d-none");
    const passwordInput=document.querySelector("[type='password']");
    const togglePasswordButton=document.getElementById("toggle-password");
    togglePasswordButton.addEventListener("click",togglePassword);
    function togglePassword(){
        if(passwordInput.type==="password"){
            passwordInput.type="text";
            togglePasswordButton.setAttribute("aria-label","Hide password.")
        }else{
            passwordInput.type="password";
            togglePasswordButton.setAttribute("aria-label","Show password as plain text. "+"Warning: this will display your password on the screen.");
        }
    }
};

ShowPasswordToggle();
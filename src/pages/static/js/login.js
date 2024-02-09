//NIP07 login
async function logIn(type, rememberMe) {

    if (type === 'legacy') {
        console.log('Legacy logIn attempt');
        await fetchServer(JSON.stringify({username: document.getElementById('username').value, password:  document.getElementById('password').value, rememberMe: rememberMe}));
    }

    if (type === 'nostr') {
        console.log('NIP07 logIn attempt');
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
            console.debug(JSON.stringify(signedEvent));

            if (signedEvent){
                console.log('Login event signed, sending to API server');
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
            console.log('Login success');
            window.location.replace('/api');
        }
    } catch (error) {
        console.error(error);
    }
}
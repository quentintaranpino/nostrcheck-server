const fetchFileServerInfo = async (file) => {

    if (!file) {
        return { "status": "error", "message": "No file selected", "satoshi": 0 };
    }

    const mimeDB = await fetch('https://cdn.jsdelivr.net/gh/jshttp/mime-db/db.json')
    .then(res => res.json())
    .catch(error => {
        showMessage("Failed to load MIME types", "alert-danger", false);
        return null;
    });

    if (!mimeDB) {
        return { "status": "error", "message": "Failed to load MIME types", "satoshi": 0 };
    }

    const fileExtension = file.name.split('.').pop().toLowerCase();

    if (!file.type) {
        for (const key in mimeDB) {
            if (mimeDB[key].extensions && mimeDB[key].extensions.includes(fileExtension)) {
                file.type = key;
                break;
            }
        }
    }

    if (!file.type) {
        showMessage("Invalid file type", "alert-danger", false);
        return { "filename": file.name, "url": "" };
    }

    try {
        const response = await fetch('/api/v2/media/info', {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ "size": file.size, "type": file.type })
        });
        const data = await response.json();
        return data;
        
    } catch (error) {
        return { "status": "error", "message": error.message, "satoshi": 0 };
    }

}

const fetchFileServer = async (file, authEventPut = "", authEventGet = "", method = "", showMessages = false) => {

    if (!method) {
        return;
    }
  
    if (!file) {
        showMessage("No file selected", "alert-danger", false);
        return { "filename": "", "url": "" };
    }

    if (!authEventPut && localStorage.getItem('authkey') == "") {
        showMessage("No authentication key, please reload page", "alert-danger", false);
        return { "filename": file.name, "url": "" };
    }

    let headers = {};
    headers["authorization"] = localStorage.getItem('authkey') != "" ? "Bearer " + localStorage.getItem('authkey') : "Nostr " + authEventPut;
    method == "PUT" ? headers["Content-Type"] = file.type : null;
    let uploadMessage = null
    
    if (showMessages) uploadMessage = showMessage(`Uploading file... `, "alert-info", true);

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(method == "PUT" ? window.location.hostname.includes("cdn") ? '/upload' : '/api/v2/media/upload' :  window.location.hostname.includes("cdn") ? '/': '/api/v2/media', {
            method: method,
            headers: headers,
            body: method == "PUT" ? file : formData
        });

        let serverData = await response.json();

        if (response.status.toString().startsWith("4")) {
            if (showMessages) updateMessage(uploadMessage, '<i class="bi bi-exclamation-circle-fill pe-1"></i>' + serverData.message, "alert-danger");
            if (showMessages) hideMessage(uploadMessage, 5000);
            await storeAuthkey('', true);
            return { "filename": file.name, "url": "" };
        }

        await storeAuthkey(response.headers.get('Authorization'));

        while (serverData.processing_url) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            headers["authorization"] = localStorage.getItem('authkey') != "" ? "Bearer " + localStorage.getItem('authkey') : "Nostr " + authEventGet;

            const processingResponse = await fetch(serverData.processing_url, {
                method: "GET",
                headers: headers
            });

            await storeAuthkey(processingResponse.headers.get('Authorization'));
            const processingData = await processingResponse.json();

            if (processingData.status === "processing") {
                if (showMessages) updateMessage(uploadMessage, `Processing file... ${processingData.percentage}`);
            } else {
                serverData.processing_url = "";
            }
        }

        const url = serverData.nip94_event ? serverData.nip94_event.tags.find(tag => tag[0] === "url")[1] : serverData.processing_url ? serverData.processing_url : serverData.url;
        if (showMessages) updateMessage(uploadMessage,
            `File uploaded successfully!
            <button class="btn p-0 pb-1" type="button" aria-controls="intro" aria-selected="false" aria-label="View file">
                <a href="${url}" target="_blank"><span><i class="fa-solid fa-link ms-2 me-2"></i><span class="visually-hidden">View file</span></span></a>
            </button>
            <button class="btn p-0 pb-1" type="button" aria-controls="intro" aria-selected="false" aria-label="Copy to clipboard" onclick="copyToClipboard(this,'${url}')">
                <span><i class="fa-solid fa-copy"></i><span class="visually-hidden">Copy to clipboard</span></span>
            </button>
            `
        );
        if (showMessages) hideMessage(uploadMessage, 15000);
        console.log(url);
        return { "filename": file.name, "url": url };

    } catch (error) {
        if (showMessages) updateMessage(uploadMessage, '<i class="bi bi-exclamation-circle-fill pe-1"></i>' + error, "alert-danger");
        if (showMessages) hideMessage(uploadMessage, 5000);
        await storeAuthkey('', true);
        return { "filename": file.name, "url": "" };
    }
}
const uploadButton = async () => {
    return new Promise((resolve) => {
        var input = $(document.createElement("input"));
        input.attr("type", "file");
        input.attr("multiple", true);
        input.trigger("click"); 

        input.on("cancel", function () {
            resolve("File upload cancelled");
        });

        input.on("change", async function (e) {

            for (const file of e.target.files) {
                const result = await fetchFileServer(file);
                resolve(result);
            }
        });
    });
}

const fetchFileServer = async (file, authEventPut = "", authEventGet = "") => {

    const mimeDB = await fetch('https://cdn.jsdelivr.net/gh/jshttp/mime-db/db.json')
        .then(res => res.json())
        .catch(error => {
            showMessage("Failed to load MIME types", "alert-danger", false);
            return null;
        });

    if (!file) {
        showMessage("No file selected", "alert-danger", false);
        return { "filename": "", "url": "" };
    }

    if (!mimeDB) {
        return { "filename": "", "url": "" }; 
    }

    const fileExtension = file.name.split('.').pop().toLowerCase();
    let mimeType = '';

    for (const key in mimeDB) {
        if (mimeDB[key].extensions && mimeDB[key].extensions.includes(fileExtension)) {
            mimeType = key;
            break;
        }
    }

    if (!mimeType) {
        showMessage("Invalid file type", "alert-danger", false);
        return { "filename": file.name, "url": "" };
    }

    let headers = {};
    headers["authorization"] = localStorage.getItem('authkey') != "" ? "Bearer " + localStorage.getItem('authkey') : "Nostr " + authEventPut;
    headers["Content-Type"] = mimeType;
    const uploadMessage = showMessage(`Uploading file... `, "alert-info", true);

    console.log(headers["authorization"])

    try {
        const response = await fetch('/upload/', {
            method: "PUT",
            headers: headers,
            body: file
        });

        let serverData = await response.json();

        if (response.status.toString().startsWith("4")) {
            updateMessage(uploadMessage, '<i class="bi bi-exclamation-circle-fill pe-1"></i>' + serverData.message, "alert-danger");
            hideMessage(uploadMessage, 5000);
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
                updateMessage(uploadMessage, `Processing file... ${processingData.percentage}`);
            } else {
                serverData.processing_url = "";
            }
        }

        const url = serverData.nip94_event ? serverData.nip94_event.tags.find(tag => tag[0] === "url")[1] : serverData.processing_url;
        updateMessage(uploadMessage,
            `File uploaded successfully!
            <button class="btn p-0 pb-1" type="button" aria-controls="intro" aria-selected="false" aria-label="View file">
                <a href="${url}" target="_blank"><span><i class="fa-solid fa-link ms-2 me-2"></i><span class="visually-hidden">View file</span></span></a>
            </button>
            <button class="btn p-0 pb-1" type="button" aria-controls="intro" aria-selected="false" aria-label="Copy to clipboard" onclick="copyToClipboard(this,'${url}')">
                <span><i class="fa-solid fa-copy"></i><span class="visually-hidden">Copy to clipboard</span></span>
            </button>
            `
        );
        hideMessage(uploadMessage, 15000);
        console.log(url);
        return { "filename": file.name, "url": url };

    } catch (error) {
        updateMessage(uploadMessage, '<i class="bi bi-exclamation-circle-fill pe-1"></i>' + error, "alert-danger");
        hideMessage(uploadMessage, 5000);
        await storeAuthkey('', true);
        return { "filename": file.name, "url": "" };
    }
}
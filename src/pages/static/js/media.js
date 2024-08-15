const uploadMedia = async (fileName) => {
    return new Promise((resolve, reject) => {
        var input = $(document.createElement("input"));
        input.attr("type", "file");
        input.trigger("click");

        input.on("cancel", function () {
            resolve("Media upload cancelled");
        });

        input.on("change", async function (e) {
            var files = e.target.files;
            var data = new FormData();

            const mimeDB = await fetch('https://cdn.jsdelivr.net/gh/jshttp/mime-db/db.json')
                .then(res => res.json())
                .then(json => {
                    return json;
                });

            const fileExtension = files[0].name.split('.').pop().toLowerCase(); // Extrae la extensión del archivo

            for (const key in mimeDB) {
                if (mimeDB[key].extensions && mimeDB[key].extensions.includes(fileExtension)) {
                    data.append("file", new Blob([files[0]], { type: key }), files[0].name);
                    break; 
                }
            }

            if (!data.has("file")) {
                showMessage("Invalid file type", "alert-danger", false);
                resolve("Invalid file type");
                return;
            }

            let headers;
            localStorage.getItem('authkey') ? headers = { "authorization": "Bearer " + localStorage.getItem('authkey') } : data.append("apikey", "26d075787d261660682fb9d20dbffa538c708b1eda921d0efa2be95fbef4910a");
            const uploadMessage = showMessage(`Uploading media... `, "alert-info", true);

            await fetch('media/', {
                method: "POST",
                headers: headers,
                body: data
                })
                .then(async response => {
                   
                    let mediaData = await response.json();

                    if (response.status.toString().startsWith("4")) {
                        updateMessage(uploadMessage,'<i class="bi bi-exclamation-circle-fill pe-1"></i>' + mediaData.message, "alert-danger");
                        hideMessage(uploadMessage, 5000);
                        reject(mediaData.message);
                        await storeAuthkey('', true);
                        return;
                    }

                    await storeAuthkey(response.headers.get('Authorization'));
                    
                    while (mediaData.processing_url != "") {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        localStorage.getItem('authkey') ? headers = { "authorization": "Bearer " + localStorage.getItem('authkey') } : mediaData.processing_url = mediaData.processing_url + "?apikey=26d075787d261660682fb9d20dbffa538c708b1eda921d0efa2be95fbef4910a";
                        await fetch(mediaData.processing_url, {
                            method: "GET",
                            headers: headers
                        })
                            .then(async response => {
                                await storeAuthkey(response.headers.get('Authorization'));
                                const processingData = await response.json();
                                if (processingData.status =="processing") { 
                                    updateMessage(uploadMessage, `Processing media... ${processingData.percentage}`);
                                }else{
                                    mediaData.processing_url = ""; 
                                }
                            })
                            .catch(async (error) => {
                                updateMessage(uploadMessage,'<i class="bi bi-exclamation-circle-fill pe-1"></i>' + error, "alert-danger");
                                hideMessage(uploadMessage, 5000);
                                await storeAuthkey('', true);
                                return;
                            });
                    }

                    const url = mediaData.nip94_event? mediaData.nip94_event.tags.find(tag => tag[0] === "url")[1] : mediaData.processing_url;
                    updateMessage(uploadMessage,
                                    `Media uploaded successfully!
                                    <button class="btn p-0 pb-1" type="button" aria-controls="intro" aria-selected="false" aria-label="View file">
                                        <a href="${url}" target="blank"><span><i class="fa-solid fa-link"></i></i><span class="visually-hidden">View file</span></span></a>
                                    </button>
                                    <button class="btn p-0 pb-1" type="button" aria-controls="intro" aria-selected="false" aria-label="Copy to clipboard" onclick="copyToClipboard(this,'${url}')">
                                        <span><i class="fa-solid fa-copy"></i><span class="visually-hidden">Copy to clipboard</span></span>
                                    </button>
                                    `
                                    );
                    hideMessage(uploadMessage, 15000);
                    resolve(`${url}`);
                })
                .catch(async (error) => {
                    updateMessage(uploadMessage,'<i class="bi bi-exclamation-circle-fill pe-1"></i>' + error, "alert-danger");
                    hideMessage(uploadMessage, 5000);
                    reject(error);
                    await storeAuthkey('', true);
                    return;
                });
        });
    });
}
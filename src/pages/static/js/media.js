const uploadMedia = async () => {
    return new Promise((resolve, reject) => {
        var input = $(document.createElement("input"));
        input.attr("type", "file");
        input.trigger("click");

        input.on("change", async function (e) {
            var files = e.target.files;
            var data = new FormData();
            data.append("file", files[0]);

            let headers;
            localStorage.getItem('authkey') ? headers = { "authorization": "Bearer " + localStorage.getItem('authkey') } : data.append("apikey", "26d075787d261660682fb9d20dbffa538c708b1eda921d0efa2be95fbef4910a");
            
            await fetch('media/', {
                method: "POST",
                headers: headers,
                body: data
                })
                .then(async response => {
                    await storeAuthkey(response.headers.get('Authorization'));
                    let mediaData = await response.json();
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
                                    showMessage(`Processing media... ${processingData.percentage}`, "alert-info", 1000);
                                }else{
                                    mediaData.processing_url = ""; 
                                }
                            })
                            .catch((error) => {
                                console.error(error);
                            });
                    }

                    const url = mediaData.nip94_event? mediaData.nip94_event.tags.find(tag => tag[0] === "url")[1] : mediaData.processing_url;
                    showMessage(    `Media uploaded successfully!
                                    <button class="btn p-0 pb-1" type="button" aria-controls="intro" aria-selected="false" aria-label="View file">
                                        <a href="${url}" target="blank"><span><i class="fa-solid fa-link"></i></i><span class="visually-hidden">View file</span></span></a>
                                    </button>
                                    <button class="btn p-0 pb-1" type="button" aria-controls="intro" aria-selected="false" aria-label="Copy to clipboard" onclick="copyToClipboard(this,'${url}')">
                                        <span><i class="fa-solid fa-copy"></i><span class="visually-hidden">Copy to clipboard</span></span>
                                    </button>
                                    `
                                    , "alert-success", 15000);
                    resolve();
                })
                .catch((error) => {
                    initAlertModal('', error);
                    console.error(error);
                    reject(error);
                });
        });
    });
}
const initConfirmModal = async (objectId, ids, action, objectName, value = null, enableEditText = false) => {

    var alert = new bootstrap.Modal($(objectId + '-confirm-modal'));


    console.log('Confirming ' + action + ' of ' + ids.length + ' ' + objectName + (ids.length > 1 ? 's' : ''));

    $(alert._element).on('show.bs.modal', function () {
        $(objectId + '-confirm-modal .modal-body').text('Are you sure you want to ' + action + ' ' + ids.length + ' ' + objectName + (ids.length > 1 ? 's' : '') + '?');
        if (action == 'remove')$(objectId + '-confirm-modal .modal-body').append('<br><br><strong>Warning:</strong> This action cannot be undone.');
        if (action == 'disable')$(objectId + '-confirm-modal .modal-body').append('<br><br><strong>Attention:</strong> Disabling a record can take up to 5 minutes to become effective.');
        if (action == 'balance')$(objectId + '-confirm-modal .modal-body').text('Specify the amount to be added to user balance:');
        if (action == 'ban')$(objectId + '-confirm-modal .modal-body').append('<br><br>Specify the reason for banning:');
        if (value != null && enableEditText){
            $(objectId + '-confirm-modal .modal-body').append(  '<input type="text" class="form-control mt-4 mb-2" id="data" placeholder="' + 
                                                                action + 
                                                                '" value="' + 
                                                                value + 
                                                                '">');
        }

        // Clear the modal title and append the title
        $(objectId + '-confirm-modal .modal-title').empty();
        $(objectId + '-confirm-modal .modal-title').append('Confirm <i class="fa-solid fa-circle-question"></i> ');
    })
    alert.show();

    let result = await new Promise((resolve) => {
        $(objectId + '-confirm-modal .save-button').click(function () {
            value = $('#data').val();
            resolve({result : true, value : value});
        });
        $(objectId + '-confirm-modal .cancel-button').click(function () {
            resolve({result : false, value : value});
        });
        $(alert._element).on('hidden.bs.modal', function () {
            resolve({result : false, value : value});
        });
    });

    alert.hide();
    return result;

}

const initEditModal = async (objectId, row, objectName, newRow, columns) => {

    var edit = new bootstrap.Modal($(objectId + '-edit-modal'));

    $(edit._element).on('show.bs.modal', function () {

        // Clear the modal body and append the title
        $(objectId + '-edit-modal .modal-title').empty();
        $(objectId + '-edit-modal .modal-body').empty();

        $(objectId + '-edit-modal .modal-title').append('<i class="fa-solid fa-pen-to-square"></i>')
        $(objectId + '-edit-modal .modal-title').append(newRow ? ' Add new ' + objectName : ' Edit ' + objectName)

        // Create each input field
        for (var key in row) {
            if (row.hasOwnProperty(key)) {
                if (key == 'state'){continue}

                // Specific case for paid fields when payments module is disabled
                if (!activeModules.includes('payments') && (key == 'paid' || key == 'transactionid' || key == 'satoshi')) {
                    continue;
                }

                // remove 'null' string from the input field
                if (row[key] === null) {
                    row[key] = '';
                }

                var isCheckbox = false;
                columns.forEach(function(column) {
                    if (column.field == key && column.class && column.class.includes('formatCheckbox')) {
                        isCheckbox = true;
                    }
                });
                if (isCheckbox) {
                    $(objectId + '-edit-modal .modal-body')
                        .append('<div class="form-check form-switch mt-3 mb-2"><input type="checkbox" class="form-check-input" id="' + key + '" ' + (row[key] ? 'checked' : '') + '><label for="' + key + '" class="form-check-label strong">' + key + '</label></div>');
                } else {
                    $(objectId + '-edit-modal .modal-body')
                        .append('<label for="' + key + '" class="col-form-label strong">' + key + '</label><input type="text" class="form-control" id="' + key + '" placeholder="' + key + '" value="' + row[key] + '">');
                }
                if (key == 'id') {
                    $('#' + key).prop('disabled', true)
                }

                // Special case for editing or creating an user
                if (objectId == '#nostraddressData') {

                    let updatingFields = false;
                    
                    if (key == 'pubkey') {
                        document.querySelector("#pubkey").addEventListener("input", (data) => {
                            if (updatingFields) return;
                            updatingFields = true;
                        
                            const pubkeyField = document.querySelector("#pubkey");
                            const hexField = document.querySelector("#hex");
                        
                            let npubValue = pubkeyField.value;
                        
                            if (npubValue.length === 63) {
                                try {
                                    let decodedHex = NostrTools.nip19.decode(npubValue).data;
                                    hexField.value = decodedHex;
                                } catch (e) {
                                    hexField.value = '';
                                }
                            } else {
                                hexField.value = '';
                            }
                        
                            updatingFields = false;
                            checkFieldsMatch();
                        });
                    }
                    if (key == 'hex') {
                        document.querySelector("#hex").addEventListener("input", (data) => {
                            if (updatingFields) return;
                            updatingFields = true;
                        
                            const pubkeyField = document.querySelector("#pubkey");
                            const hexField = document.querySelector("#hex");
                        
                            let hexValue = hexField.value;
                        
                            if (hexValue.length === 64) {
                                try {
                                    let encodedNpub = NostrTools.nip19.npubEncode(hexValue);
                                    pubkeyField.value = encodedNpub;
                                } catch (e) {
                                    pubkeyField.value = '';
                                }
                            } else {
                                pubkeyField.value = '';
                            }
                        
                            updatingFields = false;
                            checkFieldsMatch();
                        });
                    }
                }

                // Special case for editting a nostr event
                if (objectId == '#eventsData') {
                    if (key == 'content') {               
                        const formattedContent = formatNostrContent(row[key]);
                        $('#' + key).replaceWith(
                            `<div class="markdown-preview" style="height:250px; overflow-y:auto; border:1px solid #ddd; padding:10px">${formattedContent}</div>`
                        );
                    }

                    if (key == 'tags') {
                        let tagsArray = row[key] ? row[key].split(', ') : [];
                        $('#' + key).replaceWith(
                            `<div class="tags-preview" style="border:1px solid #ddd; border-radius:2px; padding:10px; display: flex; flex-direction: column; align-items: flex-start;">` +
                            tagsArray.map(tag => `<span class="badge bg-secondary text-wrap mb-1 pt-2 pb-2" style="white-space: normal; max-width: 100%;">${tag}</span>`).join('') +
                            `</div>`
                        );
                    }
                }

                columns.forEach(function(column) {
                    if (column.field == key) {
                        if (column.class) {
                            var classes = column.class.split(' ');
                            classes.forEach(function(className) {
                                if (className == 'disabled') {
                                    $('#' + key).prop('disabled', true)
                                }
                            });
                        }
                    }
                });
            }
        }

    })

    $(edit._element).on('hide.bs.modal', function () {
        $(objectId + '-edit-modal .modal-body').empty();
        row = {}
    });

    edit.show();

    let result = await new Promise((resolve) => {
        $(objectId + '-edit-modal .save-button').click(function () {
            // Create a new row object and fill it with modal form inputs
            let editedRow = {}
            for (var key in row) {
                if (key == 'state'){continue}
                if (row.hasOwnProperty(key)) {
                    var isCheckbox = false;
                    // Search key in columns object 
                    columns.forEach(function(column) {
                        if (column.field == key && column.class && column.class.includes('formatCheckbox')) {
                            isCheckbox = true;
                        }
                    });
                    if (isCheckbox) {
                        let checkboxValue = $('#' + key).is(':checked') ? 1 : 0;
                        if (row[key] !== checkboxValue) {
                            editedRow[key] = checkboxValue;
                        }
                    } else {
                        if (row[key] != $('#' + key).val()) {
                            editedRow[key] = $('#' + key).val();
                        }
                    }
                }
            }
            resolve(editedRow);
        });
        $(objectId + '-edit-modal .cancel-button').click(function () {
            resolve(null);
        });
        $(objectId + '-edit-modal .btn-close').click(function () {
            resolve(null);
        });
    });

    edit.hide();
    return result;
}

const initAlertModal = async (objectId, message, timeout = 2000, alertClass = "alert-warning") => {

    var alert = new bootstrap.Modal($(objectId + '-alert-modal'));

    $(objectId + '-alert-modal .alert').addClass(alertClass);


    $(alert._element).on('show.bs.modal', function () {
        $(objectId + '-alert-modal .alert').empty();
        if (alertClass === "alert-warning") {
            $(objectId + '-alert-modal .alert').append('<i class="fa-solid fa-triangle-exclamation"></i> ');
        } 
        $(objectId + '-alert-modal .alert ').append(message)
    })
    alert.show();

    await new Promise((resolve) => {
        if (timeout > 0) {
            setTimeout(() => {
                alert.hide();
                resolve(true);
            }, timeout);
        }
        });

    alert.hide();
    $(objectId + '-alert-modal .alert').removeClass(alertClass);
}

const initMessageModal = async (objectId, message, title, modalSize = '') => {

    const modalDialog = $(objectId + '-message-modal .modal-dialog');
    
    if (modalSize) {
        modalDialog.removeClass('modal-sm modal-lg modal-xl');
        modalDialog.addClass(modalSize);
    }

    if (title) {
        $(objectId + '-message-modal .modal-header').removeClass('d-none');
    }

    var alert = new bootstrap.Modal($(objectId + '-message-modal'));

    $(alert._element).on('show.bs.modal', function () {
        $(objectId + '-message-modal .modal-body').empty();
        $(objectId + '-message-modal .modal-body').append(message);
        $(objectId + '-message-modal .modal-title').text(title);
    });
    
    alert.show();

    let result = await new Promise((resolve, reject) => {
        $(objectId + '-message-modal .btn-close').click(function () {
            resolve(true);
        });
    });

    alert.hide();
    return result;
};

const initPaymentModal = async (paymentRequest, satoshi, instance) => {

    var paymentModal = new bootstrap.Modal($(`#${instance}payment-modal`));
    
    $(`#${instance}payment-modal`).insertAfter($('body'));  
    $(`#${instance}payment-modal .modal-title`).text('Lightning invoice');

    $(`#${instance}payment-waiting`).show();
    $(`#${instance}payment-success`).hide();

    $(`#${instance}payment-request`).empty();
    $(`#${instance}payment-request`).text(paymentRequest);

    $(`#${instance}payment-amount`).show();
    $(`#${instance}payment-amount`).empty();
    $(`#${instance}payment-amount`).text('Invoice amount: ' + satoshi + ' satoshi');

    $(`#${instance}payment-link`).show();
    $(`#${instance}payment-link`).empty();
    $(`#${instance}payment-link`).append('<a href="lightning:' + paymentRequest + '" target="_blank" class="btn btn-secondary">Pay with Lightning<i class="bi bi-lightning-charge-fill ms-2 text-warning"></i></a>');

    $(`#${instance}payment-qr`).show();
    $(`#${instance}payment-qr`).empty();

    const qrContainer = document.getElementById(`${instance}payment-qr`);
    if (qrContainer) {
        new QRCode(qrContainer, {
            text: paymentRequest,
            width: 300,
            height: 300,
        });
    }
    qrContainer.style.width = '300px';
    qrContainer.style.margin = '0 auto';

    paymentModal.show();

    let stopProcessing = false;
    setInterval(() => {
        if (stopProcessing) return;
        fetch(`payments/invoices/${$(`#${instance}payment-request`).text()}`)
            .then(response => response.json())
            .then(data => {
                if (data.invoice.isPaid == true) {
                    console.log('Payment successful');
                    stopProcessing = true;
                    $(`#${instance}payment-preimage`).text(data.invoice.preimage);
                    $(`#${instance}payment-link`).hide();
                    $(`#${instance}payment-qr`).hide();
                    $(`#${instance}payment-amount`).hide();
                    $(`#${instance}payment-waiting`).hide();
                    $(`#${instance}payment-success`).show();
                }
            });
    }, 3000); 

    let result = await new Promise((resolve) => {
        $(paymentModal._element).on('hidden.bs.modal', function () {
            console.log($(`#${instance}payment-request`).text());
            if(stopProcessing) {
                resolve($(`#${instance}payment-preimage`).text());
            }else{
                stopProcessing = true;
                resolve('');
            }
        });
    });

    paymentModal.hide();
    return result;
}

const initUploaderModal = async () => {
    var uploader = new bootstrap.Modal($('#uploader-modal'));
    uploader.show();
}

const initMediaModal = async (filename, checked, visible, showButtons = true) => {

    var mediaModal = new bootstrap.Modal($('#media-modal'));

    MediaData = await loadMediaWithToken('/api/v2/media/' + filename).then(async data => {
        return data;
    });

    let contentType = MediaData.mimeType || '';

    $('#modalSwitch-checked').prop('checked', checked);
    $('#modalSwitch-checked').change(function() {
        checked = this.checked ? 1 : 0; 
    });

    $('#modalSwitch-visible').prop('checked', visible);
    $('#modalSwitch-visible').change(function() {
        visible = this.checked ? 1 : 0;
    });

    if (!showButtons) {
        $('#modalSwitch-footer').addClass('d-none');
    }else {
        $('#modalSwitch-footer').removeClass('d-none');
    }

    const mediaPreviewIframe = $('#mediapreview-iframe');
    const mediapreviewImg = $('#mediapreview-img');
    const mediaPreview3d = $('#mediapreview-3d');
    const fontPreview = $('#mediapreview-font');
    const yamlPreview = $('#mediapreview-yaml');

    mediapreviewImg.addClass('d-none');
    mediaPreviewIframe.addClass('d-none');
    mediaPreview3d.addClass('d-none');

    $(mediaModal._element).on('hidden.bs.modal', function () {
        mediaPreviewIframe.attr('src', '');
        mediaPreviewIframe.addClass('d-none');
        mediapreviewImg.attr('src', '');
        mediapreviewImg.addClass('d-none');
        mediaPreview3d.addClass('d-none');
        fontPreview.addClass('d-none');
        yamlPreview.addClass('d-none');

        contentType = '';
    });

    $('#media-modal').on('shown.bs.modal', function () {
        $('#modalSwitch-checked').focus();

        console.log("Content type: " + contentType);
        if (contentType.includes('image')) {
            mediapreviewImg.attr('src', MediaData.url);
            mediapreviewImg.removeClass('d-none');
        }else if(contentType.includes('model')) {
            init3dViewer('mediapreview-3d', 'media-modal-body', MediaData.url);
            mediaPreview3d.removeClass('d-none');
        } else if (contentType.includes('font') || contentType.includes('ttf') || contentType.includes('woff') || contentType.includes('eot')) {
            initFontViewer('mediapreview-font', MediaData.url);
            fontPreview.removeClass('d-none');
        } else if (contentType.includes('yaml') || contentType.includes('yml')) {
            initYamlViewer('mediapreview-yaml', MediaData.url);
            yamlPreview.removeClass('d-none');
        }else {
            if (contentType == '') {
                return;
            }
            mediaPreviewIframe.attr('src', MediaData.url);
            mediaPreviewIframe.removeClass('d-none');
        }

    });

    mediaModal.show();

    let result = await new Promise((resolve) => {
        $(mediaModal._element).on('hidden.bs.modal', function () {
            resolve({ "checked": checked, "visibility": visible }); 
        });
    });

    return { data: result };
}

async function loadMediaWithToken(url) {
    try{
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include'
        });
        const blob = await response.blob();
        return {url: URL.createObjectURL(blob), mimeType: blob.type};
    }
    catch (error) {
        console.error('Error:', error);
        return {url: '', mimeType: ''};
    }
}

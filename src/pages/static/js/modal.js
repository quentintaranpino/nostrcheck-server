// Why a ban exists, as a closed set. banCategories in interfaces/admin.ts is the
// source of truth and validates every request; this list has to mirror it, name
// for name, because modal.js is served static and can't read server locals. CSAM
// first because it is 93% of the bans this server has issued, so it is the
// shortest reach. The severity drives the colour so CSAM never reads like
// QUESTIONABLE, and SERVICE_ABUSE stays neutral because it is misuse of resources,
// not illegal content.
const banCategoryTags = [
    { name: 'CSAM',          severity: 'danger',    description: 'Child sexual abuse material' },
    { name: 'ILLEGAL',       severity: 'danger',    description: 'Otherwise illegal content' },
    { name: 'VIOLENCE',      severity: 'warning',   description: 'Graphic violence or gore' },
    { name: 'QUESTIONABLE',  severity: 'secondary', description: 'Borderline, kept out of the public listings' },
    { name: 'SERVICE_ABUSE', severity: 'secondary', description: 'Resource abuse: declared type that does not match the content, or the server used as hosting or a CDN' },
    { name: 'OTHER',         severity: 'secondary', description: 'Anything the categories above do not cover' },
];

const initConfirmModal = async (objectId, ids, action, objectName, value = null, enableEditText = false) => {

    var alert = new bootstrap.Modal($(objectId + '-confirm-modal'));
    const isBan = action == 'ban';
    // Marking objects as reported to an authority. Same dialog as the ban on
    // purpose: one prompt for the whole selection, because one filing covers
    // several objects and they all carry the same reference.
    const isReport = action == 'report';
    // One category per dialog, so a bulk ban asks once for the whole selection.
    let selectedCategory = '';

    // .off() first: this init runs on every open, stacking handlers otherwise.
    $(alert._element).off('show.bs.modal').on('show.bs.modal', function () {
        const body = $(objectId + '-confirm-modal .modal-body');
        const saveButton = $(objectId + '-confirm-modal .save-button');
        selectedCategory = '';

        body.text('Are you sure you want to ' + action + ' ' + ids.length + ' ' + objectName + (ids.length > 1 ? 's' : '') + '?');
        if (action == 'remove') body.append('<br><br><strong>Warning:</strong> This action cannot be undone.');
        if (action == 'disable') body.append('<br><br><strong>Attention:</strong> Disabling a record can take up to 5 minutes to become effective.');
        if (action == 'balance') body.text('Specify the amount to be added to user balance:');

        // A ban is categorised, not described. Typing the reason by hand is what
        // produced 32 spellings for five categories, so the category is a click
        // from a closed set and the comment is optional detail on top.
        if (isBan) {
            body.append('<br><br><strong>Category</strong> (required):');
            const tagRow = $('<div class="d-flex flex-wrap gap-2 mt-2 mb-1"></div>');
            for (const tag of banCategoryTags) {
                $('<button type="button" class="btn btn-sm btn-outline-' + tag.severity + ' ban-category-tag"></button>')
                    .attr('data-category', tag.name)
                    .attr('data-severity', tag.severity)
                    // What each category is for, so SERVICE_ABUSE doesn't have to be
                    // guessed from its name and OTHER stops being the default dump.
                    .attr('title', tag.description)
                    .text(tag.name)
                    .appendTo(tagRow);
            }
            body.append(tagRow);

            // Nothing to confirm until a category is picked: cheaper than an alert
            // after the fact, and it makes the requirement obvious.
            saveButton.prop('disabled', true);
            body.off('click', '.ban-category-tag').on('click', '.ban-category-tag', function () {
                const button = $(this);
                body.find('.ban-category-tag').each(function () {
                    const other = $(this);
                    other.removeClass('btn-' + other.attr('data-severity')).addClass('btn-outline-' + other.attr('data-severity'));
                });
                button.removeClass('btn-outline-' + button.attr('data-severity')).addClass('btn-' + button.attr('data-severity'));
                selectedCategory = button.attr('data-category');
                saveButton.prop('disabled', false);
            });
            body.append('<div class="mt-3">Comment (optional):</div>');
        } else if (isReport && value != null && enableEditText) {
            body.append('<br><br><strong>Report reference</strong> (required):');
            saveButton.prop('disabled', true);
        } else {
            // The button is shared across actions, so it has to be re-enabled.
            saveButton.prop('disabled', false);
        }

        if (value != null && enableEditText){
            body.append(  '<input type="text" class="form-control mt-2 mb-2" id="data" placeholder="' +
                                                                escapeHtml(isBan ? 'optional comment' : isReport ? 'Policía Nacional, denuncia 12345' : action) +
                                                                '" value="' +
                                                                escapeHtml(value) +
                                                                '">');
        }

        // A mark with no reference records nothing, so it gets the same gate the
        // category puts on a ban.
        if (isReport) {
            body.off('input', '#data').on('input', '#data', function () {
                saveButton.prop('disabled', $(this).val().trim() == '');
            });
        }

        // Clear the modal title and append the title
        $(objectId + '-confirm-modal .modal-title').empty();
        $(objectId + '-confirm-modal .modal-title').append('Confirm <i class="fa-solid fa-circle-question"></i> ');
    })
    alert.show();

    let result = await new Promise((resolve) => {
        $(objectId + '-confirm-modal .save-button').off('click').on('click', function () {
            value = $('#data').val();
            resolve({result : true, value : value, category : selectedCategory});
        });
        $(objectId + '-confirm-modal .cancel-button').off('click').on('click', function () {
            resolve({result : false, value : value, category : ''});
        });
        $(alert._element).off('hidden.bs.modal').on('hidden.bs.modal', function () {
            resolve({result : false, value : value, category : ''});
        });
    });

    alert.hide();
    return result;

}

const initEditModal = async (objectId, row, objectName, newRow, columns) => {

    var edit = new bootstrap.Modal($(objectId + '-edit-modal'));

    // .off() first: this init runs on every open, stacking handlers otherwise.
    $(edit._element).off('show.bs.modal').on('show.bs.modal', async function () {

        // Clear the modal body and append the title
        $(objectId + '-edit-modal .modal-title').empty();
        $(objectId + '-edit-modal .modal-body').empty();

        $(objectId + '-edit-modal .modal-title').append('<i class="fa-solid fa-pen-to-square"></i>')
        $(objectId + '-edit-modal .modal-title').append(newRow ? ' Add new ' + objectName : ' Edit ' + objectName)

        // Create each input field
        for (var key in row) {
            if (row.hasOwnProperty(key)) {
                if (key == 'state'){continue}

                // remove 'null' string from the input field
                if (row[key] === null) {
                    row[key] = '';
                }

                // Check if the field is a checkbox
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
                        .append('<label for="' + key + '" class="col-form-label strong">' + key + '</label><input type="text" class="form-control" id="' + key + '" placeholder="' + key + '" value="' + escapeHtml(row[key]) + '">');
                }
                if (key == 'id') {
                    $('#' + key).prop('disabled', true)
                }

                // Comments field
                if (key == 'comments') {               
                    const formattedContent = formatNostrContent(row[key]);
                    $('#' + key).replaceWith(
                        `
                         <textarea class="form-control" id="${key}" placeholder="${key}" style="height:150px;">${escapeHtml(row[key] || '')}</textarea>`
                    );
                }

                 // Specific case for paid fields when payments module is disabled
                if (!activeModules.some(mod => mod.name === 'payments') && (key == 'paid' || key == 'transactionid' || key == 'satoshi' || key == 'balance')) {
                    $('#' + key).prop('disabled', true).addClass('d-none');
                }

                // Special case for editing or creating an user
                if (objectId == '#registeredData') {

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
                        });
                    }
                    if (key == 'domain') {
                        const response = await fetch('/api/v2/domains');

                        if (!response.ok)  return;
                        const data = await response.json();
                        if (!data.availableDomains || typeof data.availableDomains !== 'object')   return;
                        const domains = Object.keys(data.availableDomains);
                        const domainSelect = document.createElement('select');
                        domainSelect.classList.add('form-select');
                        domainSelect.id = 'domain';
                        domainSelect.name = 'domain';
                        domainSelect.required = true;
                        domainSelect.innerHTML = domains.map(domain =>
                            `<option value="${escapeHtml(domain)}">${escapeHtml(domain)}</option>`
                        ).join('');
                        
                        document.querySelector("#domain").replaceWith(domainSelect);
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
                            tagsArray.map(tag => `<span class="badge bg-secondary text-wrap mb-1 pt-2 pb-2" style="white-space: normal; max-width: 100%;">${escapeHtml(tag)}</span>`).join('') +
                            `</div>`
                        );
                    }
                }

                // Special case for editting or creating invites
                if (objectId === '#invitesData' && key === 'originid') {

                    const domainsResponse = await fetch('/api/v2/domains');
                    if (!domainsResponse.ok)  throw new Error('Error fetching domains');
                    const domainsData = await domainsResponse.json();
                    const availableDomains = Object.keys(domainsData.availableDomains);

                    // Para cada dominio, obtenemos los usuarios
                    let allUsers = [];
                    for (const domain of availableDomains) {
                        const usersResponse = await fetch(`/api/v2/domains/${domain}/users`);
                        if (usersResponse.ok) {
                        const usersData = await usersResponse.json();
                        allUsers = allUsers.concat(usersData[domain].map(user => {
                            return {
                            id: user.id,
                            username: user.username,
                            domain: domain
                            };
                        }));
                        }
                    }

                    const usersSelect = document.createElement('select');
                    usersSelect.classList.add('form-select');
                    usersSelect.id = 'originid';
                    usersSelect.name = 'originid';
                    usersSelect.required = true;
                    usersSelect.innerHTML = allUsers.map(user =>
                        `<option value="${escapeHtml(user.id)}">${escapeHtml(user.username)} (${escapeHtml(user.domain)})</option>`
                    ).join('');

                    document.querySelector("#originid").replaceWith(usersSelect);
                
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

    $(edit._element).off('hide.bs.modal').on('hide.bs.modal', function () {
        $(objectId + '-edit-modal .modal-body').empty();
        row = {}
    });

    edit.show();

    let result = await new Promise((resolve) => {
        $(objectId + '-edit-modal .save-button').off('click').on('click', function () {
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
        $(objectId + '-edit-modal .cancel-button').off('click').on('click', function () {
            resolve(null);
        });
        $(objectId + '-edit-modal .btn-close').off('click').on('click', function () {
            resolve(null);
        });
    });

    edit.hide();
    return result;
}

const initAlertModal = async (objectId, message, timeout = 2000, alertClass = "alert-warning") => {

    var alert = new bootstrap.Modal($(objectId + '-alert-modal'));

    $(objectId + '-alert-modal .alert').addClass(alertClass);


    $(alert._element).off('show.bs.modal').on('show.bs.modal', function () {
        $(objectId + '-alert-modal .alert').empty();
        if (alertClass === "alert-warning") {
            $(objectId + '-alert-modal .alert').append('<i class="fa-solid fa-triangle-exclamation"></i> ');
        }
        // Text node: callers pass server messages and raw Error objects here,
        // never markup — appending as HTML was an XSS sink.
        $(objectId + '-alert-modal .alert ').append(document.createTextNode(String(message)))
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

    $(alert._element).off('show.bs.modal').on('show.bs.modal', function () {
        $(objectId + '-message-modal .modal-body').empty();
        $(objectId + '-message-modal .modal-body').append(message);
        $(objectId + '-message-modal .modal-title').text(title);
    });

    alert.show();

    let result = await new Promise((resolve, reject) => {
        $(objectId + '-message-modal .btn-close').off('click').on('click', function () {
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
    // Keep the id so the poll dies with the modal: without clearInterval it
    // kept firing (or idling) forever after close.
    const pollId = setInterval(() => {
        if (stopProcessing) return;
        fetch(`payments/invoices/${$(`#${instance}payment-request`).text()}`)
            .then(response => response.json())
            .then(data => {
                if (data.invoice.isPaid == true) {
                    stopProcessing = true;
                    clearInterval(pollId);
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
        $(paymentModal._element).off('hidden.bs.modal').on('hidden.bs.modal', function () {
            clearInterval(pollId);
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

const initMediaModal = async (filename, checked, visible, showButtons = true, fileInfo = null, nav = null) => {

    var mediaModal = new bootstrap.Modal($('#media-modal'));

    // When `nav` is provided ({rows, index, loadMore?}) the modal becomes a
    // triage tool: arrow keys move through the rows, Space toggles checked,
    // V toggles visibility, and toggles persist via /admin/updaterecord.
    // `loadMore(currentLen)` is an optional async callback that returns more
    // rows so the user can browse beyond the table's current page (for
    // 100k+ datasets we paginate behind the scenes). Without `nav` the modal
    // keeps the legacy behaviour (return checked/visibility on close).
    let navRows = nav && Array.isArray(nav.rows) ? nav.rows.slice() : null;
    let navIndex = navRows && typeof nav.index === 'number' ? nav.index : -1;
    let navLoadMore = nav && typeof nav.loadMore === 'function' ? nav.loadMore : null;
    // onPersist(row, field, value, previous) lets the caller mirror the change in
    // whatever it is showing behind the modal; onBan(row) delegates the ban to the
    // caller, which owns its own confirmation dialog and its reason prompt.
    const navOnPersist = nav && typeof nav.onPersist === 'function' ? nav.onPersist : null;
    const navOnBan = nav && typeof nav.onBan === 'function' ? nav.onBan : null;
    let navLoading = false;
    let navExhausted = !navLoadMore;
    // Sliding window: never hold more than NAV_WINDOW_MAX rows in memory.
    // When we exceed it and the user has navigated past NAV_WINDOW_TRIM rows,
    // drop the oldest NAV_WINDOW_TRIM and adjust the index. Trade-off: at the
    // top of the window you can't ↑ further (the rows are gone), but the
    // browser stays under control on 400k-row datasets.
    const NAV_WINDOW_MAX = 2000;
    const NAV_WINDOW_TRIM = 1000;
    let curFilename = filename;
    let curChecked = checked;
    let curVisible = visible;
    // nsfw isn't a modal parameter (that would mean touching every call site),
    // it travels inside the row / fileInfo the caller already passes.
    let curNsfw = fileInfo && fileInfo.nsfw != null ? Number(fileInfo.nsfw) : 0;
    // Same story as nsfw: active travels inside the row the caller passes.
    let curActive = fileInfo && fileInfo.active != null ? Number(fileInfo.active) : 1;
    let curFileInfo = fileInfo;
    let curRow = navRows && navIndex >= 0 ? navRows[navIndex] : null;

    const navPrev = $('#media-modal-nav-prev');
    const navNext = $('#media-modal-nav-next');
    const navPos = $('#media-modal-nav-pos');
    if (navRows) {
        navPrev.removeClass('d-none');
        navNext.removeClass('d-none');
        navPos.removeClass('d-none');
    } else {
        navPrev.addClass('d-none');
        navNext.addClass('d-none');
        navPos.addClass('d-none');
    }

    $('#modalSwitch-checked').prop('checked', checked == '1' || checked === 1);
    $('#modalSwitch-visible').prop('checked', visible == '1' || visible === 1 || visible === true);
    $('#modalSwitch-nsfw').prop('checked', curNsfw === 1);
    $('#modalSwitch-active').prop('checked', curActive === 1);

    if (!showButtons) {
        $('#modalSwitch-footer').addClass('d-none');
    } else {
        $('#modalSwitch-footer').removeClass('d-none');
    }

    // Ban needs somewhere to ask for the reason, and that dialog belongs to
    // whoever opened the modal. No callback, no button.
    const banButton = $('#modalButton-ban');
    if (navOnBan) {
        banButton.removeClass('d-none');
    } else {
        banButton.addClass('d-none');
    }

    // Switches: when in nav mode, persist via admin endpoint; otherwise
    // just track local state to be returned on close.
    $('#modalSwitch-checked').off('change').on('change', function () {
        const next = this.checked ? 1 : 0;
        if (navRows && curRow?.id != null) {
            persistField('checked', next);
        } else {
            curChecked = next;
        }
    });
    $('#modalSwitch-visible').off('change').on('change', function () {
        const next = this.checked ? 1 : 0;
        if (navRows && curRow?.id != null) {
            persistField('visibility', next);
        } else {
            curVisible = next;
        }
    });
    $('#modalSwitch-nsfw').off('change').on('change', function () {
        const next = this.checked ? 1 : 0;
        if (navRows && curRow?.id != null) {
            persistField('nsfw', next);
        } else {
            curNsfw = next;
        }
    });
    $('#modalSwitch-active').off('change').on('change', function () {
        const next = this.checked ? 1 : 0;
        if (navRows && curRow?.id != null) {
            persistField('active', next);
        } else {
            curActive = next;
        }
    });

    // Ban is not a switch: it needs a reason, so it goes back to whoever opened
    // the modal and reuses their confirmation dialog.
    banButton.off('click').on('click', async function () {
        if (!navOnBan || !curRow || curRow.id == null) return;
        const banned = await navOnBan(curRow);
        if (banned === true) {
            curRow.banned = 1;
            syncSwitches();
        }
    });

    const syncSwitches = () => {
        $('#modalSwitch-checked').prop('checked', curChecked == 1 || curChecked === '1');
        $('#modalSwitch-visible').prop('checked', curVisible == 1 || curVisible === '1' || curVisible === true);
        $('#modalSwitch-nsfw').prop('checked', curNsfw === 1);
        $('#modalSwitch-active').prop('checked', curActive === 1);
    };

    function persistField(field, value) {
        if (!curRow || curRow.id == null) return;
        const id = curRow.id;
        // Everything the modal writes goes through the batch endpoint with a
        // single id. One path for the four actions instead of two, and the same
        // path the cards use: same validation, same audit row with actor and
        // source admin, and nsfw keeps writing nsfw + checked in one statement.
        const previous = field === 'nsfw'
                            ? { nsfw: Number(curNsfw) || 0, checked: Number(curChecked) || 0 }
                            : { [field]: Number(field === 'checked' ? curChecked : field === 'visibility' ? curVisible : curActive) || 0 };
        $.ajax({
            url: '/api/v2/admin/bulkmoderate',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ table: 'filesData', ids: [id], field: field, value: String(value) }),
            success: function () {
                if (field === 'checked') { curChecked = value; curRow.checked = value; }
                if (field === 'visibility') { curVisible = value; curRow.visibility = value; }
                if (field === 'active') { curActive = value; curRow.active = value; }
                if (field === 'nsfw') {
                    curNsfw = value;
                    curRow.nsfw = value;
                    // The server sets checked with it, keep the other switch honest.
                    curChecked = 1;
                    curRow.checked = 1;
                    $('#modalSwitch-checked').prop('checked', true);
                }
                // Tell the opener so what is behind the modal matches the database.
                if (navOnPersist) {
                    try { navOnPersist(curRow, field, value, previous); } catch (e) { console.error('media modal - onPersist failed', e); }
                }
                if (typeof refreshTable === 'function') {
                    try { refreshTable('#filesData'); } catch (e) { /* table may not exist on this page */ }
                }
            },
            error: function (err) {
                console.error(`Error updating ${field}`, err);
                syncSwitches();
                if (typeof showMessage === 'function') showMessage(`Could not update ${escapeHtml(field)}`, 'alert-danger');
            }
        });
    }

    function trimNavWindow() {
        if (!navRows) return;
        if (navRows.length <= NAV_WINDOW_MAX) return;
        if (navIndex < NAV_WINDOW_TRIM) return; // user still close to the head
        navRows.splice(0, NAV_WINDOW_TRIM);
        navIndex -= NAV_WINDOW_TRIM;
    }

    async function ensureNavBuffer() {
        // Pull more rows from the backend when we're getting close to the
        // tail of the cached array. Bails out cleanly when the loader returns
        // an empty page (or errors out).
        if (!navLoadMore || navLoading || navExhausted) return;
        if (navIndex < navRows.length - 5) return;
        navLoading = true;
        updateNavPos();
        try {
            const more = await navLoadMore(navRows.length);
            if (Array.isArray(more) && more.length > 0) {
                navRows.push(...more);
                trimNavWindow();
            } else {
                navExhausted = true;
            }
        } catch (e) {
            console.error('media-modal nav loadMore failed', e);
            navExhausted = true;
        } finally {
            navLoading = false;
            updateNavPos();
        }
    }

    async function navigate(delta) {
        if (!navRows) return;
        const next = navIndex + delta;
        if (next < 0) return;
        if (next >= navRows.length) {
            await ensureNavBuffer();
            if (next >= navRows.length) return; // truly at the end
        }
        navIndex = next;
        curRow = navRows[navIndex];
        // Re-derive params from the new row
        const url = curRow.url || '';
        curFilename = url ? url.substring(url.lastIndexOf('/') + 1) : (curRow.filename || '');
        curChecked = curRow.checked ?? curChecked;
        curVisible = curRow.visibility ?? curVisible;
        curNsfw = curRow.nsfw != null ? Number(curRow.nsfw) : 0;
        curActive = curRow.active != null ? Number(curRow.active) : 1;
        curFileInfo = curRow;
        renderFile();
        // Background prefetch so the next ↓ is instant.
        ensureNavBuffer();
    }

    function onKeydown(e) {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigate(-1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigate(1);
        } else if (e.code === 'Space') {
            e.preventDefault();
            const cb = document.getElementById('modalSwitch-checked');
            if (cb) { cb.checked = !cb.checked; $(cb).trigger('change'); }
        } else if (e.key === 'v' || e.key === 'V') {
            e.preventDefault();
            const cb = document.getElementById('modalSwitch-visible');
            if (cb) { cb.checked = !cb.checked; $(cb).trigger('change'); }
        } else if (e.key === 'n' || e.key === 'N') {
            e.preventDefault();
            const cb = document.getElementById('modalSwitch-nsfw');
            if (cb) { cb.checked = !cb.checked; $(cb).trigger('change'); }
        } else if (e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            const cb = document.getElementById('modalSwitch-active');
            if (cb) { cb.checked = !cb.checked; $(cb).trigger('change'); }
        } else if (e.key === 'b' || e.key === 'B') {
            // Ban still asks for a reason: the dialog is the confirmation.
            e.preventDefault();
            banButton.trigger('click');
        }
    }

    const mediaPreviewIframe = $('#mediapreview-iframe');
    const mediapreviewImg = $('#mediapreview-img');
    const mediaPreviewVideo = $('#mediapreview-video');
    const mediaPreviewAudio = $('#mediapreview-audio');
    const mediaPreview3d = $('#mediapreview-3d');
    const fontPreview = $('#mediapreview-font');
    const yamlPreview = $('#mediapreview-yaml');
    const downloadWrapper = $('#mediapreview-download');

    const infoPanel = $('#media-info');
    const infoRows = $('#media-info-rows');

    // loadMediaWithToken hands us a `blob:` URL on every fetch. Without
    // revoking the previous one, browsing 1000 files in a triage session
    // leaks 1000 blobs into browser memory until the tab is closed.
    let lastBlobUrl = null;
    function releaseLastBlob() {
        if (lastBlobUrl) {
            try { URL.revokeObjectURL(lastBlobUrl); } catch (e) { /* ignore */ }
            lastBlobUrl = null;
        }
    }

    // Dropping the src attribute and calling load() is what actually aborts an
    // in-flight media transfer; setting src="" leaves the element pointing at the
    // page URL and keeps the connection. With 954 MB videos in the backlog,
    // stepping through files with the arrows has to release the previous one or a
    // triage session ends up holding hundreds of megabytes per file visited.
    function releaseMediaElement($element) {
        const element = $element.get(0);
        if (!element) return;
        try {
            element.pause();
        } catch (e) {
            // Not a media element or already gone.
        }
        if (element.getAttribute && element.getAttribute('src')) {
            element.removeAttribute('src');
            try { element.load(); } catch (e) { /* nothing buffered to drop */ }
        }
    }

    function resetPreviews() {
        mediaPreviewIframe.attr('src', '').addClass('d-none');
        mediapreviewImg.attr('src', '').addClass('d-none');
        releaseMediaElement(mediaPreviewVideo);
        releaseMediaElement(mediaPreviewAudio);
        mediaPreviewVideo.addClass('d-none');
        mediaPreviewAudio.addClass('d-none');
        mediaPreview3d.addClass('d-none');
        fontPreview.addClass('d-none');
        yamlPreview.addClass('d-none');
        downloadWrapper.addClass('d-none');
        infoPanel.addClass('d-none');
        infoRows.empty();
        releaseLastBlob();
    }

    // In nav (admin triage) mode the info panel starts collapsed so the
    // preview gets the spotlight; an "Expand details" button below the
    // preview opens it. In regular File-details mode it shows inline.
    const infoToggleBtn = $('#media-info-toggle');
    const infoToggleLabel = $('#media-info-toggle-label');
    let navInfoVisible = !navRows;
    if (navRows) {
        infoToggleBtn.removeClass('d-none');
        infoToggleLabel.text('Expand details');
        infoToggleBtn.off('click').on('click', () => {
            navInfoVisible = !navInfoVisible;
            infoToggleLabel.text(navInfoVisible ? 'Collapse details' : 'Expand details');
            renderInfoPanel(curFileInfo);
        });
    } else {
        infoToggleBtn.addClass('d-none');
    }

    function renderInfoPanel(info) {
        infoRows.empty();
        infoPanel.addClass('d-none');
        if (!info) return;
        if (navRows && !navInfoVisible) return; // collapsed in triage mode
        const tagVal = (key) => {
            if (Array.isArray(info.tags)) {
                const t = info.tags.find(x => x[0] === key);
                return t ? t[1] : null;
            }
            return info[key] ?? null;
        };
        const sha = tagVal('ox') || tagVal('x') || tagVal('sha256')
            || info.sha256 || info.original_hash || info.hash;
        const mime = tagVal('m') || info.type || info.mimetype;
        const dim = tagVal('dim') || info.dim || info.dimensions;
        const blurhash = tagVal('blurhash') || info.blurhash;
        const pubkey = info.pubkey || tagVal('pubkey');
        const paymentRequest = tagVal('payment_request') || info.payment_request;
        const uploaded = info.created_at || info.uploaded || info.date;
        const sizeRaw = tagVal('size') || info.filesize || info.size;
        const sizeNum = Number(sizeRaw);

        const fmtSize = (b) => {
            const n = Number(b);
            if (!Number.isFinite(n) || n <= 0) return '';
            const units = ['B', 'KB', 'MB', 'GB'];
            let i = 0; let v = n;
            while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
            return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
        };
        const fmtDate = (v) => {
            if (v == null || v === '') return '';
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) {
                const ms = n < 1e11 ? n * 1000 : n;
                return new Date(ms).toLocaleString();
            }
            const d = new Date(v);
            return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
        };
        const truncate = (s, n) => (s && s.length > n) ? s.slice(0, n) + '…' : (s || '');
        const sizeDisplay = (Number.isFinite(sizeNum) && sizeNum > 0)
            ? fmtSize(sizeNum)
            : (typeof sizeRaw === 'string' && sizeRaw ? sizeRaw : '');

        // Every value below can come from Nostr event tags (attacker-controlled):
        // escape before interpolating into the info table.
        const rows = [
            sha && ['Hash', `<code class="user-select-all">${escapeHtml(sha)}</code>`],
            pubkey && ['Pubkey', `<code class="user-select-all">${escapeHtml(pubkey)}</code>`],
            mime && ['Type', escapeHtml(mime)],
            sizeDisplay && ['Size', escapeHtml(sizeDisplay)],
            dim && ['Dimensions', escapeHtml(dim)],
            uploaded && ['Uploaded', escapeHtml(fmtDate(uploaded))],
            blurhash && ['Blurhash', `<code>${escapeHtml(truncate(blurhash, 24))}</code>`],
            paymentRequest && ['Payment', `<code>${escapeHtml(truncate(paymentRequest, 32))}</code>`],
        ].filter(Boolean);

        if (rows.length > 0) {
            for (const [k, v] of rows) {
                infoRows.append(`<tr><td class="text-secondary pe-3" style="width: 35%;">${k}</td><td class="text-break">${v}</td></tr>`);
            }
            infoPanel.removeClass('d-none');
        }
    }

    async function loadPreview(name) {

        // Video and audio are pointed straight at the URL instead of being fetched
        // into a blob first. A blob has to arrive whole before anything plays, so a
        // 954 MB video means downloading 954 MB into memory to look at one frame;
        // a plain src streams it and honours Range, and the cookie goes with the
        // request just the same because it is same-origin. Everything else keeps
        // the blob path, which is also what tells us the real mimetype.
        const declaredMime = String(curFileInfo?.mimetype || curFileInfo?.type || '');
        if (declaredMime.startsWith('video/') || declaredMime.startsWith('audio/')) {
            const target = declaredMime.startsWith('video/') ? mediaPreviewVideo : mediaPreviewAudio;
            target.attr('src', '/api/v2/media/' + name).removeClass('d-none');
            return;
        }

        $('#media-loading').removeClass('d-none');
        const data = await loadMediaWithToken('/api/v2/media/' + name);
        $('#media-loading').addClass('d-none');
        // Track the new blob URL so we can revoke it before the next load.
        // resetPreviews() (called at the start of every renderFile) revokes
        // the previous one already; we just store the current.
        lastBlobUrl = data?.url || null;
        const ct = data.mimeType || '';
        if (ct.includes('image')) {
            mediapreviewImg.attr('src', data.url).removeClass('d-none');
        } else if (ct.includes('model')) {
            // Reveal the canvas before init: it needs non-zero dimensions to
            // size the WebGL context, otherwise it stays at 0x0 and only the
            // canvas background is visible.
            mediaPreview3d.removeClass('d-none');
            init3dViewer('mediapreview-3d', 'media-modal-body', data.url);
        } else if (ct.includes('font') || ct.includes('ttf') || ct.includes('woff') || ct.includes('eot')) {
            initFontViewer('mediapreview-font', data.url);
            fontPreview.removeClass('d-none');
        } else if (ct.includes('yaml') || ct.includes('yml')) {
            initYamlViewer('mediapreview-yaml', data.url);
            yamlPreview.removeClass('d-none');
        } else if (ct.includes('video')) {
            mediaPreviewVideo.attr('src', data.url).removeClass('d-none');
        } else if (ct.includes('audio')) {
            mediaPreviewAudio.attr('src', data.url).removeClass('d-none');
        } else if (ct.includes('pdf')) {
            mediaPreviewIframe.attr('src', data.url).removeClass('d-none');
        } else if (ct === '') {
            // nothing
        } else if (ct.includes('text') || ct.includes('application/json') || ct.includes('xml')) {
            mediaPreviewIframe.attr('src', data.url).removeClass('d-none');
        } else {
            $('#mediapreview-download-btn').attr('href', data.url);
            downloadWrapper.removeClass('d-none');
        }
    }

    function updateNavPos() {
        if (!navRows) return;
        const totalLabel = navExhausted ? String(navRows.length) : `${navRows.length}+`;
        const loadingMark = navLoading ? ' ⋯' : '';
        navPos.text(`${navIndex + 1} / ${totalLabel}${loadingMark}`);
        navPrev.prop('disabled', navIndex <= 0);
        navNext.prop('disabled', navExhausted && navIndex >= navRows.length - 1);
    }

    async function renderFile() {
        resetPreviews();
        renderInfoPanel(curFileInfo);
        syncSwitches();
        updateNavPos();
        if (curFilename) await loadPreview(curFilename);
    }

    if (navRows) {
        navPrev.off('click').on('click', () => navigate(-1));
        navNext.off('click').on('click', () => navigate(1));
    }

    $(mediaModal._element).off('hidden.bs.modal.gallery').on('hidden.bs.modal.gallery', function () {
        resetPreviews();
        document.removeEventListener('keydown', onKeydown);
    });

    $(mediaModal._element).off('shown.bs.modal.gallery').on('shown.bs.modal.gallery', function () {
        if (navRows) document.addEventListener('keydown', onKeydown);
        renderFile();
    });

    mediaModal.show();

    let result = await new Promise((resolve) => {
        $(mediaModal._element).one('hidden.bs.modal', function () {
            resolve({ checked: curChecked, visibility: curVisible });
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

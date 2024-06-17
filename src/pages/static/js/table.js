const initTable = async (tableId, url, objectName, dataKey, countField = "") => {
    return new Promise((resolve, reject) => {
        console.debug("Initializing table for", tableId, url, objectName);

    if (url == "") { // dummy data for table creation
        resolve();
        return;
    }
    
    let isFilterActive = false;
    $(tableId).bootstrapTable({
        url: url,
        ajaxOptions: {
            beforeSend:  function (xhr) {
              xhr.setRequestHeader('authorization', 'Bearer ' + localStorage.getItem('authkey'));
            },
            complete:  async function (xhr) {
                var response = xhr.responseJSON;
                if (response.authkey != null) {
                    storeAuthkey(response.authkey)
                    const dataCountTotal = await fetchTableCountData(dataKey, 'count', '')
                    const dataCountField = await fetchTableCountData(dataKey, 'count', countField)
                    if(countField){initDoughnutChart(tableId, countField.charAt(0).toUpperCase() + countField.slice(1) + ' ' + objectName + 's',{field: dataCountField.total, total:dataCountTotal.total}, countField, true, false)}
                    resolve()
                }
            }
          },
        sidePagination: "server",
        uniqueId: 'id',
        pagination: true,
        sortable: true,
        search: true,
        searchClearButton: true,
        pageSize: 10,
        toolbar: tableId + '-toolbar',
        resizable: true,
        clickToSelect: true,
        showRefresh: true,
        showColumns: true,
        idField: 'id',
        detailView: true,
        detailFormatter: "detailFormatter",
        buttons: initFilterButton(),
    })

    // Hide columns if hide is specified
    var columns = $(tableId).bootstrapTable('getOptions').columns[0];
    for (let column of columns) {
        if (column.class) {
            var classes = column.class.split(' ');
            classes.forEach(function(className) {
                if (className == 'hide') {
                    $(tableId).bootstrapTable('hideColumn', column.field);
                }
            });
        }
    }

    // Buttons logic
    $(tableId).on('check.bs.table uncheck.bs.table check-all.bs.table uncheck-all.bs.table', function () {
        $(tableId + '-button-disable').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        $(tableId + '-button-enable').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        $(tableId + '-button-show').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        $(tableId + '-button-hide').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        $(tableId + '-button-remove').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)

        if ($(tableId).bootstrapTable('getSelections').length == 1) {
            $(tableId + '-button-admin').prop('disabled', false)
            $(tableId + '-button-edit').prop('disabled', false)
            $(tableId + '-button-password').prop('disabled', false)
            $(tableId + '-button-pay').prop('disabled', false)
            $(tableId + '-button-balance').prop('disabled', false)
        }
        else {
            $(tableId + '-button-add').prop('disabled', false)
            $(tableId + '-button-admin').prop('disabled', true)
            $(tableId + '-button-edit').prop('disabled', true)
            $(tableId + '-button-password').prop('disabled', true)
            $(tableId + '-button-pay').prop('disabled', true)
            $(tableId + '-button-balance').prop('disabled', true)
        }
    })

    // Add button
    $(tableId + '-button-add').click(function () {

        // If tableid is mediaFiles execute the following funciton
        if (tableId === '#mediaData') {
            uploadMedia()
            return
        }

        // Deselect all rows
        $(tableId).bootstrapTable('uncheckAll')

        // Create an empty row with same columns as table
        var row = {}
        $(tableId).bootstrapTable('getOptions').columns[0].forEach(element => {
            if (element.field != 'state'){
                row[element.field] = ''
            }
        });
        var columns = $(tableId).bootstrapTable('getOptions').columns[0];
        initEditModal(tableId,row,objectName, true, columns).then(async (editedRow) => {
            if (editedRow) {
                response = await modifyRecord(tableId, null, null, null, 'insert', editedRow)
                storeAuthkey(response.authkey)
                $(tableId).bootstrapTable('uncheckAll')
                if (response.status != "error"){
                    if (tableId === '#nostraddressData'){
                       await initAlertModal(tableId, "New record added successfully. Username: " + row.username + ". A new password has been sent via DM 🥳", 1200,"alert-success");

                    }
                    await initAlertModal(tableId, "New record added successfully 🥳", 1200,"alert-success");
                }
            }
        });
    })

    // Admin, hide and show, enable and disable buttons
    initButton(tableId, '-button-admin', objectName, 'toggle admin permissions', 'allowed', null)
    initButton(tableId, '-button-hide', objectName, 'hide', 'visibility', 0)
    initButton(tableId, '-button-show', objectName, 'show', 'visibility', 1)
    initButton(tableId, '-button-disable', objectName, 'disable', 'active', 0)
    initButton(tableId, '-button-enable', objectName, 'enable', 'active', 1)
    initButton(tableId, '-button-remove', objectName, 'remove', '', null)
 
     // Edit button
     $(tableId + '-button-edit').click(function () {
        var row = $(tableId).bootstrapTable('getSelections')[0]
        var columns = $(tableId).bootstrapTable('getOptions').columns[0];
        initEditModal(tableId,row,objectName,false,columns).then(async (editedRow) => {
            if (editedRow) {
                for (let field in editedRow) {
                    if (editedRow[field] != row[field]){
                        storeAuthkey((await modifyRecord(tableId, row.id, field, editedRow[field], 'modify')).authkey)
                    }
                }
            }
        });
    })

    // Pasword button
    $(tableId + '-button-password').click(async function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
        })

        const modal = await initConfirmModal(tableId,ids,'send new generated password to ',objectName)
        if (modal.result == true) {
            console.debug("modal value", modal.value, "modal result", modal.result)

            let url = "admin/resetpassword/";

            let data = {
                pubkey: $(tableId).bootstrapTable('getSelections')[0].hex,
            };

            fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "authorization": "Bearer " + localStorage.getItem('authkey')
                },
                body: JSON.stringify(data)
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === "success") {
                    storeAuthkey(data.authkey)
                    initAlertModal(tableId, "New password for " + $(tableId).bootstrapTable('getSelections')[0].username + " has been sent via nostr DM successfully 🥳", 1200,"alert-success");
                }
                })
            .catch((error) => {
                initAlertModal(tableId, error)
                console.error(error);
            });
        }
    })

    // Pay button 
    $(tableId + '-button-pay').click(async function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
        })

        if ($(tableId).bootstrapTable('getSelections')[0].paid === 1) {
            initAlertModal(tableId, "Item already paid.", 1500,"alert-primary");
            return
        }
        const modal = await initConfirmModal(tableId,ids,'pay',objectName)
        if (modal.result == true) {
            let url = "payments/paytransaction/";

            let data = {
                transactionid: $(tableId).bootstrapTable('getSelections')[0].transactionid || $(tableId).bootstrapTable('getSelections')[0].id,
                satoshi: $(tableId).bootstrapTable('getSelections')[0].satoshi,

            };

            fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "authorization": "Bearer " + localStorage.getItem('authkey')
                },
                body: JSON.stringify(data)
            })
            .then(response => response.json())
            .then(data => {
                storeAuthkey(data.authkey)
                if (data.status === "success") {
                    initAlertModal(tableId, "Payment for item " + $(tableId).bootstrapTable('getSelections')[0].id + " has been processed successfully 🥳", 1200,"alert-success");
                    $(tableId).bootstrapTable('updateByUniqueId', {
                        id: ids[0],
                        row: {
                            paid: 1
                        }
                    });
                }else{
                    initAlertModal(tableId, data.message)
                }
                })
            .catch((error) => {
                initAlertModal(tableId, error)
                console.error(error);
            });
        }
    })

    // Balance button
    $(tableId + '-button-balance').click(async function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
        })

        const modal = await initConfirmModal(tableId,ids,'balance',objectName, '100')
        if (modal.result == true) {
            let url = "payments/addbalance/";

            let data = {
                id: $(tableId).bootstrapTable('getSelections')[0].id,
                amount: modal.value,
            };

            fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "authorization": "Bearer " + localStorage.getItem('authkey')
                },
                body: JSON.stringify(data)
            })
            .then(response => response.json())
            .then(data => {
                storeAuthkey(data.authkey)
                if (data.status === "success") {
                    initAlertModal(tableId, "Balance for " + $(tableId).bootstrapTable('getSelections')[0].username + " has been updated successfully 🥳", 1200,"alert-success");

                    $(tableId).bootstrapTable('updateByUniqueId', {
                        id: ids[0],
                        row: {
                            balance: data.message
                        }
                    });
                }else{
                    initAlertModal(tableId, data.message)
                }
                })
            .catch((error) => {
                initAlertModal(tableId, error)
                console.error(error);
            });
        }
    })
});
}


// Filter buttons
function initFilterButton () {
    return {
        btnFilterUnchecked: {
            text: 'Show unchecked records',
            icon: 'bi bi-bookmark-heart-fill',
            event: async function () {
                // dirty hack to force the filter to work
                if (isFilterActive) {
                    $(tableId).bootstrapTable('filterBy', {}); 
                    $(tableId).bootstrapTable('filterBy', {checked: [0]}); 
                    $(tableId).bootstrapTable('filterBy', {}); 
                } else {
                    $(tableId).bootstrapTable('filterBy', {checked: [0]});
                    $(tableId).bootstrapTable('filterBy', {}); 
                    $(tableId).bootstrapTable('filterBy', {checked: [0]}); 
                }
                isFilterActive = !isFilterActive; 
            },
            attributes: {
                title: 'Show only unchecked records',
                id: 'btnFilterUnchecked'
            }
        }
    }
}

function highlihtRow(tableId, row) {
    var index = $(tableId).bootstrapTable('getData').indexOf(row);
    var $row = $(tableId).find('tbody tr').eq(index);
    $row.removeClass('selected');
    $row.addClass('table-danger');
    setTimeout(function () {
        $row.removeClass('table-danger');
        $row.addClass('selected');
    }, 2000);
}

function initButton(tableId, buttonSuffix, objectName, modaltext, field, fieldValue) {
    $(tableId + buttonSuffix).click(async function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
            return row.id
        })

        const modal = await initConfirmModal(tableId, ids, modaltext, objectName)
        if (modal.result == true) {
            for (let id of ids) {
                if (modaltext === 'remove') {
                    storeAuthkey((await modifyRecord(tableId, id, field, fieldValue, 'remove')).authkey)
                } else {
                    storeAuthkey((await modifyRecord(tableId, id, field, fieldValue, 'modify')).authkey)
                }
            }
        }
    })
}

async function modifyRecord(tableId, id, field, fieldValue, action = 'modify', row = null){

    console.debug("modiyRecord", tableId, id, field, fieldValue, action, row)

    if(row === null) {row = $(tableId).bootstrapTable('getRowByUniqueId', id)};
    let url = "";
    if (action === 'modify') {url = "admin/updaterecord/"}
    if (action === 'remove') {url = "admin/deleterecord/"}
    if (action === 'insert') {url = "admin/insertrecord/"}

    if (field === "allowed") {
        fieldValue = $(tableId).bootstrapTable('getSelections')[0].allowed === 0 ? 1 : 0;
    }

    let data = {};
    if (action === 'remove' || action === 'modify') {
        
            data.table = tableId.split('-')[0].split('#')[1],
            data.field = field,
            data.value = fieldValue,
            data.id = row.id
        }
    
    if (action === 'insert') {
            data.table = tableId.split('-')[0].split('#')[1],
            data.row = row
    }

    return fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "authorization": "Bearer " + localStorage.getItem('authkey')
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(async responseData => {
        if (responseData.status === "success") {

            storeAuthkey(responseData.authkey)
            
            if (action === 'remove') {
                $(tableId).bootstrapTable('removeByUniqueId', id);
            } else if (action === 'insert') {
                 // Add returned id to the row
                 row.id = +responseData.message;
           
                 // add a new row with modal form inputs
                 $(tableId).bootstrapTable('insertRow', {
                    index: 0,
                    row: data.row
                });
              
            }else {
                let updateData = {};
                updateData[field] = responseData.message;
                $(tableId).bootstrapTable('updateByUniqueId', {
                    id: id,
                    row: updateData
                });
            }

            if (action != 'remove' && (tableId === '#nostraddressData' || tableId === '#lightningData')){
                await initAlertModal(tableId, "Action " + action + " completed successfully 🥳 Changes will not take effect after cache expires", 1600,"alert-success");
            }else{
                await initAlertModal(tableId, "Action " + action + " completed successfully 🥳", 1200,"alert-success");
            }
    
        } else {
            initAlertModal(tableId, responseData.message)
            highlihtRow(tableId, row)
            console.error(responseData);
        }
        return responseData;
        })
    .catch((error) => {
        console.error(error);
        initAlertModal(tableId, responseData.message)
    });
}

function detailFormatter(index, row) {
    var html = [];
    $.each(row, function (key, value) {
        if (key === 'state') { return; }
        html.push('<p><span class="key">' + key + ':</span> <span class="value">' + value + '</span></p>');
    });

    return `
        <div class="detail-container">
            ${html.join('')}
        </div>
    `;
}

// uploadMedia 

const uploadMedia = async () => {

    var input = $(document.createElement("input"));
    input.attr("type", "file");
    input.trigger("click");

    input.on("change", function (e) {
        var files = e.target.files;
        var data = new FormData();
        data.append("file", files[0]);
   
        fetch('media/', {
            method: "POST",
            headers: {
                "authorization": "Bearer " + localStorage.getItem('authkey')
            },
            body: data
        })
        .then(response => response.json())
        .then(data => {
            storeAuthkey(data.authkey)
            location.reload();
            })
        .catch((error) => {
            initAlertModal(tableId, error)
            console.error(error);
            return "";
        });
});

return ""
}


// Cell formatting functions
function formatCheckbox(value, row, index) {
    if (value === 1) {
      return '<div class="text-center"><i class="fas fa-check-circle purple-text"></i></div>';
    } else {
      return '<div class="text-center"><i class="fas fa-times-circle text-secondary"></i></div>';
    }
  }

function formatSatoshi(value, row, index) {
    return (value? value : "0") + ' <i class="fa-solid fa-bolt text-warning"></i>'
}

function formatPubkey(value, row, index) {
    return '<a href="https://nostrcheck.me/u/' + value + '" target="_blank">' + value + '</a>';
}

function formatFilename(value, row, index) {

    let modalFileCheck = '<div id="' + index + '_preview"><span class="cursor-zoom-in text-primary">' + value + '</span></div>';

    // Attach the click event handler to the document and delegate it to the clickable element
    $(document).off('click', '#' + index + '_preview').on('click', '#' + index + '_preview', async function() {
        let modal = await initMediaModal(row.pubkey, value, row.checked, row.visibility);
        let modalResult = modal.data;
        if(modal.authkey) {storeAuthkey(modal.authkey)};
        for (let field in modalResult) {
            if (modalResult[field] != row[field]){
                storeAuthkey((await modifyRecord('#mediaData', row.id, field, modalResult[field], 'modify')).authkey)
            }
        }
    });

    return modalFileCheck;
}

const refreshTables = async() => {
    console.debug("Starting to refresh tables", tables);

    for (const table of tables) {
        try {
            await refreshTable(table.tableId);
        } catch (error) {
            console.error(`Error refreshing table ${table}:`, error);
        }
    }
    console.debug("Finished refreshing all tables");
}

const refreshTable = async (table) => {
    console.debug(`Refreshing table ${table}`);
    return new Promise((resolve, reject) => {
        const $table = $("#" + table);

        // Obtener las selecciones antes de refrescar
        const tableSelections = $table.bootstrapTable('getSelections');
        console.log('Table selections before refresh:', tableSelections);

        // Escuchar el evento de éxito de carga
        $table.one('load-success.bs.table', function (e, data) {
            console.debug(`Load success for table ${table}`);
            console.log('Restoring selections:', tableSelections);

            // Restaurar las selecciones después de que la tabla se haya refrescado
            for (const selection of tableSelections) {
                $table.bootstrapTable('checkBy', { field: 'id', values: [selection.id] });
            }

            resolve(); 
        });

        // Escuchar el evento de error de carga
        $table.one('load-error.bs.table', function (e, status) {
            console.error(`Load error for table ${table}: ${status}`);
            reject(`Error loading data for table ${table}: ${status}`); 
        });

        // Refrescar la tabla
        $table.bootstrapTable('refresh');
    });
}

const fetchTableCountData = async (tableDataKey, action, field) => {
    console.debug("fetchTableCountData", tableDataKey, action)
    console.debug("Using authkey", localStorage.getItem('authkey'))

    let serverData  = ""

    await fetch(`admin/modulecountdata?module=${tableDataKey}&action=${action}&field=${field}`
        , {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authkey')}`,
            }}
        )
            .then(response => response.json())
            .then(data => {
                storeAuthkey(data.authkey)
                serverData = data;
            })
            .catch(error => console.error('Error:', error));

            return serverData || { total: 0 }

}

// Initialize tables
let tables = [
    { name: 'nostraddress', tableId: 'nostraddressData', dataKey: 'nostraddress', objectName: 'user', url: 'admin/moduledata?module=nostraddress', field: 'checked'},
    { name: 'media', tableId: 'mediaData', dataKey: 'media', objectName: 'media file', url: 'admin/moduledata?module=media', field: 'checked'},
    { name: 'lightning', tableId: 'lightningData', dataKey: 'lightning', objectName: 'lightning redirection', url: 'admin/moduledata?module=lightning'},
    { name: 'domains', tableId: 'domainsData', dataKey: 'domains', objectName: 'domain name', url: 'admin/moduledata?module=domains'},
    { name: 'payments', tableId: 'paymentsData', dataKey: 'payments', objectName: 'transaction', url: 'admin/moduledata?module=payments', field: 'paid'},
];
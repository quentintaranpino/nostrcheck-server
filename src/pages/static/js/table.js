let isFilterActive = {};

const initTable = async (tableId, datakey, objectName, dataKey, field = "") => {

    if (datakey == "") { // dummy data for table creation
        resolve();
        return;
    }

    $(tableId).bootstrapTable({
        url: 'admin/moduledata?module=' + datakey,
        ajax: function (params) {semaphore.execute(() => fetchTabledata(params))},
        idField: 'id',
        uniqueId: 'id',
        showFilterControlSwitch: true,
        filterControlVisible: false,
        sidePagination: "server",
        pagination: true,
        sortable: true,
        search: true,
        searchClearButton: true,
        pageSize: 5,
        toolbar: tableId + '-toolbar',
        resizable: true,
        clickToSelect: true,
        showRefresh: true,
        showColumns: true,
        detailView: true,
        mobileResponsive: true,
        minWidth: 768,
        checkOnInit: true,
        detailFormatter: "detailFormatter",
        rowStyle: rowStyle,
        queryParams: function (params) {
            let filters = params.filter ? JSON.parse(params.filter) : {};
            if (isFilterActive[tableId]) {
                filters.checked = "0";
            }
            params.filter = JSON.stringify(filters);
            return params;
        },
        buttons: (tableId === '#nostraddressData' || tableId === '#mediaData' ) ? checkedButton(tableId) : null,
    })

    // Hide columns function
    const hideShowColumns = (columns, className, action = "hideColumn") => {
        for (let column of columns) {
            if (column.class) {
                var classes = column.class.split(' ');
                classes.forEach(function(e) {
                    if (e == className) {
                        $(tableId).bootstrapTable(action, column.field);
                    }
                });
            }
        }
    }

    // Default columns to hide
    var columns = $(tableId).bootstrapTable('getOptions').columns[0];
    hideShowColumns(columns, 'hide', 'hideColumn');

    // Hide or show columns based on the screen size
    $(document).ready(function () {
        if ($(window).width() < 768) {
            hideShowColumns(columns, 'mobile-hide', 'hideColumn');
        }
    });
    $(window).resize(function () {
        if ($(window).width() < 768) {
            hideShowColumns(columns, 'mobile-hide', 'hideColumn');
        } else {
            hideShowColumns(columns, 'mobile-hide', 'showColumn');
        }
    });

    // Prevent refresh button spamming
    $(tableId).on('refresh.bs.table', function (e, data) {
        const refreshButton = $(tableId).closest('.bootstrap-table').find('[name="refresh"]');
        refreshButton.prop('disabled', true);
    })

    // Prevent sorting spamming
    $(tableId).on('sort.bs.table', function(e, name, order) {
        var sortingButtons = $(tableId).find('.sortable');
        sortingButtons.addClass('disabled');
        sortingButtons.css('pointer-events', 'none');
      });

    // Fill doughnut chart with table data
    semaphore.execute(async() => {
        const dataCount = await fetchTableCountData(dataKey, 'count', field);
        if(field){initDoughnutChart(tableId, field.charAt(0).toUpperCase() + field.slice(1) + ' ' + objectName + 's',{field: dataCount.field, total:dataCount.total}, field, true, true)}
    });

    // Buttons logic
    $(tableId).on('check.bs.table uncheck.bs.table check-all.bs.table uncheck-all.bs.table', function () {
        $(tableId + '-button-disable').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        $(tableId + '-button-enable').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        $(tableId + '-button-show').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        $(tableId + '-button-hide').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        $(tableId + '-button-remove').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        $(tableId + '-button-moderate').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        $(tableId + '-button-ban').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)

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

    // Buttons initialization
    initButton(tableId, '-button-admin',        objectName, 'toggle admin permissions', 'allowed', null)
    initButton(tableId, '-button-hide',         objectName, 'hide', 'visibility', 0)
    initButton(tableId, '-button-show',         objectName, 'show', 'visibility', 1)
    initButton(tableId, '-button-disable',      objectName, 'disable', 'active', 0)
    initButton(tableId, '-button-enable',       objectName, 'enable', 'active', 1)
    initButton(tableId, '-button-remove',       objectName, 'remove', '', null)
    initButton(tableId, '-button-edit',         objectName, 'edit', '', null)
    initButton(tableId, '-button-add',          objectName, 'add', '', null)
    initButton(tableId, '-button-password',     objectName, 'reset password', 'password', '')
    initButton(tableId, '-button-pay',          objectName, 'pay', 'paid', 1)
    initButton(tableId, '-button-balance',      objectName, 'balance', 'balance', 100, true)
    initButton(tableId, '-button-moderate',     objectName, 'moderate', 'checked', 1)
    initButton(tableId, '-button-ban',          objectName, 'ban', 'reason', '',  true)

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

function initButton(tableId, buttonSuffix, objectName, modaltext, field, fieldValue, enableEditText = false) {
    $(tableId + buttonSuffix).click(async function () {

        // Add button
        if (buttonSuffix === '-button-add') {
                    // If tableid is mediaFiles execute the following funciton
        if (tableId === '#mediaData') {
            semaphore.execute(async () => {
                await uploadButton();
                refreshTable('#mediaData');
            });
            return;
        }
            $(tableId).bootstrapTable('uncheckAll')
            var row = {}
            $(tableId).bootstrapTable('getOptions').columns[0].forEach(element => {
                if (element.field != 'state'){
                    row[element.field] = ''
                }
            });
            var columns = $(tableId).bootstrapTable('getOptions').columns[0];
            semaphore.execute(async () => {
                await initEditModal(tableId,row,objectName, true, columns).then(async (editedRow) => {
                    if (editedRow) {semaphore.execute(async () => { await modifyRecord("admin/insertrecord/",tableId, null, null, null, 'insert', editedRow)})};
                });
            });
            return
        }

        // Edit button
        if (buttonSuffix === '-button-edit') {
            var row = $(tableId).bootstrapTable('getSelections')[0]
            var columns = $(tableId).bootstrapTable('getOptions').columns[0];
            semaphore.execute(async () => await initEditModal(tableId,row,objectName,false,columns).then(async (editedRow) => {
                if (editedRow) {
                    for (let field in editedRow) {
                        if (editedRow[field] != row[field]){
                            semaphore.execute(async () => await modifyRecord("admin/updaterecord/", tableId, row.id, field, editedRow[field], 'modify'))                     
                        }
                    }
                }
            }));
            return
        }

        // Admin, hide and show, password, pay, balance, ban, enable, moderate and disable buttons
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
            return row.id
        })
        semaphore.execute(async () => {await initConfirmModal(tableId, ids, modaltext, objectName, fieldValue, enableEditText).then(async (modal) => {
            if (modal.result == true) {
                for (let id of ids) {
                    if (modaltext === 'remove') {
                        semaphore.execute(async () => await modifyRecord("admin/deleterecord/", tableId, id, field, fieldValue, 'remove'));
                    } else if (modaltext === 'reset password') {
                        semaphore.execute(async () => await modifyRecord("admin/resetpassword/", tableId, id, field, fieldValue, 'password'));
                    }else if (modaltext === 'pay') {
                        semaphore.execute(async () => await modifyRecord("payments/paytransaction/", tableId, id, field, fieldValue, 'pay'));
                    }else if (modaltext === 'balance') {
                        semaphore.execute(async () => await modifyRecord("payments/addbalance/", tableId, id, field, modal.value, 'balance'));
                    }else if (modaltext === 'ban') {
                        semaphore.execute(async () => await modifyRecord("admin/ban", tableId, id, field, modal.value, 'ban'));
                    }else if (modaltext === 'moderate') {
                        semaphore.execute(async () => await modifyRecord("admin/moderaterecord/", tableId, id, field, fieldValue, 'moderate'));
                    } else {
                        semaphore.execute(async () => await modifyRecord("admin/updaterecord/", tableId, id, field, fieldValue, 'modify'));
                        
                    }
                }
            }
        })});
    })
}

async function modifyRecord(url, tableId, id, field, fieldValue, action = 'modify', row = null){

    if(row === null) {row = $(tableId).bootstrapTable('getRowByUniqueId', id)};

    if (field === "allowed") {fieldValue = $(tableId).bootstrapTable('getSelections')[0].allowed === 0 ? 1 : 0;}

    let data = {};

    if (action === 'remove' || action === 'modify') {
        data.table = tableId.split('-')[0].split('#')[1],
        data.field = field,
        data.value = fieldValue,
        data.id = id
    }

    if (action === 'insert') {
        if (!row) {
            console.error('No row data to insert', row);
            return
        }
        data.table = tableId.split('-')[0].split('#')[1],
        data.row = row
        
    }

    if (action === 'password') {
        data = {pubkey: $(tableId).bootstrapTable('getSelections')[0].hex};
    }

    if (action === 'pay') {
        data = {
            transactionid: $(tableId).bootstrapTable('getSelections')[0].transactionid || $(tableId).bootstrapTable('getSelections')[0].id,
            satoshi: $(tableId).bootstrapTable('getSelections')[0].satoshi,
        };
    }

    if (action === 'balance') {
        data = {
            id: $(tableId).bootstrapTable('getSelections')[0].id,
            amount: fieldValue,
        };
    }

    if (action === 'ban') {
        data = {
            id: id,
            table: tableId.split('-')[0].split('#')[1],
            reason: fieldValue,
        };
    }

    if (action === 'moderate') {
        data = {
            id: id,
            filename : $(tableId).bootstrapTable('getRowByUniqueId', id).filename,
        };
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
        await storeAuthkey(responseData.authkey)
        if (responseData.status === "success") {
            if (action === 'remove') {
                $(tableId).bootstrapTable('removeByUniqueId', id);
            }else if (action === 'insert') {
                 row.id = +responseData.message;
                 console.log(row)
                 $(tableId).bootstrapTable('insertRow', {
                    index: 0,
                    row: data.row
                });
            }else if (action === 'modify' || action === 'pay' || action === 'balance'){
                let updateData = {};
                updateData[field] = responseData.message;
                $(tableId).bootstrapTable('updateByUniqueId', {
                    id: id,
                    row: updateData
                });
            }else if (action === 'moderate'){
                let updateData = {};
                updateData[field] = (responseData.message == "NA" || responseData.message =="safe") ? 1 : 0;
                $(tableId).bootstrapTable('updateByUniqueId', {
                    id: id,
                    row: updateData
                });
            }

            if (action === 'password'){
                showMessage(`New password for ${$(tableId).bootstrapTable('getSelections')[0].username} has been sent via nostr DM successfully 🥳`, "alert-success");
            }else if (action === 'balance'){
                showMessage(`Balance for ${$(tableId).bootstrapTable('getSelections')[0].username} has been updated successfully 🥳`, "alert-success");
            }else if (action === 'ban'){
                showMessage(`Record ${id} from table ${tableId} has been banned successfully 🥳`, "alert-success");
            }else{
                showMessage(`Action ${action} completed successfully for id ${id}. 🥳`, "alert-success");
            }

            refreshTable(tableId);

        } else {
            initAlertModal(tableId, responseData.message);
            await highlihtRow(tableId, row);
            console.error(responseData);
        }

        })
    .catch((error) => {
        console.error(error);
        initAlertModal(tableId, error);
    });
}



// Cell formatting functions
function formatCheckbox(value, row, index) {
    if (value === 1) {
      return '<div class="text-center"><i class="fas fa-check-circle purple-text"></i></div>';
    } else if (value === 0) {
      return '<div class="text-center"><i class="fas fa-times-circle text-secondary"></i></div>';
    }
    return '';
  }

function formatSatoshi(value, row, index) {
    return (value? value : "0") + ' <i class="fa-solid fa-bolt text-warning"></i>'
}

function formatPubkey(value) {

    let textValue = value;
    if ($(window).width() < 768) {textValue = value.slice(0, (value.length / 2)-18 ) + ':' + value.slice((value.length / 2)+18 );}
    return '<a href="https://nostrcheck.me/u/' + value + '" target="_blank" class="link-secondary text-decoration-none">' +  textValue + '</a>';
}

function formatPaymentHash(value) {

    let textValue = value;
    if ($(window).width() < 768) {textValue = value.slice(0, (value.length / 2)-18 ) + ':' + value.slice((value.length / 2)+18 );}
    return textValue;

}

function formatMediaFile(value, row, index) {

    let textValue = value;
    if ($(window).width() < 768) {
        textValue = value.slice(0, (value.length / 2) - 20) + ':' + value.slice((value.length / 2) + 20);
    }

    // If value is not a filename exit the function
    if (!value || value.indexOf('.') === -1) {
        return textValue;
    }

    let modalFileCheck = '<div id="media_' + index + '_preview"><span class="cursor-zoom-in text-secondary">' + textValue + '</span></div>';

    // Attach the click event handler to the document and delegate it to the clickable element
    $(document).off('click', '#media_' + index + '_preview').on('click', '#media_' + index + '_preview', async function () {
        semaphore.execute(async () => {
            await initMediaModal(row.pubkey + "/" + value, row.checked, row.visibility, true).then(async (modal) => {
                let modalResult = modal.data;
                for (let field in modalResult) {
                    if (modalResult[field] != row[field]) {
                        semaphore.execute(async () => await modifyRecord("admin/updaterecord/", '#mediaData', row.id, field, modalResult[field], 'modify'));
                        refreshTable('#mediaData');
                    }
                }
            })
        });
    });

    return modalFileCheck;
}

function formatBannedFile(value, row, index) {

    let textValue = value;
    if ($(window).width() < 768) {
        textValue = value.slice(0, (value.length / 2) - 20) + ':' + value.slice((value.length / 2) + 20);
    }

    // If value is not a filename exit the function
    if (!value || value.indexOf('.') === -1) {
        return textValue;
    }

    let modalFileCheck = '<div id="banned_' + index + '_preview"><span class="cursor-zoom-in text-secondary">' + textValue + '</span></div>';

    // Attach the click event handler to the document and delegate it to the clickable element
    $(document).off('click', '#banned_' + index + '_preview').on('click', '#banned_' + index + '_preview', async function () {
        semaphore.execute(async () => {
            await initMediaModal(value, row.checked, row.visibility, false).then(async (modal) => {
                let modalResult = modal.data;
                for (let field in modalResult) {
                    if (modalResult[field] != row[field]) {
                        semaphore.execute(async () => await modifyRecord("admin/updaterecord/", '#mediaData', row.id, field, modalResult[field], 'modify'));
                        refreshTable('#mediaData');
                    }
                }
            })
        });
    });

    return modalFileCheck;
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

// Fetch and refresh tables
const refreshTables = async() => {
    for (const table of tables) {
        if (activeModules.includes(table.dataKey)) {
            try {
                await refreshTable(table.tableId);
                semaphore.execute(async() => {
                    const dataCount = await fetchTableCountData(table.dataKey, 'count', table.field);
                    if(table.field){initDoughnutChart(table.tableId, table.field.charAt(0).toUpperCase() + table.field.slice(1) + ' ' + table.objectName + 's',{field: dataCount.field, total:dataCount.total}, table.field, true, false)}
                });

            } catch (error) {
                console.error(`Error refreshing table ${table}:`, error);
            }
        }
    }
}

const refreshTable = async (table) => {
    return new Promise((resolve, reject) => {
        const $table = table.startsWith('#') ? $(table) : $(`#${table}`);
        const tableSelections = $table.bootstrapTable('getSelections');

        $table.one('load-success.bs.table', function (e, data) {
            for (const selection of tableSelections) {
                $table.bootstrapTable('checkBy', { field: 'id', values: [selection.id] });
            }
            resolve();
        });

        $table.one('load-error.bs.table', function (e, status) {
            console.error(`Load error for table ${table}: ${status}`);
            reject(`Error loading data for table ${table}: ${status}`);
        });

        $table.bootstrapTable('refresh');

    });
}

function fetchTabledata(params) {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: params.url,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authkey')}`,
            },
            data: params.data,
            dataType: 'json',
            success: async function(result) {
                await storeAuthkey(result.authkey);
                params.success(result);
                resolve(params);
            },
            error: function(err) {
                params.error(err);
                reject(err);
            }
        });
    });
}

const fetchTableCountData = async (tableDataKey, action, field) => {
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

 // Checked button
 const checkedButton = (tableId) => {
    return {
        custom: {
            text: 'checked',
            icon: 'bi-check-circle-fill',
            event: () => {
                if (isFilterActive[tableId]) {
                    $(tableId).bootstrapTable('filterBy', {});
                    isFilterActive[tableId] = false;
                    $(tableId).bootstrapTable('refresh');
                } else {
                    $(tableId).bootstrapTable('filterBy', {
                        checked: 0
                    });
                    isFilterActive[tableId] = true;
                    $(tableId).bootstrapTable('refresh');
                }
            },
            attributes: {
                title: 'Show checked',
                id: 'customShowChecked',
                'data-toggle': 'tooltip'
            }
        }
    }
};

// Dynamic row styling
const rowStyle = (row, index) =>{

    // Banned row
    if (row.banned === 1) {
        return {
            classes: 'banned-row'
        };
    }
    return {};
}

// Initialize tables
let tables = [
    { name: 'nostraddress', tableId: 'nostraddressData', dataKey: 'nostraddress', objectName: 'user', field: 'checked'},
    { name: 'media', tableId: 'mediaData', dataKey: 'media', objectName: 'file',field: 'checked'},
    { name: 'lightning', tableId: 'lightningData', dataKey: 'lightning', objectName: 'lightning redirection', url: 'admin/moduledata?module=lightning'},
    { name: 'domains', tableId: 'domainsData', dataKey: 'domains', objectName: 'domain name', url: 'admin/moduledata?module=domains'},
    { name: 'payments', tableId: 'paymentsData', dataKey: 'payments', objectName: 'transaction', url: 'admin/moduledata?module=payments', field: 'paid'},
    { name: 'banned', tableId: 'bannedData', dataKey: 'banned', objectName: 'banned object', url: 'admin/moduledata?module=banned'},
    { name: 'invites', tableId: 'invitesData', dataKey: 'register', objectName: 'invitation', url: 'admin/moduledata?module=invites'},
];

setInterval(async() => {
    const value = semaphore.getQueueLength() > 0 ? true : false;
    for (const table of tables) {
        const refreshButton = $('#' + table.tableId).closest('.bootstrap-table').find('[name="refresh"]');
        refreshButton.prop('disabled', value);

        var sortingButtons = $('#' + table.tableId).find('.sortable');
        if (value) {
            sortingButtons.addClass('disabled');
            sortingButtons.css('pointer-events', 'none');
        } else {
            sortingButtons.removeClass('disabled');
            sortingButtons.css('pointer-events', 'auto');
        }
    }
}, 500);
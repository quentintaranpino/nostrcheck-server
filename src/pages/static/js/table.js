const initTable = (tableId, data, objectName, authkey) => {
    console.log('Initializing table:', tableId)

    var data = JSON.parse(data)
    if (data.length == 0) {data = [{id: '-'}]} // dummy data for table creation

    $(tableId).bootstrapTable({
        data: data,
        uniqueId: 'id',
        pagination: true,
        search: true,
        searchClearButton: true,
        pageSize: 10,
        toolbar: tableId + '-toolbar',
        resizable: true,
        clickToSelect: true,
        showColumns: true,
        idField: 'id',
        detailView: true,
        detailFormatter: "detailFormatter",
        dataSidePagination: "server",
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
        }
        else {
            $(tableId + '-button-add').prop('disabled', false)
            $(tableId + '-button-admin').prop('disabled', true)
            $(tableId + '-button-edit').prop('disabled', true)
            $(tableId + '-button-password').prop('disabled', true)
        }
    })

    // Add button
    $(tableId + '-button-add').click(function () {

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
        initEditModal(tableId,row,objectName, true, columns).then((editedRow) => {
            if (editedRow) {
                // add a new row with modal form inputs
                $(tableId).bootstrapTable('insertRow', {
                    index: 0,
                    row: editedRow
                });
                $(tableId).bootstrapTable('uncheckAll')

            }
        });

        // TODO FETCH DATA TO SERVER
        // TODO GET NEW ID FROM SERVER
    }
    )

    // Admin, hide and show, enable and disable buttons
    initButton(tableId, '-button-admin', objectName, 'toggle admin permissions', 'allowed', authkey, null)
    initButton(tableId, '-button-hide', objectName, 'hide', 'visibility', authkey, 0)
    initButton(tableId, '-button-show', objectName, 'show', 'visibility', authkey, 1)
    initButton(tableId, '-button-disable', objectName, 'disable', 'active', authkey, 0)
    initButton(tableId, '-button-enable', objectName, 'enable', 'active', authkey, 1)
 
     // Edit button
     $(tableId + '-button-edit').click(function () {
        // Get row data
        var row = $(tableId).bootstrapTable('getSelections')[0]
        var columns = $(tableId).bootstrapTable('getOptions').columns[0];
        initEditModal(tableId,row,objectName,false,columns).then((editedRow) => {
            if (editedRow) {

                // For each field in editedRow execute updateField(tableId, row.id, field, fieldValue, authkey)
                for (let field in editedRow) {

                    // If field has been edited
                    if (editedRow[field] != row[field]){
                        console.log(field, editedRow[field], row[field])
                        updateField(tableId, row.id, field, editedRow[field], authkey)
                    }
                }
            }
        });
    })

    // Remove button
    $(tableId + '-button-remove').click(async function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
        })

        if (await initConfirmModal(tableId,ids,'remove',objectName)) {
            // Remove rows from table
            $(tableId).bootstrapTable('remove', {
                field: 'id',
                values: ids
            })
            $(tableId + '-button-remove').prop('disabled', true)
        }

        // TODO FETCH DATA TO SERVER

    })

    // Pasword button
    $(tableId + '-button-password').click(async function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
        })

        if (await initConfirmModal(tableId,ids,'send new generated password to ',objectName)) {

            let url = "admin/resetpassword/";

            let data = {
                pubkey: $(tableId).bootstrapTable('getSelections')[0].hex,
            };

            fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "authorization": authkey
                },
                body: JSON.stringify(data)
            })
            .then(response => response.json())
            .then(data => console.log(data))
            .catch((error) => {
                initAlertModal(tableId, error)
                console.error(error);
            });
        }
    })

}

function detailFormatter(index, row) {
var html = []
html.push('<div class="container-fluid ps-4">')
html.push('<h3><b>Details:</b></h3>')
$.each(row, function (key, value) {
    html.push('<p><b>' + key + ':</b> ' + value + '</p>')
})
html.push('</div>')
return html.join('')
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

function initButton(tableId, buttonSuffix, objectName, modaltext, field, authkey, fieldValue) {
    $(tableId + buttonSuffix).click(async function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
            return row.id
        })

        if (await initConfirmModal(tableId, ids, modaltext, objectName)) {
            for (let id of ids) {
            updateField(tableId, id, field, fieldValue, authkey)
            }
        }
    })
}

function updateField(tableId, id, field, fieldValue, authkey){

    let row = $(tableId).bootstrapTable('getRowByUniqueId', id);
    let url = "admin/updaterecord/"

    if (field === "allowed") {
        fieldValue = $(tableId).bootstrapTable('getSelections')[0].allowed === 0 ? 1 : 0;
    }

    let data = {
        table: tableId.split('-')[0].split('#')[1],
        field: field,
        value: fieldValue,
        id: row.id,
    }
    
    fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "authorization": authkey
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(responseData => {

        if (responseData.status == "success") {
            let updateData = {};
            updateData[field] = responseData.message; // Use bracket notation here
            $(tableId).bootstrapTable('updateByUniqueId', {
                id: id,
                row: updateData
            });
        } else {
            initAlertModal(tableId, responseData.message)
            highlihtRow(tableId, row)
        }
        })
    .catch((error) => {
        console.error(error);
        initAlertModal(tableId, responseData.message)
    });
}
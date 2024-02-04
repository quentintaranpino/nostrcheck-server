const initTable = (tableId, data, objectName, authkey) => {
    console.log('Initializing table:', tableId)
    console.log('Data:', data)

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

        initEditModal(tableId,row,objectName, true).then((editedRow) => {
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

    // Disable button
    $(tableId + '-button-disable').click(async function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
        })

        if (await initConfirmModal(tableId,ids,'disable',objectName)) {

            // Update active field from row id to reverse value
            for (let id of ids) {
                $(tableId).bootstrapTable('updateByUniqueId', {
                    id: id,
                    row: {
                        active: 0,
                        visibility: 0
                    }
                });
            }
        }

        // TODO FETCH DATA TO SERVER
    })

    // Enable button
    $(tableId + '-button-enable').click(async function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
        })

        if (await initConfirmModal(tableId,ids,'enable',objectName)) {

            // Update active field from row id to reverse value
            for (let id of ids) {
                $(tableId).bootstrapTable('updateByUniqueId', {
                    id: id,
                    row: {
                        active: 1,
                        visibility: 1
                    }
                });
            }
        }

        // TODO FETCH DATA TO SERVER
    })

    // Show button
    $(tableId + '-button-show').click(async function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
        })

        if (await initConfirmModal(tableId,ids,'show',objectName)) {

            // Update active field from row id to reverse value
            for (let id of ids) {
                $(tableId).bootstrapTable('updateByUniqueId', {
                    id: id,
                    row: {
                        visibility: 1
                    }
                });
            }
        }

        // TODO FETCH DATA TO SERVER
    }
    )

    // Hide button
    $(tableId + '-button-hide').click(async function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
        })

        if (await initConfirmModal(tableId,ids,'hide',objectName)) {

            // Update active field from row id to reverse value
            for (let id of ids) {
                $(tableId).bootstrapTable('updateByUniqueId', {
                    id: id,
                    row: {
                        visibility: 0
                    }
                });
            }
        }

        // TODO FETCH DATA TO SERVER
    }
    )

    // Admin button
    $(tableId + '-button-admin').click(async function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
        })

        if (await initConfirmModal(tableId,ids,'toggle admin',objectName)) {

            // Update active field from row id to reverse value
            for (let id of ids) {
                let row = $(tableId).bootstrapTable('getRowByUniqueId', id);
                let allowed = row.allowed === 0 ? 1 : 0;
                $(tableId).bootstrapTable('updateByUniqueId', {
                    id: id,
                    row: {
                        allowed: allowed
                    }
                });
            }
        }

        // TODO FECHT DATA TO SERVER

    })

     // Edit button
     $(tableId + '-button-edit').click(function () {
        // Get row data
        var row = $(tableId).bootstrapTable('getSelections')[0]
        var columns = $(tableId).bootstrapTable('getOptions').columns[0];
        initEditModal(tableId,row,objectName,false,columns).then((editedRow) => {
            if (editedRow) {
                // Update rows with modal form inputs
                $(tableId).bootstrapTable('updateByUniqueId', {
                    id: row.id,
                    row: editedRow
                });
            }
        });

        // TODO FETCH DATA TO SERVER
        
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
                console.error('Error:', error);
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
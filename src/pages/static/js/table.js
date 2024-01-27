const initTable = (tableId, data) => {
    console.log('Initializing table:', tableId)
    console.log('Data:', data)

    var data = JSON.parse(data)
    if (data.length == 0) {data = [{id: '-'}]} // dummy data for table creation
    var arr = []
    data.forEach(element => {
        if(element.date) element.date = dateFormat(element.date)
        arr.push(element)});

    $(tableId).bootstrapTable({
        data: arr,
        pagination: true,
        search: true,
        searchClearButton: true,
        pageSize: 10,
        toolbar: tableId + '-toolbar',
        resizable: true,
        clickToSelect: true,
        showColumns: true,
        idField: 'id',
    })

    // Buttons logic
    $(tableId).on('check.bs.table uncheck.bs.table check-all.bs.table uncheck-all.bs.table', function () {
        $(tableId + '-button-remove').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        $(tableId + '-button-disable').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        if ($(tableId).bootstrapTable('getSelections').length == 1) {
            $(tableId + '-button-edit').prop('disabled', false)
        }
        else {
            $(tableId + '-button-edit').prop('disabled', true)
        }
    })

    // Remove button
    $(tableId + '-button-remove').click(function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
        })

        $(tableId).bootstrapTable('remove', {
            field: 'id',
            values: ids
            //PUT HERE DELETE FETCH TO SERVER
        })

        $(tableId + '-button-remove').prop('disabled', true)
    })

    // Edit button
    $(tableId + '-button-edit').click(function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        // return row.id
        console.log(row.id)
        })

        // Get row data
        var row = $(tableId).bootstrapTable('getSelections')[0]

        // Fill modal with all row data inside a loop
        for (var key in row) {
        if (row.hasOwnProperty(key)) {
            $(tableId + '-' + key).val(row[key])
        }
        }

        // TODO FECHT DATA TO SERVER

    })
}

function dateFormat(value) {
  return new Date(value).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
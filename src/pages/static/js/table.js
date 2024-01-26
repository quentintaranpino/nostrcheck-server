const initTable = (tableId, data) => {

    console.log('Initializing table:', tableId)

    var arr = []
    var data = JSON.parse(data)
    if (data.length == 0) {
        console.log('No data')
        data = [{id: '-'}] // dummy data for table creation
    }
    data.forEach(element => {
        arr.push(element)
    });

    $(tableId).bootstrapTable({
        data: arr,
        pagination: true,
        search: true,
        pageSize: 10,
        toolbar: tableId + '-toolbar',
        resizable: true,
        clickToSelect: true,
        showColumns: true,
        idField: 'id',
        }
        )

    // Remove button
    $(tableId).on('check.bs.table uncheck.bs.table check-all.bs.table uncheck-all.bs.table', function () {
    $(tableId + '-remove').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
    })
    $(tableId + '-remove').click(function () {
    var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
    })

    $(tableId).bootstrapTable('remove', {
        field: 'id',
        values: ids
    })
    $(tableId + '-remove').prop('disabled', true)
    })
}

function dateFormat(value) {
  return new Date(value).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
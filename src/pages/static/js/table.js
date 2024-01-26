const initTable = (tableId, data) => {

    console.log('Initializing table:', tableId)

    var arr = []
    var data = JSON.parse(data)
    data.forEach(element => {
        arr.push(element)
    });
    // $(tableId).bootstrapTable({data: arr})

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

    // data-show-columns="true" X
    // data-search="true" X
    // data-pagination="true" X
    // data-resizable="true" X
    // data-page-size="10" X
    // data-click-to-select="true" X
    // data-remember-order="true"
    // data-id-field="id"
    // data-toolbar="#regUsersTable-toolbar"

    
    // remove button
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



// var $table = $('#regUsersTable')
// var $remove = $('#regUsersTable-remove')

}

function dateFormat(value) {
  return new Date(value).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
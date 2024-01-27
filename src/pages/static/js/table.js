const initTable = (tableId, data) => {
    console.log('Initializing table:', tableId)

    var data = JSON.parse(data)
    if (data.length == 0) {data = [{id: '-'}]} // dummy data for table creation
    var arr = []
    data.forEach(element => {arr.push(element)});

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
        $(tableId + '-remove').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        $(tableId + '-disable').prop('disabled', !$(tableId).bootstrapTable('getSelections').length)
        if ($(tableId).bootstrapTable('getSelections').length == 1) {
            $(tableId + '-edit').prop('disabled', false)
        }
        else {
            $(tableId + '-edit').prop('disabled', true)
        }
    })

    // Remove button
    $(tableId + '-remove').click(function () {
        var ids = $.map($(tableId).bootstrapTable('getSelections'), function (row) {
        return row.id
        })

        $(tableId).bootstrapTable('remove', {
            field: 'id',
            values: ids
            //PUT HERE DELETE FETCH TO SERVER
        })

        $(tableId + '-remove').prop('disabled', true)
    })
}

function dateFormat(value) {
  return new Date(value).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

$(function() {
    //Take the data from the TR during the event button
    $('regUsersTable').on('click', 'button.regUsersTable-edit',function (ele) {
        //the <tr> variable is use to set the parentNode from "ele
        var tr = ele.target.parentNode.parentNode;

        //I get the value from the cells (td) using the parentNode (var tr)
        var id = tr.cells[0].textContent;
        var firstName = tr.cells[1].textContent;
        var surname = tr.cells[2].textContent;
        var email = tr.cells[3].textContent;
        var phone = tr.cells[4].textContent;
        var level = tr.cells[5].textContent;

        //Prefill the fields with the gathered information
        $('h5.modal-title').html('Edit Admin Data: '+firstName);
        $('#editName').val(firstName);
        $('#editSurname').val(surname);
        $('#editEmail').val(email);
        $('#editPhone').val(phone);
        $('#editId').val(id);
        $("#editLevel").val(level).attr('selected', 'selected');

        //If you need to update the form data and change the button link
        $("form#ModalForm").attr('action', window.location.href+'/update/'+id);
        $("a#saveModalButton").attr('href', window.location.href+'/update/'+id);
    });
});

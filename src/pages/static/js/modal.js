const initConfirmModal = async (tableId, ids, action, objectName) => {
    var alert = new bootstrap.Modal($(tableId + '-message-modal'));

    $(alert._element).on('show.bs.modal', function () {
        $(tableId + '-message-modal .modal-body').text('Are you sure you want to ' + action + ' ' + ids.length + ' ' + objectName + (ids.length > 1 ? 's' : '') + '?');
        $(tableId + '-message-modal .modal-title').text('Confirm')
    })
    alert.show();

    let result = await new Promise((resolve, reject) => {
        $(tableId + '-message-modal .save-button').click(function () {
            resolve(true);
        });
        $(tableId + '-message-modal .cancel-button').click(function () {
            resolve(false);
        });
    });

    alert.hide();
    return result;

}

const initEditModal = async (tableId, row, objectName, newRow, columns) => {

    var edit = new bootstrap.Modal($(tableId + '-edit-modal'));

    $(edit._element).on('show.bs.modal', function () {

        $(tableId + '-edit-modal .modal-title').text(newRow ? 'Add new ' + objectName : 'Edit ' + objectName)

        // Create each input field
        for (var key in row) {
            if (row.hasOwnProperty(key)) {
                if (key == 'state'){continue}
                $(tableId + '-edit-modal .modal-body')
                        .append('<label for="' + key + '" class="col-form-label strong">' + key + '</label><input type="text" class="form-control" id="' + key + '" placeholder="' + key + '" value="' + row[key] + '">')
            
                if (key == 'id') {
                    $('#' + key).prop('disabled', true)
                }
                // Search key in columns object 
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

        // Fill modal with all row data inside a loop
        for (var key in row) {
            if (row.hasOwnProperty(key)) {
                $('#' + key).val(row[key])
            }
        }
    })

    $(edit._element).on('hide.bs.modal', function () {
        // Remove all input fields
        $(tableId + '-edit-modal .modal-body').empty();

        // Remove row data
        row = {}
    });

    edit.show();

    let result = await new Promise((resolve) => {
        $(tableId + '-edit-modal .save-button').click(function () {
            // Create a new row object and fill it with modal form inputs
            let editedRow = {}
            for (var key in row) {
                if (key == 'state'){continue}
                if (row.hasOwnProperty(key)) {
                    editedRow[key] = $('#' + key).val()
                }
            }
            resolve(editedRow);
        });
        $(tableId + '-edit-modal .cancel-button').click(function () {
            resolve(null);
        });
    });

    edit.hide();
    return result;

}

const initAlertModal = async (tableId, message) => {
    var alert = new bootstrap.Modal($(tableId + '-alert-modal'));

    $(alert._element).on('show.bs.modal', function () {
        $(tableId + '-alert-modal .alert ').text(message)
    })
    alert.show();

    await new Promise((resolve) => {
        $(tableId + '-alert-modal .save-button').click(function () {
            resolve(true);
        });
        // wait 3 seconds before closing
        setTimeout(() => {
            resolve(true);
        }, 3000);
    });

    alert.hide();
}
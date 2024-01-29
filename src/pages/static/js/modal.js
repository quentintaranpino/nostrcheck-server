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

const initEditModal = async (tableId, row, objectName, newRow) => {
    var edit = new bootstrap.Modal($(tableId + '-edit-modal'));

    $(edit._element).on('show.bs.modal', function () {

        $(tableId + '-edit-modal .modal-title').text(newRow ? 'Add new ' + objectName : 'Edit ' + objectName)

        // Create each input field
        for (var key in row) {
            if (row.hasOwnProperty(key)) {
                $(tableId + '-edit-modal .modal-body')
                        .append('<label for="' + key + '" class="col-form-label">' + key + '</label><input type="text" class="form-control" id="' + key + '" placeholder="' + key + '" value="' + row[key] + '">')
            
            if (newRow && key == 'id') {
                $('#' + key).prop('disabled', true)
            }

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
            // Update row values from modal form inputs
            for (var key in row) {
                if (row.hasOwnProperty(key)) {
                    row[key] = $('#' + key).val()
                }
            }
            resolve(row);
        });
        $(tableId + '-edit-modal .cancel-button').click(function () {
            resolve(null);
        });
    });

    edit.hide();
    return result;

}
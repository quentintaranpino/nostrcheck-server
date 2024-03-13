const initConfirmModal = async (objectId, ids, action, objectName) => {
    var alert = new bootstrap.Modal($(objectId + '-confirm-modal'));

    $(alert._element).on('show.bs.modal', function () {
        $(objectId + '-confirm-modal .modal-body').text('Are you sure you want to ' + action + ' ' + ids.length + ' ' + objectName + (ids.length > 1 ? 's' : '') + '?');
        if (action == 'remove')$(objectId + '-confirm-modal .modal-body').append('<br><br><strong>Warning:</strong> This action cannot be undone.');
        if (action == 'disable')$(objectId + '-confirm-modal .modal-body').append('<br><br><strong>Attention:</strong> Disabling a record can take up to 5 minutes to become effective.');
        $(objectId + '-confirm-modal .modal-title').text('Confirm')
    })
    alert.show();

    let result = await new Promise((resolve) => {
        $(objectId + '-confirm-modal .save-button').click(function () {
            resolve(true);
        });
        $(objectId + '-confirm-modal .cancel-button').click(function () {
            resolve(false);
        });
    });

    alert.hide();
    return result;

}

const initEditModal = async (objectId, row, objectName, newRow, columns) => {

    var edit = new bootstrap.Modal($(objectId + '-edit-modal'));

    $(edit._element).on('show.bs.modal', function () {

        $(objectId + '-edit-modal .modal-title').text(newRow ? 'Add new ' + objectName : 'Edit ' + objectName)

        // Create each input field
        for (var key in row) {
            if (row.hasOwnProperty(key)) {
                if (key == 'state'){continue}

                // Extract the link text if the value is a link
                let keyValue = "";
                if (typeof row[key] === 'string' && row[key].startsWith('<')) {
                    row[key] = $(row[key]).text();
                } else {
                    keyValue = row[key];
                }

                var isCheckbox = false;
                columns.forEach(function(column) {
                    if (column.field == key && column.class && column.class.includes('checkbox')) {
                        isCheckbox = true;
                    }
                });
                if (isCheckbox) {
                    $(objectId + '-edit-modal .modal-body')
                        .append('<div class="form-check form-switch mt-3 mb-2"><input type="checkbox" class="form-check-input" id="' + key + '" ' + (row[key] ? 'checked' : '') + '><label for="' + key + '" class="form-check-label strong">' + key + '</label></div>');
                } else {
                    $(objectId + '-edit-modal .modal-body')
                        .append('<label for="' + key + '" class="col-form-label strong">' + key + '</label><input type="text" class="form-control" id="' + key + '" placeholder="' + key + '" value="' + row[key] + '">');
                }
                if (key == 'id') {
                    $('#' + key).prop('disabled', true)
                }
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

    })

    $(edit._element).on('hide.bs.modal', function () {
        $(objectId + '-edit-modal .modal-body').empty();
        row = {}
    });

    edit.show();

    let result = await new Promise((resolve) => {
        $(objectId + '-edit-modal .save-button').click(function () {
            // Create a new row object and fill it with modal form inputs
            let editedRow = {}
            for (var key in row) {
                if (key == 'state'){continue}
                if (row.hasOwnProperty(key)) {
                    var isCheckbox = false;
                    // Search key in columns object 
                    columns.forEach(function(column) {
                        if (column.field == key && column.class && column.class.includes('checkbox')) {
                            isCheckbox = true;
                        }
                    });
                    if (row[key] != $('#' + key).val()) {
                        if (isCheckbox) {
                            editedRow[key] = $('#' + key).is(':checked') ? 1 : 0; 
                        } else {
                            editedRow[key] = $('#' + key).val();
                        }
                    }
                }
            }
            resolve(editedRow);
        });
        $(objectId + '-edit-modal .cancel-button').click(function () {
            resolve(null);
        });
    });

    edit.hide();
    return result;
}

const initAlertModal = async (objectId, message, timeout = 3000, alertClass = "alert-warning") => {

    var alert = new bootstrap.Modal($(objectId + '-alert-modal'));

    $(objectId + '-alert-modal .alert').addClass(alertClass);

    $(alert._element).on('show.bs.modal', function () {
        $(objectId + '-alert-modal .alert').empty();
        if (alertClass === "alert-warning") {
            $(objectId + '-alert-modal .alert').append('<i class="fa-solid fa-triangle-exclamation"></i> ');
        } 
        $(objectId + '-alert-modal .alert ').append(message)
    })
    alert.show();

    await new Promise((resolve) => {
        if (timeout > 0) {
            setTimeout(() => {
                alert.hide();
                resolve(true);
            }, timeout);
        }
        });

    alert.hide();
}

const initMessageModal = async (objectId, message, title) => {
    var alert = new bootstrap.Modal($(objectId + '-message-modal'));

    $(alert._element).on('show.bs.modal', function () {
        $(objectId + '-message-modal .modal-body').append(message);
        $(objectId + '-message-modal .modal-title').text(title)
    })
    alert.show();

    let result = await new Promise((resolve, reject) => {
        $(objectId + '-message-modal .btn-close').click(function () {
            resolve(true);
        });
    });

    alert.hide();
    return result;

}

const initMediaModal = async (pubkey, filename, checked, visible) => {

    var mediaModal = new bootstrap.Modal($('#media-modal'));

    $('#modalSwitch-checked').prop('checked', checked);
    $('#modalSwitch-checked').change(function() {
        checked = this.checked ? 1 : 0; 
    });

    $('#modalSwitch-visible').prop('checked', visible);
    $('#modalSwitch-visible').change(function() {
        visible = this.checked ? 1 : 0;
    });

    if (['.mp4', '.webm', '.mov'].some(ext => filename.endsWith(ext))) {
        $('#media-modal .mediapreview-video').attr('src', 'media/' + pubkey + '/' + filename);
        $('#media-modal .mediapreview-video source').attr('src', 'media/' + pubkey + '/' + filename);
        $('#media-modal .mediapreview-video').removeClass('d-none');
        $('#media-modal .mediapreview-video')[0].play();
    } else if (['.webp', '.png', '.jpg', '.jpeg', '.gif'].some(ext => filename.endsWith(ext))) {
        $('#media-modal .mediapreview-image').attr('src', 'media/' + pubkey + '/' + filename);
        $('#media-modal .mediapreview-image').removeClass('d-none');
    } else if (filename.endsWith('.mp3')){
        $('#media-modal .mediapreview-audio').attr('src', 'media/' + pubkey + '/' + filename);
        $('#media-modal .mediapreview-audio source').attr('src', 'media/' + pubkey + '/' + filename);
        $('#media-modal .mediapreview-audio').removeClass('d-none');
        $('#media-modal .mediapreview-audio')[0].play();
    }

    $(mediaModal._element).on('hidden.bs.modal', function () {

        var videoElement = $('#media-modal .mediapreview-video')[0];
        videoElement.pause();
        videoElement.src = "";
        videoElement.load();

        $('#media-modal .mediapreview-video source').attr('src', '');
        $('#media-modal .mediapreview-video').addClass('d-none');
        $('#media-modal .mediapreview-video')[0].load();
        $('#media-modal .mediapreview-image').attr('src', '');
        $('#media-modal .mediapreview-image').addClass('d-none');
        $('#media-modal .mediapreview-audio source').attr('src', '');
        $('#media-modal .mediapreview-audio').addClass('d-none');
        $('#media-modal .mediapreview-audio')[0].load();
    });

    $('#media-modal').on('shown.bs.modal', function () {
        $('#modalSwitch-checked').focus();
    });

    mediaModal.show();

    let result = await new Promise((resolve) => {
        $(mediaModal._element).on('hidden.bs.modal', function () {
            resolve({"checked":checked, "visibility":visible}); 
        });
    });

    return result; 

}
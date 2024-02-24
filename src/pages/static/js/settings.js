function saveSettings() {
    const formFields = document.querySelectorAll('.form.settings-form input, .form.settings-form select, .form.settings-form textarea, .form.settings-form checkbox');
    formFields.forEach(field => {
        if (field.value !== field.defaultValue && field.name != "log" && !field.name.toString().startsWith('lookandfeel') || (field.type === 'checkbox' && field.checked !== field.defaultChecked)) {
            const value = field.type === 'checkbox' ? field.checked : field.value;
            let url = 'admin/updatesettings';
            let headers = {
                "authorization": "Bearer " + authkey,
                "Content-Type": "application/json"
            };
            let body = JSON.stringify({
                name: field.name,
                value: value
            });
            
            updateSettings(field.name, value, url, body, headers).then(result => {
                if (result) {
                    if (field.type === 'checkbox') {
                        field.defaultChecked = field.checked;
                    }
                    field.defaultValue = field.value;
                }
            });
        }
    });
}

const updateSettings = (fieldName, fieldValue, url, body, headers) => {
    return fetch(url, {
        method: 'POST',
        headers: headers,
        body: body
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            document.getElementById(fieldName).defaultValue = fieldValue;
            authkey = data.authkey;
            return true;
        } else {
            console.error('Error:', data);
            initAlertModal("#settings", data.message);
            return false;
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        return false;
    });
}

// Log data
window.onload = function() {
    let logHistory = document.getElementById('log');
    window.logData.slice().reverse().forEach(function(log, index) {
        var date = new Date(log.date);
        var formattedDate = date.getFullYear() + '-' + 
            ('0' + (date.getMonth()+1)).slice(-2) + '-' + 
            ('0' + date.getDate()).slice(-2) + ' ' + 
            ('0' + date.getHours()).slice(-2) + ':' + 
            ('0' + date.getMinutes()).slice(-2) + ':' + 
            ('0' + date.getSeconds()).slice(-2) + '.' + 
            ('00' + date.getMilliseconds()).slice(-3);
        logHistory.value += `${index + 1}-  ${log.severity} - ${formattedDate} - ${log.message}\n`;
    });
}

// Update logo or restore default
const updateLogo = (setDefault = false) => {

    let fieldName = 'lookandfeel.server.logo';
    let body = new FormData();
    let field = document.getElementById('lookandfeel.server.logo');
    body.append('lookandfeel.server.logo', field.files[0]);

    if (setDefault === true) {
        document.getElementById('lookandfeel.server.logo.default').value = setDefault;
        body['lookandfeel.server.logo'] = null;
        fieldName = 'lookandfeel.server.logo.default';
    }
       
    let headers = {"authorization": "Bearer " + authkey};
    
    updateSettings(fieldName, '', 'admin/updatelogo', body, headers).then(result => {
        if (result) {
            document.getElementById('server-logo').src = document.getElementById('server-logo').src + '?' + new Date().getTime();
            $('input[type=file]').val('');
        }
    });

}
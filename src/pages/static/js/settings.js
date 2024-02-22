function saveSettings() {
    const formFields = document.querySelectorAll('.form.settings-form input, .form.settings-form select, .form.settings-form textarea, .form.settings-form checkbox, .form.settings-form file');
    formFields.forEach(field => {
        if (field.value !== field.defaultValue || (field.type === 'checkbox' && field.checked !== field.defaultChecked)) {
            const value = field.type === 'checkbox' ? field.checked : field.value;
            let url = field.name === 'server.logo' ? 'admin/updatelogo' : 'admin/updatesettings';
            let body;
            let headers = {
                "authorization": "Bearer " + authkey
            };
            
            if (field.name === 'server.logo') {
                body = new FormData();
                body.append('logo', field.files[0]);
            } else {
                headers["Content-Type"] = "application/json";
                body = JSON.stringify({
                    name: field.name,
                    value: value
                });
            }
            
            fetch(url, {
                method: 'POST',
                headers: headers,
                body: body
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    if (field.type === 'checkbox') {
                        field.defaultChecked = field.checked;
                    }else{
                        field.defaultValue = field.value;
                    }
                    authkey = data.authkey;
                }else{
                    console.error('Error:', data);
                    initAlertModal("#settings", data.message);
                }
                })
            .catch((error) => {
                console.error('Error:', error);
            });
        }
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
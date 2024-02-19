function saveSettings() {
    const formFields = document.querySelectorAll('.form.settings-form input, .form.settings-form select, .form.settings-form textarea');
    console.log(formFields);
    formFields.forEach(field => {
        if (field.value !== field.defaultValue) {
            fetch('admin/updatesettings', {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "authorization": "Bearer " + authkey
                },
                body: JSON.stringify({
                    name: field.name,
                    value: field.value
                })
            })
            .then(response => response.json())
            .then(data => {
                console.log(data);
                if (data.status === 'success') {
                    field.defaultValue = field.value;
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
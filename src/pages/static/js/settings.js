async function saveSettings() {
    const formFields = document.querySelectorAll('.form input, .form select, .form textarea, .form checkbox');
    formFields.forEach(async field => {

        let value;
        let defaultValue;
        if (field.type === 'checkbox') {
            value = field.checked;
            defaultValue = field.defaultChecked;
        } else if (field.tagName.toLowerCase() === 'select') {
            value = field.value;
            defaultValue = Array.from(field.options).find(option => option.defaultSelected)?.value || field.value;
        } else {
            value = field.value;
            defaultValue = field.defaultValue;
        }

        if (value !== defaultValue && field.name !== "log" && !field.name.toString().startsWith('lookandfeel')) {
            
            let url = 'admin/updatesettings';
            let headers = {
                "authorization": "Bearer " + localStorage.getItem('authkey'),
                "Content-Type": "application/json"
            };
            let body = JSON.stringify({
                name: field.name,
                value: value
            });
            
            await updateSettings(field.name, value, url, body, headers).then(result => {
                console.log(result);
                if (result === true) {
                    if (field.type === 'checkbox') {
                        field.defaultChecked = field.checked;
                    } else if (field.tagName.toLowerCase() === 'select') {
                        Array.from(field.options).forEach(option => {
                            option.defaultSelected = option.selected;
                        });
                    } else {
                        field.defaultValue = field.value;
                    }
                } else {
                    if (field.type === 'checkbox') {
                        field.checked = field.defaultChecked;
                    } else if (field.tagName.toLowerCase() === 'select') {
                        field.value = Array.from(field.options).find(option => option.defaultSelected).value;
                    } else {
                        field.value = field.defaultValue;
                    }
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
    .then(async data => {
        if (data.status === 'success') {
            await storeAuthkey(data.authkey)

            const fieldId = document.getElementById(fieldName);
            fieldId.defaultValue = fieldValue;

            showMessage(`${data.message} field ${fieldName}`, "alert-primary");
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

    if (field.files.length === 0 && setDefault === false) {
        return;
    }

    if (setDefault === true) {
        document.getElementById('lookandfeel.server.logo.default').value = setDefault;
        body['lookandfeel.server.logo'] = null;
        fieldName = 'lookandfeel.server.logo.default';
    }
       
    let headers = {"authorization": "Bearer " + localStorage.getItem('authkey')};
    
    updateSettings(fieldName, '', 'admin/updatelogo', body, headers).then(result => {
        if (result) {
            document.getElementById('server-logo').src = document.getElementById('server-logo').src + '?' + new Date().getTime();
            $('input[type=file]').val('');
        }
    });

}

const updateTheme = async (primaryColor, secondaryColor, tertiaryColor, orientation, primaryPercent, secondaryPercent, tertiaryPercent, setDefault = false) => {

    let fieldName = 'lookandfeel.server.colors.theme';
    let body = {
        color1: primaryColor,
        color2: secondaryColor,
        color3: tertiaryColor,
        orientation: orientation,
        color1Percent: primaryPercent,
        color2Percent: secondaryPercent,
        color3Percent: tertiaryPercent
    };

    if (setDefault === true) {
        body.primaryColor = null;
        body.secondaryColor = null;
        body.tertiaryColor = null;
        body.themeName = '';
    }

    let headers = {
        "Content-Type": "application/json", 
        "Authorization": "Bearer " + localStorage.getItem('authkey')
    };

    updateSettings(fieldName, '', 'admin/updatetheme', JSON.stringify(body), headers)

}

const handleThemeChange = (selectElement, themes) => {
    themes = JSON.parse(themes);
    const selectedTheme = selectElement.value;

    if (selectedTheme && themes[selectedTheme]) {
        const primaryColorInput = document.getElementById("lookandfeel.server.colors.primaryColor");
        const secondaryColorInput = document.getElementById("lookandfeel.server.colors.secondaryColor");
        const tertiaryColorInput = document.getElementById("lookandfeel.server.colors.tertiaryColor");
        const orientationSelect = document.getElementById("lookandfeel.server.colors.orientation");

        const primaryColorPercentage = document.getElementById("lookandfeel.server.colors.primaryColor.percent");
        const secondaryColorPercentage = document.getElementById("lookandfeel.server.colors.secondaryColor.percent");
        const tertiaryColorPercentage = document.getElementById("lookandfeel.server.colors.tertiaryColor.percent");

        primaryColorInput.value = themes[selectedTheme].color1;
        secondaryColorInput.value = themes[selectedTheme].color2;
        tertiaryColorInput.value = themes[selectedTheme].color3;
        orientationSelect.value = themes[selectedTheme].orientation;

        primaryColorPercentage.style.left = `${themes[selectedTheme].color1Percent}`;
        secondaryColorPercentage.style.left = `${themes[selectedTheme].color2Percent}`;
        tertiaryColorPercentage.style.left = `${themes[selectedTheme].color3Percent}`;


        primaryColorInput.dispatchEvent(new Event('input', { bubbles: true }));
        secondaryColorInput.dispatchEvent(new Event('input', { bubbles: true }));
        tertiaryColorInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const primaryColorInput = document.getElementById("lookandfeel.server.colors.primaryColor");
    const secondaryColorInput = document.getElementById("lookandfeel.server.colors.secondaryColor");
    const tertiaryColorInput = document.getElementById("lookandfeel.server.colors.tertiaryColor");
    const orientationSelect = document.getElementById("lookandfeel.server.colors.orientation");
    const gradientBar = document.getElementById("lookandfeel.server.colors.gradientbar");

    const handles = [
        { element: document.createElement('div'), position: 25, id: 'lookandfeel.server.colors.primaryColor.percent', defaultPosition: 25 },
        { element: document.createElement('div'), position: 50, id: 'lookandfeel.server.colors.secondaryColor.percent', defaultPosition: 50 },
        { element: document.createElement('div'), position: 75, id: 'lookandfeel.server.colors.tertiaryColor.percent', defaultPosition: 75 }
    ];

    console.log(handles);
    
    handles.forEach(handle => {
        handle.element.classList.add('handle');
        handle.element.id = handle.id; 
        handle.element.dataset.position = handle.position;
        handle.element.dataset.defaultPosition = handle.defaultPosition;
        gradientBar.appendChild(handle.element);
        handle.element.style.left = `${handle.position}%`;
    
        const startDrag = (startEvent) => {
            startEvent.preventDefault();
            let moveEvent = 'mousemove';
            let endEvent = 'mouseup';
            let clientX = startEvent.clientX;
    
            if (startEvent.type === 'touchstart') {
                moveEvent = 'touchmove';
                endEvent = 'touchend';
                clientX = startEvent.touches[0].clientX;
            }
    
            const onMouseMove = (moveEvt) => {
                let newPosition = moveEvt.clientX || moveEvt.touches[0].clientX;
                newPosition = ((newPosition - gradientBar.getBoundingClientRect().left) / gradientBar.offsetWidth) * 100;
                if (newPosition < 0) newPosition = 0;
                if (newPosition > 100) newPosition = 100;
                handle.position = newPosition;
                handle.element.dataset.position = newPosition;
                handle.element.style.left = `${newPosition}%`;
                updateGradient();
            };
    
            const onMouseUp = () => {
                document.removeEventListener(moveEvent, onMouseMove);
                document.removeEventListener(endEvent, onMouseUp);
            };
    
            document.addEventListener(moveEvent, onMouseMove);
            document.addEventListener(endEvent, onMouseUp);
        };
    
        handle.element.addEventListener('mousedown', startDrag);
        handle.element.addEventListener('touchstart', startDrag);
    });

    const updateGradient = () => {
        const primaryColor = primaryColorInput.value;
        const secondaryColor = secondaryColorInput.value;
        const tertiaryColor = tertiaryColorInput.value;
        const orientation = orientationSelect.value;

        handles.sort((a, b) => a.position - b.position);

        const gradient = `linear-gradient(${orientation}, ${primaryColor} ${handles[0].position}%, ${secondaryColor} ${handles[1].position}%, ${tertiaryColor} ${handles[2].position}%)`;
        gradientBar.style.background = gradient;
    };

    primaryColorInput.addEventListener('input', updateGradient);
    secondaryColorInput.addEventListener('input', updateGradient);
    tertiaryColorInput.addEventListener('input', updateGradient);
    orientationSelect.addEventListener('input', updateGradient);

    const rootStyles = getComputedStyle(document.documentElement);
    primaryColorInput.value = rootStyles.getPropertyValue('--primary-color').trim();
    primaryColorInput.defaultValue = primaryColorInput.value;
    secondaryColorInput.value = rootStyles.getPropertyValue('--secondary-color').trim();
    secondaryColorInput.defaultValue = secondaryColorInput.value;
    tertiaryColorInput.value = rootStyles.getPropertyValue('--tertiary-color').trim();
    tertiaryColorInput.defaultValue = tertiaryColorInput.value;
    orientationSelect.value = rootStyles.getPropertyValue('--gradient-orientation').trim();
    orientationSelect.defaultValue = orientationSelect.value;

    handles[0].position = parseFloat(rootStyles.getPropertyValue('--primary-color-percent').trim());
    handles[0].defaultPosition = handles[0].position;
    handles[1].position = parseFloat(rootStyles.getPropertyValue('--secondary-color-percent').trim());
    handles[1].defaultPosition = handles[1].position;
    handles[2].position = parseFloat(rootStyles.getPropertyValue('--tertiary-color-percent').trim());
    handles[2].defaultPosition = handles[2].position;

    handles.forEach(handle => {
        handle.element.style.left = `${handle.position}%`;
    });

    updateGradient();
});


const saveLookAndFeel = async () => {

    await updateLogo();

    // Check if the fields have been modified
    if(document.getElementById('lookandfeel.server.colors.primaryColor').value === document.getElementById('lookandfeel.server.colors.primaryColor').defaultValue && 
        document.getElementById('lookandfeel.server.colors.secondaryColor').value === document.getElementById('lookandfeel.server.colors.secondaryColor').defaultValue &&
        document.getElementById('lookandfeel.server.colors.tertiaryColor').value === document.getElementById('lookandfeel.server.colors.tertiaryColor').defaultValue &&
        document.getElementById('lookandfeel.server.colors.orientation').value === document.getElementById('lookandfeel.server.colors.orientation').defaultValue &&
        document.getElementById('lookandfeel.server.colors.primaryColor.percent').dataset.position === document.getElementById('lookandfeel.server.colors.primaryColor.percent').dataset.defaultPosition &&
        document.getElementById('lookandfeel.server.colors.secondaryColor.percent').dataset.position === document.getElementById('lookandfeel.server.colors.secondaryColor.percent').dataset.defaultPosition &&
        document.getElementById('lookandfeel.server.colors.tertiaryColor.percent').dataset.position === document.getElementById('lookandfeel.server.colors.tertiaryColor.percent').dataset.defaultPosition) {
        return;
    }

    await updateTheme(
        document.getElementById('lookandfeel.server.colors.primaryColor').value,
        document.getElementById('lookandfeel.server.colors.secondaryColor').value,
        document.getElementById('lookandfeel.server.colors.tertiaryColor').value,
        document.getElementById('lookandfeel.server.colors.orientation').value,
        document.getElementById('lookandfeel.server.colors.primaryColor.percent').style.left,
        document.getElementById('lookandfeel.server.colors.secondaryColor.percent').style.left,
        document.getElementById('lookandfeel.server.colors.tertiaryColor.percent').style.left
    );

}


function handleCheckboxClick(id, isChecked) {
    if ((id === 'admin' || id === 'frontend') && !isChecked) {
        initAlertModal("#settings", "Attention, if you disable this module, you will need to manage the server only via<b> shell commands.</b>",10000);
    }
}

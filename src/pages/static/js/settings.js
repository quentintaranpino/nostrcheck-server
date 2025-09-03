const reloadOnChangeFields = [
    "multiTenancy",
    "appearance.server.logo.light",
    "appearance.server.logo.dark",
    "server.availableModules"
  ];

async function saveSettings() {
    const formFields = document.querySelectorAll('.form input, .form select, .form textarea');
    
    const selectedDomain = document.getElementById('domainSelector')?.value || null;

    let shouldReload = false;

    for (const field of formFields) {
        let value;
        let defaultValue;
        if (field.type === 'checkbox') {
            value = field.checked;
            defaultValue = field.defaultChecked;
        } else if (field.tagName.toLowerCase() === 'select') {
            value = field.value;
            defaultValue = field.dataset.defaultValue
               ?? (Array.from(field.options).find(o => o.defaultSelected)?.value || field.value); 
        } else if (field.type === 'file') {
            value = field.files[0]?.name || field.value;
            defaultValue = field.defaultValue;
        } else {
            value = field.value;
            defaultValue = field.dataset.defaultValue || field.defaultValue;
        }

        if (value !== defaultValue) {

            if (field.type === 'file') {
                const isRestore = value === "restore" || field.dataset.restore === "true";
                await saveSettingsFile(field.name, isRestore).then(response => {
                    if (response.reload && reloadOnChangeFields.some(key => field.name === key || field.name.startsWith(`${key}.`))) {
                        shouldReload = true;
                    }
                });
                continue;
            }

            if (reloadOnChangeFields.some(key => field.name === key || field.name.startsWith(`${key}.`))) {
                shouldReload = true;
            }
            
            const url = 'admin/updatesettings';
            const headers = {
                "Content-Type": "application/json"
            };
            const body = JSON.stringify({
                name: field.name,
                value: value, 
                domain: selectedDomain
            });

            await updateSettings(url, body, headers).then(result => {
                if (result === true) {
                    if (field.type === 'checkbox') {
                        field.defaultChecked = field.checked;
                    } else if (field.tagName.toLowerCase() === 'select') {
                        Array.from(field.options).forEach(option => {
                            option.defaultSelected = option.selected;
                        });
                        field.dataset.defaultValue = field.value;
                    } else {
                        field.defaultValue = field.value;
                        field.dataset.defaultValue = field.value;
                    }
                } else {
                    if (field.type === 'checkbox') {
                        field.checked = field.defaultChecked;
                    } else if (field.tagName.toLowerCase() === 'select') {
                        field.value = Array.from(field.options).find(option => option.defaultSelected).value;
                    } else {
                        field.value = field.dataset.defaultValue || field.defaultValue;
                    }
                }
            });
        }
    }

    if (shouldReload) {
        location.reload();
    }
}

const updateSettings = (url, body, headers) => {

    return fetch(url, {
        method: 'POST',
        headers: headers,
        body: body
    })
    .then(response => response.json())
    .then(async data => {
        if (data.status === 'success') {
            const name = await JSON.parse(body).name;
            const value = await JSON.parse(body).value;
            const fieldId = document.getElementById(name);
            fieldId.dataset.defaultValue = value;

            showMessage(`${data.message}`, "alert-primary");
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

// Update settings files
const saveSettingsFile = async (settingName, restore = false) => {
    const selectedDomain = document.getElementById("domainSelector")?.value || null;
    const field = document.getElementById(settingName);

    const form = new FormData();
    form.append("name", settingName);
    if (selectedDomain) form.append("domain", selectedDomain);

    if (restore) {
        form.append(`${settingName}.default`, "true");
    } else {
        form.append(settingName, field.files[0]);
    }

    const response = await fetch("admin/updatesettingsfile", {
        method: "POST",
        body: form
    });

    const result = await response.json();
    if (result.status === "success") {
        const preview = document.getElementById(`${settingName}-preview`);
        if (preview) {
            if (selectedDomain) {
                preview.src = preview.src.split("?")[0] + "?domain=" + selectedDomain + "&" + Date.now();
            } else {
                preview.src = preview.src.split("?")[0] + "?" + Date.now();
            }
        }
        field.value = ""; 
        showMessage(`${result.message}`, "alert-primary");
        updatePreviewBadges();
        return {
            result: true,
            reload: reloadOnChangeFields.some(key => settingName === key || settingName.startsWith(`${key}.`))
        };
        
        } else {
        initAlertModal("#settings", result.message);
        return { "result": false, "reload" : false };
    }
};

const handleDynamicBackgroundChange = (selectElement, themes) => {
    themes = JSON.parse(themes);
    const selectedTheme = selectElement.value;

    if (selectedTheme && themes[selectedTheme]) {

        const primaryColorInput = document.getElementById("appearance.dynamicbackground.color1");
        const secondaryColorInput = document.getElementById("appearance.dynamicbackground.color2");
        const tertiaryColorInput = document.getElementById("appearance.dynamicbackground.color3");
        const orientationSelect = document.getElementById("appearance.dynamicbackground.orientation");
        const particlesSelect = document.getElementById("appearance.dynamicbackground.particles");

        const primaryColorPercentageHandle = document.getElementById("appearance.dynamicbackground.color1Percent.handle");
        const secondaryColorPercentageHandle = document.getElementById("appearance.dynamicbackground.color2Percent.handle");
        const tertiaryColorPercentageHandle = document.getElementById("appearance.dynamicbackground.color3Percent.handle");

        const primaryColorPercentageInput = document.getElementById("appearance.dynamicbackground.color1Percent");
        const secondaryColorPercentageInput = document.getElementById("appearance.dynamicbackground.color2Percent");
        const tertiaryColorPercentageInput = document.getElementById("appearance.dynamicbackground.color3Percent");

        primaryColorInput.value = themes[selectedTheme].color1;
        secondaryColorInput.value = themes[selectedTheme].color2;
        tertiaryColorInput.value = themes[selectedTheme].color3;
        orientationSelect.value = themes[selectedTheme].orientation;
        particlesSelect.value = themes[selectedTheme].particles;

        primaryColorPercentageHandle.style.left = `${themes[selectedTheme].color1Percent}`;
        primaryColorPercentageHandle.dataset.position = themes[selectedTheme].color1Percent;
        secondaryColorPercentageHandle.style.left = `${themes[selectedTheme].color2Percent}`;
        secondaryColorPercentageHandle.dataset.position = themes[selectedTheme].color2Percent;
        tertiaryColorPercentageHandle.style.left = `${themes[selectedTheme].color3Percent}`;
        tertiaryColorPercentageHandle.dataset.position = themes[selectedTheme].color3Percent;

        primaryColorPercentageInput.value = themes[selectedTheme].color1Percent;
        secondaryColorPercentageInput.value = themes[selectedTheme].color2Percent;
        tertiaryColorPercentageInput.value = themes[selectedTheme].color3Percent;



        primaryColorInput.dispatchEvent(new Event('input', { bubbles: true }));
        secondaryColorInput.dispatchEvent(new Event('input', { bubbles: true }));
        tertiaryColorInput.dispatchEvent(new Event('input', { bubbles: true }));
        particlesSelect.dispatchEvent(new Event('change', { bubbles: true }));

    }
};

const handleParticlesChange = (selectElement) => {
    getParticles(selectElement);
}

document.addEventListener('DOMContentLoaded', () => {
    
    const primaryColorInput = document.getElementById("appearance.dynamicbackground.color1");
    const secondaryColorInput = document.getElementById("appearance.dynamicbackground.color2");
    const tertiaryColorInput = document.getElementById("appearance.dynamicbackground.color3");
    const orientationSelect = document.getElementById("appearance.dynamicbackground.orientation");
    const gradientBar = document.getElementById("appearance.dynamicbackground.gradientbar");
    const particlesSelect = document.getElementById("appearance.dynamicbackground.particles");
    const dynamicBackgroundThemeSelect = document.getElementById("appearance.dynamicbackground.theme");
    console.log(dynamicBackgroundThemeSelect);

    handleParticlesChange(particlesSelect);

    const handles = [
        { element: document.createElement('div'), position: 25, id: 'appearance.dynamicbackground.color1Percent.handle', defaultPosition: 25 },
        { element: document.createElement('div'), position: 50, id: 'appearance.dynamicbackground.color2Percent.handle', defaultPosition: 50 },
        { element: document.createElement('div'), position: 75, id: 'appearance.dynamicbackground.color3Percent.handle', defaultPosition: 75 }
    ];

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

                const hiddenInput = document.getElementById(handle.id.slice(0, -7));
                if (hiddenInput) {
                    const value = newPosition.toFixed(2) + "%";
                    hiddenInput.value = value;
                    hiddenInput.defaultChecked
                }

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
        const particles = particlesSelect.value;

        handles.sort((a, b) => a.position - b.position);

        const gradient = `linear-gradient(${orientation}, ${primaryColor} ${handles[0].position}%, ${secondaryColor} ${handles[1].position}%, ${tertiaryColor} ${handles[2].position}%)`;
        gradientBar.style.background = gradient;

    };

    primaryColorInput.addEventListener('input', updateGradient);
    secondaryColorInput.addEventListener('input', updateGradient);
    tertiaryColorInput.addEventListener('input', updateGradient);
    orientationSelect.addEventListener('input', updateGradient);

    // const rootStyles = getComputedStyle(document.documentElement);
    // primaryColorInput.value = rootStyles.getPropertyValue('--primary-color').trim();
    // primaryColorInput.defaultValue = primaryColorInput.value;
    // secondaryColorInput.value = rootStyles.getPropertyValue('--secondary-color').trim();
    // secondaryColorInput.defaultValue = secondaryColorInput.value;
    // tertiaryColorInput.value = rootStyles.getPropertyValue('--tertiary-color').trim();
    // tertiaryColorInput.defaultValue = tertiaryColorInput.value;
    // orientationSelect.value = rootStyles.getPropertyValue('--gradient-orientation').trim();
    // orientationSelect.defaultValue = orientationSelect.value;
    // particlesSelect.value = rootStyles.getPropertyValue('--particles').trim();
    // particlesSelect.defaultValue = particlesSelect.value;

    // handles[0].position = parseFloat(rootStyles.getPropertyValue('--primary-color-percent').trim());
    // handles[0].defaultPosition = handles[0].position;
    // handles[1].position = parseFloat(rootStyles.getPropertyValue('--secondary-color-percent').trim());
    // handles[1].defaultPosition = handles[1].position;
    // handles[2].position = parseFloat(rootStyles.getPropertyValue('--tertiary-color-percent').trim());
    // handles[2].defaultPosition = handles[2].position;

    handles.forEach(handle => {
        handle.element.style.left = `${handle.position}%`;
    });

    updateGradient();

    particlesSelect.addEventListener('change', () => {
        handleParticlesChange(particlesSelect);
    });

    dynamicBackgroundThemeSelect.addEventListener('change', () => {
        const themes = JSON.parse(document.getElementById('theme-data-json')?.textContent || '{}');
        handleDynamicBackgroundChange(dynamicBackgroundThemeSelect, JSON.stringify(themes));
    });

    updatePreviewBadges()


});

// Multi-tenancy badges

document.addEventListener("input", handleFieldLiveUpdate, true);
document.addEventListener("change", handleFieldLiveUpdate, true);

function handleFieldLiveUpdate(event) {
    const field = event.target;
    if (!field.name) return;

    const resetBtn = document.getElementById(`reset-${field.name}`);
  
    const badge = document.getElementById(`badge-${field.name}`);
    if (!badge) return;
  
    const globalValueAttr = field.dataset.globalValue;
    if (globalValueAttr === undefined) return;
  
    let current;
    let globalValue = globalValueAttr;
  
    if (field.type === "checkbox") {
      current = String(field.checked);
    } else {
      current = field.value;
    }
  
    // For booleans stored as string
    if (globalValue === "true" || globalValue === "false") {
      globalValue = String(globalValue === "true");
    }
  
    if (current !== globalValue) {
      badge.className = "badge bg-success ms-2";
      badge.textContent = "Overridden";
      resetBtn.classList.remove('d-none');
    } else {
      badge.className = "badge bg-info ms-2";
      badge.textContent = "Inherited";
      resetBtn.classList.add('d-none');
    }
  }

  async function updatePreviewBadges() {
    const previews = document.querySelectorAll('img[id$="-preview"]');
  
    const getHash = async (url) => {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    };
  
    for (const preview of previews) {
      const settingName = preview.id.replace(/-preview$/, "");
      const badge = document.getElementById(`badge-${settingName}`);
      if (!badge) continue;
  
      const domainSrc = preview.src;
      const globalSrc = preview.src.split("?")[0];
  
      try {
        const [domainHash, globalHash] = await Promise.all([
          getHash(domainSrc),
          getHash(globalSrc)
        ]);
  
        if (domainHash !== globalHash) {
          badge.className = "badge bg-success ms-2";
          badge.textContent = "Overridden";
        } else {
          badge.className = "badge bg-info ms-2";
          badge.textContent = "Inherited";
        }
      } catch (err) {
        console.warn("Error comparing hashes for", settingName, err);
      }
    }
  }
  
function resetToGlobal(fieldName, globalValue) {
    const input = document.getElementById(fieldName);
    if (!input) return;

    const tag = input.tagName.toLowerCase();

    if (tag === 'input') {
        if (input.type === 'checkbox') {
        input.checked = globalValue === 'true';
        } else {
        input.value = globalValue;
        }
    } else if (tag === 'select') {
        input.value = globalValue;
    }

    const badge = document.querySelector(`#badge-${fieldName}`);
    if (badge) {
        badge.classList.remove('bg-success');
        badge.classList.add('bg-info');
        badge.textContent = 'Inherited';
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Intercept Ctrl+S for save settings
(function () {
document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        if (e.repeat) return; 
        e.preventDefault();

        const activePane = document.querySelector('#settingsTabsContent .tab-pane.active');
        const saveBtn = activePane?.querySelector('button[onclick="saveSettings()"], button[name="Submit"]');

        if (document.activeElement) document.activeElement.blur?.();

        if (saveBtn) {
            saveBtn.click();
        } else if (typeof saveSettings === 'function') {
            saveSettings();
        }
    }
}, { passive: false });
})();
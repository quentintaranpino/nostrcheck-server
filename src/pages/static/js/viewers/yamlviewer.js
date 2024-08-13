async function initYamlViewer (containerId, yamlUrl) {
    const container = document.getElementById(containerId);

    // Limpiar el contenedor antes de agregar nuevo contenido
    container.innerHTML = '';

    // Fetch the YAML content
    const yamlContent = await fetch(yamlUrl).then(res => res.text());

    // Crear elementos <p> para mostrar el YAML con diferentes tamaños de fuente
        const pre = document.createElement('pre');
        pre.textContent = yamlContent;
        container.appendChild(pre);
};
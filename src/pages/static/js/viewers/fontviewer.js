async function initFontViewer (containerId, fontUrl) {

    const container = document.getElementById(containerId);

    const fontSizes = [48, 36, 24, 18, 14, 12, 10];
    const sampleText = "Stay humble and keep the nostr weird.";

    container.innerHTML = '';

    const fontName = 'customFont';
    const fontFace = new FontFace(fontName, `url(${fontUrl})`);
    await fontFace.load();

    document.fonts.add(fontFace);

    fontSizes.forEach(size => {
        const p = document.createElement('p');
        p.style.fontSize = `${size}px`;
        p.style.fontFamily = fontName;
        p.textContent = sampleText;
        container.appendChild(p);
    });

    const nostrLogo = document.createElement('i');
    nostrLogo.className = 'nostr-logo nostr-logo-40 me-2';
    container.appendChild(nostrLogo);

};
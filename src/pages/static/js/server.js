
// Escapes HTML special chars before interpolating untrusted data into markup.
// Global: modal.js and the viewers rely on it too.
window.escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);

// Truncates a long hex/npub for display: "abcdef…123456".
window.shortenHex = (value, prefix = 12, suffix = 6) => {
    const s = String(value || "");
    if (s.length <= prefix + suffix + 1) return s;
    return s.substring(0, prefix) + "…" + s.slice(-suffix);
};

// Auto-replaces text content of any element with [data-shorten-hex] on load.
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-shorten-hex]").forEach(el => {
        const full = el.dataset.shortenHex || el.textContent.trim();
        const prefix = Number(el.dataset.shortenPrefix) || 12;
        const suffix = Number(el.dataset.shortenSuffix) || 6;
        el.textContent = window.shortenHex(full, prefix, suffix);
    });
});

// True when the widget is actually in front of somebody: the browser tab is in
// the foreground, the widget is not inside an inactive bootstrap tab pane, and it
// is somewhere near the viewport. Widgets outside any tab pane (the dashcards
// live above the tab bar) only answer to the first two.
window.isWidgetVisible = (element) => {

    if (document.hidden) return false;
    if (!element || !element.isConnected) return false;

    const pane = element.closest(".tab-pane");
    if (pane && !pane.classList.contains("active")) return false;

    // Cheap geometry instead of an observer per widget: a card 4000px up the page
    // is not being read, and asking the database for it is what took the server
    // down.
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const margin = 300;
    return rect.bottom > -margin && rect.top < window.innerHeight + margin;
};

/**
 * Polling that stops when nobody is watching, never overlaps itself, and backs
 * off when the endpoint is failing.
 *
 * The dashboard used to fire a naked setInterval per widget. With a slow endpoint
 * (a COUNT over millions of rows behind a 300s proxy timeout) that means a new
 * request every tick while the previous ones are still open: dozens of them pile
 * up, the pool saturates and every other request on the page starts failing too.
 *
 * @param element - Widget the data belongs to, used to decide visibility.
 * @param intervalMs - Base period.
 * @param task - Async function to run. Rejecting counts as a failure.
 * @returns Handle with stop() and runNow().
 */
window.pollWhenVisible = (element, intervalMs, task) => {

    const base = Math.max(Number(intervalMs) || 60000, 1000);
    const maxBackoff = 10;
    let running = false;
    let failures = 0;
    let skipTicks = 0;
    let stopped = false;

    const tick = async () => {

        if (stopped) return;

        // Still working on the previous one: skip this beat entirely rather than
        // stacking a second request on top of it.
        if (running) return;

        if (!window.isWidgetVisible(element)) return;

        if (skipTicks > 0) {
            skipTicks--;
            return;
        }

        running = true;
        try {
            await task();
            failures = 0;
        } catch (error) {
            // Back off on failure so a broken or overloaded endpoint gets asked
            // less often, not just as often.
            failures++;
            skipTicks = Math.min(failures, maxBackoff);
            console.debug(`pollWhenVisible - task failed (${failures}), skipping the next ${skipTicks} tick(s)`, error);
        } finally {
            running = false;
        }
    };

    const timer = setInterval(tick, base);

    return {
        stop: () => { stopped = true; clearInterval(timer); },
        runNow: tick,
    };
};

/**
 * Fetches JSON and fails with something readable when the answer isn't JSON.
 *
 * A 502 from the proxy is an HTML error page. Parsing it blindly throws
 * "SyntaxError: Unexpected token '<'", which buries the actual problem under a
 * parser complaint and sends whoever is debugging to look in the wrong place.
 *
 * @param url - Request URL.
 * @param options - fetch options.
 * @returns Parsed body.
 * @throws Error whose message names the status and what came back instead.
 */
window.fetchJSON = async (url, options = {}) => {

    let response;
    try {
        response = await fetch(url, options);
    } catch (error) {
        // Network-level failure: the server is unreachable, which is not the same
        // as being logged out.
        const failure = new Error("the server could not be reached");
        failure.status = 0;
        failure.serverUnavailable = true;
        throw failure;
    }

    const body = await response.text();
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const looksJSON = contentType.includes("json") || /^\s*[[{]/.test(body);

    // The one distinction that matters for the session: only the server saying
    // "who are you" means the session is gone. 502/503/504 and a dead socket mean
    // the server is unavailable, and nothing may ever react to those by reloading
    // or bouncing to login: a reload under saturation re-fires the whole dashboard
    // and makes the outage worse.
    const buildError = (message) => {
        const failure = new Error(message);
        failure.status = response.status;
        failure.sessionLost = response.status === 401 || response.status === 403;
        failure.serverUnavailable = response.status === 502 || response.status === 503 || response.status === 504;
        return failure;
    };

    if (!looksJSON) {
        const hint = response.status === 502 || response.status === 503 || response.status === 504
                        ? "the server is unavailable or took too long to answer (proxy timeout), it may be under heavy load"
                        : `the server answered with ${contentType || "no content type"} instead of JSON`;
        throw buildError(`HTTP ${response.status}: ${hint}`);
    }

    let parsed;
    try {
        parsed = JSON.parse(body);
    } catch (error) {
        throw buildError(`HTTP ${response.status}: the answer was not valid JSON`);
    }

    if (!response.ok) {
        throw buildError(parsed?.message || `HTTP ${response.status}`);
    }

    return parsed;
};

// Wires every .search-box on the page to the unified search endpoint.
// One instance can live in the navbar and another in a page hero — they share
// the backend and the renderer, only the surrounding markup differs.
document.addEventListener("DOMContentLoaded", () => {
    const esc = s => String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);

    document.querySelectorAll(".search-box").forEach(box => {
        const input = box.querySelector(".search-box-input");
        const results = box.querySelector(".search-box-results");
        if (!input || !results) return;

        let aborter = null;
        let lastQuery = "";
        let debounceId = null;

        const hide = () => { results.classList.add("d-none"); results.innerHTML = ""; };
        const renderEmpty = () => { results.innerHTML = '<div class="search-box-empty">No results</div>'; results.classList.remove("d-none"); };

        const run = async (q) => {
            if (aborter) aborter.abort();
            aborter = new AbortController();
            try {
                const r = await fetch(`/api/v2/search?q=${encodeURIComponent(q)}`, { signal: aborter.signal });
                if (!r.ok) return hide();
                const data = await r.json();
                if (input.value.trim() !== q) return; // stale

                const sections = [];
                if (Array.isArray(data.users) && data.users.length) {
                    sections.push(`<div class="search-box-section"><div class="search-box-section-title">Users</div>` +
                        data.users.map(u => `
                            <div class="search-box-item" data-kind="user" data-hex="${esc(u.hex)}">
                              <div class="search-box-item-thumb"><i class="bi bi-person-fill"></i></div>
                              <div class="search-box-item-main">
                                <div class="search-box-item-title">${esc(u.username)}</div>
                                <div class="search-box-item-sub">@${esc(u.domain)}</div>
                              </div>
                            </div>`).join("") + `</div>`);
                }

                if (Array.isArray(data.media) && data.media.length) {
                    sections.push(`<div class="search-box-section"><div class="search-box-section-title">Media</div>` +
                        data.media.map(m => {
                            const mime = m.mimetype || "";
                            const isImg = /^image\//.test(mime);
                            const thumb = isImg ? `<img loading="lazy" src="${esc(m.url)}" alt="">` : `<i class="bi bi-${/^video\//.test(mime) ? "play-btn" : (/^audio\//.test(mime) ? "music-note-beamed" : "file-earmark")}"></i>`;
                            return `<div class="search-box-item" data-kind="media"
                                      data-filename="${esc(m.filename)}"
                                      data-url="${esc(m.url)}"
                                      data-mime="${esc(mime)}"
                                      data-hash="${esc(m.hash)}"
                                      data-blurhash="${esc(m.blurhash || "")}"
                                      data-dim="${esc(m.dimensions || "")}"
                                      data-pubkey="${esc(m.pubkey || "")}">
                              <div class="search-box-item-thumb">${thumb}</div>
                              <div class="search-box-item-main">
                                <div class="search-box-item-title">${esc(m.filename)}</div>
                                <div class="search-box-item-sub">${esc(mime)}</div>
                              </div>
                            </div>`;
                        }).join("") + `</div>`);
                }

                if (Array.isArray(data.events) && data.events.length) {
                    sections.push(`<div class="search-box-section"><div class="search-box-section-title">Notes</div>` +
                        data.events.map(n => `
                            <div class="search-box-item" data-kind="event" data-event='${esc(JSON.stringify(n))}'>
                              <div class="search-box-item-thumb"><i class="bi bi-chat-square-text"></i></div>
                              <div class="search-box-item-main">
                                <div class="search-box-item-title">${esc((n.content || "").slice(0, 80))}</div>
                                <div class="search-box-item-sub"><code>${esc((n.pubkey || "").slice(0, 12))}…</code></div>
                              </div>
                            </div>`).join("") + `</div>`);
                }

                if (!sections.length) return renderEmpty();
                results.innerHTML = sections.join("");
                results.classList.remove("d-none");
            } catch (e) {
                if (e.name !== "AbortError") console.error("search-box fetch failed", e);
            }
        };

        input.addEventListener("input", () => {
            const q = input.value.trim();
            if (debounceId) clearTimeout(debounceId);
            if (q.length < 2) { hide(); lastQuery = q; return; }
            if (q === lastQuery) return;
            lastQuery = q;
            debounceId = setTimeout(() => run(q), 250);
        });

        input.addEventListener("focus", () => { if (input.value.trim().length >= 2) results.classList.remove("d-none"); });
        document.addEventListener("click", e => {
            if (!box.contains(e.target)) hide();
        });

        results.addEventListener("click", e => {
            const item = e.target.closest(".search-box-item");
            if (!item) return;
            const kind = item.dataset.kind;
            if (kind === "user") {
                window.location.href = `/u/${item.dataset.hex}`;
            } else if (kind === "media") {
                const fileInfo = {
                    filename: item.dataset.filename,
                    url: item.dataset.url,
                    mimetype: item.dataset.mime,
                    type: item.dataset.mime,
                    hash: item.dataset.hash,
                    sha256: item.dataset.hash,
                    original_hash: item.dataset.hash,
                    blurhash: item.dataset.blurhash,
                    dimensions: item.dataset.dim,
                    dim: item.dataset.dim,
                    pubkey: item.dataset.pubkey,
                    visibility: 1,
                };
                hide();
                if (typeof initMediaModal === "function") initMediaModal(item.dataset.filename, undefined, 1, false, fileInfo);
            } else if (kind === "event") {
                hide();
                try { window.openEventModal(JSON.parse(item.dataset.event)); } catch (err) { console.error("openEventModal failed", err); }
            }
        });
    });
});

// Smooth scroll and offset by 200px
function smoothScroll(target, duration) {

  target == null? target = document.body : target = target;
  const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - 200;
  const startPosition = window.scrollY;
  const distance = targetPosition - startPosition;
  let startTime = null;

  function animation(currentTime) {
      if (startTime === null) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const run = ease(timeElapsed, startPosition, distance, duration);
      window.scrollTo(0, run);
      if (timeElapsed < duration) requestAnimationFrame(animation);
  }

  function ease(t, b, c, d) {
      t /= d / 2;
      if (t < 1) return c / 2 * t * t + b;
      t--;
      return -c / 2 * (t * (t - 2) - 1) + b;
  }

  requestAnimationFrame(animation);
}

// Scroll to hash on page load if exists
window.onload = function() {
    if (window.location.hash) {
        var element = document.querySelector(window.location.hash);
        if (element) {
            element.scrollIntoView();
        }
    }
};

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href').substring(1);
      const targetElement = document.getElementById(targetId);
      smoothScroll(targetElement, 1000); 
  });
});

// Reload only when the page really comes back from the back/forward cache, where
// scripts resume with stale state. It used to reload on performance.navigation.type
// === 2 as well, which is any ordinary back/forward navigation: on the dashboard
// that meant a full reload, and a full reload re-fires every card, table and chart
// query at once. Under load that is the worst possible response, and it is what
// made the dashboard look like it was reloading itself.
// The guard also stops a reload loop if the restore repeats immediately.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  try {
      const last = Number(sessionStorage.getItem('bfcacheReloadAt')) || 0;
      if (Date.now() - last < 5000) return;
      sessionStorage.setItem('bfcacheReloadAt', String(Date.now()));
  } catch (e) {
      // Storage blocked: reload once anyway, it is the documented behaviour.
  }
  console.debug('Restored from the back/forward cache, reloading for fresh state...');
  window.location.reload();
});

// Messages engine
const showMessage = (message, messageClass = "alert-warning", persistent = false, timeout = 2500 ) => {
  const messagesContainer = 'message-container';

  if (!document.getElementById(messagesContainer)) {
      $('body').append('<div id="' + messagesContainer + '" class="message-container"></div>');
  }

  const messageBox = 'message-box-' + Date.now();
  const messageBoxHtml = `
      <div id="${messageBox}" class="alert alert-dismissible alert-modal mb-2 message-box ${messageClass}" role="alert">
          <span>${message}</span>
          <button type="button" class="btn-close" aria-label="Close"></button>
      </div>
  `;

  const $messagesContainer = $('#' + messagesContainer);
  $messagesContainer.prepend(messageBoxHtml);

  // Manual close: fade and drop. Auto-close still fires below; if it lands
  // after a manual close it's a no-op because the node is already gone.
  $('#' + messageBox).find('.btn-close').on('click', function () {
      $('#' + messageBox).fadeOut(200, function () { $(this).remove(); });
  });

  const maxMessages = 5;
  const currentMessages = $messagesContainer.children('.message-box');
  if (currentMessages.length > maxMessages) {
      currentMessages.last().remove();
  }

  if (!persistent) {
    setTimeout(() => {
        $('#' + messageBox).fadeOut(500, function () {
            $(this).remove();
        });
    }, timeout);
    }

    return messageBox;

}

const hideMessage = (messageBox, timeout = 2500) => {
    setTimeout(() => {
        $('#' + messageBox).fadeOut(500, function () {
            $(this).remove();
        });
    }, timeout);
}

const updateMessage = (messageBox, newMessage, messageClass) => {
    // Replace only the text span so the close button survives.
    $('#' + messageBox).find('span').first().html(newMessage);
    if (messageClass) {
        $('#' + messageBox).removeClass().addClass('alert alert-dismissible alert-modal mb-2 message-box ' + messageClass);
    }
}

$(window).on('scroll', () => {
    const $messagesContainer = $('#message-container');
    if ($(window).scrollTop() > 800) {
      $messagesContainer.css('top', '10px');
    } else {
      $messagesContainer.css('top', '87px'); 
    }
  });

// Copy to clipboard
const copyToClipboard = async (object, text) => {
    try {
        await navigator.clipboard.writeText(text);
        // Make object blin
        $(object).find('i').removeClass('fa-copy').addClass('fa-check');
        setTimeout(() => {
            $(object).find('i').removeClass('fa-check').addClass('fa-copy');
        }, 2000);
    } catch (err) {
        console.error(`Can't copy text ${err}`);
    }
}


// Logout function
const logout = async () => {
  localStorage.removeItem('profileData')
  window.location.href = '/api/v2/logout';
}

// Get root host URL
const getRootHost = () => {
    const hostname = window.location.hostname;
    const rootHost = hostname.split('.').slice(-2).join('.');
    const protocol = window.location.protocol;
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${protocol}//${rootHost}${port}`;
}


function getDomain(hostname) {
    const parts = hostname.split('.');
    if (parts.length > 2) {
        return parts.slice(-2).join('.');
    }
    return hostname;
}

const getParticles = (selectElement) => {

    try{

        const particles = selectElement? selectElement.value : getComputedStyle(document.documentElement).getPropertyValue('--particles').trim(); 
        if (particles == "quantum") {
            return particlesJS("particles-js", {"particles":{"number":{"value":80,"density":{"enable":true,"value_area":800}},"color":{"value":"#ffffff"},"shape":{"type":"circle","stroke":{"width":0,"color":"#000000"},"polygon":{"nb_sides":5},"image":{"src":"img/github.svg","width":100,"height":100}},"opacity":{"value":0.5,"random":false,"anim":{"enable":false,"speed":1,"opacity_min":0.1,"sync":false}},"size":{"value":3,"random":true,"anim":{"enable":false,"speed":40,"size_min":0.1,"sync":false}},"line_linked":{"enable":true,"distance":150,"color":"#ffffff","opacity":0.4,"width":1},"move":{"enable":true,"speed":6,"direction":"none","random":false,"straight":false,"out_mode":"out","bounce":false,"attract":{"enable":false,"rotateX":600,"rotateY":1200}}},"interactivity":{"detect_on":"canvas","events":{"onhover":{"enable":false,"mode":"grab"},"onclick":{"enable":true,"mode":"push"},"resize":true},"modes":{"grab":{"distance":400,"line_linked":{"opacity":1}},"bubble":{"distance":400,"size":40,"duration":2,"opacity":8,"speed":3},"repulse":{"distance":200,"duration":0.4},"push":{"particles_nb":4},"remove":{"particles_nb":2}}},"retina_detect":true});
        }
        if (particles == "astral") {
            return particlesJS("particles-js", {"particles":{"number":{"value":160,"density":{"enable":true,"value_area":800}},"color":{"value":"#ffffff"},"shape":{"type":"circle","stroke":{"width":0,"color":"#000000"},"polygon":{"nb_sides":5},"image":{"src":"img/github.svg","width":100,"height":100}},"opacity":{"value":1,"random":true,"anim":{"enable":true,"speed":1,"opacity_min":0,"sync":false}},"size":{"value":3,"random":true,"anim":{"enable":false,"speed":4,"size_min":0.3,"sync":false}},"line_linked":{"enable":false,"distance":150,"color":"#ffffff","opacity":0.4,"width":1},"move":{"enable":true,"speed":1,"direction":"none","random":true,"straight":false,"out_mode":"out","bounce":false,"attract":{"enable":false,"rotateX":600,"rotateY":600}}},"interactivity":{"detect_on":"canvas","events":{"onhover":{"enable":false,"mode":"bubble"},"onclick":{"enable":false,"mode":"repulse"},"resize":true},"modes":{"grab":{"distance":400,"line_linked":{"opacity":1}},"bubble":{"distance":250,"size":0,"duration":2,"opacity":0,"speed":3},"repulse":{"distance":400,"duration":0.4},"push":{"particles_nb":4},"remove":{"particles_nb":2}}},"retina_detect":true});
        }
        if (particles == "nexus") {
            return particlesJS("particles-js", {"particles":{"number":{"value":6,"density":{"enable":true,"value_area":800}},"color":{"value":"#1b1e34"},"shape":{"type":"polygon","stroke":{"width":0,"color":"#000"},"polygon":{"nb_sides":6},"image":{"src":"img/github.svg","width":100,"height":100}},"opacity":{"value":0.3,"random":true,"anim":{"enable":false,"speed":1,"opacity_min":0.1,"sync":false}},"size":{"value":160,"random":false,"anim":{"enable":true,"speed":10,"size_min":40,"sync":false}},"line_linked":{"enable":false,"distance":200,"color":"#ffffff","opacity":1,"width":2},"move":{"enable":true,"speed":8,"direction":"none","random":false,"straight":false,"out_mode":"out","bounce":false,"attract":{"enable":false,"rotateX":600,"rotateY":1200}}},"interactivity":{"detect_on":"canvas","events":{"onhover":{"enable":false,"mode":"grab"},"onclick":{"enable":false,"mode":"push"},"resize":true},"modes":{"grab":{"distance":400,"line_linked":{"opacity":1}},"bubble":{"distance":400,"size":40,"duration":2,"opacity":8,"speed":3},"repulse":{"distance":200,"duration":0.4},"push":{"particles_nb":4},"remove":{"particles_nb":2}}},"retina_detect":true});
        }
        
        // None
        return particlesJS("particles-js", {"particles":{"number":{"value":0,"density":{"enable":true,"value_area":0}},"color":{"value":"#ffffff"},"shape":{"type":"circle","stroke":{"width":0,"color":"#000000"},"polygon":{"nb_sides":5},"image":{"src":"img/github.svg","width":100,"height":100}},"opacity":{"value":1,"random":true,"anim":{"enable":true,"speed":1,"opacity_min":0,"sync":false}},"size":{"value":3,"random":true,"anim":{"enable":false,"speed":4,"size_min":0.3,"sync":false}},"line_linked":{"enable":false,"distance":150,"color":"#ffffff","opacity":0.4,"width":1},"move":{"enable":true,"speed":1,"direction":"none","random":true,"straight":false,"out_mode":"out","bounce":false,"attract":{"enable":false,"rotateX":600,"rotateY":600}}},"interactivity":{"detect_on":"canvas","events":{"onhover":{"enable":false,"mode":"bubble"},"onclick":{"enable":false,"mode":"repulse"},"resize":true},"modes":{"grab":{"distance":400,"line_linked":{"opacity":1}},"bubble":{"distance":250,"size":0,"duration":2,"opacity":0,"speed":3},"repulse":{"distance":400,"duration":0.4},"push":{"particles_nb":4},"remove":{"particles_nb":2}}},"retina_detect":true});

    } catch (error) {
        
    }
}
getParticles();

// theme.css is injected async by head.ejs so getComputedStyle('--particles')
// can be empty on the first call → particles preset falls back to "None" (0
// particles, blank canvas). On `load` the stylesheet is guaranteed parsed;
// if the first call left an empty canvas, destroy and re-init.
window.addEventListener("load", () => {
    const cssParticles = getComputedStyle(document.documentElement).getPropertyValue('--particles').trim();
    const drewParticles = Array.isArray(window.pJSDom)
        && window.pJSDom[0]?.pJS?.particles?.array?.length > 0;
    if (!cssParticles || drewParticles) return;
    if (Array.isArray(window.pJSDom)) {
        window.pJSDom.forEach(inst => { try { inst?.pJS?.fn?.vendors?.destroypJS?.(); } catch (e) { /* ignore */ } });
        window.pJSDom = [];
    }
    const div = document.getElementById("particles-js");
    if (div) div.innerHTML = "";
    getParticles();
}, { once: true });

// bfcache restore for the particles lib: handled by the single pageshow listener
// above, which reloads once and guards against repeats. A second listener doing
// the same thing meant two reloads racing each other on every restore.

// Global hotkeys: Ctrl/Cmd+K, Ctrl/Cmd+F and `/` open the navbar search.
// Capture phase + stopPropagation so we beat the browser's own bindings
// (Ctrl+K focuses the address bar, Ctrl+F opens find-in-page). F3 still
// works as a native fallback for users who want browser find.
window.addEventListener("keydown", (e) => {
    const isCmdK = (e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey);
    const isCmdF = (e.key === "f" || e.key === "F") && (e.ctrlKey || e.metaKey);
    const target = e.target;
    const inField = target.matches && target.matches("input, textarea, [contenteditable='true']");
    const isSlash = e.key === "/" && !inField && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!isCmdK && !isCmdF && !isSlash) return;

    const li = document.getElementById("navbar-search-li");
    if (!li) return;
    e.preventDefault();
    e.stopPropagation();
    const toggle = li.querySelector('[data-bs-toggle="dropdown"]');
    if (!toggle) return;
    bootstrap.Dropdown.getOrCreateInstance(toggle).show();
}, { capture: true });

/**
 * 
 * @param {string} mediaUrl	URL of the media to set in the container
 * @param {Array} containers	Array of containers to set the media
 * @param {Array} imgClassList	Array of classes to apply to the image
 * @param {Object} videoOptions	Options for the video element
 */
const loadMedia = (mediaUrl, containers, imgClassList = [], videoOptions = {}) => {

    containers.forEach(container => {

        container.innerHTML = '';
        container.classList.add('d-flex', 'justify-content-center', 'align-items-center');

        const spinner = document.createElement('div');
        spinner.classList.add('spinner-border', 'text-secondary');
        spinner.style.width = '2rem';
        spinner.style.height = '2rem';
        spinner.setAttribute('role', 'status');
        spinner.innerHTML = '<span class="visually-hidden">Loading...</span>';
        const spinnerSpan = document.createElement('span');
        spinnerSpan.classList.add('visually-hidden');
        spinnerSpan.innerText = 'Loading...';
        spinner.appendChild(spinnerSpan);
        container.appendChild(spinner);

        const extension = mediaUrl.split('.').pop()?.toLowerCase() || '';
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        const videoExtensions = ['mp4', 'webm', 'ogg'];
        
        container.innerHTML = '';
        container.classList.remove('d-flex', 'justify-content-center', 'align-items-center');
        
        if (imageExtensions.includes(extension)) {
          const img = document.createElement('img');
          img.src = mediaUrl;
          img.alt = 'Media image';
          imgClassList.forEach(className => img.classList.add(className));
          container.appendChild(img);
        
        } else if (videoExtensions.includes(extension)) {
          const video = document.createElement('video');
          video.src = mediaUrl;
          video.autoplay = videoOptions.autoplay ?? true;
          video.loop = videoOptions.loop ?? false;
          video.muted = videoOptions.muted ?? true;
          video.controls = videoOptions.controls ?? false;
          imgClassList.forEach(className => video.classList.add(className));
          container.appendChild(video);
        
        } 
        
    });
};

const markdownToHTML = (text) => {
    // Escape first so raw HTML in the source never reaches the DOM; the
    // markdown replacements below then rebuild the safe subset we allow.
    const safeUrl = (url) => /^(https?:\/\/|\/|#|mailto:)/i.test(url) ? url : '';
    return escapeHtml(text)
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*)\*/g, '<em>$1</em>')
        .replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, src) => `<img alt="${alt}" src="${safeUrl(src)}">`)
        .replace(/\[(.*?)\]\((.*?)\)/g, (m, txt, href) => `<a href="${safeUrl(href)}">${txt}</a>`)
        .replace(/\n/g, '<br>');
};


// tab touch scropp
document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".nav-tabs").forEach((tabsContainer) => {
      let isDown = false;
      let startX;
      let scrollLeft;
  
      tabsContainer.addEventListener("mousedown", (e) => {
        isDown = true;
        tabsContainer.classList.add("active");
        startX = e.pageX - tabsContainer.offsetLeft;
        scrollLeft = tabsContainer.scrollLeft;
      });
  
      tabsContainer.addEventListener("mouseleave", () => {
        isDown = false;
        tabsContainer.classList.remove("active");
      });
  
      tabsContainer.addEventListener("mouseup", () => {
        isDown = false;
        tabsContainer.classList.remove("active");
      });
  
      tabsContainer.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - tabsContainer.offsetLeft;
        const walk = (x - startX) * 2; 
        tabsContainer.scrollLeft = scrollLeft - walk;
      });
    });
  });

  async function computeSHA256(data) {
    const encoder = new TextEncoder();
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }
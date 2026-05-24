// Shared helpers for the note card component. Exposes window.noteCard.* so both
// the home Recent notes and the /relay feed can hydrate cards consistently.
//
// Page templates are responsible for the structural pieces (pagination, IntersectionObserver,
// KPI polling). The helpers here only deal with one card / one root subtree at a time.

(function () {
  if (window.noteCard) return; // idempotent — safe to load twice

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const timeUnits = [
    ['year',   60 * 60 * 24 * 365],
    ['month',  60 * 60 * 24 * 30],
    ['week',   60 * 60 * 24 * 7],
    ['day',    60 * 60 * 24],
    ['hour',   60 * 60],
    ['minute', 60],
    ['second', 1],
  ];

  function rel(iso) {
    if (!iso) return '';
    const diff = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
    for (const [unit, sec] of timeUnits) {
      if (Math.abs(diff) >= sec || unit === 'second') {
        return rtf.format(Math.round(diff / sec), unit);
      }
    }
    return '';
  }

  function applyRelativeTimes(root) {
    (root || document).querySelectorAll('.relay-note-time[datetime]').forEach(el => {
      const iso = el.getAttribute('datetime');
      el.textContent = rel(iso);
    });
  }

  function highlightHashtags(root) {
    (root || document).querySelectorAll('.relay-note-content').forEach(el => {
      if (el.dataset.hashHighlighted === '1') return;
      el.innerHTML = el.innerHTML.replace(
        /(^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_-]{0,63})/gu,
        '$1<span class="relay-hashtag">#$2</span>'
      );
      el.dataset.hashHighlighted = '1';
    });
  }

  function attachClickHandlers(root) {
    (root || document).querySelectorAll('.relay-note[data-event]').forEach(card => {
      if (card.dataset.bound === '1') return;
      const open = (e) => {
        if (e.target.closest('a, button')) return;
        try { window.openEventModal(JSON.parse(card.dataset.event)); }
        catch (err) { console.error('openEventModal failed', err); }
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); }
      });
      card.dataset.bound = '1';
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Populate avatars + display names from the kind 0 metadata of each pubkey on screen.
  // Uses the existing subscribeRelays helper from static/js/nostr.js. Best-effort:
  // on failure the placeholder hex stays.
  async function hydrateMetadata(root) {
    if (typeof subscribeRelays !== 'function') return;
    const scope = root || document;
    const pubkeys = Array.from(new Set(
      Array.from(scope.querySelectorAll('.relay-note[data-pubkey]'))
        .map(el => el.dataset.pubkey).filter(Boolean)
    ));
    if (pubkeys.length === 0) return;
    try {
      const since = Math.floor(Date.now() / 1000) - (730 * 24 * 60 * 60);
      const events = await subscribeRelays(0, pubkeys, 'from', since);
      if (!Array.isArray(events)) return;
      const byPubkey = new Map();
      for (const ev of events) {
        if (!ev || !ev.pubkey) continue;
        const prev = byPubkey.get(ev.pubkey);
        if (!prev || ev.created_at > prev.created_at) byPubkey.set(ev.pubkey, ev);
      }
      byPubkey.forEach((ev, pubkey) => {
        let meta;
        try { meta = JSON.parse(ev.content); } catch { return; }
        const displayName = meta.display_name || meta.name || null;
        const picture = meta.picture || null;

        scope.querySelectorAll(`.relay-note-name[data-pubkey="${pubkey}"]`).forEach(el => {
          if (displayName) el.innerHTML = `<span class="fw-semibold">${escapeHtml(displayName)}</span>`;
        });
        if (picture) {
          scope.querySelectorAll(`.relay-note-avatar[data-pubkey="${pubkey}"]`).forEach(el => {
            const safeUrl = picture.replace(/"/g, '&quot;');
            el.innerHTML = `<img loading="lazy" decoding="async" alt="" src="${safeUrl}" onerror="this.parentElement.innerHTML='<span class=\\'relay-note-avatar-fallback\\'>${pubkey.slice(0,2).toUpperCase()}</span>'">`;
          });
        }
      });
    } catch (err) {
      console.debug('noteCard.hydrateMetadata failed', err);
    }
  }

  // Builds a card DOM node from a raw note object (used by the relay feed when
  // appending new pages from /api/v2/relay/notes). Keeps the markup in sync with the
  // EJS partial in src/pages/components/note-card.ejs.
  function renderNote(note, contentLimit) {
    const limit = (typeof contentLimit === 'number' && contentLimit > 0) ? contentLimit : 360;
    const iso = new Date((note.created_at || 0) * 1000).toISOString();
    const localTime = new Date((note.created_at || 0) * 1000).toLocaleString('en', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const content = String(note.content || '').trim();
    const trimmed = content.length > limit ? content.slice(0, limit) + '…' : content;
    const pubkey = String(note.pubkey || '');

    const article = document.createElement('article');
    article.className = 'relay-note';
    if (note.id != null) article.dataset.id = note.id;
    article.dataset.pubkey = pubkey;
    article.dataset.event = JSON.stringify(note);
    article.setAttribute('role', 'button');
    article.setAttribute('tabindex', '0');

    const njumpLink = note.event_id
      ? `<a class="relay-note-action" href="https://njump.me/${note.event_id}" target="_blank" rel="noopener noreferrer" title="Open in njump" onclick="event.stopPropagation();"><i class="fa-solid fa-up-right-from-square"></i></a>`
      : '';

    article.innerHTML = `
      <div class="relay-note-header">
        <div class="relay-note-avatar" data-pubkey="${pubkey}">
          <span class="relay-note-avatar-fallback">${pubkey.slice(0, 2).toUpperCase()}</span>
        </div>
        <div class="relay-note-meta flex-grow-1 min-w-0">
          <div class="relay-note-name" data-pubkey="${pubkey}">
            <code class="text-muted">${pubkey.slice(0, 12)}…${pubkey.slice(-6)}</code>
          </div>
          <time class="relay-note-time text-muted" datetime="${iso}">${localTime}</time>
        </div>
        ${njumpLink}
      </div>
      <div class="relay-note-content">${escapeHtml(trimmed)}</div>
    `;
    return article;
  }

  // Convenience: run all hydration passes on a freshly-mounted card subtree.
  function hydrateAll(root) {
    applyRelativeTimes(root);
    highlightHashtags(root);
    attachClickHandlers(root);
    hydrateMetadata(root);
  }

  window.noteCard = {
    applyRelativeTimes,
    highlightHashtags,
    attachClickHandlers,
    hydrateMetadata,
    hydrateAll,
    renderNote,
    escapeHtml,
  };
})();

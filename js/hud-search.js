// Search palette: a roll-up modal with instant client-side results.
// The page index comes from /search.json (theme PHP route, cached); it is
// fetched the first time the palette opens, never before. Ctrl/Cmd+K or "/"
// opens it, Esc closes, arrows navigate, Enter follows the active row.
(() => {
  const palette = document.getElementById('hud-palette');
  if (!palette) return;
  const input = document.getElementById('hud-palette-input');
  const list = document.getElementById('hud-palette-list');
  const status = document.getElementById('hud-palette-status');
  const panel = palette.querySelector('.hud-palette-panel');

  let index = null; // {v, pages:[{t,u,s,l,e,d}]}
  let loading = null;
  let results = [];
  let active = -1;
  let lastFocus = null;

  const lang = () => (document.documentElement.getAttribute('lang') || '').slice(0, 2);

  // Translated strings are handed over as data attributes on the list
  // element (base.html.twig), so this file stays language-free.
  const labels = {
    one: list.dataset.statusOne || '%s — 1 result',
    many: list.dataset.statusMany || '%s — %s results',
    none: list.dataset.statusNone || '%s — no results',
    loading: list.dataset.loading || 'Loading index…',
    sections: {
      blog: list.dataset.labelBlog || 'Blog',
      wiki: list.dataset.labelWiki || 'Wiki',
      zoo: list.dataset.labelZoo || 'Zoo',
      page: list.dataset.labelPage || 'Pages',
    },
  };

  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    const l = lang();
    const url = (l === 'en' || l === 'de' ? '/' + l : '') + '/search.json';
    loading = fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => { index = data; return data; })
      .catch(() => { loading = null; return { v: 1, pages: [] }; });
    return loading;
  }

  function score(page, tokens) {
    const t = norm(page.t), e = norm(page.e), u = norm(page.u);
    let sum = 0;
    for (const tok of tokens) {
      let s = 0;
      if (t === tok) s = 6;
      else if (t.includes(tok)) s = 4;
      else if (e.includes(tok)) s = 2;
      else if (u.includes(tok)) s = 1;
      if (s === 0) return -1; // AND semantics, like the old SimpleSearch
      sum += s;
    }
    return sum;
  }

  function query(q) {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    if (!tokens.length) { results = []; render(''); return; }
    const hits = [];
    for (const p of (index && index.pages) || []) {
      const s = score(p, tokens);
      if (s >= 0) hits.push({ p, s });
    }
    hits.sort((a, b) => b.s - a.s || (b.p.d || '').localeCompare(a.p.d || ''));
    results = hits.slice(0, 25).map((h) => h.p);
    render(q, hits.length);
  }

  function render(q, total) {
    active = -1;
    input.removeAttribute('aria-activedescendant');
    list.innerHTML = '';
    if (q && status) {
      const n = total || 0;
      // translations already wrap the query in their own quotation marks
      status.textContent = n === 0 ? labels.none.replace('%s', q)
        : n === 1 ? labels.one.replace('%s', q)
        : labels.many.replace('%s', q).replace('%s', n);
    } else if (status) {
      status.textContent = '';
    }
    const order = ['blog', 'wiki', 'zoo', 'page'];
    let n = 0;
    for (const sec of order) {
      const group = results.filter((p) => (p.s || 'page') === sec);
      if (!group.length) continue;
      const head = document.createElement('li');
      head.className = 'hud-palette-group';
      head.setAttribute('role', 'presentation');
      head.textContent = labels.sections[sec] || sec;
      list.appendChild(head);
      for (const p of group) {
        const li = document.createElement('li');
        li.className = 'hud-palette-item';
        li.setAttribute('role', 'presentation');
        // role=option on the anchor itself: a link inside an option would be
        // a nested interactive widget (axe nested-interactive).
        const a = document.createElement('a');
        a.href = p.u;
        a.tabIndex = -1; // navigation is driven by activedescendant + Enter
        a.id = 'hud-popt-' + n++;
        a.setAttribute('role', 'option');
        a.setAttribute('aria-selected', 'false');
        const st = document.createElement('span');
        st.className = 'hud-palette-title';
        st.textContent = p.t;
        const su = document.createElement('span');
        su.className = 'hud-palette-url';
        const pl = (p.u.split('/')[1] || '').slice(0, 2);
        su.textContent = p.u + (pl === 'en' || pl === 'de' ? '  [' + pl + ']' : '');
        a.appendChild(st);
        a.appendChild(su);
        li.appendChild(a);
        list.appendChild(li);
      }
    }
    input.setAttribute('aria-expanded', results.length ? 'true' : 'false');
    if (q && !results.length) setActive(0); // nothing to select, keep state clean
  }

  function items() {
    return Array.from(list.querySelectorAll('a[role="option"]'));
  }

  function setActive(i) {
    const its = items();
    if (its.length) i = Math.max(0, Math.min(i, its.length - 1));
    else i = -1;
    its.forEach((el, k) => el.setAttribute('aria-selected', k === i ? 'true' : 'false'));
    active = i;
    if (i >= 0) {
      input.setAttribute('aria-activedescendant', its[i].id);
      its[i].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function open(prefill) {
    lastFocus = document.activeElement;
    palette.hidden = false;
    document.documentElement.classList.add('palette-open');
    input.value = prefill || '';
    input.focus();
    if (index) {
      query(input.value);
    } else {
      status.textContent = labels.loading;
      loadIndex().then(() => { if (!input.value) status.textContent = ''; else query(input.value); });
    }
  }

  function close() {
    palette.hidden = true;
    document.documentElement.classList.remove('palette-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // Openers: header pill(s) + optional auto-open marker (search shell page).
  document.querySelectorAll('[data-open-search]').forEach((btn) => {
    btn.addEventListener('click', () => open(''));
  });
  const auto = document.querySelector('[data-palette-open]');
  if (auto) open(auto.dataset.paletteQuery || '');

  document.addEventListener('keydown', (e) => {
    const combo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
    const slash = e.key === '/' && !e.ctrlKey && !e.metaKey &&
      !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if ((combo || slash) && palette.hidden) {
      e.preventDefault();
      open('');
      return;
    }
    if (palette.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); return; }
    if (e.key === 'Home' && active >= 0) { e.preventDefault(); setActive(0); return; }
    if (e.key === 'End' && active >= 0) { e.preventDefault(); setActive(items().length - 1); return; }
    if (e.key === 'Enter') {
      const its = items();
      if (active >= 0 && its[active]) { e.preventDefault(); its[active].click(); }
      return;
    }
    if (e.key === 'Tab') {
      // focus stays in the panel: input and close button only
      const focusables = panel.querySelectorAll('input, button');
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  });

  palette.querySelectorAll('[data-palette-close]').forEach((el) => {
    el.addEventListener('click', close);
  });

  let debounce = 0;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { loadIndex().then(() => query(input.value)); }, 60);
  });

  list.addEventListener('click', (e) => {
    const a = e.target.closest('a[role="option"]');
    if (a) {
      setActive(items().indexOf(a));
      // let the click through as a normal navigation (respects new-tab clicks)
    }
  });
})();

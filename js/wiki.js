/* Wiki docs sidebar: collapsible branches, remembered state, TOC, mobile drawer.
   Progressive enhancement — without JS the tree renders expanded and stacked. */
(function () {
  'use strict';
  document.documentElement.classList.add('wiki-js');

  var STORE_KEY = 'hud-wiki-branches';
  var stored = {};
  try { stored = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { stored = {}; }

  /* --- Collapsible branches --- */
  var branches = {};
  document.querySelectorAll('.wiki-twist').forEach(function (btn) {
    var id = btn.getAttribute('data-twist');
    var box = document.getElementById(id);
    if (!box) return;
    branches[id] = box;
    var open = id in stored ? stored[id] : box.classList.contains('is-open');
    setOpen(btn, box, open);
    btn.addEventListener('click', function () {
      var next = !box.classList.contains('is-open');
      setOpen(btn, box, next);
      stored[id] = next;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(stored)); } catch (e) {}
    });
  });

  function setOpen(btn, box, open) {
    box.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* --- Live tree filter on the search input ---
     Typing filters the tree as you go; pressing Enter runs the full-text
     search page. Folders stay visible when any descendant matches. */
  var input = document.querySelector('.wiki-search-input');
  if (input) {
    var nodes = Array.prototype.slice.call(document.querySelectorAll('.wiki-node'));
    // DOM nodes cannot be plain-object keys (they coerce to one string) — use Maps.
    var nodeTitle = new Map();
    nodes.forEach(function (li) {
      var t = li.querySelector('.wiki-node-title');
      nodeTitle.set(li, (t ? t.textContent : li.textContent).toLowerCase());
    });

    function filter(term) {
      if (!term) {
        nodes.forEach(function (li) { li.hidden = false; });
        return;
      }
      var hits = new Map();
      nodes.forEach(function (li) {
        if (nodeTitle.get(li).indexOf(term) !== -1) {
          // reveal the node and every ancestor branch
          var el = li;
          while (el && el.classList && el.classList.contains('wiki-node')) {
            hits.set(el, true);
            el = el.parentElement ? el.parentElement.closest('.wiki-node') : null;
          }
          var box = li.parentElement;
          if (box && box.classList.contains('wiki-branch')) box.classList.add('is-open');
        }
      });
      nodes.forEach(function (li) { li.hidden = !hits.has(li); });
    }

    input.addEventListener('input', function () {
      filter(input.value.trim().toLowerCase());
    });
  }

  /* --- Table of contents from the article's headings --- */
  var tocList = document.querySelector('.wiki-toc-list');
  var tocNav = document.querySelector('.wiki-toc');
  var article = document.querySelector('.wiki-main .content-item');
  if (tocList && tocNav && article) {
    var items = [];
    article.querySelectorAll('h2, h3').forEach(function (h, i) {
      if (!h.id) h.id = 'sec-' + i;
      var li = document.createElement('li');
      li.className = 'wiki-toc-item' + (h.tagName === 'H3' ? ' wiki-toc-h3' : '');
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      li.appendChild(a);
      tocList.appendChild(li);
      items.push({ h: h, a: a });
    });
    if (items.length) {
      tocNav.hidden = false;
      var current = items[0].a;
      var mark = function () {
        if (current) current.classList.remove('is-current');
        current = items[0].a;
        for (var i = 0; i < items.length; i++) {
          if (items[i].h.getBoundingClientRect().top <= 90) current = items[i].a;
        }
        current.classList.add('is-current');
      };
      mark();
      window.addEventListener('scroll', mark, { passive: true });
    }
  }

  /* --- Mobile drawer --- */
  var drawerBtn = document.querySelector('.wiki-drawer-toggle');
  var layout = document.querySelector('.wiki-layout');
  if (drawerBtn && layout) {
    drawerBtn.addEventListener('click', function () {
      var open = layout.classList.toggle('is-sidebar-open');
      drawerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
})();

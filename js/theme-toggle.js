/*
 * Grava the HUD — appearance controller
 *
 * Two-state toggle: the theme is light or dark. Initial mode = stored user
 * choice (localStorage), else the OS preference (prefers-color-scheme).
 * A click flips light <-> dark and stores the choice; afterwards the OS
 * preference no longer matters. While nothing is stored, OS changes still
 * follow live.
 *
 * The inline bootstrap in base.html.twig sets data-theme + data-theme-preference
 * before first paint to eliminate FOUC; this file keeps them in sync at runtime.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'grava-theme';
  var root = document.documentElement;

  function getStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v === null) {
        // Migrate the preference stored by the pre-rename theme (quark2-*).
        var legacy = localStorage.getItem('quark2-theme');
        if (legacy === 'light' || legacy === 'dark') {
          localStorage.setItem(STORAGE_KEY, legacy);
          return legacy;
        }
      }
      return v;
    } catch (e) { return null; }
  }
  function setStored(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
  }
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function currentMode() {
    var stored = getStored();
    if (stored === 'light' || stored === 'dark') return stored;
    return systemPrefersDark() ? 'dark' : 'light';
  }

  function applyMode(mode) {
    root.setAttribute('data-theme', mode);
    root.setAttribute('data-theme-preference', mode);
    root.classList.toggle('dark', mode === 'dark');
  }

  // English stand-ins; real strings come from the button's data-* attributes
  // (theme-toggle.html.twig fills them from languages.yaml).
  var FALLBACK_LABELS = { light: 'Light', dark: 'Dark' };
  var FALLBACK_ARIA = 'Appearance: %s';
  var FALLBACK_TITLE = 'Appearance: %s (click to switch)';

  function attr(button, name, fallback) {
    var value = button.getAttribute(name);
    return value !== null && value !== '' ? value : fallback;
  }

  function updateToggleLabel(button, mode) {
    if (!button) return;
    var label = attr(button, 'data-label-' + mode, FALLBACK_LABELS[mode]);
    var aria = attr(button, 'data-aria-template', FALLBACK_ARIA);
    var title = attr(button, 'data-title-template', FALLBACK_TITLE);
    button.setAttribute('aria-label', aria.replace('%s', label));
    button.setAttribute('title', title.replace('%s', label));
    button.setAttribute('data-mode', mode);
  }

  // Follow the OS while the user has not chosen explicitly.
  if (window.matchMedia) {
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var handler = function () {
      if (!getStored()) applyMode(currentMode());
    };
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else if (mql.addListener) mql.addListener(handler);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var mode = currentMode();
    applyMode(mode);
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    buttons.forEach(function (btn) {
      updateToggleLabel(btn, mode);
      btn.addEventListener('click', function () {
        var next = mode === 'dark' ? 'light' : 'dark';
        mode = next;
        setStored(next);
        applyMode(next);
        buttons.forEach(function (b) { updateToggleLabel(b, next); });
      });
    });
  });
})();

/*
 * Quark 2 — language controller
 *
 * Default: on the first visit (no stored choice) the browser language decides.
 * If the browser prefers a supported language other than the one being served,
 * we store that choice and swap this same page to it. Once the user clicks the
 * toggle their choice wins, forever.
 *
 * Runs in the head (before the body exists): the redirect uses only the html
 * lang attribute + data-lang-supported; the toggle click listener waits for
 * DOMContentLoaded. The toggle itself is a real link (partials/language-toggle
 * .html.twig), so it also works without JS.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'grava-lang';
  var root = document.documentElement;
  var current = root.getAttribute('lang') || 'en';
  var supported = (root.dataset.langSupported || '').split(',').filter(Boolean);

  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function setStored(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
  }

  function browserLanguage() {
    var prefs = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < prefs.length; i++) {
      var base = String(prefs[i]).toLowerCase().split('-')[0];
      if (supported.indexOf(base) !== -1) return base;
    }
    return null;
  }

  // Same page in another language: swap the leading language prefix.
  function alternateHref(other) {
    var p = location.pathname;
    var rest = p;
    if (p === '/' + current) rest = '/';
    else if (p.indexOf('/' + current + '/') === 0) rest = p.slice(current.length + 1);
    if (rest.indexOf('/' + other) === 0) return rest;
    if (rest === '/' || rest === '') return '/' + other;
    return '/' + other + rest;
  }

  // Which language to serve: stored choice wins; otherwise the browser
  // language — unless the URL was opened as an explicit link into a
  // non-default language (Grav redirects bare / to the default prefix, so
  // only a non-default prefix counts as an explicit choice).
  var defaultLang = root.dataset.langDefault || 'en';
  var p = location.pathname;
  var wanted = getStored();
  if (!wanted) {
    var explicit = supported.some((c) => c !== defaultLang && (p === '/' + c || p.indexOf('/' + c + '/') === 0));
    if (!explicit) wanted = browserLanguage();
  }
  if (wanted && wanted !== current) {
    var url = alternateHref(wanted);
    if (url) {
      setStored(wanted);
      location.replace(url + location.search + location.hash);
      return;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('.lang-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var target = btn.getAttribute('data-lang-target');
      if (target) setStored(target);
    });
  });
})();

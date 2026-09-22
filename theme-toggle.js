/* theme-toggle.js — binds the .theme-toggle buttons injected into
   admin.html and student-workspace.html. The actual data-theme value is
   applied pre-paint by a tiny inline snippet in each page <head>; this
   file only wires the click handlers, `aria` labels and cross-tab sync. */
(function () {
  'use strict';

  var root = document.documentElement;

  function currentTheme() {
    var t = root.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') {
      return t;
    }
    /* No saved/known theme — the app defaults to dark mode. */
    return 'dark';
  }

  function applyTheme(theme) {
    var next = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('quizTheme:v2', next);
    } catch (e) {
      /* storage unavailable — attribute-only */
    }
    try {
      document.dispatchEvent(
        new CustomEvent('quiz:themechange', { detail: next }),
      );
    } catch (e) {
      /* CustomEvent unsupported — skip */
    }
    var label = next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    var buttons = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].setAttribute('aria-label', label);
      buttons[i].setAttribute('title', label);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(currentTheme());
    var buttons = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener('click', function () {
        applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
      });
    }
  });

  window.addEventListener('storage', function (event) {
    if (event.key === 'quizTheme:v2' && event.newValue) {
      applyTheme(event.newValue);
    }
  });
})();
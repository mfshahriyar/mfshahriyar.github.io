(function () {
  var root = document.documentElement;
  var btn = document.getElementById('theme-toggle');

  function isDark() {
    var t = root.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function updateIcon() {
    if (!btn) return;
    btn.innerHTML = isDark()
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
  }

  if (btn) {
    btn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      updateIcon();
    });
  }
  updateIcon();

  // Close mobile menu after clicking a link
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    a.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
  });

  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();

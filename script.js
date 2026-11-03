(function () {
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav a'));

  // Mobile menu
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = header.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  links.forEach(function (a) {
    a.addEventListener('click', function () {
      header.classList.remove('open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  });

  // Highlight the nav item for the section in view
  var sections = links
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  function onScroll() {
    var offset = header.offsetHeight + 40;
    var current = sections[0];
    sections.forEach(function (s) {
      if (s.getBoundingClientRect().top - offset <= 0) current = s;
    });
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) {
      current = sections[sections.length - 1];
    }
    links.forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current.id);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();

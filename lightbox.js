/* Lightbox for photography and certificate images.
   Opens with a fade + zoom, closes with ×, Esc, or a click outside the image.
   Left/right arrows (buttons or keys) move between images in the same group. */
(function () {
  var groups = [
    { name: 'photos', selector: '.photo-frame a' },
    { name: 'certs', selector: '.cert a' }
  ];

  var box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML =
    '<button class="lb-close" aria-label="Close">&times;</button>' +
    '<button class="lb-nav lb-prev" aria-label="Previous image">&#8249;</button>' +
    '<figure class="lb-figure"><img class="lb-img" alt=""><figcaption class="lb-caption"></figcaption></figure>' +
    '<button class="lb-nav lb-next" aria-label="Next image">&#8250;</button>';
  // Hidden inline so it never shows at the page bottom, even if style.css is stale.
  box.style.display = 'none';
  document.body.appendChild(box);
  var hideTimer = null;

  var img = box.querySelector('.lb-img');
  var cap = box.querySelector('.lb-caption');
  var prev = box.querySelector('.lb-prev');
  var next = box.querySelector('.lb-next');
  var closeBtn = box.querySelector('.lb-close');
  var items = [], index = 0, lastFocus = null;

  function captionFor(a) {
    var card = a.closest('.photo-card, .cert');
    if (!card) return '';
    var t = card.querySelector('.photo-title, figcaption strong');
    return t ? t.textContent : '';
  }

  function show(i) {
    index = (i + items.length) % items.length;
    var a = items[index];
    var thumb = a.querySelector('img');
    box.classList.add('loading');
    img.onload = function () { box.classList.remove('loading'); };
    img.src = a.getAttribute('href');
    img.alt = thumb ? thumb.alt : '';
    cap.textContent = captionFor(a);
    var many = items.length > 1;
    prev.hidden = next.hidden = !many;
  }

  function open(list, i) {
    items = list;
    lastFocus = document.activeElement;
    show(i);
    clearTimeout(hideTimer);
    box.style.display = '';
    box.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('lb-lock');
    void box.offsetWidth; // apply display before animating so the fade runs
    box.classList.add('open');
    closeBtn.focus();
  }

  function close() {
    box.classList.remove('open');
    box.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('lb-lock');
    hideTimer = setTimeout(function () { box.style.display = 'none'; }, 320);
    if (lastFocus) lastFocus.focus();
  }

  groups.forEach(function (g) {
    var links = Array.prototype.slice.call(document.querySelectorAll(g.selector));
    links.forEach(function (a, i) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        open(links, i);
      });
    });
  });

  closeBtn.addEventListener('click', close);
  prev.addEventListener('click', function (e) { e.stopPropagation(); show(index - 1); });
  next.addEventListener('click', function (e) { e.stopPropagation(); show(index + 1); });
  box.addEventListener('click', function (e) {
    if (e.target === box || e.target.classList.contains('lb-figure')) close();
  });
  document.addEventListener('keydown', function (e) {
    if (!box.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' && items.length > 1) show(index - 1);
    else if (e.key === 'ArrowRight' && items.length > 1) show(index + 1);
  });
})();

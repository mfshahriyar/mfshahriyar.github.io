/* "Listen to this page": reads the main content aloud with the browser's
   built-in speech synthesis. Play/pause, stop, and speed from 1x to 2x.
   The paragraph being read is highlighted. Hidden if the browser has no
   speech support. */
(function () {
  var bar = document.querySelector('.listen-bar');
  if (!bar) return;
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    bar.hidden = true;
    return;
  }
  var synth = window.speechSynthesis;
  var playBtn = bar.querySelector('.listen-play');
  var stopBtn = bar.querySelector('.listen-stop');
  var speedSel = bar.querySelector('.listen-speed');
  var status = bar.querySelector('.listen-status');

  var SKIP = '.listen-bar, .pub-links, .section-head .muted, .photo-caption summary, .footer, script, style';
  var BLOCKS = 'h2, h3, h4, p, li, dt, dd, .pub-title, .pub-authors, .pub-venue, figcaption';

  var chunks = [];     // { el, text }
  var index = 0;
  var state = 'idle';  // idle | playing | paused
  var token = 0;       // ignores events from cancelled utterances
  var voice = null;

  try { var saved = localStorage.getItem('listenRate'); if (saved) speedSel.value = saved; } catch (e) {}

  function pickVoice() {
    var vs = synth.getVoices();
    if (!vs.length) return;
    var en = vs.filter(function (v) { return /^en(-|_|$)/i.test(v.lang); });
    var pref = en.filter(function (v) { return /natural|google|samantha|daniel|aria|jenny|guy/i.test(v.name); });
    voice = pref[0] || en[0] || vs[0];
  }
  pickVoice();
  if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);
  else synth.onvoiceschanged = pickVoice;

  function clean(t) {
    return t
      .replace(/\[(\d{4})\.(\d{2})\]/g, '$1, $2.')       // [2026.10] -> 2026, 10.
      .replace(/\[(\d{4})\]/g, '$1.')
      .replace(/\[at\]/g, ' at ').replace(/\[dot\]/g, ' dot ')
      .replace(/Ph\.D\./g, 'PhD').replace(/M\.Sc\./g, 'M S C').replace(/Dr\./g, 'Doctor')
      .replace(/\bMd\. ?/g, 'Mohammad ').replace(/Prof\./g, 'Professor').replace(/&middot;|·/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function collect() {
    var main = document.querySelector('main.content');
    var out = [];
    main.querySelectorAll(BLOCKS).forEach(function (el) {
      if (el.closest(SKIP)) return;
      // Skip containers whose text is read through a nested block.
      if (el.querySelector(BLOCKS)) return;
      var text = clean(el.textContent || '');
      if (text.length < 2) return;
      if (/^H[234]$/.test(el.tagName) && !/[.!?]$/.test(text)) text += '.';
      // Long paragraphs are split into sentences (some browsers stop long utterances).
      var parts = text.length > 220 ? text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) : [text];
      parts.forEach(function (p) { p = p.trim(); if (p) out.push({ el: el, text: p }); });
    });
    return out;
  }

  function highlight(el) {
    document.querySelectorAll('.listen-active').forEach(function (n) { n.classList.remove('listen-active'); });
    if (!el) return;
    el.classList.add('listen-active');
    var r = el.getBoundingClientRect();
    var top = (document.querySelector('.site-header') || {}).offsetHeight || 0;
    if (r.top < top + 10 || r.bottom > window.innerHeight - 20) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function setUI() {
    var playing = state === 'playing';
    playBtn.innerHTML = playing ? '<i class="fa-solid fa-pause"></i><span>Pause</span>'
                                : '<i class="fa-solid fa-play"></i><span>' + (state === 'paused' ? 'Resume' : 'Listen') + '</span>';
    playBtn.setAttribute('aria-label', playing ? 'Pause reading' : (state === 'paused' ? 'Resume reading' : 'Listen to this page'));
    stopBtn.disabled = state === 'idle';
    bar.classList.toggle('is-playing', playing);
    if (state === 'idle') status.textContent = 'Have this page read aloud';
    else status.textContent = (state === 'paused' ? 'Paused, ' : 'Reading, ') + Math.min(index + 1, chunks.length) + ' of ' + chunks.length;
  }

  function speak() {
    if (index >= chunks.length) { stop(); return; }
    var my = ++token;
    var c = chunks[index];
    var u = new SpeechSynthesisUtterance(c.text);
    u.rate = parseFloat(speedSel.value) || 1;
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-US'; }
    u.onend = function () {
      if (my !== token || state !== 'playing') return;
      index++;
      speak();
    };
    u.onerror = function (e) {
      if (my !== token || state !== 'playing') return;
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
      index++;
      speak();
    };
    highlight(c.el);
    setUI();
    synth.speak(u);
  }

  function play() {
    if (state === 'idle') { chunks = collect(); index = 0; }
    state = 'playing';
    token++;
    synth.cancel();
    speak();
  }

  function pause() {
    state = 'paused';
    token++;
    synth.cancel();   // pause() is unreliable across browsers; resume restarts the current part
    setUI();
  }

  function stop() {
    state = 'idle';
    token++;
    synth.cancel();
    index = 0;
    highlight(null);
    setUI();
  }

  playBtn.addEventListener('click', function () {
    if (state === 'playing') pause(); else play();
  });
  stopBtn.addEventListener('click', stop);
  speedSel.addEventListener('change', function () {
    try { localStorage.setItem('listenRate', speedSel.value); } catch (e) {}
    if (state === 'playing') { token++; synth.cancel(); speak(); }  // apply new speed now
  });
  window.addEventListener('beforeunload', function () { synth.cancel(); });

  bar.hidden = false;
  setUI();
})();

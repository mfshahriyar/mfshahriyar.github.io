/* "Listen to this page": reads the main content aloud with the browser's
   built-in speech synthesis.

   - Opened from the headphones button in the header (floating player).
   - Play / pause / resume, stop, volume 0-100% with mute, speed 1x-2x.
   - Changing speed or volume continues from the current word, not from
     the start of the paragraph.
   - Text is spoken in short pieces, and a watchdog restarts speech if the
     browser's speech engine stalls (a known browser issue).
   - Hidden in browsers without speech support. */
(function () {
  var panel = document.querySelector('.listen-panel');
  var toggle = document.querySelector('.listen-toggle');
  if (!panel || !toggle) return;
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;

  var synth = window.speechSynthesis;
  var playBtn = panel.querySelector('.listen-play');
  var stopBtn = panel.querySelector('.listen-stop');
  var closeBtn = panel.querySelector('.listen-close');
  var status = panel.querySelector('.listen-status');
  var speedSel = panel.querySelector('.listen-speed');
  var volInput = panel.querySelector('.listen-vol');
  var volVal = panel.querySelector('.listen-vol-val');
  var muteBtn = panel.querySelector('.listen-mute');

  var SKIP = '.pub-links, .section-head .muted, .photo-caption summary, .footer, script, style';
  var BLOCKS = 'h2, h3, h4, p, li, dt, dd, .pub-title, .pub-authors, .pub-venue, figcaption';
  var MAX_PIECE = 160;          // characters per spoken piece

  var pieces = [];              // { el, text }
  var index = 0;                // current piece
  var offset = 0;               // character offset inside the current piece
  var state = 'idle';           // idle | playing | paused
  var token = 0;                // ignores events from cancelled utterances
  var voice = null;
  var lastVolume = 100;
  var current = null;           // { token, started, ended, startedAt, lastEvent, expectedMs, retries }
  var watchdog = null;
  var startTimer = null;
  var settingTimer = null;

  /* ---------- saved settings ---------- */
  try {
    var r = localStorage.getItem('listenRate'); if (r) speedSel.value = r;
    var v = localStorage.getItem('listenVolume'); if (v !== null) volInput.value = v;
  } catch (e) {}

  /* ---------- voice ---------- */
  function pickVoice() {
    var vs = synth.getVoices();
    if (!vs.length) return;
    var en = vs.filter(function (x) { return /^en(-|_|$)/i.test(x.lang); });
    var pref = en.filter(function (x) { return /natural|google|samantha|daniel|aria|jenny|guy/i.test(x.name); });
    voice = pref[0] || en[0] || vs[0];
  }
  pickVoice();
  if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);
  else synth.onvoiceschanged = pickVoice;

  /* ---------- text ---------- */
  function clean(t) {
    return t
      .replace(/\[(\d{4})\.(\d{2})\]/g, '$1, $2.')
      .replace(/\[(\d{4})\]/g, '$1.')
      .replace(/\[at\]/g, ' at ').replace(/\[dot\]/g, ' dot ')
      .replace(/Ph\.D\./g, 'PhD').replace(/M\.Sc\./g, 'M S C').replace(/Dr\./g, 'Doctor')
      .replace(/\bMd\. ?/g, 'Mohammad ').replace(/Prof\./g, 'Professor').replace(/·/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Split into sentences, then split long sentences at commas/semicolons or spaces.
  function split(text) {
    var sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
    var out = [];
    sentences.forEach(function (s) {
      s = s.trim();
      while (s.length > MAX_PIECE) {
        var cut = Math.max(s.lastIndexOf(', ', MAX_PIECE), s.lastIndexOf('; ', MAX_PIECE));
        if (cut < 60) cut = s.lastIndexOf(' ', MAX_PIECE);
        if (cut < 40) cut = MAX_PIECE;
        out.push(s.slice(0, cut + 1).trim());
        s = s.slice(cut + 1).trim();
      }
      if (s) out.push(s);
    });
    return out;
  }

  function collect() {
    var main = document.querySelector('main.content');
    var out = [];
    main.querySelectorAll(BLOCKS).forEach(function (el) {
      if (el.closest(SKIP)) return;
      if (el.querySelector(BLOCKS)) return;   // read through the nested block instead
      var text = clean(el.textContent || '');
      if (text.length < 2) return;
      if (/^H[234]$/.test(el.tagName) && !/[.!?]$/.test(text)) text += '.';
      split(text).forEach(function (p) { out.push({ el: el, text: p }); });
    });
    return out;
  }

  /* ---------- UI ---------- */
  function highlight(el) {
    var prev = document.querySelector('.listen-active');
    if (prev === el) return;
    if (prev) prev.classList.remove('listen-active');
    if (!el) return;
    el.classList.add('listen-active');
    var rect = el.getBoundingClientRect();
    var top = (document.querySelector('.site-header') || {}).offsetHeight || 0;
    var bottom = window.innerHeight - (panel.offsetHeight || 0) - 24;
    if (rect.top < top + 10 || rect.bottom > bottom) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function setUI() {
    var playing = state === 'playing';
    playBtn.innerHTML = playing ? '<i class="fa-solid fa-pause"></i><span>Pause</span>'
      : '<i class="fa-solid fa-play"></i><span>' + (state === 'paused' ? 'Resume' : 'Play') + '</span>';
    playBtn.setAttribute('aria-label', playing ? 'Pause reading' : (state === 'paused' ? 'Resume reading' : 'Start reading'));
    stopBtn.disabled = state === 'idle';
    panel.classList.toggle('is-playing', playing);
    toggle.classList.toggle('is-playing', playing);
    if (state === 'idle') status.textContent = 'Ready';
    else {
      var pct = pieces.length ? Math.round((index / pieces.length) * 100) : 0;
      status.textContent = (state === 'paused' ? 'Paused' : 'Reading') + ' · ' + pct + '%';
    }
  }

  function syncVolumeUI() {
    var v = parseInt(volInput.value, 10) || 0;
    volVal.textContent = v + '%';
    volInput.style.setProperty('--fill', v + '%');
    var icon = v === 0 ? 'fa-volume-xmark' : (v < 50 ? 'fa-volume-low' : 'fa-volume-high');
    muteBtn.innerHTML = '<i class="fa-solid ' + icon + '"></i>';
    muteBtn.setAttribute('aria-label', v === 0 ? 'Unmute' : 'Mute');
    muteBtn.title = v === 0 ? 'Unmute' : 'Mute';
  }

  /* ---------- speaking ---------- */
  function rate() { return parseFloat(speedSel.value) || 1; }
  function volume() { return (parseInt(volInput.value, 10) || 0) / 100; }

  function stopEngine() {
    token++;
    clearTimeout(startTimer);
    current = null;
    synth.cancel();
  }

  // Some browsers drop speech queued right after cancel(), so wait a moment.
  function speakSoon(delay) {
    clearTimeout(startTimer);
    startTimer = setTimeout(speakCurrent, delay == null ? 80 : delay);
  }

  function next() {
    index++;
    offset = 0;
    speakSoon(30);
  }

  function speakCurrent() {
    if (state !== 'playing') return;
    if (index >= pieces.length) { stop(); return; }
    var piece = pieces[index];
    var text = piece.text.slice(offset);
    if (!text.trim()) { next(); return; }

    var my = ++token;
    var base = offset;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = rate();
    u.volume = volume();
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-US'; }

    // ~14 characters per second at 1x, with generous slack.
    current = {
      token: my, started: false, ended: false, retries: current && current.retries || 0,
      startedAt: Date.now(), lastEvent: Date.now(),
      expectedMs: (text.length / (14 * u.rate)) * 1000
    };
    var info = current;

    u.onstart = function () { if (my === token) { info.started = true; info.lastEvent = Date.now(); } };
    u.onboundary = function (e) {
      if (my !== token) return;
      info.lastEvent = Date.now();
      if (e && typeof e.charIndex === 'number') offset = base + e.charIndex;
    };
    u.onend = function () {
      if (my !== token || state !== 'playing') return;
      info.ended = true;
      if (current) current.retries = 0;
      next();
    };
    u.onerror = function (e) {
      if (my !== token || state !== 'playing') return;
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
      info.ended = true;
      next();
    };

    highlight(piece.el);
    setUI();
    synth.speak(u);
  }

  // Watchdog: recovers when the speech engine stalls without finishing.
  function checkStall() {
    if (state !== 'playing' || !current || current.ended) return;
    var now = Date.now();
    var age = now - current.startedAt;
    var idle = !synth.speaking && !synth.pending;
    var stalledSilently = idle && age > 1500;                          // engine stopped but never said "done"
    var neverStarted = !current.started && age > 5000;                 // speech never began
    var overdue = age > current.expectedMs * 2.5 + 6000;               // far longer than it should take
    if (!(stalledSilently || neverStarted || overdue)) return;

    if (current.retries < 1 && (neverStarted || stalledSilently) && !current.started) {
      current.retries++;
      stopEngine();
      speakSoon(120);                   // try the same piece once more
    } else {
      stopEngine();
      index++; offset = 0;
      speakSoon(120);                   // move on rather than getting stuck
    }
  }

  function startWatchdog() { if (!watchdog) watchdog = setInterval(checkStall, 1000); }
  function stopWatchdog() { clearInterval(watchdog); watchdog = null; }

  function play() {
    if (state === 'idle') { pieces = collect(); index = 0; offset = 0; }
    state = 'playing';
    stopEngine();
    startWatchdog();
    speakSoon(60);
  }

  function pause() {
    state = 'paused';
    stopEngine();        // pause() is unreliable across browsers; resume continues from the saved word
    stopWatchdog();
    setUI();
  }

  function stop() {
    state = 'idle';
    stopEngine();
    stopWatchdog();
    index = 0; offset = 0;
    highlight(null);
    setUI();
  }

  // Speed and volume can't change mid-utterance, so restart from the current word.
  function applySettingNow() {
    clearTimeout(settingTimer);
    settingTimer = setTimeout(function () {
      if (state !== 'playing') return;
      stopEngine();
      speakSoon(80);
    }, 250);
  }

  /* ---------- panel open / close ---------- */
  function openPanel() {
    panel.hidden = false;
    void panel.offsetWidth;
    panel.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    playBtn.focus();
  }
  function closePanel() {
    stop();
    panel.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    setTimeout(function () { if (!panel.classList.contains('open')) panel.hidden = true; }, 250);
    toggle.focus();
  }

  /* ---------- events ---------- */
  toggle.addEventListener('click', function () {
    if (panel.classList.contains('open')) closePanel(); else openPanel();
  });
  closeBtn.addEventListener('click', closePanel);
  playBtn.addEventListener('click', function () { if (state === 'playing') pause(); else play(); });
  stopBtn.addEventListener('click', stop);
  speedSel.addEventListener('change', function () {
    try { localStorage.setItem('listenRate', speedSel.value); } catch (e) {}
    applySettingNow();
  });
  volInput.addEventListener('input', function () {
    try { localStorage.setItem('listenVolume', volInput.value); } catch (e) {}
    syncVolumeUI();
    applySettingNow();
  });
  muteBtn.addEventListener('click', function () {
    var v = parseInt(volInput.value, 10) || 0;
    if (v > 0) { lastVolume = v; volInput.value = 0; } else { volInput.value = lastVolume || 100; }
    try { localStorage.setItem('listenVolume', volInput.value); } catch (e) {}
    syncVolumeUI();
    applySettingNow();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open') && !document.querySelector('.lightbox.open')) closePanel();
  });
  window.addEventListener('beforeunload', function () { synth.cancel(); });

  toggle.hidden = false;
  syncVolumeUI();
  setUI();
})();

/* =====================================================================
   الصوت: تنبيه قبل الأذان، مقطع الأذان، وتلاوة القرآن في أوقات الفراغ
   الإعدادات كلها في config.js داخل قسم audio
   - أي زر في الريموت يوقف الصوت الحالي
   - التلاوة تتوقف قبل الأذان وترجع بعد انتهاء الصلاة وأذكارها
   ===================================================================== */
var AudioCtl = (function () {
  'use strict';

  var C = window.CONFIG || {};
  var A = C.audio || {};
  if (!A.enabled) return { update: function () {}, stop: function () { return false; } };

  var MIN = 60000;
  var player = null, ready = false, apiRequested = false;
  var mode = null;                 // 'adhan' | 'quran' | null
  var firedReminder = {}, firedAdhan = {};
  var quranMutedUntil = 0;         // إيقاف التلاوة بالريموت حتى الأذان القادم
  var chime = null;

  function $(id) { return document.getElementById(id); }

  /* ---------- الواجهة: القرص الصغير ---------- */
  function showTile(on, label) {
    var t = $('mediaTile');
    if (!t) return;
    if (label) $('mediaLabel').textContent = label;
    if (on) t.className = 'media-tile show' + (mode === 'adhan' ? ' is-adhan' : '');
    else t.className = 'media-tile';
  }

  /* ---------- مشغل يوتيوب ---------- */
  var nextTry = 0;
  function loadApi() {
    if (apiRequested || Date.now() < nextTry) return;
    apiRequested = true;
    window.onYouTubeIframeAPIReady = function () {
      player = new YT.Player('ytPlayer', {
        width: '256', height: '144',
        playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, fs: 0 },
        events: {
          onReady: function () { ready = true; player.setVolume(A.volume || 80); },
          onStateChange: onState,
          onError: function () { if (mode === 'quran') nextQuran(); else stopAll(); }
        }
      });
    };
    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = function () { apiRequested = false; nextTry = Date.now() + 2 * MIN; if (s.parentNode) s.parentNode.removeChild(s); };   // بدون إنترنت: يحاول بعد دقيقتين
    document.head.appendChild(s);
  }

  function onState(e) {
    if (e.data === 0) {            // انتهى المقطع
      if (mode === 'quran') nextQuran();
      else { mode = null; showTile(false); }
    }
  }

  /* القراء: نجمع المقاطع حسب اسم القارئ، ونتناوب بينهم
     وكل قارئ يكمل من نفس المقطع والثانية اللي وقف عندها */
  var reciters = null, rIndex = 0, segStart = 0, fading = false;
  function buildReciters() {
    var list = (A.quran && A.quran.playlist) || [], map = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i].name;
      if (!map[n]) { map[n] = { name: n, items: [], idx: 0, pos: 0 }; out.push(map[n]); }
      map[n].items.push(list[i].id);
    }
    return out;
  }
  function cur() { return reciters[rIndex % reciters.length]; }

  function savePos() {
    if (!reciters || mode !== 'quran' || !player || !ready) return;
    try { cur().pos = Math.max(0, (player.getCurrentTime() || 0) - 2); } catch (e) {}
  }

  function playQuran() {
    if (!reciters) reciters = buildReciters();
    if (!ready || !reciters.length) return;
    var r = cur();
    mode = 'quran';
    var vol = A.quran.volume || A.volume || 80;
    player.setVolume(0);
    player.loadVideoById({ videoId: r.items[r.idx % r.items.length], startSeconds: r.pos || 0 });
    fadeTo(vol, 2500);
    segStart = Date.now();
    showTile(true, r.name);
  }

  /* خفض وتعلية الصوت بنعومة */
  function fadeTo(target, ms, done) {
    var steps = 15, i = 0, from = 0;
    try { from = player.getVolume(); } catch (e) {}
    fading = true;
    var iv = setInterval(function () {
      i++;
      try { player.setVolume(Math.round(from + (target - from) * i / steps)); } catch (e) {}
      if (i >= steps) { clearInterval(iv); fading = false; if (done) done(); }
    }, ms / steps);
  }

  /* انتقال للقارئ التالي بعد مدة التبديل */
  function rotate() {
    if (fading || mode !== 'quran') return;
    savePos();
    fadeTo(0, 2500, function () {
      if (mode !== 'quran') return;
      rIndex++;
      playQuran();
    });
  }

  /* انتهى مقطع القارئ: ننتقل لمقطعه التالي ونبدّل القارئ */
  function nextQuran() {
    if (!reciters) return;
    var r = cur();
    r.idx++; r.pos = 0;
    rIndex++;
    if (mode === 'quran') playQuran();
  }

  function playAdhan() {
    var ad = A.adhan || {};
    if (!ad.enabled || !ad.youtubeId || !ready) return;
    mode = 'adhan';
    player.setVolume(ad.volume || A.volume || 90);
    player.loadVideoById({ videoId: ad.youtubeId, startSeconds: ad.start || 0, endSeconds: ad.end || 22 });
    showTile(true, 'أذان ' + (ad.name || 'المسجد الحرام'));
  }

  function stopAll() {
    savePos();
    if (player && ready) { try { player.stopVideo(); } catch (e) {} }
    mode = null;
    showTile(false);
  }

  function playChime() {
    if (!A.reminder || !A.reminder.enabled) return;
    try {
      if (!chime) chime = new Audio('assets/audio/reminder.wav');
      chime.volume = Math.min(1, (A.reminder.volume || 70) / 100);
      chime.currentTime = 0;
      var p = chime.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  /* الأذان القادم (يتجاهل الشروق) */
  function nextAdhanAt(state) {
    var ev = state.ev;
    if (!ev) return Infinity;
    if (ev.key === 'sunrise') return state.day.byKey.dhuhr.at;
    return ev.at;
  }

  /* ---------- يُستدعى كل ثانية من app.js ---------- */
  function update(state, W) {
    if ((A.quran && A.quran.enabled) || (A.adhan && A.adhan.enabled)) loadApi();

    // تنبيه قبل الأذان
    var rem = A.reminder || {};
    if (state.phase === 'normal' && state.ev && state.ev.key !== 'sunrise' && rem.enabled) {
      var at = state.ev.at, t = at - (rem.minutesBefore || 5) * MIN;
      if (W >= t && W < t + 15000 && !firedReminder[at]) {
        firedReminder[at] = true;
        if (mode === 'quran') stopAll();
        playChime();
      }
    }

    // الأذان: أول ٢٠ ثانية من دخول الوقت فقط
    if (state.phase === 'adhan' && state.ev) {
      var a = state.ev.at;
      if (W - a < 20000 && !firedAdhan[a]) {
        firedAdhan[a] = true;
        if (mode === 'quran') stopAll();
        playAdhan();
      }
      return;
    }

    // التلاوة: فقط في الوضع الطبيعي وقبل الأذان بوقت كافٍ
    var q = A.quran || {};
    var allowed = q.enabled && state.phase === 'normal' &&
                  (nextAdhanAt(state) - W) > (q.stopMinutesBeforeAdhan || 5) * MIN &&
                  W >= quranMutedUntil && inHours(W, q);
    if (allowed && mode === null && ready) playQuran();
    if (allowed && mode === 'quran' && Date.now() - segStart > (q.switchMinutes || 5) * MIN) rotate();
    if (!allowed && mode === 'quran') stopAll();

    // أثناء الإقامة والصلاة: صمت تام
    if (mode === 'adhan' && (state.phase === 'iqama' || state.phase === 'prayer')) stopAll();
    lastState = state;
  }
  var lastState = null;

  /* ساعات التشغيل (اختياري): مثلًا من "06:00" إلى "23:00" */
  function inHours(W, q) {
    if (!q.from || !q.to) return true;
    var d = new Date(W), m = d.getUTCHours() * 60 + d.getUTCMinutes();
    var f = q.from.split(':'), t = q.to.split(':');
    var fm = +f[0] * 60 + +f[1], tm = +t[0] * 60 + +t[1];
    return fm <= tm ? (m >= fm && m < tm) : (m >= fm || m < tm);
  }

  /* أي زر في الريموت يوقف الصوت */
  function stopByUser() {
    var was = mode;
    if (chime && !chime.paused) { chime.pause(); was = was || 'chime'; }
    if (!was) return false;
    if (was === 'quran' && lastState) quranMutedUntil = nextAdhanAt(lastState);
    stopAll();
    return true;
  }

  document.addEventListener('keydown', function () { stopByUser(); }, true);

  return { update: update, stop: stopByUser };
})();

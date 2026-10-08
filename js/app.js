/* =====================================================================
   شاشة مواقيت الصلاة — المنطق الرئيسي
   لا تحتاج تعديل هذا الملف؛ الإعدادات كلها في config.js
   ===================================================================== */
(function () {
  'use strict';

  var C = window.CONFIG;
  var SEC = 1000, MIN = 60000, HOUR = 3600000, DAY = 86400000;

  var ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  var SALAH = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  var NAMES = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء', jumuah: 'الجمعة' };
  var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var GMONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  function $(id) { return document.getElementById(id); }

  /* ---------------- الوقت ----------------
     كل الأوقات داخليًا بتوقيت السعودية (ممثلة بأرقام UTC)
     حتى لو كانت منطقة الجهاز الزمنية مضبوطة غلط */
  var realStart = Date.now();
  var wallStart = realStart + C.location.timezone * HOUR;
  var speed = 1;
  var testMode = false;

  (function parseTestParams() {
    var q = window.location.search || '';
    var mTime = q.match(/[?&]time=([^&]+)/);
    var mSpeed = q.match(/[?&]speed=([0-9.]+)/);
    if (mTime) {
      var v = decodeURIComponent(mTime[1]);
      var full = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      var hm = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (full) {
        wallStart = Date.UTC(+full[1], +full[2] - 1, +full[3], +full[4], +full[5], +(full[6] || 0));
        testMode = true;
      } else if (hm) {
        var d = new Date(wallStart);
        wallStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +hm[1], +hm[2], +(hm[3] || 0));
        testMode = true;
      }
    }
    if (mSpeed) { speed = parseFloat(mSpeed[1]) || 1; testMode = true; }
  })();

  function now() { return wallStart + (Date.now() - realStart) * speed; }

  /* ---------------- تنسيق الأرقام ---------------- */
  var AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  function digits(s) {
    s = String(s);
    if (C.display.digits !== 'arabic') return s;
    return s.replace(/[0-9]/g, function (c) { return AR_DIGITS[+c]; });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function clockParts(ms) {
    var d = new Date(ms);
    var H = d.getUTCHours(), M = d.getUTCMinutes();
    if (C.display.clock24) return { hm: digits(pad(H) + ':' + pad(M)), ampm: '' };
    var h = H % 12; if (h === 0) h = 12;
    return { hm: digits(h + ':' + pad(M)), ampm: H < 12 ? 'ص' : 'م' };
  }
  function timeHTML(ms) {
    var p = clockParts(ms);
    return '<span dir="ltr">' + p.hm + '</span>' + (p.ampm ? '<span class="ampm">' + p.ampm + '</span>' : '');
  }
  function timeText(ms) {
    var p = clockParts(ms);
    return p.hm + (p.ampm ? ' ' + p.ampm : '');
  }
  function countdown(ms) {
    if (ms < 0) ms = 0;
    var t = Math.ceil(ms / 1000);
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return digits(h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s));
  }
  function setText(el, txt) { if (el && el.__t !== txt) { el.textContent = txt; el.__t = txt; } }
  function setHTML(el, html) { if (el && el.__h !== html) { el.innerHTML = html; el.__h = html; } }

  /* ---------------- بيانات اليوم ---------------- */
  var dayCache = {};

  function dayStart(ms) {
    var d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function getDay(ms) {
    var base = dayStart(ms);
    if (dayCache[base]) return dayCache[base];

    var d = new Date(base);
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate();
    var hijri = Hijri.get(base);
    var isRamadan = hijri.m === 9;
    var t = PrayerTimes.getTimes(y, m, dd, isRamadan);
    var isFriday = d.getUTCDay() === 5 && C.friday && C.friday.enabled;

    var events = [];
    for (var i = 0; i < ORDER.length; i++) {
      var key = ORDER[i];
      var at = base + t[key] * MIN;
      var ev = { key: key, at: at, name: NAMES[key], iqamaAt: null, isJumuah: false };
      if (key !== 'sunrise') {
        if (key === 'dhuhr' && isFriday) {
          ev.isJumuah = true;
          ev.name = NAMES.jumuah;
          ev.iqamaAt = at + (C.friday.khutbahMinutes || 25) * MIN;
        } else {
          var fixed = PrayerTimes.hhmmToMinutes(C.iqamaFixed && C.iqamaFixed[key]);
          ev.iqamaAt = (fixed !== null && fixed > t[key]) ? base + fixed * MIN : at + (C.iqama[key] || 0) * MIN;
        }
      }
      events.push(ev);
    }

    var day = { base: base, date: d, hijri: hijri, isFriday: isFriday, isRamadan: isRamadan, events: events, byKey: {} };
    for (var j = 0; j < events.length; j++) day.byKey[events[j].key] = events[j];
    dayCache[base] = day;

    // تنظيف الذاكرة
    var keys = Object.keys(dayCache);
    if (keys.length > 6) { keys.sort(); delete dayCache[keys[0]]; }
    return day;
  }

  /* ---------------- تحديد الحالة الحالية ---------------- */
  function resolveState(W) {
    var today = getDay(W);
    var D = C.durations;

    for (var i = 0; i < today.events.length; i++) {
      var ev = today.events[i];
      if (ev.key === 'sunrise') continue;
      var A = ev.at, I = ev.iqamaAt;
      var adhanEnd = A + D.adhanScreenMinutes * MIN;
      var prayMin = ev.isJumuah ? D.prayerMinutes.jumuah : D.prayerMinutes[ev.key];
      var afterEnd;

      if (ev.isJumuah) {
        var prayEndJ = I + prayMin * MIN;
        afterEnd = prayEndJ + D.afterPrayerMinutes * MIN;
        if (W < A || W >= afterEnd) continue;
        if (W < Math.min(adhanEnd, I)) return { phase: 'adhan', ev: ev, day: today };
        if (W < I) return { phase: 'khutbah', ev: ev, day: today };
        if (W < prayEndJ) return { phase: 'prayer', ev: ev, day: today };
        return { phase: 'after', ev: ev, day: today, until: afterEnd };
      }

      var finalStart = I - D.finalCountdownSeconds * SEC;
      if (finalStart < A) finalStart = A;
      if (adhanEnd > finalStart) adhanEnd = finalStart;
      var iqamaEnd = I + D.iqamaScreenSeconds * SEC;
      var prayEnd = I + prayMin * MIN;
      if (prayEnd < iqamaEnd) prayEnd = iqamaEnd;
      afterEnd = prayEnd + D.afterPrayerMinutes * MIN;

      if (W < A || W >= afterEnd) continue;
      if (W < adhanEnd) return { phase: 'adhan', ev: ev, day: today };
      if (W < finalStart) return { phase: 'wait', ev: ev, day: today, from: A, to: I };
      if (W < I) return { phase: 'final', ev: ev, day: today, to: I };
      if (W < iqamaEnd) return { phase: 'iqama', ev: ev, day: today };
      if (W < prayEnd) return { phase: 'prayer', ev: ev, day: today };
      return { phase: 'after', ev: ev, day: today, until: afterEnd };
    }

    // الوضع الطبيعي: الحدث القادم
    var next = null, prev = null;
    for (var k = 0; k < today.events.length; k++) {
      if (today.events[k].at > W) { next = today.events[k]; break; }
      prev = today.events[k];
    }
    if (!next) next = getDay(W + DAY).byKey.fajr;
    if (!prev) prev = getDay(W - DAY).byKey.isha;
    return { phase: 'normal', ev: next, prev: prev, day: today };
  }

  /* ---------------- مقاس الشاشة ---------------- */
  function fitStage() {
    var w = window.innerWidth || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    var unit = Math.min(w / 192, h / 108);
    document.documentElement.style.fontSize = unit + 'px';
  }

  /* ---------------- تطبيق الألوان من الإعدادات ---------------- */
  function applyTheme() {
    var t = C.theme || {};
    var map = { night: '--night', nightDeep: '--night-deep', lapis: '--lapis', gold: '--gold', goldLight: '--gold-light',
                goldDeep: '--gold-deep', ivory: '--ivory', emerald: '--emerald', emeraldGlow: '--emerald-glow' };
    var root = document.documentElement;
    for (var k in map) { if (map.hasOwnProperty(k) && t[k]) root.style.setProperty(map[k], t[k]); }
  }

  /* ---------------- صف المواقيت ---------------- */
  var cols = {};
  function buildRow() {
    var row = $('prayerRow');
    var html = '';
    for (var i = 0; i < ORDER.length; i++) {
      var k = ORDER[i];
      html += '<div class="pc' + (k === 'sunrise' ? ' is-sunrise' : '') + '" id="pc-' + k + '">' +
        '<div class="pc-arch"><svg viewBox="0 0 300 256" preserveAspectRatio="none"><path d="M4,252 L4,100 C4,54 80,30 150,4 C220,30 296,54 296,100 L296,252 Z"/></svg></div>' +
        '<p class="pc-name"></p><p class="pc-time" dir="ltr"></p><p class="pc-sub"></p></div>';
    }
    row.innerHTML = html;
    for (var j = 0; j < ORDER.length; j++) {
      var el = $('pc-' + ORDER[j]);
      cols[ORDER[j]] = { el: el, name: el.querySelector('.pc-name'), time: el.querySelector('.pc-time'), sub: el.querySelector('.pc-sub') };
    }
  }

  var lastRowDay = null;
  function renderRow(state) {
    var day = state.day;
    if (lastRowDay !== day.base) {
      lastRowDay = day.base;
      for (var i = 0; i < day.events.length; i++) {
        var ev = day.events[i], c = cols[ev.key];
        setText(c.name, ev.name);
        setText(c.time, clockParts(ev.at).hm);
        if (ev.key === 'sunrise') {
          setHTML(c.sub, 'الضحى ' + timeText(ev.at + 15 * MIN));
        } else if (ev.isJumuah) {
          setHTML(c.sub, 'الخطبة بعد الأذان');
        } else {
          setHTML(c.sub, 'الإقامة <b>' + timeText(ev.iqamaAt) + '</b>');
        }
      }
    }
    // التمييز
    var activeKey = null, isWait = false;
    if (state.phase === 'normal') {
      // لو الحدث القادم من اليوم التالي (فجر الغد) نميّز الفجر أيضًا
      activeKey = state.ev.key;
    } else {
      activeKey = state.ev.key;
      isWait = (state.phase === 'wait' || state.phase === 'final');
    }
    for (var k in cols) {
      if (!cols.hasOwnProperty(k)) continue;
      var on = (k === activeKey);
      toggle(cols[k].el, 'is-active', on);
      toggle(cols[k].el, 'is-wait', on && isWait);
    }
  }

  function toggle(el, cls, on) {
    var has = (' ' + el.className + ' ').indexOf(' ' + cls + ' ') > -1;
    if (on && !has) el.className += ' ' + cls;
    if (!on && has) el.className = (' ' + el.className + ' ').replace(' ' + cls + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  /* ---------------- الساعة والتاريخ ---------------- */
  var lastDateKey = null;
  function renderClock(W) {
    var p = clockParts(W);
    setText($('clkHM'), p.hm);
    setText($('clkAmPm'), p.ampm);
    setText($('clkSec'), C.display.showSeconds ? digits(pad(new Date(W).getUTCSeconds())) : '');

    var base = dayStart(W);
    if (base !== lastDateKey) {
      lastDateKey = base;
      var day = getDay(W);
      var d = day.date;
      setText($('dayName'), DAYS[d.getUTCDay()]);
      setText($('hijriDate'), digits(day.hijri.d) + ' ' + day.hijri.monthName + ' ' + digits(day.hijri.y) + ' هـ');
      setText($('gregDate'), digits(d.getUTCDate()) + ' ' + GMONTHS[d.getUTCMonth()] + ' ' + digits(d.getUTCFullYear()) + ' م');
    }
  }

  /* ---------------- قسم الصلاة القادمة ---------------- */
  var lastHeroKey = null;
  function renderHero(state, W) {
    var hero = $('hero'), body = hero.querySelector('.hero-body');
    var ev = state.ev;
    var isWait = (state.phase === 'wait' || state.phase === 'final');
    var heroKey = state.phase === 'normal' ? 'n-' + ev.key + ev.at : 'w-' + ev.key;

    if (heroKey !== lastHeroKey) {
      if (lastHeroKey !== null) {
        toggle(body, 'swap', false);
        void body.offsetWidth;
        toggle(body, 'swap', true);
      }
      lastHeroKey = heroKey;
    }
    toggle(hero, 'is-wait', isWait);

    var target, from;
    if (isWait) {
      setText($('heroKicker'), 'إقامة صلاة');
      setText($('heroName'), ev.name);
      setHTML($('heroTime'), '<span class="ampm" style="margin:0 0 0 1.2rem;color:var(--ivory-dim);font-weight:300">الإقامة</span>' + timeHTML(ev.iqamaAt));
      setText($('heroCdLabel'), 'متبقي على الإقامة');
      target = ev.iqamaAt; from = ev.at;
    } else {
      var isSunrise = ev.key === 'sunrise';
      setText($('heroKicker'), isSunrise ? 'الوقت القادم' : 'الصلاة القادمة');
      setText($('heroName'), ev.name);
      setHTML($('heroTime'), timeHTML(ev.at));
      setText($('heroCdLabel'), isSunrise ? 'متبقي على الشروق' : 'متبقي على الأذان');
      target = ev.at; from = state.prev ? state.prev.at : ev.at - 6 * HOUR;
    }
    setText($('heroCd'), countdown(target - W));
    var pct = Math.max(0, Math.min(100, (W - from) / Math.max(1, target - from) * 100));
    $('heroBar').style.width = pct.toFixed(2) + '%';
  }

  /* ---------------- الحالات الكاملة ---------------- */
  var OVERLAYS = ['adhan', 'khutbah', 'final', 'iqama', 'prayer', 'after'];
  var currentOverlay = null;
  function showOverlay(name) {
    if (name === currentOverlay) return;
    for (var i = 0; i < OVERLAYS.length; i++) toggle($('ov-' + OVERLAYS[i]), 'show', OVERLAYS[i] === name);
    currentOverlay = name;
  }

  function renderOverlay(state, W) {
    var ev = state.ev, ph = state.phase;
    var pname = 'صلاة ' + ev.name;
    if (ph === 'adhan') {
      setText($('ovAdhanName'), pname);
      setHTML($('ovAdhanTime'), timeHTML(ev.at));
      showOverlay('adhan');
    } else if (ph === 'khutbah') {
      showOverlay('khutbah');
    } else if (ph === 'final') {
      setText($('ovFinalKicker'), 'تبقّى على إقامة ' + pname);
      var s = Math.max(0, Math.ceil((state.to - W) / 1000));
      setText($('ovFinalCd'), digits(s));
      showOverlay('final');
    } else if (ph === 'iqama') {
      setText($('ovIqamaName'), pname);
      showOverlay('iqama');
    } else if (ph === 'prayer') {
      setText($('ovPrayerText'), ev.isJumuah ? 'صلاة الجمعة قائمة' : 'الصلاة قائمة');
      setText($('ovPrayerClock'), timeText(W));
      showOverlay('prayer');
    } else if (ph === 'after') {
      showOverlay('after');
    } else {
      showOverlay(null);
    }
  }

  /* ---------------- الأذكار ---------------- */
  var pointers = {};
  var stepCount = 0;
  var dhikrTimer = null;
  var lastCtx = null;

  function nextFrom(cat) {
    var list = ADHKAR[cat];
    if (!list || !list.items.length) return null;
    var p = pointers[cat] || 0;
    var item = list.items[p % list.items.length];
    pointers[cat] = (p + 1) % list.items.length;
    return { title: list.title, text: item.text, note: item.note || '', src: item.src || '' };
  }

  function contextFor(state, W) {
    if (state.phase === 'after') return 'afterPrayer';
    if (state.phase === 'wait' || state.phase === 'adhan' || state.phase === 'final') return 'iqamaWait';
    var day = state.day, b = day.byKey;
    if (W >= b.fajr.at && W < b.dhuhr.at) return 'morning';
    if (W >= b.asr.at && W < b.isha.at) return 'evening';
    if (W >= b.isha.at) return 'night';
    return 'duas';
  }

  function isFridayTime(state, W) {
    var day = state.day;
    if (day.isFriday) return true;
    // ليلة الجمعة: من مغرب الخميس
    var d = new Date(W);
    return d.getUTCDay() === 4 && W >= day.byKey.maghrib.at;
  }

  function pickItem(ctx, state, W) {
    stepCount++;
    if (ctx === 'afterPrayer') return nextFrom('afterPrayer');
    if (isFridayTime(state, W) && stepCount % 4 === 0) return nextFrom('friday');
    if (ctx !== 'iqamaWait' && stepCount % 3 === 0) return nextFrom('hadith');
    if (ctx === 'night' && stepCount % 2 === 0) return nextFrom('duas');
    return nextFrom(ctx);
  }

  /* تصغير الخط تلقائيًا إذا كان النص طويلًا */
  function fitText(el, box, maxRem, minRem) {
    var unit = parseFloat(document.documentElement.style.fontSize) || 10;
    var size = maxRem;
    el.style.fontSize = size + 'rem';
    var guard = 0;
    while ((el.offsetHeight > box.clientHeight - unit || el.scrollWidth > box.clientWidth) && size > minRem && guard < 40) {
      size -= 0.2;
      el.style.fontSize = size + 'rem';
      guard++;
    }
  }

  function runBar(bar, ms) {
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    bar.style.transition = 'width ' + ms + 'ms linear';
    bar.style.width = '100%';
  }

  function showDhikr(force) {
    var W = now();
    var state = resolveState(W);
    var ctx = contextFor(state, W);
    var hold = (C.display.adhkarSeconds || 10) * 1000;
    if (dhikrTimer) clearTimeout(dhikrTimer);
    lastCtx = ctx;

    var item = pickItem(ctx, state, W);
    if (!item) { dhikrTimer = setTimeout(showDhikr, hold); return; }
    /* النصوص الطويلة مثل آية الكرسي تبقى وقتًا أطول حتى تُقرأ كاملة */
    hold = Math.min(45000, Math.max(hold, item.text.length * 110));

    if (ctx === 'afterPrayer') {
      var at = $('afterText');
      toggle(at, 'out', true);
      setTimeout(function () {
        at.textContent = item.text;
        setText($('afterSrc'), item.src);
        fitText(at, $('afterBox'), 6.6, 3.8);
        toggle(at, 'out', false);
        runBar($('afterBar'), hold);
      }, force ? 50 : 800);
    } else {
      var tx = $('dhikrText'), foot = document.querySelector('.dhikr-foot');
      toggle(tx, 'out', true); toggle(foot, 'out', true);
      setTimeout(function () {
        setText($('dhikrTitle'), item.title);
        tx.textContent = item.text;
        setText($('dhikrNote'), item.note);
        setText($('dhikrSrc'), item.src);
        fitText(tx, $('dhikrBox'), 4.6, 3.0);
        toggle(tx, 'out', false); toggle(foot, 'out', false);
        runBar($('dhikrBar'), hold);
      }, force ? 50 : 800);
    }
    dhikrTimer = setTimeout(showDhikr, hold);
  }

  /* ---------------- تعتيم الليل ---------------- */
  function renderNightDim(state, W) {
    var nd = C.display.nightDim;
    var el = $('nightDim');
    if (!nd || !nd.enabled) { el.style.opacity = '0'; return; }
    var base = dayStart(W);
    var start = PrayerTimes.hhmmToMinutes(nd.startTime);
    var todayFajr = getDay(W).byKey.fajr.at;
    var startMs = base + start * MIN;
    var endToday = todayFajr - nd.minutesBeforeFajr * MIN;
    var dim = false;
    if (state.phase === 'normal') {
      if (start >= 12 * 60) {
        // بداية مسائية: من وقت البداية حتى منتصف الليل، ومن منتصف الليل حتى قبل الفجر
        dim = (W >= startMs) || (W < endToday);
      } else {
        dim = (W >= startMs && W < endToday);
      }
    }
    var op = dim ? String(nd.opacity) : '0';
    if (el.__op !== op) { el.style.opacity = op; el.__op = op; }
  }

  /* ---------------- حماية الشاشة ---------------- */
  var lastShift = 0;
  function antiBurnIn() {
    if (!C.display.antiBurnIn) return;
    var t = Date.now();
    if (t - lastShift < 4 * MIN) return;
    lastShift = t;
    var x = (Math.random() * 0.8 - 0.4).toFixed(2);
    var y = (Math.random() * 0.8 - 0.4).toFixed(2);
    $('stage').style.transform = 'translate(' + x + 'rem,' + y + 'rem)';
  }

  /* ---------------- إعادة تحميل يومية ---------------- */
  var reloadArmed = false;
  function dailyReload(W) {
    if (testMode || !C.display.dailyReloadTime) return;
    var target = PrayerTimes.hhmmToMinutes(C.display.dailyReloadTime);
    if (target === null) return;
    var d = new Date(W);
    var mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (Date.now() - realStart < 2 * HOUR) return;
    if (mins === target && !reloadArmed) { reloadArmed = true; window.location.reload(); }
  }

  /* ---------------- الحلقة الرئيسية ---------------- */
  var PHASE_AR = { normal: 'طبيعي', adhan: 'الأذان', wait: 'انتظار الإقامة', final: 'الدقيقة الأخيرة', iqama: 'الإقامة', prayer: 'أثناء الصلاة', after: 'بعد الصلاة', khutbah: 'الخطبة' };
  var lastPhase = null;
  function tick() {
    var W = now();
    var state;
    try {
      state = resolveState(W);
      renderClock(W);
      renderRow(state);
      if (state.phase === 'normal' || state.phase === 'wait') renderHero(state, W);
      renderOverlay(state, W);
      renderNightDim(state, W);
      antiBurnIn();
      dailyReload(W);

      // تغيير سياق الأذكار فورًا عند تغير الحالة
      var ctx = contextFor(state, W);
      if (state.phase !== lastPhase) {
        lastPhase = state.phase;
        if (ctx !== lastCtx) showDhikr(false);
      }
      if (testMode) {
        $('testBadge').style.display = 'block';
        setText($('testBadge'), 'وضع التجربة — ' + (PHASE_AR[state.phase] || state.phase) + ' — ' + timeText(W) + (speed !== 1 ? ' — ×' + speed : ''));
      }
    } catch (e) {
      if (window.console) console.error(e);
    }
    var delay = 1000 - (Date.now() % 1000) + 5;
    if (speed > 1) delay = 250;
    setTimeout(tick, delay);
  }

  /* ---------------- ملء الشاشة بالريموت ---------------- */
  function goFullscreen() {
    var el = document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (fn) { try { var p = fn.call(el); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  }
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode || e.which;
    // زر الموافق في الريموت (13 أو 23) يفعّل ملء الشاشة
    if (k === 13 || k === 23 || e.key === 'Enter') { goFullscreen(); e.preventDefault(); }
  });
  document.addEventListener('click', goFullscreen);

  /* منع الشاشة من النوم إذا كان المتصفح يدعم ذلك */
  function keepAwake() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request('screen').catch(function () {});
      }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) keepAwake(); });

  /* ---------------- التشغيل ---------------- */
  function init() {
    applyTheme();
    fitStage();
    window.addEventListener('resize', fitStage);
    setText($('mosqueName'), C.mosque.name);
    setText($('mosqueSub'), C.mosque.subtitle);
    document.title = C.mosque.name + ' — مواقيت الصلاة';
    buildRow();
    tick();
    keepAwake();
    var start = function () {
      $('stage').className += ' ready';
      showDhikr(true);
    };
    if (document.fonts && document.fonts.ready) {
      var done = false;
      document.fonts.ready.then(function () { if (!done) { done = true; start(); } });
      setTimeout(function () { if (!done) { done = true; start(); } }, 2500);
    } else {
      setTimeout(start, 300);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

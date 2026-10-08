/* =====================================================================
   حساب مواقيت الصلاة فلكيًا بدون إنترنت — طريقة أم القرى
   + التاريخ الهجري (تقويم أم القرى) مع بديل حسابي احتياطي
   لا تحتاج تعديل هذا الملف؛ الإعدادات كلها في config.js
   ===================================================================== */

var PrayerTimes = (function () {
  'use strict';

  /* ---------- رياضيات الزوايا بالدرجات ---------- */
  function dtr(d) { return d * Math.PI / 180; }
  function rtd(r) { return r * 180 / Math.PI; }
  function sin(d) { return Math.sin(dtr(d)); }
  function cos(d) { return Math.cos(dtr(d)); }
  function tan(d) { return Math.tan(dtr(d)); }
  function arcsin(x) { return rtd(Math.asin(x)); }
  function arccos(x) { return rtd(Math.acos(x)); }
  function arctan2(y, x) { return rtd(Math.atan2(y, x)); }
  function arccot(x) { return rtd(Math.atan(1 / x)); }
  function fix(a, b) { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; }

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100);
    var B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }

  function sunPosition(jd) {
    var D = jd - 2451545.0;
    var g = fix(357.529 + 0.98560028 * D, 360);
    var q = fix(280.459 + 0.98564736 * D, 360);
    var L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
    var e = 23.439 - 0.00000036 * D;
    var RA = arctan2(cos(e) * sin(L), cos(L)) / 15;
    var eqt = q / 15 - fix(RA, 24);
    var decl = arcsin(sin(e) * sin(L));
    return { decl: decl, eqt: eqt };
  }

  /* يُرجع الأوقات بالساعات العشرية حسب التوقيت المحلي */
  function computeRaw(y, m, d, o) {
    var jDate = julian(y, m, d) - o.lng / (15 * 24);

    function midDay(t) {
      return fix(12 - sunPosition(jDate + t).eqt, 24);
    }
    function sunAngleTime(angle, t, ccw) {
      var decl = sunPosition(jDate + t).decl;
      var noon = midDay(t);
      var v = (-sin(angle) - sin(decl) * sin(o.lat)) / (cos(decl) * cos(o.lat));
      if (v > 1) v = 1; if (v < -1) v = -1;
      var T = arccos(v) / 15;
      return noon + (ccw ? -T : T);
    }
    function asrTime(factor, t) {
      var decl = sunPosition(jDate + t).decl;
      var angle = -arccot(factor + tan(Math.abs(o.lat - decl)));
      return sunAngleTime(angle, t, false);
    }

    var riseAngle = 0.833 + 0.0347 * Math.sqrt(o.elev || 0);
    var t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18 };

    for (var i = 0; i < 2; i++) {
      var p = { fajr: t.fajr / 24, sunrise: t.sunrise / 24, dhuhr: t.dhuhr / 24, asr: t.asr / 24, maghrib: t.maghrib / 24 };
      t.fajr = sunAngleTime(o.fajrAngle, p.fajr, true);
      t.sunrise = sunAngleTime(riseAngle, p.sunrise, true);
      t.dhuhr = midDay(p.dhuhr);
      t.asr = asrTime(o.asrFactor, p.asr);
      t.maghrib = sunAngleTime(riseAngle, p.maghrib, false);
    }

    var shift = o.tz - o.lng / 15;
    for (var k in t) { if (t.hasOwnProperty(k)) t[k] += shift; }
    return t;
  }

  function hhmmToMinutes(s) {
    if (!s) return null;
    var p = String(s).split(':');
    if (p.length < 2) return null;
    var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  /* الأوقات بالدقائق من منتصف الليل */
  function getTimes(y, m, d, isRamadan) {
    var C = window.CONFIG;
    var calc = C.calculation, adj = calc.adjustments || {};
    var out = {};

    if (C.manualTimes && C.manualTimes.enabled) {
      var keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
      for (var i = 0; i < keys.length; i++) out[keys[i]] = hhmmToMinutes(C.manualTimes[keys[i]]);
      return out;
    }

    var raw = computeRaw(y, m, d, {
      lat: C.location.latitude,
      lng: C.location.longitude,
      tz: C.location.timezone,
      elev: C.location.elevation,
      fajrAngle: calc.fajrAngle,
      asrFactor: calc.asrFactor || 1
    });

    out.fajr = Math.round(raw.fajr * 60) + (adj.fajr || 0);
    out.sunrise = Math.round(raw.sunrise * 60) + (adj.sunrise || 0);
    out.dhuhr = Math.round(raw.dhuhr * 60) + (adj.dhuhr || 0);
    out.asr = Math.round(raw.asr * 60) + (adj.asr || 0);
    out.maghrib = Math.round(raw.maghrib * 60) + (adj.maghrib || 0);
    var ishaGap = isRamadan ? calc.ishaMinutesInRamadan : calc.ishaMinutesAfterMaghrib;
    out.isha = Math.round(raw.maghrib * 60) + ishaGap + (adj.isha || 0);
    return out;
  }

  return { getTimes: getTimes, hhmmToMinutes: hhmmToMinutes };
})();


/* =====================================================================
   التاريخ الهجري
   ===================================================================== */
var Hijri = (function () {
  'use strict';

  var MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
                'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];

  var intlFmt = null;
  try {
    var f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric'
    });
    if (f.resolvedOptions().calendar === 'islamic-umalqura' && typeof f.formatToParts === 'function') {
      intlFmt = f;
    }
  } catch (e) { intlFmt = null; }

  function fromIntl(ms) {
    var parts = intlFmt.formatToParts(new Date(ms));
    var r = {};
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === 'day') r.d = parseInt(parts[i].value, 10);
      if (parts[i].type === 'month') r.m = parseInt(parts[i].value, 10);
      if (parts[i].type === 'year' || parts[i].type === 'relatedYear') r.y = parseInt(parts[i].value, 10);
    }
    if (!r.d || !r.m || !r.y) return null;
    return r;
  }

  /* بديل حسابي (التقويم الهجري الجدولي) إذا المتصفح ما يدعم أم القرى */
  function islamicToJD(y, m, d) {
    return d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + 1948439.5 - 1;
  }
  function fromTabular(ms) {
    var jd = ms / 86400000 + 2440587.5;
    jd = Math.floor(jd) + 0.5;
    var y = Math.floor((30 * (jd - 1948439.5) + 10646) / 10631);
    var m = Math.min(12, Math.ceil((jd - (29 + islamicToJD(y, 1, 1))) / 29.5) + 1);
    var d = jd - islamicToJD(y, m, 1) + 1;
    return { y: y, m: m, d: Math.round(d) };
  }

  /* ms = منتصف ليل اليوم بتوقيت السعودية ممثلًا كـ UTC */
  function get(ms) {
    var adjust = (window.CONFIG.display && window.CONFIG.display.hijriAdjustDays) || 0;
    var t = ms + 12 * 3600000 + adjust * 86400000;   // منتصف النهار لتجنب حواف اليوم
    var r = intlFmt ? fromIntl(t) : null;
    if (!r) r = fromTabular(t);
    r.monthName = MONTHS[r.m - 1];
    return r;
  }

  return { get: get, MONTHS: MONTHS };
})();

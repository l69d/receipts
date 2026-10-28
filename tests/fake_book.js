// SpreadsheetApp / Session / LockService over plain grids ({tab: [[cell, ...], ...]}) - what Code.gs calls.
// Used by the node suites (lib.js) and pasted into the offline preview by build_preview.py, so it is plain browser JS.
// Values and formulas are real: a cell holding '=...' is a formula, and getValues works it out with `evaluate` (tests/
// sheet_eval.js) when one is given. Everything else (formats, charts, validations, rules) is recorded in `log` and
// chains like the real API. Date cells come in as {$d: 'yyyy-mm-dd'} and go out as Dates made with DateCtor (the
// caller's realm's Date - or Code.gs's `v instanceof Date` is false).
function fakeServices(grids, user, editors, DateCtor, evaluate, log) {
  var D = DateCtor || Date, calls = log || [];
  // an object whose unknown methods are recorded and return `self` (chaining, as builders and ranges do)
  function recorder(real, name, self) {
    return new Proxy(real, { get: function (t, k) {
      if (k in t || typeof k === 'symbol') return t[k];
      return function () { calls.push([name, String(k), [].slice.call(arguments)]); return self ? self() : recorder({}, name + '.' + String(k)); };
    } });
  }
  function out(sheet, v) {
    if (v && typeof v === 'object' && v.$d) { var p = v.$d.split('-'); return new D(+p[0], p[1] - 1, +p[2]); }
    if (typeof v === 'string' && v[0] === '=' && evaluate) return evaluate(grids, sheet, v);
    // as Sheets: a leading ' only marks the cell as text - it is not part of what getValues returns
    if (typeof v === 'string' && v[0] === "'") return v.slice(1);
    return v === undefined ? '' : v;
  }
  function a1(s) {
    var m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d*))?$/.exec(s), col = function (x) { var n = 0; for (var i = 0; i < x.length; i++) n = n * 26 + x.charCodeAt(i) - 64; return n; };
    if (!m) throw new Error('fake getRange: cannot read "' + s + '"');
    var r = +m[2], c = col(m[1]);  // 'A2:A' runs to the sheet's last row (1000)
    return [r, c, m[3] ? (m[4] ? +m[4] : 1000) - r + 1 : 1, m[3] ? col(m[3]) - c + 1 : 1];
  }
  var ids = {}, cache = {};
  function sheet(name) {
    var g = grids[name], me;
    if (!(name in ids)) ids[name] = Object.keys(ids).length * 1000 + 7;
    function range(r, c, nr, nc) {
      if (typeof r === 'string') { var x = a1(r); r = x[0]; c = x[1]; nr = x[2]; nc = x[3]; }
      if (nr === undefined) { nr = 1; nc = 1; }
      if (!(r >= 1 && c >= 1 && nr >= 1 && nc >= 1)) throw new Error('getRange(' + [r, c, nr, nc] + '): a range needs at least one row and column');
      var rg, put = function (v) {
        if (v.length !== nr || v.some(function (row) { return row.length !== nc; })) throw new Error('setValues: the data does not match the range ' + name + ' ' + [r, c, nr, nc]);
        for (var i = 0; i < nr; i++) { while (g.length < r + i) g.push([]); for (var j = 0; j < nc; j++) g[r - 1 + i][c - 1 + j] = v[i][j]; }
        return rg;
      };
      rg = recorder({
        getValues: function () {
          var o = [];
          for (var i = 0; i < nr; i++) { var row = g[r - 1 + i] || [], x = []; for (var j = 0; j < nc; j++) x.push(out(name, row[c - 1 + j])); o.push(x); }
          return o;
        },
        getValue: function () { return out(name, (g[r - 1] || [])[c - 1]); },
        setValues: put,
        // as Sheets: a formula without its '=' is still a formula ('Rank' -> =Rank, #NAME?)
        setFormulas: function (v) { return put(v.map(function (row) { return row.map(function (x) { return typeof x === 'string' && x && x[0] !== '=' ? '=' + x : x; }); })); },
        setValue: function (v) { return put([[v]]); }, setFormula: function (v) { return rg.setFormulas([[v]]); },
        getColumn: function () { return c; }, getRow: function () { return r; }
      }, name + '!' + [r, c, nr, nc], function () { return rg; });
      return rg;
    }
    me = recorder({
      getName: function () { return name; }, getSheetId: function () { return ids[name]; },
      getLastRow: function () { return g.length; },
      getLastColumn: function () { return g.reduce(function (w, r) { return Math.max(w, r.length); }, 0); },
      getMaxRows: function () { return Math.max(1000, g.length); }, getMaxColumns: function () { return 26; },
      getRange: range,
      clearContents: function () { g.length = 0; return me; },
      clear: function () { g.length = 0; calls.push([name, 'clear', []]); return me; },
      getCharts: function () { return calls.filter(function (x) { return x[0] === name && x[1] === 'insertChart'; }); },
      removeChart: function (ch) { calls.splice(calls.indexOf(ch), 1); }
    }, name, function () { return me; });
    return me;
  }
  var book = recorder({
    getId: function () { return 'fake-spreadsheet'; }, getUrl: function () { return 'https://docs.google.com/spreadsheets/d/fake-spreadsheet/edit'; },
    getSheetByName: function (n) { return grids[n] ? sheet(n) : null; },
    insertSheet: function (n) { if (grids[n]) throw new Error('A sheet with the name "' + n + '" already exists.'); grids[n] = []; calls.push(['book', 'insertSheet', [n]]); return sheet(n); },
    getSheets: function () { return Object.keys(grids).map(sheet); },
    deleteSheet: function (s) { delete grids[s.getName()]; calls.push(['book', 'deleteSheet', [s.getName()]]); },
    getEditors: function () { return (editors || []).map(function (e) { return { getEmail: function () { return e; } }; }); }
  }, 'book', function () { return book; });
  return {
    SpreadsheetApp: recorder({ getActiveSpreadsheet: function () { return book; }, flush: function () {} }, 'SpreadsheetApp'),
    Session: { getActiveUser: function () { return { getEmail: function () { return user || ''; } }; }, getScriptTimeZone: function () { return 'Asia/Kolkata'; } },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
    CacheService: { getScriptCache: function () { return { get: function (k) { return k in cache ? cache[k] : null; }, put: function (k, v) { cache[k] = v; } }; } },
    ScriptApp: recorder({ getProjectTriggers: function () { return []; }, getService: function () { return { getUrl: function () { return 'https://script.google.com/macros/s/fake/exec'; } }; } }, 'ScriptApp'),
    Charts: recorder({}, 'Charts'),
    ContentService: recorder({ createTextOutput: function (s) { var o = recorder({ text: s }, 'TextOutput', function () { return o; }); return o; } }, 'ContentService'),
    log: calls
  };
}

function fakeFormatDate(d, tz, fmt) {
  var p = function (n) { return String(n).padStart(2, '0'); };
  return fmt.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
    .replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes()));
}
if (typeof module !== 'undefined') module.exports = { fakeServices: fakeServices, fakeFormatDate: fakeFormatDate };

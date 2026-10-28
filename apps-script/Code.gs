// Receipts - a web app bound to a Google Sheet: what you are working on, what you shipped, and what it changed - with a link
// to every deliverable. Runs as the deployer, so viewers need only the link. The sheet's `log` tab is the source (one row per
// piece of work); Claude Code adds rows through Inbox.gs (see skill/SKILL.md). All numbers are worked out in Model.html.
var TABS = { log: 'log', ideas: 'ideas', streams: 'streams', config: 'config', applied: 'inbox-applied', notes: 'notes' };
var NOTE_HEAD = ['id', 'created', 'updated', 'text', 'state', 'task'];
var NOTE_STATES = ['Open', 'Made a task', 'Archived'];
var LOG_HEAD = ['date', 'item', 'project', 'stream', 'kind', 'status', 'notes', 'impact', 'link', 'for'];
var IDEA_HEAD = ['stream', 'idea', 'status'];
var STREAM_HEAD = ['stream', 'about'];
var CONFIG_HEAD = ['key', 'value'];
var CONFIG_DEFAULTS = [['name', 'Your name'], ['title', 'Your role'], ['org', 'Your team'], ['tagline', 'What I am working on, what shipped, and what it changed.']];
var STATUSES = ['Completed', 'In Progress', 'Not yet Started', 'Deprioritized'];
var KINDS = ['Feature', 'Fix', 'Dashboard', 'Analysis', 'Pipeline', 'Doc', 'Deck', 'Review'];
var IDEA_STATUSES = ['Open', 'Picked up', 'Dropped'];
var CLOCK = null;  // the suites pin "today"; null in production

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  t.data = getData().replace(/</g, '\\u003c');  // the whole payload rides in the page: one server trip
  return t.evaluate().setTitle('Receipts').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Everything the page needs, as a JSON string. */
function getData() {
  var book = SpreadsheetApp.getActiveSpreadsheet(), tz = Session.getScriptTimeZone(), warnings = [];
  setupIfNew(book);
  applyInbox(book);
  var edit = canEdit(book), config = {};
  rowsOf(book, TABS.config, CONFIG_HEAD).forEach(function (r) { if (r[0]) config[String(r[0]).toLowerCase()] = String(r[1]); });
  return JSON.stringify({
    asOf: Utilities.formatDate(CLOCK || new Date(), tz, 'yyyy-MM-dd'),
    config: config,
    entries: readLog(book, tz, warnings),
    ideas: rowsOf(book, TABS.ideas, IDEA_HEAD).filter(function (r) { return r[1]; }),
    streams: rowsOf(book, TABS.streams, STREAM_HEAD).filter(function (r) { return r[0]; }),
    canEdit: edit,
    notes: edit ? readNotes(book, tz) : [],  // a scratchpad: editors only - never sent to a viewer
    sheet: edit ? book.getUrl() : null,  // viewers get the app, not the sheet
    warnings: warnings
  });
}

/** The tab's rows as arrays in `head` order, matched by header name (any order, any case); [] when the tab is missing. */
function rowsOf(book, name, head, warnings) {
  var sheet = book.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var v = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var have = v[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var idx = head.map(function (h) { return have.indexOf(h); });
  var missing = head.filter(function (h, i) { return idx[i] < 0; });
  if (missing.length && warnings) warnings.push('The "' + name + '" tab has no ' + missing.join(', ') + ' column - those show blank.');
  return v.slice(1).map(function (row) {
    return idx.map(function (i) { return i < 0 ? '' : row[i] instanceof Date ? row[i] : String(row[i] == null ? '' : row[i]).trim(); });
  });
}

/** log as [date 'yyyy-mm-dd', item, project, stream, kind, status, notes, impact, link, for, sheet row]. */
function readLog(book, tz, warnings) {
  var out = [], bad = [], odd = {};
  rowsOf(book, TABS.log, LOG_HEAD, warnings).forEach(function (r, i) {
    if (!r[1]) return;  // no item: a spare row
    var day = isoDay(r[0], tz);
    if (!day) { bad.push(i + 2); return; }
    var st = statusOf(r[5]);
    if (STATUSES.indexOf(st) < 0) odd[st || '(blank)'] = 1;
    out.push([day].concat(r.slice(1, 5), [st], r.slice(6), [i + 2]));
  });
  if (bad.length) warnings.push('Skipped log row' + (bad.length > 1 ? 's ' : ' ') + bad.slice(0, 10).join(', ') + (bad.length > 10 ? '…' : '') +
    ': the date did not read as a date (type it as 2026-10-22, or day first as 22/10/2026).');
  var o = Object.keys(odd);
  if (o.length) warnings.push('Status not one of ' + STATUSES.join(' / ') + ': ' + o.join(', ') + ' - counted as open.');
  return out;
}

/** 'done' / 'wip' / any case -> the four statuses; anything else as typed. */
function statusOf(v) {
  var s = String(v).trim(), k = s.toLowerCase().replace(/[^a-z]/g, '');
  var alias = { completed: 'Completed', complete: 'Completed', done: 'Completed', shipped: 'Completed', inprogress: 'In Progress', wip: 'In Progress',
    ongoing: 'In Progress', notyetstarted: 'Not yet Started', notstarted: 'Not yet Started', todo: 'Not yet Started', deprioritized: 'Deprioritized',
    deprioritised: 'Deprioritized', dropped: 'Deprioritized', parked: 'Deprioritized' };
  return alias[k] || s;
}

/** A date cell, 20261022, '2026-10-22' or '22/10/2026' (day first) -> '2026-10-22'; else null. */
function isoDay(v, tz) {
  if (v instanceof Date) return isNaN(v) ? null : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = String(v).trim(), m;
  if (/^\d{8}$/.test(s)) s = s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  else if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s))) s = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  var d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s ? s : null;  // 2026-02-30 is not a day
}

/**
 * Only the sheet's editors see its link: the app runs as the deployer, so the link alone must not open the sheet.
 * Asking the sheet for its editors is slow, so a confirmed editor is remembered for a minute (a removed editor keeps
 * access for at most that long); a "no" is never remembered, so a newly added editor works at once.
 */
function canEdit(book) {
  var me = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!me) return false;
  var cache = null, key = 'editor:' + me;
  try { cache = CacheService.getScriptCache(); if (cache.get(key)) return true; } catch (e) { cache = null; }
  var yes = book.getEditors().some(function (u) { return String(u.getEmail()).toLowerCase() === me; });
  if (yes && cache) try { cache.put(key, '1', 60); } catch (e) {}
  return yes;
}

/**
 * The page's "+ New task" / "Log update" / "Make a task" form: one row into the log tab, under its own headers. Editors
 * only (the app writes as the deployer, so the link alone must not be enough); every field checked here, whatever the
 * page sent. Returns just what the page needs to show it - {entry: the row as the page reads the log, note: {updated}
 * when it came from a note} - not the whole payload: a save is a few spreadsheet calls, not sixty.
 */
function addTask(json) {
  var book = SpreadsheetApp.getActiveSpreadsheet(), tz = Session.getScriptTimeZone();
  if (!canEdit(book)) throw new Error('Only editors of the sheet can add tasks.');
  var t = JSON.parse(json || '{}'), clean = function (k, max) { return String(t[k] == null ? '' : t[k]).trim().slice(0, max || 300); };
  var item = clean('item');
  if (!item) throw new Error('Give the task a name.');
  var day = isoDay(String(t.date || '').trim() || Utilities.formatDate(CLOCK || new Date(), tz, 'yyyy-MM-dd'), tz);
  if (!day) throw new Error('The date did not read as a date - use 2026-10-27.');
  var status = statusOf(t.status || 'Not yet Started');
  if (STATUSES.indexOf(status) < 0) throw new Error('Status must be one of ' + STATUSES.join(', ') + '.');
  var f = { item: item, project: clean('project'), stream: clean('stream'), kind: clean('kind'), notes: clean('notes', 2000), impact: clean('impact', 500),
    link: clean('link', 2000), 'for': clean('for') };
  var p = day.split('-'), rec = { date: new Date(+p[0], p[1] - 1, +p[2]), status: status };
  Object.keys(f).forEach(function (k) { rec[k] = plain(f[k]); });  // typed text stays text, never a formula
  setupIfNew(book);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var row, note = null;
  try {
    var log = book.getSheetByName(TABS.log);
    var head = log.getRange(1, 1, 1, log.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
    row = log.getLastRow() + 1;
    log.getRange(row, 1, 1, head.length).setValues([head.map(function (h) { return h in rec ? rec[h] : ''; })]);
    if (t.fromNote) note = setNote(book, String(t.fromNote), { state: 'Made a task', task: asText(item) });  // the note it came from, in the same save
  } finally { lock.releaseLock(); }
  return JSON.stringify({ entry: [day, f.item, f.project, f.stream, f.kind, status, f.notes, f.impact, f.link, f['for'], row], note: note });
}

/** Typed text stays text: Sheets reads a leading = + - @ as a formula, so such a value gets the ' that keeps it text. */
function plain(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }

// ---------------------------------------------------------------- notes ----------
// A scratchpad in the notes tab: jot things down, turn one into a task when it becomes work. Editors only, both ways -
// getData sends notes to editors alone, and every change is checked here.

/** notes as [id, created, updated, text, state, task], newest first. */
function readNotes(book, tz) {
  var stamp = function (v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm') : String(v); };
  return rowsOf(book, TABS.notes, NOTE_HEAD).map(function (r, i) {
    return [String(r[0]), stamp(r[1]), stamp(r[2]), String(r[3]), NOTE_STATES.indexOf(String(r[4])) >= 0 ? String(r[4]) : 'Open', String(r[5]), i];
  }).filter(function (r) { return r[0] && r[3]; })
    .sort(function (a, b) { return a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : b[6] - a[6]; })  // same minute: the later row first
    .map(function (r) { return r.slice(0, 6); });
}

/** Text written to a cell as text, whatever it looks like - a leading ' is Sheets' own mark for it (a note "27/10" stays "27/10"). */
function asText(s) { return "'" + s; }

/**
 * The page's notepad: a new note ({text}) or an edit ({id, text}). Returns only what changed - {id, created, updated} for a
 * new note, {updated} for an edit - so a save is a handful of spreadsheet calls and a reply of a few dozen characters.
 */
function saveNote(json) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (!canEdit(book)) throw new Error('Only editors of the sheet can keep notes.');
  var t = JSON.parse(json || '{}'), text = String(t.text == null ? '' : t.text).trim().slice(0, 5000);
  if (!text) throw new Error('The note is empty.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var out;
  try {
    if (t.id) {
      out = setNote(book, String(t.id), { text: asText(text) });
      if (!out) throw new Error('That note is no longer in the sheet.');
    } else {
      var sheet = notesTab(book), now = nowStamp(), row = sheet.getLastRow() + 1;
      var id = 'n' + (CLOCK || new Date()).getTime().toString(36) + '-' + row;
      sheet.getRange(row, 1, 1, NOTE_HEAD.length).setValues([[id, now, now, asText(text), 'Open', '']]);
      out = { id: id, created: now, updated: now };
    }
  } finally { lock.releaseLock(); }
  return JSON.stringify(out);
}

/** Archive a note, or bring it back ({id, state}). Returns {updated}. */
function noteState(json) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (!canEdit(book)) throw new Error('Only editors of the sheet can keep notes.');
  var t = JSON.parse(json || '{}');
  if (NOTE_STATES.indexOf(t.state) < 0) throw new Error('A note is ' + NOTE_STATES.join(', ') + '.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var out;
  try {
    out = setNote(book, String(t.id || ''), { state: t.state });
    if (!out) throw new Error('That note is no longer in the sheet.');
  } finally { lock.releaseLock(); }
  return JSON.stringify(out);
}

/**
 * Change a note's fields by id (the caller holds the lock): one read of the tab, then one write per changed cell - only
 * those, so the rest of the row is never rewritten. Returns {updated}, or null when the id is not there.
 */
function setNote(book, id, change) {
  var sheet = book.getSheetByName(TABS.notes);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var v = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var head = v[0].map(function (h) { return String(h).trim().toLowerCase(); }), at = head.indexOf('id');
  if (at < 0) return null;
  for (var i = 1; i < v.length; i++) if (String(v[i][at]) === id) {
    change.updated = nowStamp();
    Object.keys(change).forEach(function (k) { if (head.indexOf(k) >= 0) sheet.getRange(i + 1, head.indexOf(k) + 1).setValue(change[k]); });
    return { updated: change.updated };
  }
  return null;
}

function notesTab(book) {
  var sheet = book.getSheetByName(TABS.notes);
  if (sheet) return sheet;
  sheet = book.insertSheet(TABS.notes);
  sheet.getRange(1, 1, 1, NOTE_HEAD.length).setValues([NOTE_HEAD]);
  sheet.getRange(1, 1, 1, NOTE_HEAD.length).setFontWeight('bold').setBackground('#eef5fd');
  sheet.setFrozenRows(1);
  [120, 130, 130, 520, 110, 260].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.getRange('D2:D').setWrap(true);
  return sheet;
}

function nowStamp() { return Utilities.formatDate(CLOCK || new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }

// ---------------------------------------------------------------- first open ----------

/**
 * A sheet with no log tab is a new one: make log / ideas / streams / config, with dropdowns for status, kind and stream so
 * typing a row stays clean. Never touches a sheet that has a log tab.
 */
function setupIfNew(book) {
  if (book.getSheetByName(TABS.log)) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (book.getSheetByName(TABS.log)) return;  // another open set it up while this one waited
    var log = tab(book, TABS.log, LOG_HEAD, [], [110, 300, 220, 170, 110, 120, 420, 320, 260, 140]);
    log.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
    log.getRange('G2:I').setWrap(true);
    dropdown(log, 'E2:E', SpreadsheetApp.newDataValidation().requireValueInList(KINDS, true));
    dropdown(log, 'F2:F', SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true));
    var ideas = tab(book, TABS.ideas, IDEA_HEAD, [], [170, 420, 110]);
    dropdown(ideas, 'C2:C', SpreadsheetApp.newDataValidation().requireValueInList(IDEA_STATUSES, true));
    var streams = tab(book, TABS.streams, STREAM_HEAD, [], [190, 640]);
    // stream dropdowns list whatever the streams tab holds - it has to exist before a rule can point at it
    var anyStream = function () { return SpreadsheetApp.newDataValidation().requireValueInRange(streams.getRange('A2:A'), true); };
    dropdown(log, 'D2:D', anyStream());
    dropdown(ideas, 'A2:A', anyStream());
    tab(book, TABS.config, CONFIG_HEAD, CONFIG_DEFAULTS, [120, 520]);
    var blank = book.getSheetByName('Sheet1');  // what a new spreadsheet starts with
    if (blank && blank.getLastRow() === 0) book.deleteSheet(blank);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}

function tab(book, name, head, rows, widths) {
  var sheet = book.insertSheet(name);
  sheet.getRange(1, 1, rows.length + 1, head.length).setValues([head].concat(rows));
  sheet.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#eef5fd');
  sheet.setFrozenRows(1);
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  return sheet;
}

function dropdown(sheet, a1, rule) {
  sheet.getRange(a1).setDataValidation(rule.setAllowInvalid(true).build());
}

// ---------------------------------------------------------------- inbox ----------

/**
 * What Claude Code logs (Inbox.gs, shipped with `npm run release` - no sheet credentials needed) reaches the log tab once,
 * on the next open, under the log's own headers wherever its columns are:
 *  - INBOX rows are added under the last row;
 *  - LINKS fill an existing row's link cell (the row found by date, item and how its notes start) - only when the cell is
 *    empty or holds nothing but links the new text also has, so a link typed by hand is never replaced.
 * Each id goes into inbox-applied, so a later open never repeats it (nor re-adds a row deleted by hand). A LINKS id whose
 * row is not there yet is left for a later open. Returns {added, linked}.
 */
function applyInbox(book) {
  var adds = typeof INBOX === 'undefined' ? [] : INBOX, links = typeof LINKS === 'undefined' ? [] : LINKS, out = { added: 0, linked: 0 };
  var log = book.getSheetByName(TABS.log);
  if (!(adds.length || links.length) || !log || log.getLastColumn() < 1) return out;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var applied = book.getSheetByName(TABS.applied), seen = {}, done = [];
    if (applied && applied.getLastRow() >= 2) applied.getRange(2, 1, applied.getLastRow() - 1, 1).getValues().forEach(function (r) { seen[String(r[0])] = 1; });
    var head = log.getRange(1, 1, 1, log.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var now = Utilities.formatDate(CLOCK || new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

    var todo = adds.filter(function (r) { return !seen[r[0]]; });
    if (todo.length) {
      var at = log.getLastRow() + 1;
      log.getRange(at, 1, todo.length, head.length).setValues(todo.map(function (r) {
        var p = r[1].split('-'), rec = { date: new Date(+p[0], p[1] - 1, +p[2]) };
        LOG_HEAD.slice(1).forEach(function (h, i) { rec[h] = r[i + 2]; });
        return head.map(function (h) { return h in rec ? rec[h] : ''; });
      }));
      todo.forEach(function (r, i) { done.push([r[0], now, at + i]); });
      out.added = todo.length;
    }

    var col = { date: head.indexOf('date'), item: head.indexOf('item'), notes: head.indexOf('notes'), link: head.indexOf('link') };
    var patch = links.filter(function (l) { return !seen[l[0]]; });
    if (patch.length && col.link >= 0 && col.date >= 0 && col.item >= 0 && log.getLastRow() >= 2) {
      var tz = Session.getScriptTimeZone(), v = log.getRange(2, 1, log.getLastRow() - 1, head.length).getValues();
      patch.forEach(function (l) {
        var i = -1;
        for (var k = 0; k < v.length && i < 0; k++) {
          if (isoDay(v[k][col.date], tz) === l[1] && String(v[k][col.item]).trim() === l[2] &&
            (col.notes < 0 || String(v[k][col.notes]).trim().indexOf(l[3]) === 0)) i = k;
        }
        if (i < 0) return;  // not in the log (yet): try again on a later open
        var have = String(v[i][col.link] || '').trim();
        if (urlsOf(have).every(function (u) { return l[4].indexOf(u) >= 0; }) && have !== l[4]) {
          log.getRange(i + 2, col.link + 1).setValue(l[4]);
          v[i][col.link] = l[4];
          out.linked++;
        }
        done.push([l[0], now, i + 2]);  // filled, already there, or kept as typed - never tried again
      });
    }

    if (done.length) {
      if (!applied) {
        applied = book.insertSheet(TABS.applied);
        applied.getRange(1, 1, 1, 3).setValues([['id', 'added_at', 'log_row']]);
      }
      applied.getRange(applied.getLastRow() + 1, 1, done.length, 3).setValues(done);
      SpreadsheetApp.flush();
    }
    return out;
  } finally { lock.releaseLock(); }
}

function urlsOf(s) { return String(s).match(/https?:\/\/[^\s|]+/g) || []; }

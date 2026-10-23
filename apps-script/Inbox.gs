// What Claude Code logs between releases (skill/SKILL.md). Each id reaches the sheet once, on the next open of the app
// (applyInbox, Code.gs). Ids are never reused; keep old rows - they are skipped once applied, and they are the record of
// what was added.
//
// INBOX: new log rows    [id, date 'YYYY-MM-DD', item, project, stream, kind, status, notes, impact, link, for]
// LINKS: links for rows already in the log    [id, date, item, how its notes start, "Label | url" lines]
var INBOX = [
];

var LINKS = [
];

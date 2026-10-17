/*
 * Structural checks for cordis.patch.yml, aimed at the failures that only show
 * up after a restart — where the mode silently disappears from the picker.
 *
 * Why this exists: every one of these has already shipped once and cost a
 * debugging round, because the only place the real error text appears is the
 * "failed to load" card under Settings → Modes.
 *
 * Checks:
 *   1. every `agentPreset:` reference names a preset declared in this file
 *   2. no removed `dsh-tool-subagent` fields (persona / toolFilter /
 *      backgroundMode / enableRunInBackground) are still configured
 *   3. every declared preset declares an `id` and a `plugins` list
 *   4. child presets do not mount delegation tools (no recursion)
 *
 * Run:  node scripts/check-composition.cjs
 * Exit: 0 clean, 1 on any finding.
 *
 * Deliberately regex/indentation based: the repository has no YAML dependency,
 * and the file is authored by hand in a fixed shape.
 */

const fs = require('node:fs');
const path = require('node:path');

const patchPath = path.join(__dirname, '..', 'cordis.patch.yml');
const lines = fs.readFileSync(patchPath, 'utf8').split('\n');

const findings = [];
const note = (line, msg) => findings.push(`cordis.patch.yml:${line}  ${msg}`);

/** Collect rows: `- id: <rowId>` plus the lines that belong to that row. */
const rows = [];
let current = null;
lines.forEach((line, i) => {
  const m = /^(\s*)- id:\s*(\S+)\s*$/.exec(line);
  if (m) {
    current = { rowId: m[2], indent: m[1].length, start: i + 1, lines: [line] };
    rows.push(current);
    return;
  }
  if (!current) return;
  const indent = (line.match(/^\s*/) || [''])[0].length;
  // A non-indented comment or a shallower list item ends the row.
  if (line.trim() !== '' && indent <= current.indent) {
    current = null;
    return;
  }
  current.lines.push(line);
});

// 1) declared preset ids
const declared = new Map(); // presetId -> { line, row }
for (const row of rows) {
  if (!row.rowId.startsWith('preset-')) continue;
  let presetId = null;
  let hasPlugins = false;
  let lineOfId = 0;
  for (const [offset, line] of row.lines.slice(1).entries()) {
    const idm = /^\s+id:\s*([\w-]+)\s*$/.exec(line);
    if (idm && presetId === null) {
      presetId = idm[1];
      lineOfId = row.start + offset + 1;
    }
    if (/^\s+plugins:\s*$/.test(line)) hasPlugins = true;
  }
  if (presetId) declared.set(presetId, { line: lineOfId, row, hasPlugins });
}

// 2) agentPreset references + removed fields
// A delegation row is any row mounting @deepseek-ai/dsh-tool-subagent. Matching
// on the package name (rather than the row id) keeps the control tools out.
const isDelegationRow = (row) =>
  row.lines.some((l) => /name:\s*'@deepseek-ai\/dsh-tool-subagent'\s*$/.test(l));

const REMOVED = ['persona', 'toolFilter', 'backgroundMode', 'enableRunInBackground'];
for (const row of rows) {
  const toolRow = isDelegationRow(row);
  if (!toolRow) continue;
  for (const [offset, line] of row.lines.slice(1).entries()) {
    const lineNo = row.start + offset + 1;
    for (const field of REMOVED) {
      // a config key, not a `- id: persona` plugin row
      const key = new RegExp(`^\\s+${field}:\\s*(.*)$`);
      if (key.test(line)) {
        note(lineNo, `removed field "${field}" still configured on ${row.rowId} ` +
          `— move persona/tools into a child preset and use agentPreset`);
      }
    }
    const ref = /^\s+agentPreset:\s*([\w-]+)\s*$/.exec(line);
    if (ref) {
      const id = ref[1];
      if (!declared.has(id)) {
        note(lineNo, `${row.rowId} references agentPreset "${id}", which this file does not declare`);
      }
    }
  }
  for (const field of ['provider', 'toolName']) {
    if (!row.lines.some((l) => new RegExp(`^\\s+${field}:`).test(l))) {
      note(row.start, `${row.rowId} is missing required "${field}"`);
    }
  }
}

// 3) each declared preset must carry plugins
for (const [id, info] of declared) {
  if (!info.hasPlugins) note(info.line, `preset "${id}" has no plugins list`);
}

// 4) child presets must not mount delegation tools
for (const [id, info] of declared) {
  if (!/-(explore|review)$/.test(id)) continue;
  if (info.row.lines.some((l) => /dsh-tool-subagent/.test(l))) {
    note(info.line, `child preset "${id}" mounts a delegation tool — that allows unbounded recursion`);
  }
}

const allToolRows = rows.filter((r) => r.rowId.startsWith('tool-subagent')).map((r) => r.rowId);

console.log(`declared presets: ${[...declared.keys()].join(', ') || '(none)'}`);
console.log(`delegation rows:  ${allToolRows.join(', ') || '(none)'}`);
console.log('');

if (findings.length) {
  for (const f of findings) console.log('FAIL  ' + f);
  console.log('');
  console.log(`${findings.length} finding(s). Fix these before restarting DSH:`);
  console.log('a broken preset disappears from the mode picker with no visible error.');
  process.exit(1);
}

console.log('composition checks passed');

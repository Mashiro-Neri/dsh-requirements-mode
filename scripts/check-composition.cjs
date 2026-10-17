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
const text = fs.readFileSync(patchPath, 'utf8');
const lines = text.split('\n');

const findings = [];
const warnings = [];
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

// 5) skills: every directory must carry a matching name, stay under the trim
// threshold, and every requirements-* skill named in the patch must exist.
const SKILL_SIZE_CAP = 8192;
const skillsDir = path.join(__dirname, '..', 'skills');
const skillNames = new Set();
for (const dirent of fs.readdirSync(skillsDir, { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const file = path.join(skillsDir, dirent.name, 'SKILL.md');
  if (!fs.existsSync(file)) {
    note(0, `skills/${dirent.name} has no SKILL.md`);
    continue;
  }
  const body = fs.readFileSync(file, 'utf8');
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
  const declaredName = front && /^name:\s*(\S+)\s*$/m.exec(front[1]);
  if (!declaredName) {
    note(0, `skills/${dirent.name}/SKILL.md has no name in frontmatter`);
  } else if (declaredName[1] !== dirent.name) {
    note(0, `skills/${dirent.name}/SKILL.md declares name "${declaredName[1]}"`);
  } else {
    skillNames.add(declaredName[1]);
  }
  const bytes = Buffer.byteLength(body, 'utf8');
  if (bytes > SKILL_SIZE_CAP) {
    note(0, `skills/${dirent.name}/SKILL.md is ${bytes} bytes (cap ${SKILL_SIZE_CAP}) — split it`);
  } else if (bytes > SKILL_SIZE_CAP * 0.85) {
    warnings.push(`skills/${dirent.name}/SKILL.md is at ${Math.round((bytes / SKILL_SIZE_CAP) * 100)}% of the cap — plan a split`);
  }
}

// Skill names referenced from persona text / the patch must actually exist.
// `requirements-mode`, `dsh-requirements-mode` and the bare `requirements`
// preset id are not skill names.
const NOT_SKILLS = new Set([
  'requirements-mode', 'requirements',
  'requirements-explore', 'requirements-review',
  'requirements-hide-internal-presets',
]);
for (const token of new Set(text.match(/\brequirements-[a-z0-9-]+\b/g) || [])) {
  if (NOT_SKILLS.has(token)) continue;
  if (!skillNames.has(token)) {
    warnings.push(`patch mentions "${token}", which is not a skill in skills/ (typo?)`);
  }
}

// 6) a preset whose persona names a skill must be able to load skills:
// without tool-skill + skill-filesystem the instruction is a dead end.
//
// Note: the `rows` scan above stops at the first nested `- id:` row (plugin
// rows), so preset blocks are collected separately here — from a declaration
// line down to the next declaration line.
const presetBlocks = [];
{
  const declRe = /^\s{0,6}- id:\s*(preset-[\w-]+)\s*$/;
  let cur = null;
  lines.forEach((line, i) => {
    const m = declRe.exec(line);
    if (m) {
      if (cur) cur.end = i;
      cur = { id: m[1], start: i + 1, body: [line], end: lines.length };
      presetBlocks.push(cur);
      return;
    }
    if (cur) cur.body.push(line);
  });
}

for (const block of presetBlocks) {
  const mouth = block.body.join('\n');
  const named = [...skillNames].filter((s) => mouth.includes(s));
  if (named.length === 0) continue;
  const hasTool = mouth.includes('dsh-tool-skill');
  const hasFs = mouth.includes('dsh-skill-filesystem');
  if (!hasTool || !hasFs) {
    note(block.start, `preset "${block.id}" tells the agent to use ${named.join(', ')} ` +
      `but does not mount ${!hasTool ? 'tool-skill' : 'skill-filesystem'}`);
  }
}

// 7) every preset except the mode itself is internal plumbing, so the roster
// shim must list it — otherwise a new child preset silently reappears in the
// mode picker.
const shimPath = path.join(__dirname, '..', 'plugin', 'hide-internal-presets.js');
const shim = fs.existsSync(shimPath) ? fs.readFileSync(shimPath, 'utf8') : '';
const declaredIds = [...declared.keys()];
for (const id of declaredIds) {
  if (id === 'requirements') continue;
  if (shim !== '' && !shim.includes(`'${id}'`)) {
    warnings.push(`preset "${id}" is not listed in plugin/hide-internal-presets.js — it will show up as a mode`);
  }
}

const allToolRows = rows.filter((r) => r.rowId.startsWith('tool-subagent')).map((r) => r.rowId);

console.log(`declared presets: ${[...declared.keys()].join(', ') || '(none)'}`);
console.log(`delegation rows:  ${allToolRows.join(', ') || '(none)'}`);
console.log(`skills:           ${[...skillNames].join(', ') || '(none)'}`);
console.log('');

for (const w of warnings) console.log('WARN  ' + w);
if (warnings.length) console.log('');

if (findings.length) {
  for (const f of findings) console.log('FAIL  ' + f);
  console.log('');
  console.log(`${findings.length} finding(s). Fix these before restarting DSH:`);
  console.log('a broken preset disappears from the mode picker with no visible error.');
  process.exit(1);
}

console.log('composition checks passed');

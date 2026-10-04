/*
 * Checks that every name in a sub-agent `toolFilter.allow` is a tool this preset
 * can actually see.
 *
 * Why this exists: `tools.restrict()` throws when an allow-list names a tool that
 * is not registered in that scope, and the sub-agent then cannot be created at
 * all. The error text is only visible in the session log, so the failure looks
 * like "the sub-agent silently doesn't work". Three separate names have already
 * caused this:
 *
 *   - `pwsh` / `bash`                  this preset mounts no shell
 *   - `tool-fs` / `tool-fs-search`     plugin row names, not tool names
 *   - `read_mcp_resource` and friends  provided by the web layer, invisible here
 *
 * Run:  node scripts/check-tool-filter.cjs
 * Exit: 0 when every name is known, 1 with a report otherwise.
 *
 * KEEPING KNOWN_TOOLS FRESH
 * -------------------------
 * The list below is the authoritative set for a requirements-mode session. To
 * refresh it, trigger a sub-agent failure on purpose (temporarily add a bogus
 * name to an allow-list, start a session, call `subagent_explore`) and copy the
 * `known global tools: ...` list out of the session log. Or read the host
 * composition's tool rows. Whenever a new DSH version is adopted, re-check it.
 */

const fs = require('node:fs');
const path = require('node:path');

// Tools registered by whatever this preset mounts, keyed by the plugin package
// that contributes them. Adding a tool to the preset means adding its name here.
// From the real 0.2.0-rc.2 error text plus the packages the preset mounts.
const TOOLS_BY_PACKAGE = {
  '@deepseek-ai/dsh-tool-fs': ['read', 'write', 'edit', 'read_image'],
  '@deepseek-ai/dsh-tool-fs-search': ['glob', 'grep'],
  '@deepseek-ai/dsh-tool-web': ['web_search', 'web_fetch'],
  '@deepseek-ai/dsh-tool-ask-user': ['ask_user_question'],
  '@deepseek-ai/dsh-tool-skill': ['skill'],
  '@deepseek-ai/dsh-tool-todo': ['todo_write'],
  '@deepseek-ai/dsh-tool-pwsh': ['pwsh'],
  '@deepseek-ai/dsh-tool-bash': ['bash'],
  // Provided by the host plane rather than by a row this preset mounts.
  '@deepseek-ai/dsh-tool-subagent-control': ['send_message', 'interrupt_agent', 'list_agents'],
  '@deepseek-ai/dsh-tool-subagent': ['subagent_explore', 'subagent_review'],
  '@deepseek-ai/dsh-tool-workspace-dependencies': ['load_workspace_dependencies'],
};

// Tool names that live in the host composition and are visible here regardless.
const HOST_TOOLS = ['load_workspace_dependencies'];

const root = path.join(__dirname, '..');
const patchPath = path.join(root, 'cordis.patch.yml');
const text = fs.readFileSync(patchPath, 'utf8');

// Derive the known set from the packages this preset actually mounts.
const mounted = [...text.matchAll(/name:\s*'(@deepseek-ai\/[^']+)'/g)].map((m) => m[1]);
const known = new Set(HOST_TOOLS);
const contributors = [];
for (const pkg of new Set(mounted)) {
  const names = TOOLS_BY_PACKAGE[pkg];
  if (!names) continue;
  contributors.push(`${pkg} -> ${names.join(', ')}`);
  for (const n of names) known.add(n);
}

// Collect every `allow: [...]` list in the file, with the line number it starts on.
const allowLists = [];
const lines = text.split('\n');
lines.forEach((line, i) => {
  const m = /^\s*allow:\s*\[(.*)\]\s*$/.exec(line);
  if (!m) return;
  const names = m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  allowLists.push({ line: i + 1, names });
});

if (allowLists.length === 0) {
  console.error('no `allow: [...]` list found in cordis.patch.yml — did the shape change?');
  process.exit(1);
}

let failed = false;
for (const { line, names } of allowLists) {
  const unknown = names.filter((n) => !known.has(n));
  const label = `cordis.patch.yml:${line}`;
  if (unknown.length === 0) {
    console.log(`ok    ${label}  [${names.join(', ')}]`);
  } else {
    failed = true;
    console.log(`FAIL  ${label}`);
    for (const u of unknown) console.log(`        unknown tool: ${u}`);
  }
}

console.log('');
console.log('known tools derived from the packages this preset mounts:');
for (const c of contributors) console.log('  ' + c);

if (failed) {
  console.log('');
  console.log('An allow-list names a tool this scope does not register.');
  console.log('tools.restrict() will throw and the sub-agent will not be creatable.');
  console.log('Either remove the name, or mount whatever provides it (and add that');
  console.log('package to TOOLS_BY_PACKAGE in this script).');
  process.exit(1);
}

console.log('');
console.log(`all ${allowLists.length} allow-list(s) reference known tools`);

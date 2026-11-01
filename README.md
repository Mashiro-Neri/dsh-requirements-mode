# Requirements Mode

<img src="assets/icon-512.png" width="88" align="right" alt="Requirements Mode icon">

![](https://img.shields.io/badge/dsh-%E2%89%A5%200.2.1--rc.2-4D6BFE?style=flat-square)
![](https://img.shields.io/badge/license-MIT-green?style=flat-square)

**English** · [中文](README.zh.md)

A mode for DSH (DeepSeek Harness) that only discusses: it clarifies what you want, then produces one development document you can hand to another AI. It doesn't start implementing.

## Why this exists

The most common problem when asking an AI to build something isn't speed — it's that it starts too early. You say "I want to build a desktop todo app" and it immediately creates directories, installs dependencies, writes code, while you haven't worked out what the thing looks like or how you'd use it every day.

This mode flips the order: ask first, summarise, wait for your confirmation, then write one document. Writing code is the next stage's job.

## What it does

Pick Requirements mode and the behaviour changes:

- It discusses goals, scope and your daily usage instead of writing code
- The whole conversation produces exactly one document, not a pile of files
- Two extra roles appear: one investigates the real machine, one looks for holes in the document
- It stops when the document is done; nothing rolls into implementation

No tool is removed — it has what you have. The constraints are workflow rules: nothing written during discussion, no side-effecting commands, and when one is genuinely needed it hands you the command.

## What's in the box

One bundle:

**A mode** (an agent preset) — the standing workflow, the usual tools, and two delegation tools. The workflow text is about 3,800 characters and rides on every request.

**Two sub-agents**, each its own preset: an investigator and a reviewer. They are hidden from the mode picker and reached through the delegation tools.

**Eight skills**, loaded only when needed: approach comparison, questions by project type, questioning and the confirmation ledger, the document skeleton, the delivery checklist, the review rubric, the sub-agent protocol, and the large-project route.

**Three asset sets**: the implementation contract (optional handoff), the large-project planning playbook, and the acceptance workflow (the last two are used by the large-project route).

## Install

Requires DSH **0.2.1-rc.2 or newer**. 0.2.0 and older cannot load it: those versions still expect `persona` inside the delegation tool, which 0.2.1 removed.

Three ways, pick one.

### From the plugin panel

Sidebar → Plugins → Add plugin → Install a third-party plugin, and paste:

```
https://github.com/Mashiro-Neri/dsh-requirements-mode
```

The panel accepts an npm package name, a Git repository URL, or a local directory. For Git sources it runs `git ls-remote` first (5 s timeout, using the profile's git and proxy settings), so an unreachable GitHub fails immediately instead of producing a confusing package error.

Then restart DSH fully. Settings → Modes should show a card called "需求确认".

> If you already installed this repo through a development `link:`, remove it first — otherwise the same patch is applied twice.

### Let DSH install it

Start a session (standard mode is fine) and send:

```
Install https://github.com/Mashiro-Neri/dsh-requirements-mode as a bundle in the current
profile, then tell me which presets and skills it added.
```

### Command line

```bash
dsh plugin --profile desktop add github:Mashiro-Neri/dsh-requirements-mode
```

Replace `desktop` with your profile name.

## Using it

Start a session, pick Requirements mode, and describe what you want to build.

It asks a few questions per round, you answer, it continues. Once the direction settles it gives you a summary and asks whether anything needs changing; only after you confirm does it write the document.

To check something on the real machine, just ask — "which version is installed on this box?" It sends the investigator to run commands and comes back with the raw output instead of guessing.

## The two sub-agents

**The investigator** has a shell and runs read-only commands: versions, processes, logs, file diffs. Its rule is to bring back raw evidence — which file, which command, what the output actually said — with "what I saw" kept apart from "what I inferred".

**The reviewer** reads the document before delivery, looking for places that look confirmed but are assumptions. It can't see your conversation, so anything it's unsure about is listed as "needs clarification" rather than decided.

A call returns `started subagent <childId>` immediately; the answer arrives later as a completion notice, and `send_message(agent_id: …)` continues the same child. After revising the document, start a **new** reviewer — one that already saw the previous version tends to confirm its own feedback was adopted.

Each child's model can be chosen per call: when the host has a sub-agent model policy, the tools expose `provider`, `model` and `reasoning_effort`, so a review that needs no deep reasoning can run on a cheaper model.

## The large-project route

The default is the short route: four stages, one eight-section development document. The number of files is not preset — only when the content genuinely does not fit does it split into a second document (usually acceptance or an appendix).

When a project spans several systems, devices or roles, mostly reuses an existing system instead of rewriting it, or is expensive to get wrong once, the mode asks whether to take the large-project route. The default is no; hesitation means the short route.

The large route has nine stages:

```
intent → reality check → concept definition → invariants → refutation and
eight-perspective red team → state semantics → splitting → decision freeze → acceptance
```

Each stage has an artifact and a gate. Highlights:

- **Reality check** sends the investigator to inventory existing capabilities — "already exists / current semantics / gap / reuse or rebuild" — instead of designing them again
- **Red team** runs eight perspectives in one agent, then hands security and chaos engineering to an independent reviewer; every refutation goes into a ledger, convergence has explicit criteria, and the same question gets at most three rounds
- **State semantics** separate "nobody present / timeout / unknown outcome / offline / approval not delivered", with side effects modelled separately
- **Acceptance** follows the evidence-card model; only an independent verifier can write `verified`

The deliverable is a set of files, packaged as a zip:

```
requirements/<project>-planning/
  README.md               file index and SHA256
  00-planning-document.md 17 sections
  01-refutation-ledger.md
  02-decision-log.md      ADRs plus review triggers
  03-acceptance/
    README.md             acceptance workflow and verdicts
    acceptance-plan.md
    evidence-card.md
    implementation-contract/   included by default
  04-risks-and-triggers.md
```

Acceptance is not a single file but a folder: the workflow, the plan, the evidence card, and the implementation contract. The previous version's acceptance model (risk tiers, gates, evidence cards, independent review) lives there and ships by default.

The whole route is documented in `playbooks/large-project-planning.md`, distilled from a real project retrospective.

## The bundled implementation contract

The hard part of implementation isn't writing code — it's proving it actually works.

The bundle ships a delivery contract for that stage: risk tiers L0–L3, six gates, evidence cards, independent review. The core is one sentence — **evidence is completion**. A 200 response, green unit tests and a `started` log line are not.

Before writing the development document the mode asks whether to include it. If you agree, the directory is copied to the project root as `ai-contract/` and a line in the document points at it. It then asks separately whether to append a section to `AGENTS.md` — that file is loaded automatically on every DSH session, so any future agent entering the project learns to read the contract first.

Say no and nothing happens; the document won't mention it.

## What comes after

Delivering the document rolls into nothing:

1. Requirements (this mode) → the development document, you confirm the direction
2. Planning (plan mode) → an implementation plan, you approve it
3. Implementation (a fresh standard-mode session) → the code, you ask for it

Each stage stops and waits for you.

## Notes

**The "Agent Teams" plugin can stay on.** Older versions fought over the same tool name; since DSH 0.2.1 they coexist: a registration inside the preset scope shadows the global one, and Agent Teams now just disables the base rows and inserts its own team tools without touching preset rows.

Tell them apart by the parameter name: `agent_id` is this mode's `send_message` (delivers to the investigator/reviewer), `target` is the team one (delivers to teammates). The team tools are still visible inside this mode but **not usable there** — `spawn_teammate` exists globally, while the mode's `send_message` only accepts a child-agent id. Delegate through the investigator and the reviewer instead.

**Version.** If the mode card turns red after a DSH upgrade, run:

```bash
node scripts/check-composition.cjs
```

It checks preset references, removed config fields, skill directories and bundled assets, catching most upgrade breakage before a restart.

## Known limitations

**"No files during discussion" is a rule, not a physical limit.** The sub-agents have write access; what keeps them to look-but-don't-touch is their persona. For a firmer guarantee, switch the session to read-only with `/permission read-only`.

**Sub-agents can't see your conversation with the main agent**, so every task you hand them has to restate the background. The upside is they won't guess at context they don't have.

**The two child presets are hidden by a small shim.** DSH's preset registry has no concept of a hidden preset, so the bundle wraps its roster method and filters those two ids out of the picker. If a future DSH release renames that method, the shim stops working silently and the two cards reappear — the mode itself is unaffected.

## Troubleshooting

**"需求确认" isn't in the mode list.** Go to Settings → Modes and look at the card: a red "failed to load" badge with a hover tooltip carries the real error. The usual causes are a DSH version mismatch or a config field the new version removed.

**A sub-agent cannot be created.** Run `node scripts/check-composition.cjs`; if that passes, check the session log for the original error.

**git or SSL errors during install.** The repo is fetched from GitHub at install time, so your git needs to reach it. For a stale SSH host key, switch to HTTPS:

```bash
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
```

For a certificate error, use the system store:

```bash
git config --global http.sslBackend schannel
```

## Uninstall

Ask DSH to call `plugin_manager` with `action: remove_bundle` and `target` set to `@dsh-community/dsh-requirements-mode`.

The eight skills and the two child presets go with it; nothing to clean up separately.

## Layout

```
.
├── package.json               declares this as a DSH bundle
├── cordis.patch.yml           three preset declarations + the roster shim
├── plugin/
│   └── hide-internal-presets.js   filters the two child presets out of the mode picker
├── skills/                    the eight skills
├── contract/                  the implementation contract (main doc, appendix, templates, config example)
├── playbooks/
│   └── large-project-planning.md   the nine-stage large-project template
├── acceptance/
│   ├── README.md              acceptance workflow: process, verdicts, prohibitions
│   └── ACCEPTANCE_PLAN.md     acceptance plan template
├── scripts/
│   ├── build-package.ps1      packs dist/*.tgz
│   ├── check-composition.cjs  pre-restart structural checks
│   └── release.ps1            tag + push + GitHub Release from CHANGELOG.md
├── assets/
│   ├── icon.svg               original icon, MIT with this repo
│   └── icon-512.png
├── CHANGELOG.md               release notes
├── RELEASING.md               how a release is cut
├── LICENSE
├── README.md
└── README.zh.md
```

## Hacking on it

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-package.ps1
```

Produces a tgz and its SHA256 under `dist/`.

After touching the preset, run the structural check:

```bash
node scripts/check-composition.cjs
```

It verifies that every `agentPreset` a delegation row points at is declared in the same file, that no removed fields (`persona`, `toolFilter`, `backgroundMode`, `enableRunInBackground`) are still configured, that child presets don't mount delegation tools, that each skill directory matches its frontmatter name and stays under the 8 KB cap, that any preset whose persona names a skill actually mounts `tool-skill` + `skill-filesystem`, and that the bundled assets (implementation contract, large-project playbook, acceptance workflow) are all present. Several of these have shipped broken once, and each cost a restart plus a round of guessing, because a broken preset simply disappears from the mode picker.

Preset and skill-directory changes need a DSH restart; skill bodies are hot-reloaded.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) and the [releases page](https://github.com/Mashiro-Neri/dsh-requirements-mode/releases). Each release note is generated from the changelog by `scripts/release.ps1`.

## License

MIT

---

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

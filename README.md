# Requirements Mode

<img src="assets/icon-512.png" width="88" align="right" alt="Requirements Mode icon">

**English** · [中文](README.zh.md)

A mode for DSH (DeepSeek Harness) that only discusses — it doesn't write code.

<br clear="right">

## Why this exists

The most common problem when talking through a feature with an AI is that it's in too much of a hurry. You say "I want to build a desktop todo app" and it immediately starts creating directories, installing dependencies, writing code — when what you actually wanted was to figure out what the thing looks like and how you'd use it every day.

This mode pulls that step out on its own: talk it through properly, write it down as a document, then stop.

Credit where it's due: the requirements-confirmation flow isn't my idea. It comes from the **Oh My OpenCode** plugin's requirements-confirmation mode. The approach seemed right, so I ported it to DSH and adjusted it around what DSH actually provides.

## What it does

In the normal mode an agent has the full toolset and defaults to shipping something runnable as fast as possible.

Pick this mode instead and:

- Its default behaviour shifts from "give me code" to "clarify, summarise, wait for your confirmation, then write the document."
- Nothing gets written during the discussion. Across the whole conversation it produces exactly one document, at the end.
- Two extra roles show up: a sub-agent that goes and investigates, and one that looks for holes.

**The toolset is not actually reduced**, and it's worth being straight about that, because an earlier version of this README claimed otherwise. DSH mounts shell tooling on the host plane, so `pwsh` is simply present and the preset doesn't take it away. What holds the line is the workflow instruction: no files until you confirm, no side-effecting commands, and hand those to you instead.

So "it doesn't write code" is a rule it follows, not a capability it lacks. If you want the structural version, run the session read-only (`/permission read-only`) and the filesystem sandbox enforces it for real.

It isn't a prompt snippet — it's a full mode. Its identity, toolset and sub-agents are fixed when the session is created, rather than depending on the model remembering to behave.

## Built specifically for DSH

This is not a portable prompt. It leans on DSH internals, and most of it wouldn't translate to another tool as-is.

- **The mode is a real agent preset**, declared by a bundle patch (`cordis.patch.yml`). Identity, toolset and sub-agents are composed at session creation. Nothing is bolted on at runtime.
- **Each sub-agent role is its own agent preset.** Since DSH 0.2.1, `dsh-tool-subagent` rejects `persona` and `toolFilter` config; a child's persona and toolset must be a declared preset, referenced with `agentPreset`. So the bundle ships three presets: the mode itself, plus `requirements-explore` and `requirements-review`.
- **What the host already provides is not remounted.** The shell executor and the sub-agent runtime live on the host plane; mounting them again collides with the host's services and breaks the whole preset, so the bundle only mounts the tools.
- **The seven skills ship inside the bundle.** They're discovered through `skill-filesystem`'s `customSkillDirs`, with the path resolved from the bundle's own location at load time — so installing one package is enough.

Each of these maps to something the platform gives you, and each of them took some digging to get right. The dead ends are written up in the commit history, and `scripts/check-composition.cjs` exists because every one of those failures only surfaced after a restart, as a mode that silently vanished from the picker.

## Install

You need DSH (DeepSeek Harness), and Full access or approval enabled for the install.

**Version:** tested on **0.2.1-rc.2**. It will not load on 0.2.0 or older — those versions still expect `persona` inside the delegation tool, which is exactly what 0.2.1 removed. Thanks to the host plane, `pwsh` (or `bash` off Windows) will be available to the session.

If a DSH upgrade breaks it again, the failure shows up as `persona is no longer supported` or a `service "..." has been registered` message on the mode card. Run `node scripts/check-composition.cjs` first — it catches both classes before a restart.

One more thing: **turn off the "Agent Teams" plugin first** — the reason is under [Notes](#notes).

### Let DSH install it

Start a new session (standard mode is fine) and send it this:

```
Install https://github.com/Mashiro-Neri/dsh-requirements-mode as a plugin bundle into the current profile,
then tell me which presets and skills it added.
```

Restart DSH completely afterwards.

### From the command line

```bash
dsh plugin --profile desktop add github:Mashiro-Neri/dsh-requirements-mode
```

Replace `desktop` with your own profile name.

### Point at the repo directly

Ask DSH to call:

```
plugin_manager
  action: install_bundle
  target: github:Mashiro-Neri/dsh-requirements-mode
```

### Confirming it worked

Open Settings → Modes. You should see a card named "需求确认" (Requirements).

If you don't, check whether the card is red and marked as failed to load — see [Troubleshooting](#troubleshooting).

## Using it

Start a new session and pick "需求确认" from the mode selector on the welcome screen.

This has to be done before the first message — a session's mode is fixed at creation and can't be changed later.

Then just describe what you want, for example:

```
I want to build a cross-platform bookmark sync tool. Let's talk through the approach first, don't write code.
```

From there it will restate its understanding of your goal, compare a few approaches for feasibility, ask a small number of key questions (it won't dump a questionnaire on you), fill in details you hadn't thought about, and finally summarise everything and ask whether you want changes.

Once you say something like "go ahead and write the document", it drafts one first, hands it to another agent to pick apart, reports those findings back to you, and only writes the file once they're resolved.

After the document is written it stops, and points you at plan mode for the implementation plan.

To make it the default for new sessions, set it in Settings → Modes. Though if you mostly write code, I'd leave the standard mode as default.

## What's in it

Three agent presets:

- **`requirements`** — the mode itself: the standing workflow description (core principles, permission boundaries, the discussion phases, the review step, the three gates), the usual toolset, the skills, and the two delegation tools.
- **`requirements-explore`** — the investigator's persona and tools (files, search, web, shell).
- **`requirements-review`** — the reviewer's persona and tools (the same set, plus skills — it loads its own checklist).

The last two are internal plumbing, not modes to start a chat in; they appear in the mode list because a preset is a preset. Leave them alone.

The mode mounts no sub-agent runtime and no shell executor of its own — the host plane already provides both, and a second copy collides with it.

The seven skills, loaded only when a stage needs them:

- `requirements-refinement` — how to compare approaches early on, how to investigate on the ground, how to keep the document consistent when something changes
- `requirements-clarification-checklist` — questions that are easy to miss, by project type
- `requirements-questioning-ledger` — how to ask, and how to record what's actually been confirmed
- `requirements-doc-template` — the fixed document structure
- `requirements-delivery-checklist` — the pre-delivery self-check, where the file goes, and the three gates
- `requirements-review-rubric` — the reviewer's ten-point checklist
- `requirements-subagent-protocol` — how to delegate and follow up with the two sub-agents, and what each error means

The split is deliberate: the standing description carries principles and the shape of the process, while anything mechanical — an argument name, a timing rule, an error table — lives in a skill and is loaded when needed.

## The two sub-agents

Each role is its own preset, which is also how their toolset is scoped: the investigator and the reviewer simply have different plugin lists.

**Investigator.** It can run read-only commands — versions, processes, ports, environment, git state — and has write/edit as a fallback. Its rule is to bring back raw evidence (which file, which command, what the output actually said) and keep "what I saw" apart from "what I inferred".

**Reviewer.** It reads the draft looking for places that *look* confirmed but are assumptions. It can't see your conversation, so anything it is unsure about is listed as "needs clarification" rather than decided; and it can't make decisions for you — those go into the report for the main agent to relay.

Both have the full toolset including write/edit and shell, so what keeps them to look-but-don't-touch is their persona. For a firmer guarantee, use `/permission read-only`.

A call returns `started subagent <childId>` immediately; the answer arrives later as a completion notice, and `send_message(agent_id: …)` continues the same child. If the main agent thinks a finding is wrong, it explains why; the reviewer either withdraws it explicitly, or says which piece of context is missing. Two rounds per finding at most.

## What comes after

Delivering the document doesn't roll into anything. There are two more gates:

1. Requirements (this mode) → produces the development document, you confirm the direction
2. Planning (plan mode) → produces an implementation plan, you approve it
3. Implementation (a fresh standard-mode session) → writes the code, you ask for it

Each stage stops and waits for you. Nothing proceeds on its own.

## Notes

**You must turn off the "Agent Teams" plugin** (`@deepseek-ai/dsh-experimental-agent-team-profile`).

Here's why. This mode talks to its sub-agents through `send_message`, and the one DSH ships takes a parameter named `agent_id`. The Agent Teams plugin overrides that same tool name with its own version, whose parameter is `target` and which only delivers to teammates. Once overridden, the investigator and the reviewer can't be talked to any further — you'd have to start a fresh one for every single exchange.

To turn it off: Settings → Plugins → switch Agent Teams off → restart DSH.

The cost is losing `spawn_teammate`, the shared task board and the team panel. Turning it back on and restarting restores them.

To tell whether you've hit this: if your `send_message` takes `target` and errors with `active teammate "<id>" not found`, it's been overridden.

## Known limitations

**"No files during discussion" is a convention, not a structural guarantee.** The preset doesn't remove any tools — `write`, `edit` and `pwsh` are all present, for the main agent and for both sub-agents. What keeps files from appearing is the workflow instruction. The only document written at the end is still the one the main agent produces.

If you want a stronger guarantee than that, switch the session to read-only with `/permission read-only` — the sandbox will then block writes at the filesystem layer.

**Sub-agents can't see your conversation with the main agent**, so every task you hand them has to restate the background. The upside is they won't guess at context they don't have.

**`send_message` has a timing constraint**: you can't deliver while the investigator is running — it returns `subagent "<id>" is unavailable`. That's not a failure, just wait for the current round to finish. So the rhythm is: assign, wait for the report, assign again.

**The standing workflow description rides on every request**, around 3,300 characters. That costs tokens. The tradeoff is that hard constraints and the process skeleton have to be present at all times, while the details are loaded on demand.

## Troubleshooting

### "需求确认" isn't in the mode list

The mode list only shows modes that load cleanly. If one fails, it simply doesn't appear — no error, nothing.

Go to Settings → Modes and look at the card. If it's red and marked as failed to load, hover over that marker to see the actual reason. **That's the only place the error text is visible.**

Some common causes:

- `service "subagents" has been registered at <SubagentRuntime>` — a row that provides a service is mounted in the wrong place and collides with one that already exists
- `tool-subagent: persona is no longer supported` — the config still carries fields a newer DSH removed; move them into a child preset
- `service "..." has been registered at ...` — a row in the preset duplicates something the host already provides
- `skill "xxx" is unknown or no longer available` — the skill loader isn't mounted
- `active teammate "<id>" not found` — you're calling Agent Teams' `send_message`; turn that plugin off

### Sub-agent behaviour looks wrong

First confirm the session really is in Requirements mode (check the mode label at the top). Then check whether its `send_message` takes `agent_id` or `target` — the latter means it's been overridden.

If a sub-agent simply can't be created, run `node scripts/check-composition.cjs`: it catches a delegation row whose `agentPreset` isn't declared, and rows still carrying removed fields. Both make the whole preset fail to load, and the only place the real error appears is the mode card.

**None of the seven skills show up:** `customSkillDirs` could not resolve this package. The usual cause is an install alias that differs from the declared name — for example the profile lists `@local/dsh-requirements-mode` while the package calls itself `@dsh-community/dsh-requirements-mode`. This version tries both; if your alias is a third name, add it to the `names` array in `cordis.patch.yml`. Also check `~/.dsh/skills` for stale copies of the same skills: whichever root is found first wins, so an old copy silently shadows the bundled one.

### git or SSL errors during install

This repo is cloned from GitHub at install time, so your local git needs to be able to reach it. Two common cases:

If you see `Host key for github.com has changed` or similar, your SSH host key is stale. Switch to HTTPS:

```bash
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
```

If you see `SSL certificate problem: unable to get local issuer certificate`, Git's bundled CA store is out of date. Use the system one instead:

```bash
git config --global http.sslBackend schannel
```

## Uninstall

```
plugin_manager
  action: remove_bundle
  target: @dsh-community/dsh-requirements-mode
```

The seven skills and the two child presets go with it; nothing to clean up separately.

## Layout

```
.
├── package.json               declares this as a DSH bundle
├── cordis.patch.yml           the actual plugin: three preset declarations
├── skills/                    the seven skills
├── scripts/
│   ├── build-package.ps1      packs dist/*.tgz
│   └── check-composition.cjs  pre-restart structural checks
├── assets/
│   ├── icon.svg               original icon, MIT with this repo
│   └── icon-512.png
├── LICENSE
└── README.md
```

## Hacking on it

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-package.ps1
```

Produces a tgz and its SHA256 under `dist/`.

There's also a check worth running after touching the preset:

```bash
node scripts/check-composition.cjs
```

It verifies that every `agentPreset` a delegation row points at is declared in the same file, that no removed fields (`persona`, `toolFilter`, `backgroundMode`, `enableRunInBackground`) are still configured, that child presets don't mount delegation tools, that each skill directory matches its frontmatter name and stays under the 8 KB cap, and that any preset whose persona names a skill actually mounts `tool-skill` + `skill-filesystem`. The first three have each shipped once, and each cost a restart plus a round of guessing, because a broken preset simply disappears from the mode picker.

The packaging script is deliberately ASCII-only: Windows PowerShell 5.1 decodes BOM-less files using the system codepage, and non-ASCII characters break it outright.

After changing things, structural changes to the preset or skills need a DSH restart; skill bodies are hot-reloaded. To verify, start a new session and check the mode label and tool list.

## License

MIT

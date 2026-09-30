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

- There's no shell. Installing dependencies, starting services, changing system settings — it can't do any of that, because those tools aren't in its toolset at all. It isn't being asked nicely to hold back.
- It doesn't scatter files around. Across the whole conversation it produces exactly one document, at the end.
- Its behaviour shifts from "give me code" to "clarify, summarise, wait for your confirmation, then write the document."
- Two extra roles show up: a sub-agent that goes and investigates, and one that looks for holes.

It isn't a prompt snippet — it's a full mode. Its identity, toolset and sub-agents are fixed when the session is created, rather than depending on the model remembering to behave.

## Built specifically for DSH

This is not a portable prompt. It leans on DSH internals, and most of it wouldn't translate to another tool as-is.

- **The mode is a real agent preset**, declared by a bundle patch (`cordis.patch.yml`). Identity, toolset and sub-agents are composed at session creation. Nothing is bolted on at runtime.
- **The "can't write code" guarantee is structural, not textual.** The shell tools are simply absent from the preset. There's no prompt saying "please don't install dependencies".
- **The sub-agent runtime lives in its own isolated realm** (`isolate: {subagents: true}`), plus the matching `send_message` control tools. Both are component parts this mode mounts for itself.
- **The four skills ship inside the bundle.** They're discovered through `skill-filesystem`'s `customSkillDirs`, with the path resolved from the bundle's own location at load time — so installing one package is enough.
- **The reviewer's toolset is narrowed by `toolFilter`**, so it can read but not write and cannot run commands.

Each of these maps to something the platform gives you, and each of them took some digging to get right. The dead ends are written up in the commit history.

## Install

You need DSH (DeepSeek Harness), and Full access or approval enabled for the install.

On versions: this was tested end to end on **0.1.7-rc.2**. I checked every interface it uses against **0.2.0-rc.1** and found no changes (details below), but I haven't actually run it on that version — if you hit problems there, please open an issue.

<details>
<summary>What was checked for 0.2.0-rc.1</summary>

Compared against both versions' package sources:

- `dsh-tool-subagent-control`'s `send_message` still takes `agent_id` + `message` (the sub-agent messaging this whole mode depends on)
- `dsh-tool-subagent` config fields are unchanged: `provider` / `toolName` / `backgroundMode` / `enableRunInBackground` / `persona` / `toolFilter` / `maxDepth` / `agentOptions`
- `dsh-skill-filesystem` still has `customSkillDirs` / `includeDefaultRoots` / `bundledSkillDir`
- All 13 `@deepseek-ai/dsh-*` packages it uses exist at 0.2.0-rc.1

Not verified: the runtime behaviour — preset mounting, `isolate` scoping, tool filtering. Those only show up when you actually run it.

One thing worth knowing: these packages pin their peers to **exact versions** (e.g. `@deepseek-ai/dsh-subagent: 0.2.0-rc.1`), so the plugin rows in a preset have to match the runtime version. A normal install resolves this for you.

</details>

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

One mode, containing:

- A standing workflow description (core principles, permission boundaries, the discussion phases, the review step, what comes after) — around 3,300 characters, carried on every request
- A read-only toolset: read files, find files, search contents, web search, fetch pages, ask you questions, load skills, track a to-confirm list
- One write permission: writing that final document
- No shell
- Two sub-agents (below)

It also brings four skills, installed alongside and loaded only when needed:

- `requirements-refinement` — how to compare approaches early on, how to investigate on the ground, how to keep the document consistent when something changes
- `requirements-clarification-checklist` — questions that are easy to miss, by project type
- `requirements-questioning-ledger` — how to ask, and how to record what's actually been confirmed
- `requirements-doc-template` — the fixed document structure and a pre-delivery checklist

## The two sub-agents

The first one investigates. When the main agent needs to know what a machine actually looks like, or how an existing codebase is really structured, it sends this one to find out. It can only read files and has no shell, so anything it can't reach it reports as unreachable, along with a command you could run yourself — rather than guessing.

It follows a rule I find genuinely useful: bring back the raw evidence, and keep "what I saw" separate from "what I inferred".

The second one looks for holes. Once a draft exists it goes to this agent, whose job is to find places that *look* confirmed but are actually assumptions.

A few deliberate choices here: it can't see your conversation with the main agent, so anything it's unsure about gets listed as "needs clarification" instead of being decided unilaterally; its tools are read-only, so it can read but not write or run commands; and it can't make decisions for you — when it finds something that's yours to decide, that goes in the report for the main agent to relay.

If the main agent thinks a finding is wrong, it can explain why. The reviewer either withdraws it explicitly and says the reasoning holds, or says which piece of context is missing and why it can't withdraw. Two rounds at most; anything still disputed goes to you.

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

**There's no shell in this mode**, deliberately. So for things that can only be learned by running a command — which version is installed, whether a port is open — the investigator says plainly that it can't tell, and gives you a command to run instead.

**Sub-agents can't see your conversation with the main agent**, so every task you hand them has to restate the background. The upside is they won't guess at context they don't have.

**`send_message` has a timing constraint**: you can't deliver while the investigator is running — it returns `subagent "<id>" is unavailable`. That's not a failure, just wait for the current round to finish. So the rhythm is: assign, wait for the report, assign again.

**The standing workflow description rides on every request**, around 3,300 characters. That costs tokens. The tradeoff is that hard constraints and the process skeleton have to be present at all times, while the details are loaded on demand.

## Troubleshooting

### "需求确认" isn't in the mode list

The mode list only shows modes that load cleanly. If one fails, it simply doesn't appear — no error, nothing.

Go to Settings → Modes and look at the card. If it's red and marked as failed to load, hover over that marker to see the actual reason. **That's the only place the error text is visible.**

Some common causes:

- `service "subagents" has been registered at <SubagentRuntime>` — a row that provides a service is mounted in the wrong place and collides with one that already exists
- `tools.restrict() names unknown global tools "..."` — a sub-agent's tool allowlist names a tool that doesn't exist in that scope
- `skill "xxx" is unknown or no longer available` — the skill loader isn't mounted
- `active teammate "<id>" not found` — you're calling Agent Teams' `send_message`; turn that plugin off

### Sub-agent behaviour looks wrong

First confirm the session really is in Requirements mode (check the mode label at the top). Then check whether its `send_message` takes `agent_id` or `target` — the latter means it's been overridden.

If a sub-agent simply can't be created, the allow-list is the first thing to suspect, and the real error is only in the session log. After a DSH upgrade this is the most likely breakage: the set of registered tools can change, and a name that used to be valid then throws. `node scripts/check-tool-filter.cjs` catches it before you run anything.

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

The four skills go with it; nothing to clean up separately.

## Layout

```
.
├── package.json            declares this as a DSH bundle
├── cordis.patch.yml        the actual plugin: a single declaration
├── skills/                 the four skills
├── scripts/
│   └── build-package.ps1   packs dist/*.tgz
├── assets/
│   ├── icon.svg            original icon, MIT with this repo
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
node scripts/check-tool-filter.cjs
```

It verifies that every name in a sub-agent's `toolFilter.allow` is actually a tool this preset can see. Get one wrong and `tools.restrict()` throws, the sub-agent can't be created at all, and all you see is that the mode "doesn't work" — the real error only lands in the session log. Three different names have caused this already, which is why it's a script now rather than a note in the comments.

Both scripts are deliberately ASCII-only: Windows PowerShell 5.1 decodes BOM-less files using the system codepage, and non-ASCII characters break it outright.

After changing things, structural changes to the preset or skills need a DSH restart; skill bodies are hot-reloaded. To verify, start a new session and check the mode label and tool list.

## License

MIT

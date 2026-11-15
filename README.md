<div align="center">
  <img src="assets/elenalyse.png" alt="Elenalyse Logo" width="600" style="background-color: transparent;" />

# Elenalyse

### Multi-Modal CLI Developer Assistant & Persona Quartet
**Persona-driven code analysis, autonomous multi-step auditing, visual diff previews, and Japanese TTS audio cues.**

[![npm version](https://img.shields.io/npm/v/elenalyse.svg?style=flat-square)](https://www.npmjs.com/package/elenalyse)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![TypeScript: 5.0+](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/)
[![Node.js: >=18](https://img.shields.io/badge/Node.js->=18-339933.svg?style=flat-square)](https://nodejs.org/)

</div>

---

## 🌟 Overview

**Elenalyse** is an interactive, agentic developer assistant designed for the terminal. Built on top of the Vercel AI SDK, Elenalyse combines deep codebase auditing, multi-step autonomous tool execution, and visual diff previews with the charm and distinct analytical strengths of the **Persona Quartet**.

Whether you need a relentless security audit from **RIN**, cold architecture refactoring from **REI**, enthusiastic feature ideation from **SORA**, or patient mentorship and synthesis from **ELI**, Elenalyse adapts to your workflow.

---

## ✨ Core Features in v1.0

* **🎭 The Persona Quartet & Isolated Memory Handoff**: Four archetypes (ELI, REI, SORA, RIN) with isolated conversation memories. Switching personas automatically preserves technical context without personality bleed.
* **🎉 Simultaneous Party Mode (`/party`)**: Orchestrates all four personas simultaneously under ELI's leadership. RIN, REI, and SORA inspect your codebase in parallel, and ELI synthesizes their findings into a prioritized, empathetic roadmap.
* **⚡ Autonomous Multi-Step Analysis**: Analyzes, audits, and navigates large codebases across up to 25 autonomous steps with real-time spinners and text-based tool call fallback.
* **🔍 Visual Unified Diff Preview**: Calculates line-level diffs and renders clean boxed previews (`+ green`, `- red`, `@@ hunk`) before any file write or edit is confirmed.
* **🛡️ Developer Safety & Control (`/undo`)**: Automatic pre-modification snapshots allow instant reversal of any file write or edit via `/undo`.
* **🔧 Actionable Remediation (`/fix`)**: Formulates and executes targeted code fixes (`/fix blockers`, `/fix majors`, `/fix all`) based on prior audit findings.
* **⌨️ Interactive Slash Autocomplete Dropdown**: Smooth terminal dropdown popup with arrow-key navigation (`↑/↓`), multi-level sub-command drilldowns, Tab/Enter selection, and non-intrusive auto-dismissal.
* **⚙️ Persistent In-Chat Settings (`/setting`)**: Configure memory context limits (`amnesia`, `default`, `focus`), maximum autonomous inspection steps, and voice toggle directly within the REPL.
* **💾 Session Persistence (`/session`)**: Save, load, and list isolated conversation sessions stored in `~/.elenalyse/sessions/`.
* **📑 Terminal Markdown & Syntax Highlighting**: Custom pure-TypeScript ANSI renderer for headers, bold/italic, inline code, and boxed code containers with syntax highlighting (TypeScript, Python, SQL, Diff, JSON, Shell).
* **🔄 Multi-Provider Resilience & Failover**: Built-in support for Google Gemini, OpenAI, OpenRouter, and Ollama with automatic rate-limit and server failover.
* **🗣️ Expressive Japanese TTS Audio Cues**: Optional voice feedback powered by the local [VOICEVOX](https://voicevox.hiroshiba.jp/) engine.

---

## 🎭 The Persona Quartet

| Persona | Archetype | Tone & Personality | Analytical Focus |
| :--- | :--- | :--- | :--- |
| **🌱 ELI** | **Warm Mentor** | Friendly, patient, empathetic, supportive | Onboarding, architecture explanation, ELI5 breakdowns, Party leader |
| **❄️ REI** | **Kuudere** | Cold, concise, highly efficient, objective | Code refactoring, performance optimization, structural complexity |
| **☀️ SORA** | **Deredere** | Cheerful, energetic, creative, inspiring | Brainstorming, user experience, developer delight, new features |
| **🔥 RIN** | **Tsundere** | Strict, merciless, sharp-tongued, thorough | Security auditing, bug detection, input validation, critical blockers |

---

## 🚀 Installation

Install Elenalyse globally using npm:

```bash
npm install -g elenalyse
```

Or run directly using `npx`:

```bash
npx elenalyse start
```

---

## ⚡ Quick Start

### 1. Interactive REPL Mode (Recommended)

Launch the interactive chat loop with rich dashboard banners and slash autocomplete:

```bash
elenalyse start
```

#### Launch Flags:
* `elenalyse start --voice` : Enable local VOICEVOX Japanese speech synthesis.
* `elenalyse start --amnesia` : Restrict conversation memory to 10 messages (for low-token models).
* `elenalyse start --focus` : Expand conversation memory to 100 messages (for extended context).
* `elenalyse start --debug` : Display token usage and memory dump logs.

Inside the chat, save your provider API keys permanently:
```text
👤 You ❯ /api google <YOUR_API_KEY>
👤 You ❯ /api openrouter <YOUR_API_KEY>
👤 You ❯ /api openai <YOUR_API_KEY>
```

### 2. Single Message Usage

Execute quick, one-off tasks from your shell or CI/CD pipelines:

```bash
# Analyze a bug or ask a quick question
elenalyse chat "Inspect src/index.ts and check for unhandled exceptions"

# Switch global active persona
elenalyse persona set rei
```

---

## 💬 In-Chat Slash Commands Reference

| Command | Syntax | Description |
| :--- | :--- | :--- |
| **`/help`** | `/help` | Show command menu, shortcuts, and usage guide |
| **`/persona`** | `/persona <eli\|rei\|sora\|rin>` | Switch active persona with automatic technical context handoff |
| **`/party`** | `/party [audit\|review\|brainstorm\|<task>]` | Orchestrate all 4 personas simultaneously under ELI's coordination |
| **`/fix`** | `/fix [blockers\|majors\|all\|<issue>]` | Automatically generate and execute code fixes for audit findings |
| **`/setting`** | `/setting [show\|memory\|steps\|voice] [value]` | Configure runtime settings (memory limits, autonomous steps, voice) |
| **`/undo`** | `/undo` | Revert the last file modification made by Elenalyse |
| **`/session`** | `/session <save\|load\|list> [name]` | Save, load, or list persistent conversation sessions |
| **`/provider`** | `/provider <name\|fallback>` | Switch AI provider (`google`, `openai`, `openrouter`, `local`) |
| **`/model`** | `/model <model-slug>` | Change the active model (e.g. `gemini-2.5-flash`, `gpt-4o`) |
| **`/api`** | `/api <provider> <key>` | Save API key permanently to `~/.elenalyserc.json` |
| **`/paste`** | `/paste` | Enter multi-line paste mode (type `END` to submit) |
| **`/retry`** | `/retry` | Retry the previous prompt with pristine turn memory |
| **`/clear`** | `/clear` | Clear terminal screen and re-display the dashboard banner |
| **`/exit`** | `/exit` | Exit the interactive session safely |

---

## 🗣️ Voice Engine & Attribution

Elenalyse supports local Japanese speech synthesis using the **[VOICEVOX](https://voicevox.hiroshiba.jp/)** engine.

### Setting Up VOICEVOX:
1. Download and install the [VOICEVOX Official Editor](https://voicevox.hiroshiba.jp/).
2. Launch the application; Elenalyse connects to the local engine on port `50021`.
3. Start the chat with `elenalyse start --voice` (or toggle with `/setting voice on`).

### Mandatory Voice Attribution:
When recording, streaming, or publishing audio produced by Elenalyse, you must credit the VOICEVOX characters used in accordance with their terms of service:
* **VOICEVOX: 四国めたん** (Shikoku Metan - ELI)
* **VOICEVOX: 春日部つむぎ** (Kasukabe Tsumugi - REI)
* **VOICEVOX: No.7** (SORA)
* **VOICEVOX: ずんだもん** (Zundamon - RIN)

Please review the [VOICEVOX Terms of Use](https://voicevox.hiroshiba.jp/term/) before sharing audio publicly.

---

## 🔮 Upcoming in v1.1+ (Roadmap)

Version 1.0 focuses on delivering a hardened, rock-solid, developer-first terminal core. The following graphical extensions are actively developed and slated for upcoming releases:

* **🖥️ 3D Live Desktop Mascot (`elenalyse live`)**: A transparent, borderless desktop overlay powered by Tauri + Three.js displaying an expressive 3D VRM persona hovering alongside your IDE with real-time lip-sync audio cues.
* **🌐 Repository 3D Graph Visualization (`elenalyse viz`)**: An interactive 3D force-directed module graph visualizing file imports, dependencies, and architectural coupling directly in your browser.

---

## 🛠️ Tech Stack

* **CLI Core**: Node.js, TypeScript, Commander, Chalk, Ora.
* **Agentic Engine**: Vercel AI SDK (`ai`), Zod.
* **Terminal UI**: Custom ANSI parser, TTY Raw Mode prompt engine, box-drawing renderers.
* **TTS Engine**: VOICEVOX Engine (Local REST API), Sound-Play.
* **Testing**: Vitest (175+ tests).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

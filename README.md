<div align="center">
  <img src="assets/elenalyse.png" alt="Elenalyse Logo" width="600" style="background-color: transparent;" />
</div>

# Elenalyse

Multi-Modal CLI Developer Assistant & 3D Floating Mascot
Persona-driven code analysis, Japanese TTS audio cues, 3D graph visualization, and agentic terminal automation.

![npm version](https://img.shields.io/npm/v/repo-elenalyse.svg?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-Desktop-FFC107.svg?style=flat-square)

---

## ✨ Features

* **Dual-Payload Response Engine:** Delivers precise technical analysis in the terminal while voicing expressive Japanese audio cues via TTS.
* **Persona Quartet:** Powered by 4 distinct anime archetypes with unique review styles, strictness levels, and voice responses.
* **Floating 3D Mascot (`elenalyse float`):** A transparent, borderless desktop overlay powered by Tauri + Three.js that floats above your IDE without cluttering your workspace.
* **Repository 3D Graph Mapping (`elenalyse viz`):** Extracts module dependencies (`import`/`export`) and renders them in an interactive 3D force graph.
* **Agentic Terminal Tools:** Capable of analyzing bugs, editing code files precisely, and running automated tests (`npm test`, `eslint`) via Vercel AI SDK.
* **Isolated Multi-Memory Handoff:** Each persona maintains its own isolated memory buffer. When switching personas, your last technical context is seamlessly handed off as a system note, preventing personality bleed while maintaining conversation flow.

---

## 🎭 Persona Quartet

| Persona | Archetype | Tone / Personality | Specialization |
| :--- | :--- | :--- | :--- |
| **ELI** | Warm Mentor | Friendly, supportive, patient | Onboarding, complex concept breakdowns, ELI5 |
| **REI** | Kuudere | Cold, highly efficient, to-the-point | Refactoring, performance optimization, architecture |
| **SORA** | Deredere | Cheerful, creative, full of ideas | Brainstorming, new features, exploratory concepts |
| **RIN** | Tsundere | Strict, merciless, relentless | Code audits, security checks, error detection |

---

## 🚀 Installation

```bash
npm install -g elenalyse
```

---

## ⚡ Quick Start

### 1. Launch Interactive Chat (REPL)

The best way to use Elenalyse is through the interactive chat loop. This mode remembers your conversation history!

```bash
elenalyse start
```

Once inside, you can securely set your API keys and configure Elenalyse using in-chat commands:

* `/api <provider> <key>` : Save your API key permanently (e.g., `/api google AIza...`)
* `/persona <name>` : Switch between `eli`, `rei`, `sora`, `rin`.
* `/model <name>` : Change the active LLM model.
* `/provider <name>` : Change the AI provider (`google`, `openai`, `openrouter`, `local`).
* `/help` : View all available commands.

> **💡 Pro Tip - Memory Handoff:** When you switch personas using `/persona`, Elenalyse preserves the strict personality of the new character while automatically handing off the context of your last message. Ask ELI to explain a concept, then switch to REI to optimize the code!

### 2. Single Message Usage

If you prefer one-off commands for scripting or quick tasks:

```bash
# Send a single message and exit
elenalyse chat "Please create a new React component called Button"

# Switch active persona globally via CLI
elenalyse persona set rin

# Open interactive 3D module visualization in your browser
elenalyse viz

# Launch the floating 3D desktop mascot
elenalyse float
```

## 🗣️ Voice & TTS Engine

Elenalyse utilizes the **[VOICEVOX](https://voicevox.hiroshiba.jp/)** Engine for its local, offline Text-to-Speech generation.

To enable Voice Mode, start the interactive chat with the `--voice` flag:
```bash
elenalyse start --voice
```

### Installation Guide
While Elenalyse can attempt to automatically download the engine via terminal, the GitHub release size is massive (~1.7GB) and may take a long time. 
**We highly recommend installing the official VOICEVOX Editor:**
1. Download the Installer from the [VOICEVOX Official Website](https://voicevox.hiroshiba.jp/).
2. Run the installer and launch the application.
3. Elenalyse will automatically detect your local installation (e.g. `AppData/Local/Programs/VOICEVOX`) or the active `50021` port and connect to it instantly!

### Attribution (Important)
If you record or share the voice output of Elenalyse publicly (e.g., YouTube, Twitch, Twitter), you **must** credit the VOICEVOX characters used according to their terms of service. For example:
- **VOICEVOX:ずんだもん** (Zundamon)
- **VOICEVOX:四国めたん** (Shikoku Metan)
- **VOICEVOX:春日部つむぎ** (Kasukabe Tsumugi)
- **VOICEVOX:No.7**



Please review the [VOICEVOX Terms of Use](https://voicevox.hiroshiba.jp/term/) for full details before publishing audio.

---

## 🛠️ Tech Stack

* **CLI Core:** Node.js, TypeScript, Commander, Chalk, Ora.
* **LLM & Agentic Engine:** Vercel AI SDK (`ai`), Zod, Execa.
* **TTS Engine:** Node-7z, Sound-Play, VOICEVOX Engine (Local API).
* **Code Parser & RAG:** Gray-Matter, Dependency-Cruiser, Tree-Sitter.
* **Desktop Overlay:** Tauri (Rust Framework), Webview2/WebKit.
* **3D & Graphics:** Three.js, React Force Graph 3D / Spline.



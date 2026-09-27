<div align="center">
  <img src="assets/elenalyse.png" alt="Elenalyse Logo" width="600" />
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
npm install -g repo-elenalyse
```

---

## ⚡ Quick Start

### 1. Setup API Keys

Set your LLM provider API key in your environment variables or `~/.elenalyserc` config file:

```bash
export OPENAI_API_KEY="sk-..."
```

### 2. CLI Basic Usage

```bash
# Instant chat with the active persona (default: ELI)
elenalyse chat "How do I refactor this auth function?"

# Switch active persona to RIN (Strict Auditor)
elenalyse persona set rin

# Request a code audit with Japanese TTS voice response
elenalyse chat --voice "Please check for bugs in src/index.ts"

# Open interactive 3D module visualization in your browser
elenalyse viz

# Launch the floating 3D desktop mascot
elenalyse float
```

---

## 🛠️ Tech Stack

* **CLI Core:** Node.js, TypeScript, Commander, Chalk, Ora.
* **LLM & Agentic Engine:** Vercel AI SDK (`ai`), Zod, Execa.
* **Code Parser & RAG:** Gray-Matter, Dependency-Cruiser, Tree-Sitter.
* **Desktop Overlay:** Tauri (Rust Framework), Webview2/WebKit.
* **3D & Graphics:** Three.js, React Force Graph 3D / Spline.



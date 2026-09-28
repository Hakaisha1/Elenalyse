# Panduan Implementasi: Pematangan Core System Elenalyse

Dokumen ini adalah panduan kerja untuk AI coding agent (Claude Code, Cursor, atau sejenisnya) yang membantu implementasi kontribusi ke repo Elenalyse. Baca seluruh dokumen dulu sebelum mulai eksekusi, kerjakan urut sesuai prioritas — jangan lompat ke Fase 3 sebelum Fase 1 selesai, karena Fase 3 (TTS) bergantung pada asumsi bahwa fondasi di Fase 1 sudah benar.

## Cara pakai dokumen ini

Untuk tiap task di bawah, format yang dipakai adalah:
- **Masalah** — kenapa ini perlu diperbaiki
- **Lokasi** — file yang perlu disentuh
- **Solusi** — pendekatan konkret
- **Kriteria selesai** — cara memverifikasi perbaikan berhasil

Kerjakan satu task, verifikasi kriteria selesai terpenuhi, baru lanjut ke task berikutnya. Jangan gabungkan beberapa task jadi satu commit besar — pisahkan per task supaya gampang di-review.

---

## FASE 1 — Fondasi (kerjakan lebih dulu, tanpa ini fase lain rapuh)

### Task 1.1 — Perbaiki resolusi path skill loading

**Masalah**: skill (`skills/eli/*.md`, `skills/rei/*.md`, dst) dimuat memakai `process.cwd()`, bukan lokasi instalasi package. Kalau user install lewat `npm install -g elenalyse` lalu jalankan dari direktori proyek mereka sendiri, folder `skills/` tidak ditemukan di situ — sistem gagal diam-diam (silent failure), persona jatuh ke fallback generic tanpa peringatan ke user.

**Lokasi**: file yang memuat skill (kemungkinan `src/personas.ts`, cari pemanggilan `path.join(cwd, "skills", ...)`).

**Solusi**:
```typescript
// SALAH — bergantung pada direktori kerja user saat menjalankan command
const cwd = process.cwd();
const skillPath = path.join(cwd, "skills", "global.md");

// BENAR — resolve relatif terhadap lokasi file module ini sendiri (lokasi package)
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, ".."); // sesuaikan jumlah ".." dengan struktur folder src/
const skillPath = path.join(packageRoot, "skills", "global.md");
```
Kalau project pakai CommonJS (bukan ESM), gunakan `__dirname` bawaan Node langsung tanpa `fileURLToPath`.

Tambahkan juga **fallback eksplisit dengan warning**, bukan silent fallback:
```typescript
if (!fs.existsSync(skillPath)) {
  console.warn(chalk.yellow(`[Peringatan] File skill tidak ditemukan di ${skillPath}. Persona akan memakai prompt generic.`));
}
```

**Kriteria selesai**: jalankan `elenalyse start` dari direktori KOSONG di luar folder repo (misal `cd /tmp && elenalyse start`), pastikan skill tetap termuat dengan benar (test dengan cek isi system prompt yang dikirim ke API, atau tambahkan log sementara).

---

### Task 1.2 — Tambahkan path traversal guard

**Masalah**: `readFileTool` dan `listDirTool` memakai `path.resolve(process.cwd(), filePath)` tanpa validasi bahwa hasil resolve tetap berada di dalam boundary direktori kerja. LLM (baik karena salah tafsir maupun karena prompt injection dari konten yang dibaca) bisa memanggil tool dengan `filePath: "../../../.ssh/id_rsa"` dan tool akan patuh membacanya.

**Lokasi**: `src/tools.ts`, definisi `readFileTool` dan `listDirTool`.

**Solusi**:
```typescript
function resolveSafePath(baseDir: string, userPath: string): string {
  const resolved = path.resolve(baseDir, userPath);
  const normalizedBase = path.resolve(baseDir);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new Error(
      `Akses ditolak: path "${userPath}" mengarah keluar dari direktori proyek yang diizinkan.`
    );
  }
  return resolved;
}
```
Panggil fungsi ini di awal `execute()` tiap tool yang menyentuh filesystem, ganti `path.resolve(process.cwd(), filePath)` langsung dengan `resolveSafePath(process.cwd(), filePath)`. Bungkus dengan try/catch supaya error ini dikembalikan sebagai tool result yang informatif ke LLM, bukan meng-crash proses.

**Kriteria selesai**: tulis test (atau uji manual) yang memanggil tool dengan `filePath: "../../etc/passwd"` dan pastikan tool menolak dengan pesan error yang jelas, bukan membaca file tersebut.

---

### Task 1.3 — Satukan arsitektur memory antara mode chat dan REPL

**Masalah**: `handleChat()` (dipanggil lewat `elenalyse chat "..."`, single-shot) tidak menyentuh objek `memory` sama sekali, sementara `startInteractiveChat()` (mode REPL) punya sistem multi-memory per-persona. Ini bikin dua code path yang harus dipelihara terpisah, dan bug apa pun soal memory harus diperbaiki dua kali.

**Lokasi**: `src/chat.ts`, bandingkan `handleChat()` (baris 11-72) dengan `startInteractiveChat()` (baris ~126 ke atas).

**Solusi**: ekstrak logika pembacaan/penulisan `memory[persona]` jadi fungsi bersama yang dipanggil dari kedua fungsi:
```typescript
function appendToMemory(memory: Record<string, any[]>, persona: string, message: any) {
  if (!memory[persona]) memory[persona] = [];
  memory[persona].push(message);
}
```
`handleChat()` untuk mode single-shot tetap boleh tidak melakukan handoff (karena tidak ada switching persona di satu eksekusi), tapi minimal harus **membaca riwayat lama** dari persona yang sama jika dipanggil berturut-turut, dan **menyimpan** pesan baru ke memory persona itu supaya konsisten dengan mode REPL kalau nanti keduanya perlu disatukan lebih lanjut (misal via daemon/session file — di luar cakupan dokumen ini, cukup catat sebagai TODO comment di kode kalau belum diimplementasi).

**Kriteria selesai**: kedua mode memakai fungsi baca/tulis memory yang sama (tidak ada duplikasi logika array push/lookup).

---

## FASE 2 — Penyempurnaan Memory Handoff

### Task 2.1 — Ganti handoff "1 pesan terakhir" jadi sliding window + state eksplisit

**Masalah**: saat ini handoff antar-persona cuma mengambil 1 pesan user terakhir secara mentah (`.find()`), yang seringkali tidak informatif kalau pesan terakhir itu cuma basa-basi pendek.

**Lokasi**: `src/chat.ts`, bagian penanganan command `/persona <nama>`.

**Solusi** — gabungkan dua sumber, JANGAN pakai regex untuk parsing teks bebas (terlalu rapuh terhadap variasi format), pakai state terstruktur dari tool call:

```typescript
// 1. Track state dari tool call — DATA INI AKURAT karena berasal dari parameter asli, bukan tebakan dari teks
interface SessionState {
  filesTouched: Set<string>;
  lastFileRead: string | null;
}
let sessionState: SessionState = { filesTouched: new Set(), lastFileRead: null };

// Panggil sessionState.filesTouched.add(filePath) di dalam execute() readFileTool/listDirTool

// 2. Sliding window dengan budget karakter (bukan jumlah pesan tetap)
function getRecentContext(history: any[], maxChars = 1500): any[] {
  let result: any[] = [];
  let charCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    charCount += (history[i].content?.length ?? 0);
    if (charCount > maxChars) break;
    result.unshift(history[i]);
  }
  return result;
}

// 3. Gabungkan jadi handoff note
function buildHandoffNote(history: any[], state: SessionState): string {
  const recentWindow = getRecentContext(history);
  const lastUserMsg = [...history].reverse().find(m => m.role === "user");
  const filesLine = state.filesTouched.size
    ? `File yang dibahas sesi ini: ${[...state.filesTouched].join(", ")}`
    : "";
  return `[SYSTEM HANDOFF NOTE]
${filesLine}
Pesan terakhir user: "${lastUserMsg?.content ?? ""}"
Ringkasan percakapan terakhir (mentah, beberapa pesan terakhir):
${recentWindow.map(m => `${m.role}: ${m.content}`).join("\n")}`;
}
```

**Kriteria selesai**: uji skenario percakapan panjang (>10 pesan) yang menyentuh 2-3 file berbeda, ganti persona, dan pastikan persona baru tahu file apa yang sedang dibahas — bukan cuma tahu 1 kalimat terakhir.

---

## FASE 3 — Integrasi TTS (VOICEVOX ENGINE, opt-in & tanpa Docker)

Kerjakan fase ini **hanya setelah Fase 1 selesai**. TTS bergantung pada core system yang stabil; menambahnya di atas fondasi yang masih rapuh cuma menambah permukaan bug baru.

### Prinsip desain Fase 3 (baca dulu sebelum eksekusi)

1. **TTS mati secara default.** User yang cuma mau pakai fitur coding assistant biasa tidak boleh kena beban unduhan/proses tambahan apa pun. Fitur suara diaktifkan eksplisit lewat flag `--voice` atau command konfigurasi, bukan otomatis nyala.
2. **Tidak pakai Docker.** VOICEVOX ENGINE menyediakan executable binary siap pakai per OS di halaman Releases resminya — tidak perlu Docker sama sekali. Elenalyse men-download binary itu otomatis (sekali saja, di-cache lokal) saat user pertama kali mengaktifkan `--voice`, mirip pola yang dipakai Playwright (`npx playwright install`).
3. **Proses engine dijalankan di background oleh Elenalyse sendiri** (`spawn` dengan `detached: true`), user tidak perlu tahu ada "server" yang jalan di baliknya.

### Task 3.1 — Auto-download binary VOICEVOX ENGINE per OS

**Lokasi**: buat file baru `src/voiceEngine.ts`.

**Solusi**:
```typescript
import fs from "fs";
import path from "path";
import os from "os";
import { spawn, execSync } from "child_process";

const ENGINE_DIR = path.join(os.homedir(), ".elenalyse", "voicevox-engine");

function getEngineExecutablePath(): string {
  return path.join(ENGINE_DIR, os.platform() === "win32" ? "run.exe" : "run");
}

function getReleaseAssetUrlForPlatform(): string {
  // Ambil URL asset yang sesuai dari halaman Releases VOICEVOX ENGINE.
  // Cek https://github.com/VOICEVOX/voicevox_engine/releases untuk nama asset per-OS terkini
  // sebelum hardcode URL — nama file rilis bisa berubah antar versi.
  switch (os.platform()) {
    case "win32": return "<url-asset-windows-cpu.zip>";
    case "darwin": return "<url-asset-macos.zip>";
    default: return "<url-asset-linux-cpu.tar.gz>";
  }
}

export async function ensureEngineDownloaded(onProgress?: (msg: string) => void): Promise<void> {
  const execPath = getEngineExecutablePath();
  if (fs.existsSync(execPath)) return; // sudah pernah didownload, tidak unduh ulang

  fs.mkdirSync(ENGINE_DIR, { recursive: true });
  onProgress?.("Mengunduh VOICEVOX ENGINE (sekali saja, beberapa ratus MB)...");

  const assetUrl = getReleaseAssetUrlForPlatform();
  // Download ke file temp, lalu extract ke ENGINE_DIR.
  // Pakai lib seperti `node-fetch`/`undici` untuk download stream,
  // dan `extract-zip` (Windows/macOS) atau `tar` (Linux) untuk ekstraksi.
  // ... implementasi download+extract di sini ...

  if (os.platform() !== "win32") {
    fs.chmodSync(execPath, 0o755); // pastikan executable di Unix
  }
  onProgress?.("Selesai mengunduh VOICEVOX ENGINE.");
}

let engineProcess: ReturnType<typeof spawn> | null = null;

export async function ensureEngineRunning(): Promise<void> {
  try {
    execSync("curl -s -o /dev/null http://127.0.0.1:50021/version");
    return; // sudah jalan (misal dari sesi sebelumnya yang belum ditutup)
  } catch {
    // belum jalan, lanjut start
  }

  const execPath = getEngineExecutablePath();
  engineProcess = spawn(execPath, [], { detached: true, stdio: "ignore" });
  engineProcess.unref();

  // poll endpoint /version sampai merespons, dengan timeout wajar (misal 15 detik)
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      execSync("curl -s -o /dev/null http://127.0.0.1:50021/version");
      return;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error("VOICEVOX ENGINE tidak merespons setelah 15 detik. Coba jalankan ulang.");
}
```

**Kriteria selesai**: pada mesin yang belum pernah pakai fitur suara sama sekali, jalankan `elenalyse start --voice` untuk pertama kali — proses download berjalan otomatis dengan progress message, lalu engine ter-start di background tanpa user perlu command manual apa pun. Panggilan kedua dan seterusnya tidak mengunduh ulang.

### Task 3.2 — Implementasi fungsi sintesis suara

**Lokasi**: file baru `src/tts.ts`, panggil dari titik yang sekarang masih berisi `console.log(chalk.magenta("[TTS Feature is currently mocked...]"))`.

**Solusi**:
```typescript
const VOICEVOX_BASE_URL = "http://127.0.0.1:50021";

export async function synthesizeSpeech(text: string, speakerId: number): Promise<Buffer> {
  let queryRes: Response;
  try {
    queryRes = await fetch(
      `${VOICEVOX_BASE_URL}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(text)}`,
      { method: "POST" }
    );
  } catch (err) {
    throw new Error(
      "Tidak bisa terhubung ke VOICEVOX ENGINE lokal. Coba jalankan ulang dengan flag --voice."
    );
  }
  if (!queryRes.ok) {
    throw new Error(`VOICEVOX audio_query gagal (status ${queryRes.status}).`);
  }
  const audioQuery = await queryRes.json();

  const synthRes = await fetch(`${VOICEVOX_BASE_URL}/synthesis?speaker=${speakerId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(audioQuery),
  });
  if (!synthRes.ok) {
    throw new Error(`VOICEVOX synthesis gagal (status ${synthRes.status}).`);
  }

  const arrayBuffer = await synthRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
```
Panggil `ensureEngineDownloaded()` lalu `ensureEngineRunning()` (dari Task 3.1) sebelum `synthesizeSpeech()` dipanggil pertama kali dalam satu sesi — bukan di setiap pemanggilan, cukup sekali di awal saat `--voice` terdeteksi aktif.

**Kriteria selesai**: dengan engine sudah ter-download & ter-start otomatis dari Task 3.1, panggil `synthesizeSpeech("こんにちは", 1)` menghasilkan Buffer valid yang bisa disimpan jadi file `.wav` dan diputar.

### Task 3.3 — Flag opt-in `--voice` dan penonaktifan default

**Lokasi**: entry point CLI (kemungkinan `bin/` atau argumen parser di `src/chat.ts`).

**Solusi**:
```typescript
const voiceEnabled = process.argv.includes("--voice");

// ...di titik yang menangani respons AI:
if (voiceEnabled) {
  await ensureEngineDownloaded(msg => console.log(chalk.gray(msg)));
  await ensureEngineRunning();
  // lanjut ke parsing <voice> tag dan sintesis
} else {
  // lewati seluruh alur TTS sepenuhnya, tidak ada percobaan koneksi ke port 50021 sama sekali
}
```
Simpan juga preferensi ini opsional ke config file (misal `~/.elenalyse/config.json`) supaya user tidak perlu ketik `--voice` tiap kali kalau mereka memang mau selalu aktifkan.

**Kriteria selesai**: `elenalyse start` (tanpa flag) berjalan identik seperti sebelum Fase 3 dikerjakan — tidak ada percobaan koneksi ke VOICEVOX, tidak ada proses download, tidak ada log terkait suara sama sekali.

### Task 3.4 — Mapping persona ke speaker ID

**Lokasi**: `src/personas.ts` atau file konfigurasi terpisah `src/voiceConfig.ts`.

**Solusi**: ambil daftar speaker lewat `GET http://127.0.0.1:50021/speakers` (jalankan manual dulu untuk lihat opsi ID yang tersedia, atau minta dari maintainer VOICEVOX). Susun mapping eksplisit:
```typescript
export const PERSONA_SPEAKER_MAP: Record<string, number> = {
  eli: 8,   // sesuaikan dengan ID karakter yang terdengar hangat
  rei: 11,  // sesuaikan dengan ID karakter yang terdengar dingin/efisien
  sora: 3,  // sesuaikan dengan ID karakter yang terdengar ceria
  rin: 20,  // sesuaikan dengan ID karakter yang terdengar tegas
};
```
Jangan hardcode angka tanpa komentar — tiap ID harus dikomentari karakter apa yang dipetakan, supaya gampang diaudit/diganti nanti.

**Kriteria selesai**: tiap persona menghasilkan suara berbeda saat dipanggil, mapping terdokumentasi jelas di kode.

### Task 3.5 — Parsing tag `<voice>` dan pemutaran audio

**Masalah**: respons AI mengandung tag `<voice>...</voice>` (lihat `skills/rin/security-audit.md` dkk) yang perlu dipisahkan dari teks biasa sebelum dikirim ke TTS.

**Solusi**:
```typescript
function extractVoiceSegments(responseText: string): { displayText: string; voiceLines: string[] } {
  const voiceLines: string[] = [];
  const displayText = responseText.replace(/<voice>([\s\S]*?)<\/voice>/g, (_, content) => {
    voiceLines.push(content.trim());
    return content.trim(); // tetap tampilkan teksnya di terminal, cuma hilangkan tag-nya
  });
  return { displayText, voiceLines };
}
```
Setelah dapat `voiceLines`, panggil `synthesizeSpeech()` untuk tiap baris, simpan ke file temp, mainkan pakai library pemutar audio cross-platform (misal `play-sound` atau `sound-play`). Pastikan pemutaran **tidak blocking** — teks di terminal harus tetap tampil duluan, suara menyusul secara async.

**Kriteria selesai**: menjalankan chat dengan persona RIN menghasilkan teks di terminal + suara terputar tanpa mem-freeze prompt berikutnya.

---

## Kewajiban lisensi (jangan lewatkan, wajib untuk Fase 3)

Tambahkan ke `README.md` bagian baru:

```markdown
## Kredit Suara (VOICEVOX)

Fitur TTS pada Elenalyse menggunakan [VOICEVOX ENGINE](https://github.com/VOICEVOX/voicevox_engine).
Jika kamu membagikan hasil suara dari tool ini secara publik, kamu WAJIB mencantumkan
kredit sesuai karakter suara yang digunakan, misal "VOICEVOX:<nama karakter>".
Lihat syarat lengkap tiap karakter di halaman resmi VOICEVOX.
```

Tambahkan juga pesan runtime satu kali (misal saat command `elenalyse start` pertama kali dijalankan setelah TTS aktif):
```typescript
console.log(chalk.gray(
  "Catatan: suara dihasilkan via VOICEVOX. Jika kamu membagikan hasil suara secara publik, " +
  "cantumkan kredit sesuai karakter suara — lihat README untuk detail."
));
```

---

## Urutan commit yang disarankan

1. `fix: resolve skill path relative to package root, not cwd`
2. `fix: add path traversal guard to file tools`
3. `refactor: unify memory handling between chat and REPL modes`
4. `feat: improve persona handoff with sliding window + tool-call state`
5. `feat: auto-download & manage VOICEVOX ENGINE binary (opt-in via --voice)`
6. `feat: implement VOICEVOX TTS synthesis and <voice> tag playback`
7. `docs: add VOICEVOX attribution requirements to README`

Jangan gabungkan poin 1-3 dengan poin 5-6 dalam satu PR — reviewer (temannya) akan lebih mudah menilai kalau perbaikan fondasi dan fitur baru dipisah jelas.
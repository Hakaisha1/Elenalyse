# Changelog

Semua perubahan dan peningkatan signifikan pada Elenalyse (mulai dari pematangan core system, stabilitas mode *agentic*, hingga peningkatan UX).

## [1.0.2] - Bugfix Release (Dropdown Stacking & Voice Tag Leaks)

### Bug Fixes
- **Fix Dropdown Stacking di Terminal**: Menghilangkan escape code `\x1b[s` dan `\x1b[u` yang menyebabkan dropdown autocomplete menumpuk (stacking) pada terminal Windows saat terjadi scrolling. Digantikan dengan kontrol kursor ECMA-48 `\x1b[<n>A` dan pembersihan layar instan `\r\x1b[J`.
- **Auto-Dismissal Autocomplete**: Kotak saran kini otomatis menutup saat slash command yang diketik sudah cocok persis (misal `/party`), saat input tidak cocok dengan perintah apa pun, atau saat mengetik chat normal.
- **Natural Enter Key Execution**: Menekan tombol `Enter` saat mengetik perintah langsung mengeksekusi perintah tanpa terperangkap loop autocomplete. Tombol `Tab` tetap didedikasikan untuk memilih saran.
- **Sanitasi Tag `<voice>`**: Memperbaiki kebocoran tag `<voice>` ke output terminal dengan mem-passing `displayText` hasil sanitasi ke markdown renderer, memperluas regex pembersihan tag suara agar kebal terhadap huruf besar/kecil (`<Voice>`), berbagai format tanda kutip, tag tanpa penutup, dan tag penutup liar.
- **Defense-in-Depth Markdown Renderer**: Menambahkan filter pelindung di dalam `renderMarkdown` untuk memastikan teks output selalu bersih dari tag internal TTS.

## [1.0.1] - Perbaikan Core & Pematangan Sistem

### ✨ Fitur Baru & Peningkatan (Features)
- **Streaming Response (Real-time Output)**: Mengubah mekanisme REPL utama menggunakan `streamText` alih-alih `generateText`. AI sekarang mengetik jawaban per karakter secara *real-time*, sehingga tidak ada lagi lag / *freeze* "thinking lama" saat menunggu respons yang panjang.
- **Sliding Window Handoff**: Pergantian persona kini menggunakan sistem *sliding window* dengan *budget* 1000 karakter, menggantikan sistem *copy-paste* 6 pesan terakhir. Handoff note kini jauh lebih informatif.
- **Session State Tracking**: Sistem kini melacak secara otomatis (di *background*) file-file apa saja yang sudah dibaca/ditulis/diedit oleh sebuah persona melalui *tool calls*, dan memberikan list file ini ke persona baru saat *handoff*.
- **Automatic Memory Trimming**: Menambahkan sistem pemangkasan memori pintar (`trimMemory`) yang menjaga panjang riwayat obrolan maksimal 40 pesan. Pesan terlama akan dibuang secara diam-diam agar token API tidak meledak di sesi yang panjang.
- **Integrasi Voicevox (TTS)**: Mendukung fitur *text-to-speech* lokal tanpa *cloud* dan tanpa Docker melalui flag `--voice`. Sistem otomatis mengunduh *binary* Voicevox, menjalankannya di background, dan memutarkan `<voice>` tags ke *speaker* pengguna sesuai mapping karakter (ELI, REI, SORA, RIN).

### 🛠️ Perbaikan & Hardening Mode Agentic (Bug Fixes)
- **Harden `editFile` Tool**: 
  - Kini melakukan normalisasi CRLF (`\r\n` -> `\n`) sebelum melakukan *search & replace* untuk mengatasi *bug* gagal *match* di Windows.
  - Jika AI gagal menemukan *match*, sistem otomatis menampilkan 10 baris pertama file untuk memberi AI konteks agar ia bisa membetulkannya sendiri.
- **Safe `writeFile` Tool**: Kini mengecek eksistensi file sebelum meminta izin eksekusi. User akan melihat label peringatan yang jelas (`CREATE` vs `OVERWRITE`) beserta perbandingan ukuran file lama dan baru, demi mencegah *data loss*.
- **Protect `readFile` Tool**: 
  - Menambahkan perlindungan *size limit* maksimum 50KB agar file raksasa tidak menelan *context window* LLM.
  - Otomatis menolak upaya membaca file binary (`.exe`, `.png`, dll).
- **Protect `runCommand` Tool**: 
  - Menambahkan *timeout* paksa 30 detik pada *subprocess* CLI agar perintah yang mem-blokir (seperti server Dev) tidak membuat aplikasi Elenalyse nge-hang selamanya.
  - Membatasi (*truncate*) output STDOUT/STDERR maksimal 5000 karakter untuk mencegah *crash context window* dari output log yang terlalu panjang.
- **Fatal Error on Agent Loop**: Deteksi *agent loop* kini langsung menghentikan AI secara paksa dengan melempar `Error`, mencegah agen terus menerus menyedot batas `maxSteps` dengan mengulang argumen/tool yang sama berkali-kali.
- **Safe Single-Shot Chat**: Command CLI `elenalyse chat "pesan"` kini meneruskan *interface* Readline dengan benar sehingga tool yang meminta konfirmasi (`Y/n`) tidak mengalami konflik STDIN yang membuat aplikasi mogok.
- **Path Traversal Guard**: Semua operasi filesystem di *tools* kini memvalidasi bahwa AI tidak dapat kabur ke luar direktori proyek (*prevent `../../../etc/passwd` injection*).
- **Robust Skill Loading**: *Path resolution* untuk *skills* kini menggunakan basis hierarki modul *package* (`__dirname`), bukan direktori eksekusi user (`process.cwd()`), memungkinkan instalasi secara global (`npm install -g`).

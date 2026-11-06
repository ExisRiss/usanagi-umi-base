# Usanagi Umi Base

Base bot WhatsApp (**Baileys v7**) yang sengaja dibuat kecil, jelas, dan aman
untuk dikembangkan siapa saja.

Fokus base ini: **satu jalur koneksi untuk semua mode**, kontrak plugin yang
tegas, dan pemeriksaan otomatis supaya perubahanmu tidak diam-diam merusak bot.

```
Bot utama · Jadibot · Mode single   →  lib/socket-options.js   (satu opsi socket)
Plugins (folder plugins/)           →  lib/plugin-loader.js    (rekursif)
```

---

## 1. Mulai dalam 3 menit

```bash
git clone <repo-ini> umi-base
cd umi-base
npm install
cp config.example.js config.js      # isi nomor bot + pemilik
npm run pair 628123456789           # cetak kode 8 digit
npm start
```

Masukkan kode pairing di **WhatsApp → Perangkat Tertaut → Tautkan dengan nomor
telepon**. Setelah `[BASE] tersambung`, coba kirim `.menu` ke nomor bot.

Tanpa `nomor` di `config.js`, bot menampilkan **QR** di terminal — pindai lewat
WhatsApp → Perangkat Tertaut → Tautkan perangkat.

> Node.js **20+** wajib. Uji: `node -v`.

---

## 2. Bentuk base

```
index.js                 titik masuk: koneksi + plugin + reconnect
config.example.js        contoh konfigurasi (salin → config.js)
lib/
  baileys.js             SATU pintu impor library koneksi
  socket-options.js      BASE OPSI SOCKET (bot utama = jadibot = single)
  config.js              pembaca konfigurasi
  plugin.js              kontrak + validasi plugin
  plugin-loader.js       memuat plugins/ secara rekursif (async)
  bot-jid.js             jid bot dinamis dari sock.user.id
  rich-message-adapter.js  kirim kartu/HTML, dengan fallback teks
  webgame-server.js      API meja game multiplayer (HTTP)
  webgame-rules.js       aturan permainan yang diverifikasi SERVER
plugins/                 fiturmu di sini (main, tools, game, …)
scripts/pair.js          pairing lewat terminal
tests/                   `npm test`
docs/                    panduan lebih dalam
```

### Kenapa ada `lib/socket-options.js`

Dulu tiap mode menyusun `makeWASocket({...})` sendiri-sendiri sehingga
perilakunya berbeda:

| opsi | dulu bot utama | dulu jadibot | sekarang (semua) |
|---|---|---|---|
| `connectTimeoutMs` | 45 000 | 60 000 | **45 000** |
| `keepAliveIntervalMs` | 15 000 | 30 000 | **15 000** |
| `defaultQueryTimeoutMs` | 60 000 | 0 (∞) | **60 000** |
| `maxMsgRetryCount` | 10 | 5 | **10** |
| `browser` | Chrome | Edge | **Chrome** |

`defaultQueryTimeoutMs: 0` sengaja **tidak** dipakai: query tanpa batas membuat
socket menggantung diam-diam ketika server WhatsApp lambat.

---

## 3. Membuat plugin

Satu berkas = satu perintah. Taruh di `plugins/<kategori>/<nama>.js`:

```js
export default async function handler(m, { conn, text, usedPrefix, command }) {
  if (!text) throw `Contoh: ${usedPrefix}${command} Budi`
  await m.reply(`Halo ${text}!`)
}

handler.help = ['halo <nama>']
handler.tags = ['main']
handler.description = 'Menyapa pengguna'
handler.command = /^(halo|hai)$/i
handler.limit = false
```

Panduan lengkap (semua parameter `m`, semua metadata, kiat debugging, dan
contoh plugin nontrivial): **[docs/MEMBUAT-PLUGIN.md](docs/MEMBUAT-PLUGIN.md)**.

Aturan yang tidak boleh dilanggar:

- **ES2020** — jangan pakai `||=` atau `??=`.
- **Jangan cetak token/secret** ke chat maupun log.
- **Validasi semua input** — jangan percaya argumen dari chat.
- Satu plugin gagal **tidak** boleh mematikan bot (loader sudah menangkapnya).

---

## 4. Tes & pemeriksaan

```bash
npm test        # kontrak plugin, opsi socket, konfigurasi
npm run check   # node --check semua berkas inti
```

CI (`.github/workflows/check.yml`) menjalankan keduanya untuk setiap push dan
pull request. **Pull request yang membuat `npm test` merah tidak akan diterima.**

---

## 5. Soal library koneksi (penting)

`package.json` memakai alias npm:

```json
"@whiskeysockets/baileys": "npm:@itsliaaa/baileys@^0.5.1"
```

Artinya: seluruh kode tetap mengimpor `@whiskeysockets/baileys`, tetapi yang
terpasang adalah fork `@itsliaaa/baileys` (Baileys v7 aktif).

**Jangan pasang paket-paket ini** (sudah diverifikasi):

| paket | status |
|---|---|
| `@yudzxml/baileys` | **MALICIOUS** (OSV MAL-2026-17846) — nama sekarang holding package `0.0.1-security` |
| `@sairidev/baileys-new` | dicabut npm → holding package `0.0.1-security`; build GitHub-nya **rusak** (`DONATE_URL` tidak diekspor `Defaults/index.js`) |
| `@rexxhayanasi/elaina-baileys` | dipakai versi lama proyek ini; sudah diganti (lihat `lib/baileys.js`) |

Ingin mengganti library? Ubah **satu baris** di `package.json`, lalu sesuaikan
`lib/baileys.js`. Tidak ada berkas lain yang perlu disentuh.

---

## 6. Keamanan

- `config.js`, `sessions/`, `data/` **tidak** ikut di-commit (lihat `.gitignore`).
- Folder sesi berisi kredensial perangkat — perlakukan seperti kata sandi.
- Jangan pernah menempel isi `.env`, sesi, atau token ke issue/pull request.
- Menemukan celah? Baca [SECURITY.md](SECURITY.md).

---

## 7. Lisensi & kredit

MIT — lihat [LICENSE](LICENSE). Dibangun di atas Baileys; kredit library asal
ada di dalam berkas masing-masing.

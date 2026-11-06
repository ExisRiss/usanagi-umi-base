# Membuat Plugin

Panduan ini menjelaskan **semua** yang kamu butuhkan untuk menambah fitur ke
base ini tanpa menyentuh `index.js`.

---

## 1. Berkas plugin

```js
/* plugins/kategori/nama-perintah.js */
export default async function handler(m, ctx) {
  // kode fiturmu
}

handler.help = ['nama <argumen>']
handler.tags = ['kategori']
handler.command = /^(nama)$/i

export const metadata = { versi: '1.0.0' }  // opsional, tidak wajib
```

Lokasi folder apa pun di dalam `plugins/` boleh (rekursif). Nama berkas bebas,
tetapi dianjurkan `kata-perintah.js`.

---

## 2. Objek `m` (pesan masuk)

| properti | tipe | keterangan |
|---|---|---|
| `m.chat` | string | jid tujuan (grup `…@g.us` atau pribadi `…@s.whatsapp.net`) |
| `m.sender` | string | jid pengirim (di grup = participant) |
| `m.fromMe` | boolean | pesan berasal dari nomor bot sendiri |
| `m.isGroup` | boolean | pesan dari grup |
| `m.text` | string | **argumen** setelah perintah (tanpa perintah, tanpa prefix) |
| `m.args` | string[] | argumen dipecah spasi |
| `m.command` | string | perintah yang dipicu (huruf kecil) |
| `m.usedPrefix` | string | prefix yang dipakai pengguna (bisa kosong) |
| `m.pushName` | string | nama tampilan WhatsApp pengirim |
| `m.quoted` | object\|undefined | pesan yang di-reply |
| `m.message` | object | isi pesan mentah (media, dsb.) |
| `m.reply(teks)` | async | balas ke chat ini, otomatis mengutip pesan |

Contoh membaca media:

```js
import { downloadMediaMessage } from '../../lib/baileys.js'

export default async function handler(m, { conn }) {
  if (!m.quoted || !m.quoted.imageMessage) throw 'Reply sebuah gambar.'
  const buf = await downloadMediaMessage(m.quoted, 'buffer', {}, { logger: console, reuploadRequest: conn.updateMediaMessage })
  await conn.sendMessage(m.chat, { image: buf, caption: `Ukuran: ${buf.length} byte` }, { quoted: m.message })
}
handler.command = /^(ukur)$/i
handler.tags = ['tools']
handler.help = ['ukur']
```

---

## 3. Objek `ctx`

| properti | keterangan |
|---|---|
| `ctx.conn` | socket aktif (semua API Baileys tersedia) |
| `ctx.command` | perintah yang dipicu |
| `ctx.args`, `ctx.text` | sama dengan `m.args` / `m.text` |
| `ctx.usedPrefix` | prefix yang dipakai |
| `ctx.plugins` | daftar semua plugin termuat (untuk plugin induk seperti `menu`) |

---

## 4. Metadata plugin

| metadata | tipe | fungsi |
|---|---|---|
| `command` | RegExp \| string[] | **wajib** — pemicu perintah |
| `help` | string[] | contoh pemakaian di menu |
| `tags` | string[] | kategori (tag pertama dipakai pengelompokan menu) |
| `description` | string | penjelasan satu baris |
| `limit` | boolean | `false` = tidak memotong kuota pengguna |
| `groupOnly` | boolean | hanya bisa dipakai di grup |
| `owner` | boolean | hanya pemilik bot |
| `admin` | boolean | hanya admin grup |
| `register` | boolean | pengguna wajib terdaftar lebih dulu |
| `cooldown` | number | jeda (detik) antar pemakaian |
| `before` | function | dijalankan sebelum handler |
| `all` | boolean | dijalankan untuk **setiap** pesan (tanpa perintah) |

> `limit`/`cooldown`/`owner`/`admin` baru **berlaku** bila base-mu memasang
> fitur ekonomi/izin. Di base ini metadata tersebut hanya dibaca, tidak
> dipaksakan — kamu bebas mengaktifkannya di `index.js`.

---

## 5. Menyimpan data

Sementara (hilang saat restart):

```js
const sesi = new Map()
sesi.set(m.chat, { skor: 0 })
```

Permanen — tulis ke `data/`, **jangan** ke `sessions/`:

```js
import fs from 'node:fs'
import path from 'node:path'

const BERKAS = path.join(process.cwd(), 'data', 'skor.json')
const baca = () => { try { return JSON.parse(fs.readFileSync(BERKAS, 'utf8')) } catch { return {} } }
const tulis = (d) => {
  fs.mkdirSync(path.dirname(BERKAS), { recursive: true })
  fs.writeFileSync(BERKAS, JSON.stringify(d, null, 2), { mode: 0o600 })
}
```

---

## 6. Mengirim pesan yang lebih kaya

```js
// teks panjang
await conn.sendMessage(m.chat, { text: '*Tebal* _miring_ ```mono```' }, { quoted: m.message })

// gambar dari URL
await conn.sendMessage(m.chat, { image: { url: 'https://contoh/gambar.jpg' }, caption: 'Halo' })

// dokumen
await conn.sendMessage(m.chat, { document: Buffer.from('isi'), mimetype: 'text/plain', fileName: 'catatan.txt' })

// reaksi
await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
```

Kartu/HTML (rich message) memakai `lib/rich-message-adapter.js` — adapter akan
jatuh ke teks biasa bila perangkat penerima tidak mendukung.

---

## 7. Kesalahan yang sering terjadi

| gejala | penyebab | perbaikan |
|---|---|---|
| plugin tidak muncul di `.menu` | `handler.command` tidak ada | tambahkan RegExp/array |
| `[PLUGIN] dilewati …: ekspor default harus berupa fungsi` | lupa `export default` | `export default async function handler` |
| bot diam saja | perintah tidak cocok | cek `/^(nama)$/i` dan huruf kecil |
| galat tidak terlihat | ditelan loader | jalankan `node index.js` langsung, baca log |
| `SyntaxError: Unexpected token '??='` | ES2020 | pakai `if (x == null) x = …` |

---

## 8. Sebelum mengirim pull request

```bash
npm test        # wajib hijau
npm run check   # wajib tanpa galat
```

Tambahkan tes untuk plugin baru di `tests/` bila logikanya nontrivial:

```js
test('plugin hitung menjumlahkan', async () => {
  const plugins = await muatPlugin(path.join(AKAR, 'plugins'))
  let balasan = null
  await cariPlugin(plugins, 'hitung')({ text: '2 3', args: ['2','3'], reply: async (t) => { balasan = t } }, { usedPrefix: '.', command: 'hitung' })
  assert.match(String(balasan), /5/)
})
```

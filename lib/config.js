/* By AlzRiss — Usanagi Umi AI
 *
 * lib/config.js — konfigurasi base, seminimal mungkin dan tanpa rahasia di repo.
 *
 * Cara pakai:
 *   1. salin `config.example.js` → `config.js`
 *   2. isi nomor bot & pemilik
 *   3. JANGAN commit `config.js` (sudah ada di .gitignore)
 */

import fs from 'node:fs'
import path from 'node:path'

export const KONFIG_BAWAAN = Object.freeze({
  /* Nomor bot (format internasional tanpa +). Kosong = tampilkan QR. */
  nomor: '',
  /* Prefix perintah. `wajibPrefix: false` membuat perintah jalan tanpa prefix. */
  prefix: '.',
  wajibPrefix: true,
  /* Pemilik bot (boleh lebih dari satu) — untuk plugin handler.owner. */
  owner: [],
  /* Nama bot untuk sapaan/menu. */
  namaBot: 'Umi Base',
  /* Folder sesi (relatif ke root). Jangan taruh di dalam folder repo publik. */
  sessionDir: 'sessions/main',
  /* Tampilkan pesan galat plugin ke chat (true) atau hanya ke log (false). */
  tampilkanError: false,
  /* Penyetelan jaringan per-bot; lihat lib/socket-options.js. */
  runtimePerformance: {},
})

/**
 * Baca konfigurasi: `config.js` (kalau ada) ditimpa ke nilai bawaan.
 * Berkas contoh TIDAK pernah dibaca otomatis supaya tidak ada kejutan.
 */
export function bacaKonfig() {
  const root = process.cwd()
  const jalur = path.join(root, 'config.js')
  let pengguna = {}
  try {
    if (fs.existsSync(jalur)) {
      /* CommonJS/ESM dua-duanya bisa: berkasnya hanya objek literal. */
      const isi = fs.readFileSync(jalur, 'utf8')
      const cocok = isi.match(/export\s+default\s+({[\s\S]*})\s*;?\s*$/) || isi.match(/module\.exports\s*=\s*({[\s\S]*})\s*;?\s*$/)
      if (cocok) {
        /* eslint-disable-next-line no-new-func */
        pengguna = new Function(`return (${cocok[1]})`)()
      }
    }
  } catch (error) {
    console.warn('[CONFIG] config.js tidak terbaca, memakai bawaan:', error?.message || error)
  }
  return { ...KONFIG_BAWAAN, ...pengguna }
}

export default { bacaKonfig, KONFIG_BAWAAN }

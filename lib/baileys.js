/* By AlzRiss — Usanagi Umi AI
 *
 * lib/baileys.js — SATU pintu impor library koneksi WhatsApp.
 *
 * Kenapa dipusatkan: kalau suatu saat library harus diganti (fork lain, versi
 * baru, atau kembali ke upstream), cukup ubah alias di `package.json` — semua
 * berkas lain cukup mengimpor dari `@sairidev/baileys-new`.
 *
 * Status paket (06-11-2026):
 *   "dependencies": {
 *     "@sairidev/baileys-new": "github:ExisRiss/baileys-new#7bb1fc0"
 *   }
 *
 *   • Fork DIPERBAIKI: DONATE_URL didaftarkan di Defaults/index.js (sebelumnya
 *     diimpor dua berkas tetapi tidak pernah dideklarasikan → seluruh paket
 *     gagal diimpor), forwardedAiBotMessageInfo.botJid dibuat dinamis, serta
 *     console.clear() + banner promosi dibuang dari lib/index.js.
 *   • Alias `npm:` TIDAK didukung npm untuk dependensi Git
 *     ("aliases only work for registry deps") → dependensi memakai nama asli.
 *   • DILARANG dipasang: @yudzxml/baileys (MALICIOUS, OSV MAL-2026-17846) dan
 *     @sairidev/baileys-new DARI NPM (dicabut → stub `0.0.1-security`).
 */

export * from '@sairidev/baileys-new'
export { default } from '@sairidev/baileys-new'

/** Nama paket yang benar-benar terpasang di node_modules. */
export const BAILEYS_PACKAGE = process.env.UMI_BAILEYS_PACKAGE || '@itsliaaa/baileys'

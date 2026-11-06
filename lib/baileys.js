/* By AlzRiss — Usanagi Umi AI
 *
 * lib/baileys.js — SATU pintu impor library koneksi WhatsApp.
 *
 * Kenapa dipusatkan: kalau suatu saat library harus diganti (fork lain, versi
 * baru, atau kembali ke upstream), cukup ubah alias di `package.json` — semua
 * berkas lain tetap mengimpor dari `@whiskeysockets/baileys`.
 *
 * Status paket (06-11-2026):
 *   "dependencies": {
 *     "@whiskeysockets/baileys": "npm:@itsliaaa/baileys@^0.5.1"
 *   }
 *
 *   • @itsliaaa/baileys  = fork Baileys v7 yang aktif (perbaikan unggah media
 *     newsletter, pesan interaktif, album, tipe pesan tambahan).
 *   • @whiskeysockets/baileys resmi di npm masih 7.0.0-rc14 (RC) → belum
 *     dipakai untuk produksi.
 *   • DILARANG dipasang: @yudzxml/baileys (MALICIOUS, OSV MAL-2026-17846) dan
 *     @sairidev/baileys-new (dicabut npm → holding package `0.0.1-security`;
 *     build GitHub-nya juga rusak: DONATE_URL tidak diekspor Defaults/index.js).
 */

export * from '@whiskeysockets/baileys'
export { default } from '@whiskeysockets/baileys'

/** Nama paket yang benar-benar terpasang di node_modules. */
export const BAILEYS_PACKAGE = process.env.UMI_BAILEYS_PACKAGE || '@itsliaaa/baileys'

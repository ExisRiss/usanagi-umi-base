/* By AlzRiss — Usanagi Umi AI
 *
 * lib/plugin.js — KONTRAK PLUGIN (dokumentasi + penyaring), supaya orang lain
 * yang mengembangkan base ini tahu PERSIS bentuk plugin yang sah.
 *
 * Sebuah plugin = satu berkas `.js` di dalam `plugins/` (subfolder boleh,
 * rekursif). Berkas itu mengekspor `default` sebuah fungsi dan boleh
 * menempelkan metadata sebagai properti fungsi tersebut.
 *
 * ── CONTOH MINIMAL ──────────────────────────────────────────────────────
 *
 *   export default async function handler(m, { conn, text, usedPrefix, command }) {
 *     if (!text) throw `Contoh: ${usedPrefix}${command} halo`
 *     await conn.reply(m.chat, `Halo ${text}!`, m)
 *   }
 *
 *   handler.help = ['halo <nama>']
 *   handler.tags = ['main']
 *   handler.command = /^(halo)$/i
 *
 * ── PARAMETER `m` (pesan masuk) ─────────────────────────────────────────
 *   m.chat          jid tujuan balasan (grup / pribadi)
 *   m.sender        jid pengirim
 *   m.text          teks setelah prefix + perintah
 *   m.isGroup       true bila dari grup
 *   m.quoted        pesan yang di-reply (bila ada)
 *   m.mentionedJid  daftar jid yang di-tag
 *   m.reply(teks)   balasan singkat (sudah terikat ke chat)
 *
 * ── METADATA YANG DIKENAL ───────────────────────────────────────────────
 *   handler.command      RegExp / string[] perintah pemicu (wajib)
 *   handler.help         contoh pemakaian untuk menu
 *   handler.tags         kategori menu
 *   handler.description  penjelasan singkat
 *   handler.limit        false = tidak memotong kuota pengguna
 *   handler.groupOnly    true = hanya di grup
 *   handler.owner        true = hanya pemilik bot
 *   handler.admin        true = hanya admin grup
 *   handler.register     true = wajib terdaftar
 *   handler.cooldown     jeda detik antar pemakaian
 *   handler.before       fungsi dijalankan sebelum handler
 *   handler.all          true = dijalankan untuk SEMUA pesan (tanpa perintah)
 *
 * ── ATURAN KESELAMATAN ──────────────────────────────────────────────────
 *   • JANGAN pernah mencetak token/secret ke chat atau log.
 *   • ES2020: dilarang `||=` dan `??=`, agar tetap jalan di runtime lama.
 *   • Validasi SEMUA input pengguna; jangan percaya argumen klien.
 *   • Satu plugin = satu tanggung jawab. Kalau butuh 2 hal, buat 2 berkas.
 */

/** Metadata yang dikenali loader. Dipakai untuk validasi & dokumentasi. */
export const METADATA_DIKENAL = Object.freeze([
  'command', 'help', 'tags', 'description', 'limit', 'groupOnly',
  'owner', 'admin', 'register', 'cooldown', 'before', 'all', 'group',
])

/**
 * Periksa apakah sebuah plugin memenuhi kontrak minimum.
 * Dipakai di `tests/plugin-contract.test.mjs` dan oleh pengembang baru.
 *
 * @param {Function} plugin
 * @returns {{ ok: boolean, masalah: string[] }}
 */
export function periksaPlugin(plugin) {
  const masalah = []
  if (typeof plugin !== 'function') {
    masalah.push('ekspor default harus berupa fungsi (m, { conn, ... }) => ...')
    return { ok: false, masalah }
  }
  if (!plugin.command) masalah.push('handler.command wajib diisi (RegExp atau string[])')
  if (plugin.help && !Array.isArray(plugin.help)) masalah.push('handler.help harus array')
  if (plugin.tags && !Array.isArray(plugin.tags)) masalah.push('handler.tags harus array')
  if (plugin.command instanceof RegExp && plugin.command.source.length > 400) {
    masalah.push('handler.command regex terlalu panjang (>400 karakter)')
  }
  return { ok: masalah.length === 0, masalah }
}

/** Uraikan `handler.command` menjadi daftar perintah teks (untuk bantuan/menu). */
export function daftarPerintah(plugin) {
  const cmd = plugin && plugin.command
  if (!cmd) return []
  if (Array.isArray(cmd)) return cmd.map((c) => String(c))
  if (cmd instanceof RegExp) {
    const sumber = cmd.source.replace(/^\^\(?/, '').replace(/\)?\$$/, '')
    return sumber.split('|').map((c) => c.replace(/[\\^$]/g, '')).filter(Boolean)
  }
  return [String(cmd)]
}

export default { METADATA_DIKENAL, periksaPlugin, daftarPerintah }

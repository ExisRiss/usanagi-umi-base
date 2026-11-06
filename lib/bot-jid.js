/* By AlzRiss - Usanagi Umi AI
 *
 * Task213 — jid bot untuk `forwardedAiBotMessageInfo` (rich message).
 *
 * Dulu semua pengirim rich message memakai jid TETAP:
 *   botJid: '867051314767696@bot'
 * Akibatnya kartu selalu tampil sebagai "diteruskan dari bot lain" — bukan
 * dari bot yang benar-benar mengirim. Owner meminta memakai jid perangkat
 * yang aktif:
 *
 *   const botJid = sock.user?.id?.replace(/:.*@/, '@')
 *   forwardedAiBotMessageInfo: { botJid }
 *
 * Modul ini menyediakan satu fungsi yang dipakai SEMUA pengirim rich message
 * (lib/awang-rich-forward.js, lib/awang-table.js, lib/rich-live-card.js,
 * lib/usanagi-ai-rich.js, lib/rich-games/*, plugin game) supaya perilakunya
 * seragam dan tidak ada nilai jid yang tertinggal.
 */

/* jid lama dipakai hanya sebagai cadangan terakhir bila tidak ada koneksi. */
export const BOT_JID_CADANGAN = '867051314767696@bot'

/**
 * Ubah `628xxx:12@s.whatsapp.net` → `628xxx@s.whatsapp.net`.
 * Nilai yang tidak berbentuk jid dikembalikan apa adanya (aman untuk 'bot'
 * string yang dipakai sebagian contoh lama).
 */
export function rapikanBotJid(id) {
  const nilai = String(id || '').trim()
  if (!nilai) return ''
  /* Buang bagian device (`:12`) sebelum `@`. */
  return nilai.replace(/:\d+(?=@)/, '')
}

/**
 * Jid bot yang sedang aktif.
 *
 * @param {object} [conn] koneksi WhatsApp (opsional; default `global.conn`)
 * @returns {string} jid siap pakai untuk `forwardedAiBotMessageInfo.botJid`
 */
export function botJidAktif(conn) {
  let sumber = conn
  if (!sumber) {
    try { sumber = global.conn } catch { sumber = null }
  }
  const kandidat = [
    sumber && sumber.user && sumber.user.id,
    sumber && sumber.authState && sumber.authState.creds && sumber.authState.creds.me && sumber.authState.creds.me.id,
  ]
  for (const nilai of kandidat) {
    const jid = rapikanBotJid(nilai)
    if (jid && jid.includes('@')) return jid
  }
  /* Tanpa koneksi: jangan mengarang nomor. Cadangan lama dipertahankan supaya
   * pesan yang dibangun di luar sesi (mis. pratinjau di panel) tetap sah. */
  return BOT_JID_CADANGAN
}

export default botJidAktif

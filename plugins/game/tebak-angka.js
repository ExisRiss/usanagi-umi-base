/* Contoh penyimpanan state di memori: state hilang saat bot restart.
 * Untuk data permanen, tulis ke folder `data/` (lihat docs/MEMBUAT-PLUGIN.md). */

const sesi = new Map()

export default async function handler(m, { usedPrefix, command }) {
  const sekarang = sesi.get(m.chat)

  if (command === 'nyerah' || (sekarang && m.text === 'nyerah')) {
    if (!sekarang) throw 'Tidak ada permainan yang berjalan di chat ini.'
    sesi.delete(m.chat)
    return m.reply(`Oke, angkanya adalah *${sekarang.angka}*.`)
  }

  if (!sekarang) {
    const angka = Math.floor(Math.random() * 100) + 1
    sesi.set(m.chat, { angka, tebakan: 0 })
    return m.reply(
      '🎲 *TEBAK ANGKA*\n\nAku memilih angka 1–100. Tebak dengan mengirim angkanya.\n' +
        `Ketik \`${usedPrefix}nyerah\` untuk menyerah.`
    )
  }

  const tebak = Number(m.text)
  if (!Number.isInteger(tebak) || tebak < 1 || tebak > 100) throw 'Kirim angka bulat 1–100.'
  sekarang.tebakan += 1

  if (tebak === sekarang.angka) {
    sesi.delete(m.chat)
    return m.reply(`🎉 Benar! Angkanya *${sekarang.angka}*. Kamu butuh ${sekarang.tebakan} tebakan.`)
  }
  await m.reply(tebak < sekarang.angka ? '📈 Terlalu kecil.' : '📉 Terlalu besar.')
}

handler.help = ['tebakangka', 'nyerah']
handler.tags = ['game']
handler.description = 'Game tebak angka 1–100'
handler.command = /^(tebakangka|nyerah)$/i
handler.limit = false

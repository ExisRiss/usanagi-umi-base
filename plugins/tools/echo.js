/* Contoh validasi input: tolak argumen kosong dengan pesan yang berguna. */

export default async function handler(m, { usedPrefix, command }) {
  if (!m.text) throw `Contoh: ${usedPrefix}${command} teks yang mau diulang`
  const ulang = Math.min(5, Math.max(1, Number(m.args[0]) || 1))
  const isi = /^\d+$/.test(String(m.args[0] || '')) ? m.args.slice(1).join(' ') : m.text
  if (!isi) throw 'Teksnya kosong.'
  await m.reply(Array.from({ length: ulang }, (_, i) => `${i + 1}. ${isi}`).join('\n'))
}

handler.help = ['echo [jumlah] <teks>']
handler.tags = ['tools']
handler.description = 'Mengulang teks (maksimal 5×)'
handler.command = /^(echo|ulang)$/i
handler.cooldown = 2

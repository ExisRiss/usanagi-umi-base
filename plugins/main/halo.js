/* Plugin contoh paling sederhana — mulai dari sini. */

export default async function handler(m, { usedPrefix, command }) {
  const nama = m.text || m.pushName || 'kamu'
  await m.reply(`Halo ${nama}! 👋\n\nCoba: ${usedPrefix}ping · ${usedPrefix}menu`)
}

handler.help = ['halo <nama>']
handler.tags = ['main']
handler.description = 'Menyapa pengguna'
handler.command = /^(halo|hai|hi)$/i
handler.limit = false

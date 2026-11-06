/* Contoh plugin yang membaca keadaan runtime (latensi + memori). */

import os from 'node:os'

export default async function handler(m) {
  const mulai = Date.now()
  const pesan = await m.reply('🏓 menghitung…')
  const latensi = Date.now() - mulai
  const mem = process.memoryUsage()
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`
  const teks = [
    '*🏓 PONG*',
    `• Latensi : ${latensi} ms`,
    `• Uptime  : ${Math.floor(process.uptime())} s`,
    `• Memori  : ${mb(mem.rss)}`,
    `• Node    : ${process.version}`,
    `• Platform: ${os.platform()} ${os.arch()}`,
    `• CPU     : ${(os.cpus() || []).length} core`,
  ].join('\n')
  /* Pesan pertama diganti, bukan dikirim ulang, supaya chat tidak berantakan. */
  await m.reply(teks)
  return pesan
}

handler.help = ['ping']
handler.tags = ['main']
handler.description = 'Cek latensi dan kondisi server'
handler.command = /^(ping)$/i
handler.limit = false

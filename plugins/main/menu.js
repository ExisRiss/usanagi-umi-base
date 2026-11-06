/* Menu otomatis: membaca metadata plugin yang sedang dimuat.
 * Tidak perlu mendaftar perintah manual — tambah plugin, menu ikut tumbuh. */

import { ringkasPlugin } from '../../lib/plugin-loader.js'

export default async function handler(m, { plugins, usedPrefix }) {
  const daftar = ringkasPlugin(plugins)
  const perKategori = new Map()
  for (const p of daftar) {
    const kategori = (p.tags && p.tags[0]) || 'lainnya'
    if (!perKategori.has(kategori)) perKategori.set(kategori, [])
    for (const cmd of p.perintah) perKategori.get(kategori).push(cmd)
  }
  const baris = [...perKategori.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kategori, cmds]) => `*${kategori.toUpperCase()}*\n${cmds.sort().map((c) => `${usedPrefix}${c}`).join('\n')}`)
  await m.reply(`*🤖 MENU* (${daftar.length} plugin)\n\n${baris.join('\n\n')}`)
}

handler.help = ['menu']
handler.tags = ['main']
handler.description = 'Daftar perintah yang tersedia'
handler.command = /^(menu|help)$/i
handler.limit = false

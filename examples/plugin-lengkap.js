/* Contoh plugin yang lebih lengkap: izin, cooldown, simpan data, media.
 * SALIN ke plugins/<kategori>/ untuk mengaktifkan (folder examples/ tidak dimuat). */

import fs from 'node:fs'
import path from 'node:path'
import { downloadMediaMessage } from '../lib/baileys.js'

const BERKAS = path.join(process.cwd(), 'data', 'contoh-poin.json')
const cooldown = new Map()

const baca = () => {
  try { return JSON.parse(fs.readFileSync(BERKAS, 'utf8')) } catch { return {} }
}
const tulis = (data) => {
  fs.mkdirSync(path.dirname(BERKAS), { recursive: true })
  fs.writeFileSync(BERKAS, JSON.stringify(data, null, 2), { mode: 0o600 })
}

export default async function handler(m, { conn, usedPrefix, command }) {
  /* 1. Batasi pemakaian (cooldown sederhana, per pengguna). */
  const terakhir = cooldown.get(m.sender) || 0
  const sisa = 5000 - (Date.now() - terakhir)
  if (sisa > 0) throw `Tunggu ${Math.ceil(sisa / 1000)} detik lagi.`
  cooldown.set(m.sender, Date.now())

  /* 2. Sub-perintah: `.contoh poin` / `.contoh tambah 5` / `.contoh gambar`. */
  const aksi = (m.args[0] || '').toLowerCase()

  if (aksi === 'poin') {
    const data = baca()
    return m.reply(`Poinmu: *${data[m.sender] || 0}*`)
  }

  if (aksi === 'tambah') {
    const nilai = Number(m.args[1])
    if (!Number.isFinite(nilai) || nilai < 1 || nilai > 100) throw `Contoh: ${usedPrefix}${command} tambah 5 (1–100)`
    const data = baca()
    data[m.sender] = (data[m.sender] || 0) + Math.trunc(nilai)
    tulis(data)
    return m.reply(`✅ +${Math.trunc(nilai)} poin. Total: *${data[m.sender]}*`)
  }

  if (aksi === 'gambar') {
    if (!m.quoted || !m.quoted.imageMessage) throw 'Reply sebuah gambar.'
    const buf = await downloadMediaMessage(
      m.quoted, 'buffer', {},
      { logger: console, reuploadRequest: conn.updateMediaMessage }
    )
    return m.reply(`🖼️ Gambar diterima: *${(buf.length / 1024).toFixed(1)} KB*`)
  }

  throw [
    '*CONTOH PLUGIN*',
    `${usedPrefix}${command} poin          → lihat poin`,
    `${usedPrefix}${command} tambah 5      → tambah poin`,
    `${usedPrefix}${command} gambar        → reply gambar untuk diukur`,
  ].join('\n')
}

handler.help = ['contoh poin', 'contoh tambah <n>', 'contoh gambar']
handler.tags = ['contoh']
handler.description = 'Contoh plugin lengkap: cooldown, data, media'
handler.command = /^(contoh)$/i
handler.cooldown = 5
handler.limit = false

/* By AlzRiss — Usanagi Umi AI
 *
 * lib/plugin-loader.js — memuat semua plugin dari folder `plugins/`.
 *
 * Aturan folder:
 *   plugins/                 ← rekursif, subfolder = kategori
 *     main/halo.js
 *     game/tebak.js
 *   • berkas harus `.js` dan TIDAK diawali titik
 *   • `node_modules/` di dalam plugins/ dilewati
 *   • satu plugin gagal dimuat TIDAK menghentikan plugin lain (dilaporkan)
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { periksaPlugin, daftarPerintah } from './plugin.js'

function daftarBerkas(akar) {
  const hasil = []
  const jelajah = (dir) => {
    let entri = []
    try {
      entri = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entri) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const penuh = path.join(dir, e.name)
      if (e.isDirectory()) jelajah(penuh)
      else if (e.isFile() && /\.js$/i.test(e.name)) hasil.push(penuh)
    }
  }
  jelajah(akar)
  return hasil
}

/**
 * Muat semua plugin.
 * @param {string} folder folder `plugins/`
 * @returns {Array<Function & {berkas:string, perintah:string[]}>}
 */
export async function muatPlugin(folder) {
  if (!fs.existsSync(folder)) return []
  const berkas = daftarBerkas(folder)
  /* BUG yang pernah ada: impor dijalankan fire-and-forget sehingga muatPlugin()
   * mengembalikan array KOSONG sementara plugin baru masuk belakangan — menu dan
   * pencarian perintah tidak menemukan apa pun. Sekarang ditunggu (Promise.all). */
  const hasil = await Promise.all(
    berkas.map(async (jalur) => {
      const relatif = path.relative(folder, jalur).replace(/\\/g, '/')
      try {
        const mod = await import(pathToFileURL(jalur).href)
        const plugin = mod.default || mod.handler || mod
        const cek = periksaPlugin(plugin)
        if (!cek.ok) {
          console.warn(`[PLUGIN] dilewati ${relatif}: ${cek.masalah.join('; ')}`)
          return null
        }
        plugin.berkas = relatif
        plugin.perintah = daftarPerintah(plugin)
        return plugin
      } catch (error) {
        console.warn(`[PLUGIN] gagal dimuat ${relatif}: ${error?.message || error}`)
        return null
      }
    })
  )
  return hasil.filter(Boolean)
}

/**
 * Cari plugin untuk sebuah perintah (case-insensitive, cocok persis).
 * @param {Array} plugins hasil `muatPlugin()`
 * @param {string} command perintah tanpa prefix
 */
export function cariPlugin(plugins, command) {
  const cari = String(command || '').toLowerCase()
  if (!cari) return null
  for (const p of plugins) {
    const cmd = p.command
    if (Array.isArray(cmd) && cmd.map((c) => String(c).toLowerCase()).includes(cari)) return p
    if (cmd instanceof RegExp && cmd.test(cari)) return p
  }
  return null
}

/** Ringkasan untuk log/menu: [{ berkas, perintah, tags }] */
export function ringkasPlugin(plugins) {
  return plugins.map((p) => ({ berkas: p.berkas || '', perintah: p.perintah || [], tags: p.tags || [] }))
}

export default { muatPlugin, cariPlugin, ringkasPlugin }

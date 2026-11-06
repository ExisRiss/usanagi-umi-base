/* By AlzRiss — Usanagi Umi AI
 *
 * index.js — titik masuk BASE bot.
 *
 * Sengaja dibuat pendek dan mudah dibaca: yang sulit (opsi socket, sesi,
 * plugin loader) sudah dipisah ke `lib/`. Kalau kamu mengembangkan base ini,
 * tambahkan fitur sebagai PLUGIN (folder `plugins/`), bukan dengan menumpuk
 * kode di sini.
 *
 * Alur:
 *   1. baca konfigurasi (nomor bot, prefix, pemilik)
 *   2. buat sesi (pakai yang tersimpan; kalau belum ada → pairing/QR)
 *   3. sambungkan socket dengan `opsiSocket()` (base yang sama dengan jadibot)
 *   4. muat semua plugin dari `plugins/` (rekursif)
 *   5. teruskan setiap pesan masuk ke handler plugin
 *   6. sambung ulang otomatis dengan backoff bila koneksi putus
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  jidNormalizedUser,
} from './lib/baileys.js'
import { opsiSocket, ringkasOpsi } from './lib/socket-options.js'
import { bacaKonfig } from './lib/config.js'
import { muatPlugin, cariPlugin } from './lib/plugin-loader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const logger = pino({ level: 'silent' })

const konfig = bacaKonfig()
const SESSION_DIR = path.resolve(__dirname, konfig.sessionDir || 'sessions/main')

/* ── util kecil ───────────────────────────────────────────────────────── */

const jeda = (ms) => new Promise((selesai) => setTimeout(selesai, ms))
const tidur = (menit) => Math.min(30, Math.max(1, menit))

/** Ambil `sender` dari berbagai bentuk pesan (grup memakai participant). */
function senderDari(key) {
  return jidNormalizedUser(key.participant || key.remoteJid || '')
}

/** Teks pesan dari semua bentuk yang umum (conversation, extended, caption). */
function teksPesan(pesan) {
  if (!pesan) return ''
  return (
    pesan.conversation ||
    pesan.extendedTextMessage?.text ||
    pesan.imageMessage?.caption ||
    pesan.videoMessage?.caption ||
    pesan.documentMessage?.caption ||
    ''
  )
}

/** Objek ringkas yang diterima plugin sebagai `m`. */
function buatPesan(conn, msg) {
  const key = msg.key || {}
  const teks = teksPesan(msg.message)
  const chat = key.remoteJid || ''
  const m = {
    key,
    id: key.id || '',
    chat,
    sender: senderDari(key),
    fromMe: Boolean(key.fromMe),
    isGroup: chat.endsWith('@g.us'),
    text: teks,
    pushName: msg.pushName || '',
    message: msg.message || {},
    reply: (isi, opsi) => conn.sendMessage(chat, { text: String(isi) }, { quoted: msg, ...(opsi || {}) }),
  }
  const ctx = String(m.text || '')
  const prefix = String(konfig.prefix || '.')
  const pakaiPrefix = konfig.wajibPrefix === false ? false : ctx.startsWith(prefix)
  m.prefix = pakaiPrefix ? prefix : ''
  const tanpa = pakaiPrefix ? ctx.slice(prefix.length) : ctx
  const [perintahMentah, ...sisa] = tanpa.trim().split(/\s+/)
  m.command = (perintahMentah || '').toLowerCase()
  m.args = sisa
  m.text = sisa.join(' ')
  m.usedPrefix = m.prefix
  return m
}

/* ── plugin ───────────────────────────────────────────────────────────── */

const plugins = await muatPlugin(path.join(__dirname, 'plugins'))
console.log(`[BASE] ${plugins.length} plugin dimuat dari plugins/`)

async function jalankanPlugin(m, conn) {
  const plugin = cariPlugin(plugins, m.command)
  if (!plugin) return false
  const ctx = {
    conn,
    command: m.command,
    args: m.args,
    text: m.text,
    usedPrefix: m.usedPrefix,
    plugins,
  }
  try {
    await plugin(m, ctx)
  } catch (error) {
    /* Galat plugin TIDAK boleh mematikan bot — cukup dilaporkan ke chat. */
    const pesan = typeof error === 'string' ? error : error?.message || 'Terjadi kesalahan.'
    console.error(`[BASE] plugin ${m.command} gagal:`, pesan)
    if (konfig.tampilkanError !== false) {
      await m.reply(`⚠️ ${pesan}`).catch(() => {})
    }
  }
  return true
}

/* ── sesi & koneksi ───────────────────────────────────────────────────── */

let percobaan = 0

async function mulai() {
  fs.mkdirSync(SESSION_DIR, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const { version } = await fetchLatestBaileysVersion()

  const opsi = opsiSocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    version,
    logger,
    performance: konfig.runtimePerformance || {},
  })
  console.log('[BASE] opsi socket:', JSON.stringify(ringkasOpsi(opsi)))

  const conn = makeWASocket(opsi)
  conn.ev.on('creds.update', saveCreds)

  /* Pairing: hanya kalau sesi belum terdaftar DAN nomor tersedia. */
  if (!state.creds.registered && konfig.nomor) {
    const nomor = String(konfig.nomor).replace(/\D/g, '')
    try {
      const kode = await conn.requestPairingCode(nomor)
      console.log(`\n[BASE] KODE PAIRING: ${kode}`)
      console.log('[BASE] Masukkan di WhatsApp → Perangkat Tertaut → Tautkan dengan nomor telepon.\n')
    } catch (error) {
      console.error('[BASE] gagal minta kode pairing:', error?.message || error)
    }
  }

  conn.ev.on('messages.upsert', async ({ messages = [], type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (!msg.message || msg.key?.fromMe) continue
      const m = buatPesan(conn, msg)
      if (!m.command) continue
      await jalankanPlugin(m, conn)
    }
  })

  conn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'open') {
      percobaan = 0
      console.log(`[BASE] tersambung sebagai ${conn.user?.id || '?'}`)
      global.conn = conn
    }
    if (connection === 'close') {
      const kode = lastDisconnect?.error?.output?.statusCode
      const keluar = kode === DisconnectReason.loggedOut
      if (keluar) {
        console.error('[BASE] sesi ditolak WhatsApp (logged out). Hapus folder sesi lalu pairing ulang.')
        return
      }
      percobaan += 1
      /* Backoff 1.2s → 19.2s (maks 30s). Setelah 5 kali gagal, naik ke 5 menit:
       * mengejar WhatsApp tiap 30 detik justru memicu penolakan berulang. */
      const dasar = 1200 * 2 ** Math.min(percobaan - 1, 4)
      const batas = percobaan >= 5 ? 300000 : 30000
      const tunggu = Math.min(dasar, batas)
      console.log(`[BASE] koneksi putus (kode ${kode || '-'}) — sambung ulang dalam ${Math.round(tunggu / 1000)}s`)
      await jeda(tunggu)
      mulai()
    }
  })

  return conn
}

process.on('unhandledRejection', (error) => {
  console.error('[BASE] unhandledRejection:', error?.message || error)
})
process.on('uncaughtException', (error) => {
  console.error('[BASE] uncaughtException:', error?.message || error)
})

console.log('[BASE] mulai — menunggu koneksi WhatsApp…')
mulai().catch((error) => {
  console.error('[BASE] gagal start:', error?.message || error)
  process.exit(1)
})

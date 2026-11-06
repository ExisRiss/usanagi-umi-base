#!/usr/bin/env node
/* Pairing lewat terminal: `npm run pair 628123456789`
 * Kode 8 digit akan dicetak; masukkan di WhatsApp →
 * Perangkat Tertaut → Tautkan dengan nomor telepon. */

import fs from 'node:fs'
import path from 'node:path'
import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
} from '../lib/baileys.js'
import { opsiSocket } from '../lib/socket-options.js'
import { bacaKonfig } from '../lib/config.js'
import pino from 'pino'

const logger = pino({ level: 'silent' })
const konfig = bacaKonfig()
const nomor = String(process.argv[2] || konfig.nomor || '').replace(/\D/g, '')

if (!nomor) {
  console.error('Cara pakai: npm run pair 628123456789')
  process.exit(1)
}
if (nomor.length < 8 || nomor.length > 15) {
  console.error(`Nomor "${nomor}" tidak valid. Pakai format kode negara tanpa +.`)
  process.exit(1)
}

const sesi = path.resolve(process.cwd(), konfig.sessionDir || 'sessions/main')
if (fs.existsSync(path.join(sesi, 'creds.json'))) {
  console.log(`[PAIR] Sesi sudah ada di ${sesi}. Hapus foldernya dulu kalau ingin pairing ulang.`)
  process.exit(0)
}
fs.mkdirSync(sesi, { recursive: true })

const { state, saveCreds } = await useMultiFileAuthState(sesi)
const { version } = await fetchLatestBaileysVersion()
const sock = makeWASocket(
  opsiSocket({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    version,
    logger,
  })
)
sock.ev.on('creds.update', saveCreds)

let diminta = false
sock.ev.on('connection.update', async (u) => {
  const { connection, lastDisconnect } = u
  if (!diminta && !state.creds.registered) {
    diminta = true
    try {
      const kode = await sock.requestPairingCode(nomor)
      console.log(`\n[PAIR] KODE: ${kode}`)
      console.log('[PAIR] WhatsApp → Perangkat Tertaut → Tautkan dengan nomor telepon.\n')
    } catch (error) {
      console.error('[PAIR] gagal minta kode:', error?.message || error)
      process.exit(1)
    }
  }
  if (connection === 'open') {
    console.log('[PAIR] berhasil tersambung. Sesi tersimpan:', sesi)
    setTimeout(() => process.exit(0), 1500)
  }
  if (connection === 'close') {
    const kode = lastDisconnect?.error?.output?.statusCode
    if (kode === DisconnectReason.loggedOut) {
      console.error('[PAIR] ditolak WhatsApp (logged out).')
      process.exit(1)
    }
  }
})

/* Batas waktu: kode pairing kedaluwarsa ±3 menit. */
setTimeout(() => {
  console.error('[PAIR] tidak ada jawaban dalam 3 menit. Jalankan ulang perintahnya.')
  process.exit(1)
}, 180000)

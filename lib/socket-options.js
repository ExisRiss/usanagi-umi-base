/* By AlzRiss - Usanagi Umi AI
 *
 * Task214 — SATU BASE OPSI SOCKET untuk bot utama, jadibot, dan mode single.
 *
 * Kenapa perlu: sebelumnya ada EMPAT tempat yang menyusun opsi `makeWASocket`
 * sendiri-sendiri (main.js, lib/jadibot.js, core/awang-koneksi.js,
 * scripts/pair.js) dengan nilai berbeda-beda:
 *
 *   ┌──────────────────────────┬───────────┬───────────┬──────────────┐
 *   │ opsi                     │ bot utama │ jadibot   │ pair (single)│
 *   ├──────────────────────────┼───────────┼───────────┼──────────────┤
 *   │ connectTimeoutMs         │ 45 000    │ 60 000    │ bawaan       │
 *   │ keepAliveIntervalMs      │ 15 000    │ 30 000    │ bawaan       │
 *   │ defaultQueryTimeoutMs    │ 60 000    │ 0 (∞)     │ bawaan       │
 *   │ maxMsgRetryCount         │ 10        │ 5         │ bawaan       │
 *   │ browser                  │ Chrome    │ Edge      │ Chrome       │
 *   │ retryRequestDelayMs      │ 100       │ 250       │ bawaan       │
 *   └──────────────────────────┴───────────┴───────────┴──────────────┘
 *
 * Beda-beda ini bikin perilaku "kadang nyambung, kadang tidak" dan menyulitkan
 * diagnosis disconnect (K1): bot utama dan jadibot bisa bereaksi berbeda pada
 * kondisi jaringan yang sama. Sekarang semua jalur memakai `opsiSocket()`.
 *
 * `defaultQueryTimeoutMs: 0` (tanpa batas) dari jalur jadibot SENGAJA tidak
 * diadopsi: query tanpa batas membuat socket menggantung saat server WA lambat
 * dan baru terlihat sebagai "macet" berjam-jam kemudian.
 */

import { Browsers } from '@whiskeysockets/baileys'

/* Nilai dasar yang dipakai semua jalur. Bisa ditimpa per-bot lewat
 * `runtimePerformance` (config/users.json atau konfigurasi jadibot). */
export const OPSI_DASAR = Object.freeze({
  browser: Browsers.ubuntu('Chrome'),
  printQRInTerminal: false,
  syncFullHistory: false,
  shouldSyncHistoryMessage: () => false,
  markOnlineOnConnect: true,
  generateHighQualityLinkPreview: true,
  connectTimeoutMs: 45000,
  keepAliveIntervalMs: 15000,
  retryRequestDelayMs: 100,
  maxMsgRetryCount: 10,
  defaultQueryTimeoutMs: 60000,
})

const angka = (nilai, cadangan) => {
  const n = Number(nilai)
  return Number.isFinite(n) && n > 0 ? n : cadangan
}

/**
 * Bangun opsi socket yang seragam.
 *
 * @param {object} opsi
 * @param {object} opsi.auth       { creds, keys } — wajib
 * @param {any}    opsi.logger     instance pino (default: dibuat di pemanggil)
 * @param {number[]} opsi.version  versi WhatsApp Web dari fetchLatestBaileysVersion()
 * @param {object} opsi.performance  { connectTimeoutMs, keepAliveIntervalMs,
 *                                     retryRequestDelayMs, maxMessageRetries }
 * @param {string} opsi.browser    label browser, mis. 'Hai Umi' (opsional)
 * @param {object} opsi.tambahan   opsi tambahan yang digabung terakhir
 * @returns {object} siap dipakai `makeWASocket(...)`
 */
export function opsiSocket({ auth, logger, version, performance = {}, browser, tambahan = {} } = {}) {
  if (!auth) throw new Error('opsiSocket: `auth` wajib diisi')
  const opsi = {
    ...OPSI_DASAR,
    auth,
    version,
    logger,
    connectTimeoutMs: angka(performance.connectTimeoutMs, OPSI_DASAR.connectTimeoutMs),
    keepAliveIntervalMs: angka(performance.keepAliveIntervalMs, OPSI_DASAR.keepAliveIntervalMs),
    retryRequestDelayMs: angka(performance.retryRequestDelayMs, OPSI_DASAR.retryRequestDelayMs),
    maxMsgRetryCount: angka(performance.maxMessageRetries, OPSI_DASAR.maxMsgRetryCount),
    defaultQueryTimeoutMs: angka(performance.defaultQueryTimeoutMs, OPSI_DASAR.defaultQueryTimeoutMs),
  }
  if (browser) opsi.browser = Browsers.ubuntu(String(browser))
  return { ...opsi, ...tambahan }
}

/** Ringkasan untuk log/health: nilai efektif yang benar-benar dipakai. */
export function ringkasOpsi(opsi = {}) {
  return {
    connectTimeoutMs: opsi.connectTimeoutMs,
    keepAliveIntervalMs: opsi.keepAliveIntervalMs,
    retryRequestDelayMs: opsi.retryRequestDelayMs,
    maxMsgRetryCount: opsi.maxMsgRetryCount,
    defaultQueryTimeoutMs: opsi.defaultQueryTimeoutMs,
    syncFullHistory: Boolean(opsi.syncFullHistory),
    markOnlineOnConnect: Boolean(opsi.markOnlineOnConnect),
    generateHighQualityLinkPreview: Boolean(opsi.generateHighQualityLinkPreview),
  }
}

export default { opsiSocket, ringkasOpsi, OPSI_DASAR }

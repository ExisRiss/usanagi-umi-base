/* By AlzRiss - Usanagi Umi AI
 *
 * RichMessageAdapter — SATU lapisan untuk semua pengiriman "kaya" ke WhatsApp.
 *
 * Kenapa ada berkas ini
 * ---------------------
 * Sebelumnya setiap plugin membuat payload sendiri: ada yang memakai
 * `relayMessage` + `richResponseMessage` (lib/awang-table.js,
 * lib/usanagi-ai-rich.js, plugins/game-html/picopark.js), ada yang memakai
 * `conn.sendSticker`, ada yang hanya teks. Kalau library koneksi berganti
 * (Baileys 6.7.x ↔ 7.0.x, atau fork lain), semua plugin harus diubah.
 *
 * Dengan adapter ini:
 *   - plugin TIDAK menyentuh `relayMessage`/payload protobuf secara langsung;
 *   - setiap jenis pesan punya rantai fallback (rich → sederhana → teks),
 *     sehingga fitur tetap jalan walau klien/akun tidak mendukung rich message;
 *   - semua kegagalan dikembalikan sebagai nilai `{ ok:false, error }`, tidak
 *     pernah melempar error ke handler (satu pesan gagal tidak boleh membuat
 *     satu perintah gagal total).
 *
 * Yang dipakai di sini SUDAH terbukti di repo ini:
 *   - richResponseMessage (teks, tabel)   → lib/awang-table.js
 *   - unifiedResponse + HTML primitive    → plugins/game-html/picopark.js
 *   - media biasa (image/video/sticker)   → plugins/maker/*, plugins/music/*
 *
 * Format tombol/list/carousel memakai proto standar `interactiveMessage`.
 * WhatsApp membatasi tombol untuk akun non-bisnis, jadi tombol SELALU punya
 * fallback teks bernomor dan tidak diaktifkan secara default. Nyalakan dengan
 * `global.richFeatures.buttons = true` setelah diuji di nomor sendiri.
 */

import { createRequire } from 'module'
import { botJidAktif } from './bot-jid.js'

/* Daftar dicoba berurutan. Nama paket aktif = @whiskeysockets/baileys
 * (fork sairidev/baileys-new); sisanya cadangan bila suatu saat diganti lagi. */
const PKG_NAMES = ['@whiskeysockets/baileys', '@whiskeysockets/baileys', '@yudzxml/baileys']

let cachedProto = null
let cachedProtoSource = ''

/**
 * Ambil objek `proto` dari library koneksi yang benar-benar terpasang.
 * Tidak mengambil alih koneksi, hanya membaca skema protobuf untuk membangun
 * payload yang valid. Kalau tidak ada, adapter tetap jalan lewat jalur teks.
 */
export function loadProto() {
  if (cachedProto) return cachedProto
  for (const name of PKG_NAMES) {
    try {
      const mod = createRequire(import.meta.url)(name)
      const proto = mod.proto || mod.default?.proto
      if (proto?.Message) {
        cachedProto = proto
        cachedProtoSource = name
        return proto
      }
    } catch { /* paket tidak terpasang, coba berikutnya */ }
  }
  return null
}

export function protoSource() {
  loadProto()
  return cachedProtoSource
}

const DEFAULT_HTML_BUDGET = 900 * 1024

function limitText(value, max) {
  const text = String(value == null ? '' : value)
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

function makeId(prefix) {
  const stamp = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${prefix}${stamp}${rand}`
}

function richContext(quoted) {
  const contextInfo = {
    forwardingScore: 1,
    isForwarded: true,
    forwardedAiBotMessageInfo: { botJid: botJidAktif(conn) },
    forwardOrigin: 4,
  }
  const key = quoted?.key || quoted
  if (key?.id && key?.remoteJid) {
    contextInfo.stanzaId = key.id
    contextInfo.participant = key.participant || key.remoteJid
    contextInfo.quotedMessage = quoted.message || quoted
  }
  return contextInfo
}

/**
 * Deteksi kemampuan koneksi. Dicek dari method yang ada, bukan dari asumsi
 * versi library — sehingga adapter tetap benar untuk 6.7.x maupun 7.x.
 */
export function detectCapabilities(conn) {
  const has = name => typeof conn?.[name] === 'function'
  const flags = global.richFeatures || {}
  return {
    relay: has('relayMessage'),
    media: has('sendMessage'),
    sticker: has('sendSticker'),
    edit: has('sendMessage'),
    richText: has('relayMessage'),
    htmlApp: has('sendHtmlApp') || has('relayMessage'),
    buttons: flags.buttons === true && has('sendMessage'),
    carousel: flags.carousel === true && has('sendMessage'),
    proto: Boolean(loadProto()),
  }
}

/* ============================================================
 * PESAN DASAR
 * ============================================================ */

export class RichMessageAdapter {
  constructor(conn, options = {}) {
    this.conn = conn
    this.prefix = options.prefix || '.'
    this.log = options.logger || console
    this.caps = detectCapabilities(conn)
    this.htmlBudget = Number(options.htmlBudget) || DEFAULT_HTML_BUDGET
  }

  /** Kirim teks biasa. Jaring terakhir semua metode lain. */
  async sendText(jid, text, options = {}) {
    const payload = { text: String(text == null ? '' : text) }
    try {
      if (options.editKey && this.caps.edit) {
        await this.conn.sendMessage(jid, { ...payload, edit: options.editKey })
        return { ok: true, mode: 'edit' }
      }
      await this.conn.sendMessage(jid, payload, options.quoted ? { quoted: options.quoted } : undefined)
      return { ok: true, mode: 'text' }
    } catch (error) {
      this.log?.error?.('[RICH] sendText gagal:', error?.message || error)
      return { ok: false, mode: 'text', error: String(error?.message || error) }
    }
  }

  /**
   * Kirim media. `source` boleh Buffer, URL, atau { url }.
   * kind: 'image' | 'video' | 'audio' | 'document' | 'sticker'
   */
  async sendMedia(jid, media = {}, options = {}) {
    const kind = media.kind || 'image'
    const caption = limitText(media.caption ?? '', 1024)
    if (!media.source) {
      return this.sendText(jid, caption || 'Media tidak tersedia.', options)
    }
    const base = kind === 'sticker'
      ? { sticker: media.source }
      : { [kind]: media.source, ...(caption ? { caption } : {}) }
    const payload = {
      ...base,
      ...(media.mimetype ? { mimetype: media.mimetype } : {}),
      ...(media.gifPlayback ? { gifPlayback: true } : {}),
      ...(media.fileName ? { fileName: media.fileName } : {}),
    }
    try {
      if (kind === 'sticker' && this.caps.sticker) {
        await this.conn.sendSticker(jid, media.source, options.quoted || null, {
          packname: media.packname || global.stickpack || global.namebot || 'Usanagi Umi AI',
          packpublish: media.packpublish || global.stickauth || global.author || 'By AlzRiss',
        })
        return { ok: true, mode: 'sticker' }
      }
      await this.conn.sendMessage(jid, payload, options.quoted ? { quoted: options.quoted } : undefined)
      return { ok: true, mode: kind }
    } catch (error) {
      this.log?.error?.('[RICH] sendMedia gagal:', error?.message || error)
      // Media gagal dikirim (mis. ukuran terlalu besar) → minimal teksnya sampai.
      if (caption) return this.sendText(jid, `${caption}\n\n(Media gagal dikirim.)`, options)
      return { ok: false, mode: kind, error: String(error?.message || error) }
    }
  }

  /* ============================================================
   * RICH RESPONSE (teks/tabel) — jalur yang sudah terbukti
   * ============================================================ */

  /** Bangun payload `richResponseMessage` (belum dikirim). */
  buildRichMessages({ title, sections = [], contextInfo }) {
    const submessages = []
    if (title) submessages.push({ messageType: 2, messageText: limitText(title, 300) })
    for (const section of sections) {
      if (section.type === 'text') submessages.push({ messageType: 2, messageText: limitText(section.text, 8000) })
      if (section.type === 'table') {
        submessages.push({
          messageType: 4,
          tableMetadata: {
            title: limitText(section.title || '', 200),
            rows: [
              { items: (section.headers || []).map(v => String(v ?? '')), isHeading: true },
              ...(section.rows || []).map(row => ({
                items: (Array.isArray(row) ? row : [row]).map(v => String(v ?? '')),
              })),
            ],
          },
        })
      }
    }
    if (!submessages.length) throw new Error('Rich response tanpa isi')
    return {
      message: {
        botForwardedMessage: {
          message: {
            richResponseMessage: {
              messageType: 1,
              submessages,
              contextInfo: contextInfo || richContext(null),
            },
          },
        },
      },
      messageId: makeId('UMIRICH'),
    }
  }

  async sendRich(jid, content, options = {}) {
    const fallbackText = options.fallbackText || plainFromSections(content)
    try {
      const { message, messageId } = this.buildRichMessages({
        title: content.title,
        sections: content.sections,
        contextInfo: richContext(options.quoted),
      })
      const proto = loadProto()
      if (proto) {
        // Encode + decode dulu: payload rusak ditolak di sini, bukan di server.
        const encoded = proto.Message.encode(proto.Message.fromObject(message)).finish()
        if (!encoded.length) throw new Error('payload kosong setelah encode')
      }
      if (!this.caps.relay) throw new Error('relayMessage tidak tersedia')
      await this.conn.relayMessage(jid, message, { messageId })
      return { ok: true, mode: 'rich', messageId }
    } catch (error) {
      this.log?.error?.('[RICH] sendRich gagal, fallback teks:', error?.message || error)
      const result = await this.sendText(jid, fallbackText, options)
      return { ...result, fallbackUsed: true, originalError: String(error?.message || error) }
    }
  }

  /** Tabel native (dipakai ringkasan pertandingan, daftar pemain, dsb). */
  async sendTable(jid, table = {}, options = {}) {
    const rows = table.rows || []
    const fallback = [
      table.title || '',
      ...(table.headers ? [table.headers.join(' | ')] : []),
      ...rows.map(r => (Array.isArray(r) ? r : [r]).join(' | ')),
    ].filter(Boolean).join('\n')
    return this.sendRich(jid, {
      title: table.title,
      sections: [{ type: 'table', title: table.title, headers: table.headers, rows }],
    }, { ...options, fallbackText: options.fallbackText || fallback })
  }

  /* ============================================================
   * HTML / MINI APP — kartu game interaktif
   * ============================================================ */

  /** Bangun payload HTML primitive (bentuk yang dipakai picopark). */
  buildHtmlPayload(html, options = {}) {
    const value = String(html || '')
    if (!value.trim()) throw new Error('HTML kosong')
    const bytes = Buffer.byteLength(value, 'utf8')
    if (bytes > this.htmlBudget) {
      throw new Error(`HTML ${Math.round(bytes / 1024)}KB melebihi batas ${Math.round(this.htmlBudget / 1024)}KB`)
    }
    const responseId = options.responseId || makeId('umi-html-')
    return {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2, botMetadata: {} },
        botForwardedMessage: {
          message: {
            richResponseMessage: {
              messageType: 1,
              submessages: options.title
                ? [{ messageType: 2, messageText: limitText(options.title, 300) }]
                : [],
              unifiedResponse: {
                data: Buffer.from(JSON.stringify({
                  response_id: responseId,
                  sections: [{
                    view_model: {
                      primitive: {
                        __typename: 'GenAIaeacdsnwHtmlPrimitive',
                        payload: value,
                        trusted_sources: options.trustedSources || [],
                      },
                      __typename: 'GenAISingleLayoutViewModel',
                    },
                  }],
                }), 'utf8').toString('base64'),
              },
              contextInfo: richContext(options.quoted),
            },
          },
        },
      },
      messageId: makeId('UMIHTML'),
    }
  }

  /**
   * Kirim Mini App HTML. Urutan percobaan:
   *   sendHtmlApp (bila ada) → relayMessage unifiedResponse → teks ringkas.
   */
  async sendHtmlApp(jid, html, options = {}) {
    const fallbackText = options.fallbackText || options.title || 'Kartu interaktif tidak dapat ditampilkan. Ketik perintah untuk melanjutkan.'
    try {
      const { message, messageId } = this.buildHtmlPayload(html, options)
      const proto = loadProto()
      if (proto) {
        const encoded = proto.Message.encode(proto.Message.fromObject(message)).finish()
        if (!encoded.length) throw new Error('payload kosong setelah encode')
      }
      if (typeof this.conn?.sendHtmlApp === 'function') {
        try {
          await this.conn.sendHtmlApp(jid, html)
          return { ok: true, mode: 'sendHtmlApp' }
        } catch (error) {
          this.log?.error?.('[RICH] sendHtmlApp gagal, coba relay:', error?.message || error)
        }
      }
      if (!this.caps.relay) throw new Error('relayMessage tidak tersedia')
      await this.conn.relayMessage(jid, message, { messageId })
      return { ok: true, mode: 'relay-html', messageId }
    } catch (error) {
      this.log?.error?.('[RICH] sendHtmlApp gagal, fallback teks:', error?.message || error)
      const result = await this.sendText(jid, fallbackText, options)
      return { ...result, fallbackUsed: true, originalError: String(error?.message || error) }
    }
  }

  /* ============================================================
   * TOMBOL / LIST / CAROUSEL (proto standar, default nonaktif)
   * ============================================================ */

  /** Teks bernomor sebagai fallback tombol. */
  buttonFallbackText(text, buttons) {
    const lines = [limitText(text, 3000)]
    buttons.slice(0, 10).forEach((button, index) => {
      const label = typeof button === 'string' ? button : (button.text || button.label || `Pilihan ${index + 1}`)
      lines.push(`${index + 1}. ${label}`)
    })
    lines.push('', `Balas nomornya, atau ketik perintahnya langsung.`)
    return lines.join('\n')
  }

  async sendButtons(jid, { text, buttons = [], footer = '' }, options = {}) {
    const list = (buttons || []).slice(0, 10)
    const fallback = this.buttonFallbackText(text, list)
    if (!list.length) return this.sendText(jid, text, options)
    if (!this.caps.buttons) {
      // Tombol tidak diaktifkan/diuji → langsung teks bernomor, bukan gagal.
      const result = await this.sendText(jid, fallback, options)
      return { ...result, fallbackUsed: true, reason: 'buttons-disabled' }
    }
    try {
      await this.conn.sendMessage(jid, {
        text: limitText(text, 1024),
        footer: limitText(footer, 60),
        buttons: list.map((button, index) => ({
          buttonId: String(button.id || `btn_${index + 1}`),
          buttonText: { displayText: limitText(button.text || button.label || `Pilihan ${index + 1}`, 20) },
          type: 1,
        })),
        headerType: 1,
      }, options.quoted ? { quoted: options.quoted } : undefined)
      return { ok: true, mode: 'buttons' }
    } catch (error) {
      this.log?.error?.('[RICH] sendButtons gagal, fallback teks:', error?.message || error)
      const result = await this.sendText(jid, fallback, options)
      return { ...result, fallbackUsed: true, originalError: String(error?.message || error) }
    }
  }

  /** Carousel kartu (maks 10). Fallback: kirim kartu satu per satu, lalu teks. */
  async sendCarousel(jid, { text, cards = [] }, options = {}) {
    const list = (cards || []).slice(0, 10)
    if (!list.length) return this.sendText(jid, text || 'Tidak ada kartu.', options)

    if (this.caps.carousel) {
      try {
        await this.conn.sendMessage(jid, {
          text: limitText(text || '', 1024),
          footer: '',
          cards: list.map((card, index) => ({
            title: limitText(card.title || `Kartu ${index + 1}`, 60),
            body: limitText(card.body || '', 1024),
            ...(card.image ? { image: card.image } : {}),
            buttons: (card.buttons || []).slice(0, 3).map((button, bi) => ({
              buttonId: String(button.id || `c${index}b${bi + 1}`),
              buttonText: { displayText: limitText(button.text || 'Buka', 20) },
              type: 1,
            })),
          })),
          headerType: 1,
        }, options.quoted ? { quoted: options.quoted } : undefined)
        return { ok: true, mode: 'carousel' }
      } catch (error) {
        this.log?.error?.('[RICH] sendCarousel gagal, fallback kartu:', error?.message || error)
      }
    }

    // Fallback 1: kirim maksimal 3 kartu sebagai pesan terpisah.
    const results = []
    for (const card of list.slice(0, 3)) {
      const body = [card.title, card.body].filter(Boolean).join('\n')
      results.push(card.image
        ? await this.sendMedia(jid, { kind: 'image', source: card.image, caption: body }, options)
        : await this.sendText(jid, body, options))
    }
    return { ok: results.every(r => r.ok), mode: 'cards', fallbackUsed: true, results }
  }

  /* ============================================================
   * GAME HELPERS (WA hanya antarmuka; backend tetap sumber kebenaran)
   * ============================================================ */

  /** Kartu status game untuk satu pemain. */
  async sendGameCard(jid, state = {}, options = {}) {
    const title = state.title || 'Game'
    if (state.html) {
      return this.sendHtmlApp(jid, state.html, {
        ...options,
        title: state.header || title,
        fallbackText: state.fallbackText || plainGameState(state),
      })
    }
    if (Array.isArray(state.table?.rows) && state.table.rows.length) {
      return this.sendTable(jid, { title, ...state.table }, { ...options, fallbackText: plainGameState(state) })
    }
    return this.sendText(jid, state.text || plainGameState(state), options)
  }

  /** Undangan bermain (room code + tautan website sebagai fallback). */
  async sendGameInvite(jid, invite = {}, options = {}) {
    const code = String(invite.roomCode || invite.code || '----')
    const lines = [
      `🎮 *${invite.gameTitle || 'Game'}*`,
      '',
      invite.host ? `Tuan rumah: ${invite.host}` : '',
      `Kode room: *${code}*`,
      invite.players ? `Pemain: ${invite.players}` : '',
      '',
      invite.joinCommand ? `Masuk: ${invite.joinCommand}` : `Ketik: ${this.prefix}join ${code}`,
      invite.link ? `Atau lewat website: ${invite.link}` : '',
    ].filter(line => line !== '')
    return this.sendButtons(jid, {
      text: lines.join('\n'),
      buttons: [
        { id: `join:${code}`, text: 'Gabung' },
        { id: `status:${code}`, text: 'Status' },
      ],
    }, options)
  }

  /** Ringkasan pertandingan (tabel + teks). */
  async sendMatchSummary(jid, summary = {}, options = {}) {
    const rows = (summary.players || []).map((player, index) => [
      String(index + 1),
      String(player.name || player.jid || '-'),
      String(player.score == null ? '-' : player.score),
    ])
    const text = [
      `🏁 *${summary.gameTitle || 'Pertandingan'} selesai*`,
      summary.winner ? `Pemenang: ${summary.winner}` : '',
      summary.detail || '',
    ].filter(Boolean).join('\n')
    if (!rows.length) return this.sendText(jid, text, options)
    const result = await this.sendTable(jid, {
      title: summary.gameTitle || 'Hasil',
      headers: ['#', 'Pemain', 'Skor'],
      rows,
    }, { ...options, fallbackText: text + '\n\n' + rows.map(r => r.join(' | ')).join('\n') })
    if (result.ok && !result.fallbackUsed) {
      // Tabel native tidak memuat kalimat pemenang → kirim sebagai teks pendek.
      await this.sendText(jid, text, options)
    }
    return result
  }

  /**
   * Normalisasi respons masuk (tombol/list/carousel/teks) menjadi aksi.
   * Isi pesan WhatsApp TIDAK dipercaya: hasilnya hanya `{ action, id, value }`
   * dan wajib divalidasi ulang oleh backend game (gameId/playerId dicek di
   * server, bukan dari pesan).
   */
  static normalizeResponse(message) {
    if (!message) return null
    const pick = node => ({
      action: 'button',
      id: String(node?.selectedButtonId || node?.buttonId || node?.id || ''),
      value: node?.selectedRowId ? String(node.selectedRowId) : '',
      raw: node,
    })
    const single = message.buttonsResponseMessage || message.templateButtonReplyMessage
    if (single) {
      return {
        action: single.selectedButtonId ? 'button' : 'template',
        id: String(single.selectedButtonId || single.selectedId || ''),
        value: String(single.selectedDisplayText || ''),
        raw: single,
      }
    }
    if (message.listResponseMessage) {
      const row = message.listResponseMessage.singleSelectReply || {}
      return { action: 'list', id: String(row.selectedRowId || ''), value: String(message.listResponseMessage.title || ''), raw: message.listResponseMessage }
    }
    if (message.interactiveResponseMessage) {
      const body = message.interactiveResponseMessage.nativeFlowResponseMessage
      let params = {}
      try { params = JSON.parse(body?.paramsJson || '{}') } catch { params = { raw: body?.paramsJson } }
      return {
        action: 'interactive',
        id: String(body?.name || ''),
        value: String(params.id || params.command || ''),
        params,
        raw: message.interactiveResponseMessage,
      }
    }
    const text = message.conversation || message.extendedTextMessage?.text
    if (text) return { action: 'text', id: '', value: String(text), raw: message }
    return null
  }
}

/* ============================================================
 * HELPER TEKS (fallback yang enak dibaca)
 * ============================================================ */

export function plainFromSections(content = {}) {
  const parts = []
  if (content.title) parts.push(String(content.title))
  for (const section of content.sections || []) {
    if (section.type === 'text') parts.push(String(section.text || ''))
    if (section.type === 'table') {
      if (section.title) parts.push(String(section.title))
      if (section.headers) parts.push(section.headers.join(' | '))
      for (const row of section.rows || []) parts.push((Array.isArray(row) ? row : [row]).join(' | '))
    }
  }
  return parts.filter(Boolean).join('\n')
}

export function plainGameState(state = {}) {
  const parts = []
  if (state.title) parts.push(`🎮 ${state.title}`)
  if (state.text) parts.push(String(state.text))
  for (const player of state.players || []) {
    parts.push(`${player.name || player.id || 'Pemain'}: ${player.status || player.score || '-'}`)
  }
  if (state.hint) parts.push(String(state.hint))
  return parts.filter(Boolean).join('\n') || 'Status game tidak tersedia.'
}

/** Pintasan: adapter untuk satu koneksi, di-cache per objek koneksi. */
const adapters = new WeakMap()
export function richFor(conn, options = {}) {
  if (!conn || typeof conn !== 'object') return new RichMessageAdapter(conn, options)
  let adapter = adapters.get(conn)
  if (!adapter) {
    adapter = new RichMessageAdapter(conn, options)
    adapters.set(conn, adapter)
  } else if (options.prefix) {
    adapter.prefix = options.prefix
  }
  return adapter
}

export default RichMessageAdapter

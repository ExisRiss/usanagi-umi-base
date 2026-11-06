/* By AlzRiss - Usanagi Umi AI
 *
 * Task213 — server MEJA GAME MULTIPLAYER di server bot sendiri.
 *
 * Kenapa: `game.gwenna.my.id` (origin 165.232.107.82) MATI (Cloudflare 522),
 * jadi 7 meja web (UNO, UNO Flip, Catur, Ular Tangga, Monopoli, Property
 * Empire, Werewolf) tidak bisa dipakai — API `/api/rooms/*` tidak ada di mana
 * pun. Situsnya sendiri (folder `situs/game3d`) sekarang dilayani server bot,
 * jadi API-nya juga harus dilayani di sini.
 *
 * API yang disediakan (sama dengan yang dipakai plugins/game/game-webmultiplayer.js):
 *   GET  /api/health                     → status server meja
 *   GET  /api/rooms                      → daftar meja publik
 *   POST /api/rooms/create  { game }     → { roomId, token (host), view }
 *   POST /api/rooms/{id}/join { name }   → { token (seat), view }
 *   POST /api/rooms/{id}/start { token } → mulai (hanya host)
 *   GET  /api/rooms/{id}/state           → { view }
 *   POST /api/rooms/{id}/action { token, action, ... } → aksi pemain
 *
 * Catatan:
 *   • State disimpan di memori + `data/webgame-rooms.json` (tahan restart),
 *     meja kedaluwarsa otomatis setelah 6 jam tanpa aktivitas.
 *   • Tanpa dependensi baru; memakai `node:http` handler dari API platform.
 *   • Token meja acak 24 byte (hex), bukan nomor sesi — tidak bocor identitas.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { aksiGame, daftarMesin, mulaiGame, papanGame, punyaMesin } from './webgame-rules.js'

const BERKAS = path.join(process.cwd(), 'data', 'webgame-rooms.json')
const KEDALUWARSA_MS = 6 * 60 * 60 * 1000
const MAKS_MEJA = 200

const GAME = {
  uno: { label: 'UNO', min: 2, max: 8, emoji: '🃏' },
  unoflip: { label: 'UNO Flip', min: 2, max: 8, emoji: '🔄' },
  chess: { label: 'Catur', min: 2, max: 2, emoji: '♟️' },
  snakes: { label: 'Ular Tangga', min: 2, max: 4, emoji: '🎲' },
  monopoly: { label: 'Monopoli', min: 2, max: 6, emoji: '🏙️' },
  empire: { label: 'Property Empire', min: 2, max: 6, emoji: '🎩' },
  werewolf: { label: 'Werewolf', min: 4, max: 12, emoji: '🐺' },
}

let meja = {}
let siapMuat = false

function muat() {
  if (siapMuat) return
  siapMuat = true
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS, 'utf8'))
    if (isi && typeof isi === 'object') meja = isi
  } catch { meja = {} }
  bersihkan()
}

function simpan() {
  try {
    fs.mkdirSync(path.dirname(BERKAS), { recursive: true })
    fs.writeFileSync(BERKAS, JSON.stringify(meja), { mode: 0o600 })
  } catch { /* tidak boleh menggagalkan permainan */ }
}

function bersihkan() {
  const sekarang = Date.now()
  let hapus = 0
  for (const [id, m] of Object.entries(meja)) {
    if (!m || !m.dibuat || sekarang - Number(m.terakhir || m.dibuat) > KEDALUWARSA_MS) {
      delete meja[id]
      hapus += 1
    }
  }
  const kunci = Object.keys(meja)
  if (kunci.length > MAKS_MEJA) {
    kunci.sort((a, b) => Number(meja[a].terakhir || 0) - Number(meja[b].terakhir || 0))
    for (const id of kunci.slice(0, kunci.length - MAKS_MEJA)) delete meja[id]
    hapus += kunci.length - MAKS_MEJA
  }
  if (hapus) simpan()
}

const token = () => crypto.randomBytes(24).toString('hex')
const idMeja = () => crypto.randomBytes(4).toString('hex').toUpperCase()

function kodeNama(nama, maks = 24) {
  return String(nama || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, maks)
}

/** Bentuk data yang dikirim ke klien (tanpa token pemain lain). */
function tampilan(m, pemain) {
  return {
    roomId: m.id,
    game: m.game,
    label: (GAME[m.game] || {}).label || m.game,
    host: m.pemain.find((p) => p.host)?.nama || 'host',
    phase: m.phase,
    seats: m.pemain.map((p, i) => ({ seat: i, name: p.nama, host: Boolean(p.host) })),
    min: (GAME[m.game] || {}).min || 2,
    max: (GAME[m.game] || {}).max || 8,
    log: m.log.slice(-30),
    skor: m.skor || {},
    giliran: m.giliran,
    giliranNama: (m.pemain[m.giliran] || {}).nama || null,
    mulai: m.phase === 'bermain' ? m.mulai : null,
    /* Task213 — papan permainan untuk pemain ini (kartu/pion/catur). */
    papan: papanUntuk(m, pemain),
  }
}

function papanUntuk(m, pemain) {
  if (!m.state) return null
  try {
    return papanGame(m.game, m, pemain)
  } catch {
    return null
  }
}

function catat(m, teks) {
  m.log.push(`[${new Date().toISOString()}] ${kodeNama(teks, 160)}`)
  if (m.log.length > 80) m.log = m.log.slice(-80)
  m.terakhir = Date.now()
}

/* ── aksi permainan sederhana (server yang menentukan, bukan klien) ───────
 * Meja yang belum punya aturan rinci tetap bisa dipakai: status giliran
 * diputar dan aksi dicatat, sehingga klien (yang punya aturan tampilan)
 * bisa memakai `giliran` + `skor` sebagai sumber kebenaran bersama.
 * Catur/UNO/Werewolf memakai `gerak` bebas yang dicatat di log meja. */
function jalankanAksi(m, pemain, aksi) {
  const jenis = String(aksi?.aksi || aksi?.action || '').toLowerCase()
  /* Task213 — game ber-mesin (uno/snakes/chess/monopoly/empire/werewolf)
   * divalidasi oleh lib/webgame-rules.js; chat tetap boleh kapan saja. */
  if (punyaMesin(m.game) && !m.state && jenis !== 'chat' && jenis !== 'siap') {
    return { ok: false, alasan: 'Permainan belum dimulai — host harus menekan MULAI lebih dulu.' }
  }
  if (m.state && punyaMesin(m.game) && jenis !== 'chat') {
    const hasil = aksiGame(m.game, m, pemain, aksi)
    if (!hasil.ok) return hasil
    if (hasil.pesan) catat(m, hasil.pesan)
    return { ok: true, ...(hasil.pesan ? { pesan: hasil.pesan } : {}), giliran: m.giliran }
  }
  if (jenis === 'chat') {
    catat(m, `${pemain.nama}: ${kodeNama(aksi.pesan || '', 120)}`)
    return { ok: true }
  }
  if (jenis === 'siap' || jenis === 'ready') {
    pemain.siap = true
    catat(m, `${pemain.nama} siap`)
    const semua = m.pemain.filter((p) => !p.host).every((p) => p.siap)
    if (semua && m.phase === 'menunggu') {
      m.phase = 'bermain'
      m.mulai = Date.now()
      m.giliran = 0
      catat(m, 'Permainan dimulai')
    }
    return { ok: true, phase: m.phase }
  }
  if (jenis === 'gerak' || jenis === 'move' || jenis === 'main') {
    if (m.phase !== 'bermain') return { ok: false, alasan: 'Permainan belum dimulai.' }
    const giliranPemain = m.pemain[m.giliran]
    if (giliranPemain && giliranPemain.token !== pemain.token) {
      return { ok: false, alasan: `Bukan giliran ${pemain.nama}; sekarang giliran ${giliranPemain.nama}.` }
    }
    catat(m, `${pemain.nama}: ${kodeNama(JSON.stringify(aksi.data || aksi.gerak || {}).slice(0, 120))}`)
    m.giliran = (m.giliran + 1) % Math.max(1, m.pemain.length)
    return { ok: true, giliran: m.giliran }
  }
  if (jenis === 'skor') {
    const nilai = Number(aksi.nilai)
    if (!Number.isFinite(nilai)) return { ok: false, alasan: 'Nilai skor tidak valid.' }
    m.skor[pemain.nama] = (m.skor[pemain.nama] || 0) + Math.max(-1000, Math.min(1000, Math.trunc(nilai)))
    catat(m, `skor ${pemain.nama} → ${m.skor[pemain.nama]}`)
    return { ok: true, skor: m.skor }
  }
  return { ok: false, alasan: `Aksi "${jenis || '?'}" tidak dikenal.` }
}

function cariPemain(m, tokenPemain) {
  return m.pemain.find((p) => p.token === String(tokenPemain || ''))
}

/* ── penangan HTTP ─────────────────────────────────────────────────────── */

function kirim(res, status, data) {
  const isi = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(isi),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  res.end(isi)
}

async function bacaBody(req) {
  const potong = []
  let ukuran = 0
  for await (const bagian of req) {
    ukuran += bagian.length
    if (ukuran > 64 * 1024) throw new Error('Data terlalu besar.')
    potong.push(bagian)
  }
  if (!potong.length) return {}
  try { return JSON.parse(Buffer.concat(potong).toString('utf8')) || {} } catch { return {} }
}

/**
 * Tangani permintaan WebGame bila jalurnya cocok.
 * @returns {boolean} true bila permintaan sudah ditangani.
 */
/* Host yang boleh memakai API meja. PENTING: rute ini dipasang SEBELUM rute
 * platform, jadi tanpa penjaga host `/api/health` milik bot ikut tertimpa.
 * Host lain (api.gwenna.my.id, IP, localhost) sudah punya /api/health sendiri. */
const HOST_GAME = new Set([
  'game.gwenna.my.id',
  'game.alzriss.my.id',
  'game3d-alzriss.gwenna.my.id',
  'game3d.alzriss.gwenna.my.id',
])

export function hostGame(botHost) {
  const h = String(botHost || '').toLowerCase().split(':')[0]
  if (!h) return false
  if (HOST_GAME.has(h)) return true
  /* fallback: subdomain game apa pun di domain milik kita */
  return /^game[0-9a-z-]*(\.alzriss)?\.(gwenna|alzriss)\.my\.id$/.test(h)
}

export async function layaniWebGame(req, res, url) {
  const jalur = String((url && url.pathname) || req.url || '/').split('?')[0]
  if (!jalur.startsWith('/api/')) return false
  if (!hostGame(req.headers && (req.headers.host || req.headers['x-forwarded-host']))) return false
  const cocok = /^\/api\/(health|rooms)(\/|$)/.test(jalur)
  if (!cocok) return false
  muat()

  if (req.method === 'OPTIONS') {
    kirim(res, 204, {})
    return true
  }

  if (jalur === '/api/health') {
    kirim(res, 200, {
      ok: true,
      service: 'umi-webgame',
      versi: 3,
      meja: Object.keys(meja).length,
      game: Object.keys(GAME),
      mesin: daftarMesin(),
      waktu: new Date().toISOString(),
    })
    return true
  }

  if (jalur === '/api/rooms' && req.method === 'GET') {
    const daftar = Object.values(meja)
      .filter((m) => m.phase !== 'selesai')
      .sort((a, b) => Number(b.terakhir || 0) - Number(a.terakhir || 0))
      .slice(0, 50)
      .map((m) => ({
        roomId: m.id, game: m.game, label: (GAME[m.game] || {}).label || m.game,
        phase: m.phase, pemain: m.pemain.length, maks: (GAME[m.game] || {}).max || 8,
      }))
    kirim(res, 200, { ok: true, rooms: daftar })
    return true
  }

  if (jalur === '/api/rooms/create' && req.method === 'POST') {
    const isi = await bacaBody(req)
    const game = String(isi.game || '').toLowerCase()
    if (!GAME[game]) {
      kirim(res, 400, { ok: false, error: `Game "${game}" tidak dikenal. Pilihan: ${Object.keys(GAME).join(', ')}` })
      return true
    }
    bersihkan()
    let id = idMeja()
    while (meja[id]) id = idMeja()
    const sekarang = Date.now()
    const tuan = { nama: kodeNama(isi.nama || isi.name || 'Host', 24) || 'Host', token: token(), host: true, siap: true }
    const m = {
      id, game, phase: 'menunggu', pemain: [tuan], dibuat: sekarang, terakhir: sekarang,
      log: [], skor: {}, giliran: 0, mulai: null,
    }
    catat(m, `Meja ${GAME[game].label} dibuat oleh ${tuan.nama}`)
    meja[id] = m
    simpan()
    kirim(res, 200, { ok: true, roomId: id, token: tuan.token, view: tampilan(m, tuan) })
    return true
  }

  const cocokMeja = jalur.match(/^\/api\/rooms\/([A-Za-z0-9]{4,12})(?:\/(join|start|state|action|tutup))?$/)
  if (!cocokMeja) return false
  const [, id, aksi] = cocokMeja
  const m = meja[id.toUpperCase()] || meja[id]
  if (!m) {
    kirim(res, 404, { ok: false, error: 'Meja tidak ditemukan atau sudah kedaluwarsa.' })
    return true
  }
  m.terakhir = Date.now()

  if ((aksi === undefined || aksi === 'state') && req.method === 'GET') {
    /* Token opsional lewat ?token= — tanpa token, tangan kartu tidak dikirim
     * (pantau publik tetap melihat kursi, giliran, dan papan). */
    const tokenTanya = String((url.searchParams && url.searchParams.get('token')) || '').trim()
    const pemainState = tokenTanya ? cariPemain(m, tokenTanya) : null
    const tokenSah = String(req.headers['x-room-token'] || '').trim()
    const pemainHeader = !pemainState && tokenSah ? cariPemain(m, tokenSah) : null
    kirim(res, 200, { ok: true, view: tampilan(m, pemainState || pemainHeader || null) })
    return true
  }

  const isi = req.method === 'POST' ? await bacaBody(req) : {}

  if (aksi === 'join' && req.method === 'POST') {
    const batas = (GAME[m.game] || {}).max || 8
    if (m.pemain.length >= batas) {
      kirim(res, 409, { ok: false, error: `Meja penuh (maks ${batas} pemain).` })
      return true
    }
    if (m.phase !== 'menunggu') {
      kirim(res, 409, { ok: false, error: 'Permainan sudah dimulai; tunggu meja berikutnya.' })
      return true
    }
    const nama = kodeNama(isi.nama || isi.name || `Pemain ${m.pemain.length + 1}`, 24)
    const pemain = { nama, token: token(), host: false, siap: true }
    m.pemain.push(pemain)
    catat(m, `${nama} duduk di kursi ${m.pemain.length}`)
    simpan()
    kirim(res, 200, { ok: true, roomId: m.id, token: pemain.token, seat: m.pemain.length - 1, view: tampilan(m, pemain) })
    return true
  }

  if (aksi === 'start' && req.method === 'POST') {
    const pemain = cariPemain(m, isi.token)
    if (!pemain) { kirim(res, 403, { ok: false, error: 'Token meja tidak valid.' }); return true }
    if (!pemain.host) { kirim(res, 403, { ok: false, error: 'Hanya pembuat meja yang bisa memulai.' }); return true }
    const minimal = (GAME[m.game] || {}).min || 2
    if (m.pemain.length < minimal) {
      kirim(res, 409, { ok: false, error: `Butuh minimal ${minimal} pemain (sekarang ${m.pemain.length}).` })
      return true
    }
    m.phase = 'bermain'
    m.mulai = Date.now()
    m.giliran = 0
    if (punyaMesin(m.game)) {
      m.state = mulaiGame(m.game, m)
      catat(m, `Papan ${m.game} disiapkan`)
    }
    catat(m, `Permainan dimulai oleh ${pemain.nama}`)
    simpan()
    kirim(res, 200, { ok: true, view: tampilan(m, pemain) })
    return true
  }

  if (aksi === 'action' && req.method === 'POST') {
    const pemain = cariPemain(m, isi.token)
    if (!pemain) { kirim(res, 403, { ok: false, error: 'Token meja tidak valid.' }); return true }
    const hasil = jalankanAksi(m, pemain, isi)
    simpan()
    kirim(res, hasil.ok ? 200 : 400, { ...hasil, view: tampilan(m, pemain) })
    return true
  }

  if (aksi === 'tutup' && req.method === 'POST') {
    const pemain = cariPemain(m, isi.token)
    if (!pemain || !pemain.host) { kirim(res, 403, { ok: false, error: 'Hanya pembuat meja yang bisa menutup.' }); return true }
    m.phase = 'selesai'
    catat(m, `Meja ditutup oleh ${pemain.nama}`)
    delete meja[m.id]
    simpan()
    kirim(res, 200, { ok: true, ditutup: true })
    return true
  }

  kirim(res, 405, { ok: false, error: 'Metode atau aksi tidak didukung.' })
  return true
}

export const daftarGame = () => ({ ...GAME })
export default { layaniWebGame, daftarGame }

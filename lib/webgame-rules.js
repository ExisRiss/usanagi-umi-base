/* By AlzRiss - Usanagi Umi AI
 *
 * Task213 — MESIN ATURAN game meja (server-authoritative).
 *
 * Kenapa dipisah dari `webgame-server.js`: jaringan/HTTP dan aturan permainan
 * dua hal berbeda. Semua keputusan sah/tidak sah dihitung DI SINI (server),
 * klien hanya menggambar `papan()` — jadi pemain tidak bisa curang dari
 * konsol browser.
 *
 * Game yang punya mesin penuh:
 *   • uno      — kartu angka + skip/reverse/+2, wild & wild+4 (pilih warna)
 *   • snakes   — ular tangga 100 kotak, dadu 1–6, tangga & ular tetap
 *   • chess    — catur 8×8, langkah diverifikasi (pola + jalur + tidak makan
 *                kawan + tidak meninggalkan raja di kotak yang diserang)
 * sisa game memakai mode `console` (giliran + chat + papan skor bersama).
 *
 * Semua fungsi murni terhadap objek meja (`m`) milik webgame-server.js:
 *   m.state      → data permainan
 *   m.pemain[]   → { nama, host, siap, token, kursi }
 * Tidak ada impor & tidak ada I/O supaya mudah diuji.
 */

/* ── utilitas ─────────────────────────────────────────────────────────── */

function acak(n) {
  return Math.floor(Math.random() * n)
}

function kocok(daftar) {
  const a = daftar.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = acak(i + 1)
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

const teks = (v, maks = 120) => String(v === undefined || v === null ? '' : v).slice(0, maks)

/* ── UNO ──────────────────────────────────────────────────────────────── */

const WARNA = ['merah', 'kuning', 'hijau', 'biru']

function dekUno() {
  const dek = []
  let n = 0
  for (const w of WARNA) {
    dek.push({ id: 'c' + n++, warna: w, nilai: '0' })
    for (let v = 1; v <= 9; v++) {
      dek.push({ id: 'c' + n++, warna: w, nilai: String(v) })
      dek.push({ id: 'c' + n++, warna: w, nilai: String(v) })
    }
    for (const khusus of ['lewati', 'balik', 'tarik2']) {
      dek.push({ id: 'c' + n++, warna: w, nilai: khusus })
      dek.push({ id: 'c' + n++, warna: w, nilai: khusus })
    }
  }
  for (let i = 0; i < 4; i++) {
    dek.push({ id: 'c' + n++, warna: 'hitam', nilai: 'bebas' })
    dek.push({ id: 'c' + n++, warna: 'hitam', nilai: 'bebas4' })
  }
  return kocok(dek)
}

function unoMulai(m) {
  const dek = dekUno()
  const tangan = {}
  for (const p of m.pemain) {
    tangan[p.token] = []
    for (let i = 0; i < 7; i++) tangan[p.token].push(dek.pop())
  }
  // kartu buang pertama: jangan kartu aksi
  let atas = dek.pop()
  while (atas.warna === 'hitam' || /^[a-z]/.test(atas.nilai)) {
    dek.unshift(atas)
    atas = dek.pop()
  }
  return {
    tumpukan: dek,
    buang: [atas],
    tangan,
    warnaAktif: atas.warna,
    arah: 1,
    tumpukanTarik: 0,
    menungguWarna: null,
    pemenang: null,
  }
}

function kartuBoleh(kartu, atas, warnaAktif) {
  if (kartu.warna === 'hitam') return true
  if (kartu.warna === warnaAktif) return true
  return kartu.nilai === atas.nilai
}

function unoAmbil(s, token, jumlah = 1) {
  for (let i = 0; i < jumlah; i++) {
    if (!s.tumpukan.length) {
      const atas = s.buang.pop()
      s.tumpukan = kocok(s.buang)
      s.buang = [atas]
    }
    if (!s.tumpukan.length) return
    s.tangan[token].push(s.tumpukan.pop())
  }
}

function unoLanjut(m, s, langkah = 1) {
  const total = Math.max(1, m.pemain.length)
  m.giliran = (((m.giliran + s.arah * langkah) % total) + total) % total
}

function unoAksi(m, s, pemain, data) {
  if (s.pemenang) return { ok: false, alasan: 'Permainan sudah selesai.' }
  const jenis = String(data.aksi || '').toLowerCase()

  /* BUG yang pernah ada: kartu bebas/bebas4 langsung memindahkan giliran,
   * lalu pemilih warna ditolak "Bukan giliranmu" — papan macet menunggu warna
   * selamanya. Pemilihan warna karena itu diperiksa SEBELUM cek giliran. */
  if (jenis === 'warna') {
    if (s.menungguWarna !== pemain.token) return { ok: false, alasan: 'Tidak ada permintaan warna untukmu.' }
    const w = String(data.warna || '').toLowerCase()
    if (!WARNA.includes(w)) return { ok: false, alasan: 'Warna harus merah/kuning/hijau/biru.' }
    s.warnaAktif = w
    s.menungguWarna = null
    return { ok: true, pesan: `Warna menjadi ${w}` }
  }

  if (s.menungguWarna) {
    const penunggu = m.pemain.find((p) => p.token === s.menungguWarna) || {}
    return { ok: false, alasan: `Menunggu ${penunggu.nama || 'pemain'} memilih warna.` }
  }

  const giliranPemain = m.pemain[m.giliran]
  if (!giliranPemain || giliranPemain.token !== pemain.token) {
    return { ok: false, alasan: `Bukan giliranmu; sekarang giliran ${giliranPemain ? giliranPemain.nama : '?'}.` }
  }
  const tanganSaya = s.tangan[pemain.token] || []

  if (jenis === 'tarik') {
    if (s.tumpukanTarik > 0) return { ok: false, alasan: 'Kamu harus mengambil kartu hukuman.' }
    unoAmbil(s, pemain.token, 1)
    const baru = s.tangan[pemain.token].slice(-1)[0]
    s.logAmbil = `${pemain.nama} mengambil 1 kartu`
    if (baru && kartuBoleh(baru, s.buang[s.buang.length - 1], s.warnaAktif)) {
      s.bolehMain = pemain.token
      return { ok: true, pesan: 'Kartu bisa dimainkan — mainkan atau tekan Lewati.' }
    }
    unoLanjut(m, s)
    s.bolehMain = null
    return { ok: true, pesan: 'Kartu diambil, giliran berpindah.' }
  }

  if (jenis === 'lewati' || jenis === 'pass') {
    if (s.bolehMain !== pemain.token) return { ok: false, alasan: 'Kamu belum mengambil kartu.' }
    s.bolehMain = null
    unoLanjut(m, s)
    return { ok: true, pesan: 'Giliran dilewati.' }
  }

  if (jenis === 'main') {
    const kartu = tanganSaya.find((k) => k.id === String(data.kartu || ''))
    if (!kartu) return { ok: false, alasan: 'Kartu itu tidak ada di tanganmu.' }
    const atas = s.buang[s.buang.length - 1]
    if (!kartuBoleh(kartu, atas, s.warnaAktif)) {
      return { ok: false, alasan: `Kartu tidak cocok (harus ${s.warnaAktif} atau ${atas.nilai}).` }
    }
    tanganSaya.splice(tanganSaya.indexOf(kartu), 1)
    s.buang.push(kartu)
    s.warnaAktif = kartu.warna === 'hitam' ? s.warnaAktif : kartu.warna
    s.bolehMain = null
    s.tumpukanTarik = 0

    if (!tanganSaya.length) {
      s.pemenang = pemain.nama
      m.phase = 'selesai'
      return { ok: true, pesan: `🎉 ${pemain.nama} menang!` }
    }

    if (kartu.nilai === 'balik') {
      s.arah = -s.arah
      if (m.pemain.length === 2) unoLanjut(m, s, 2)
      else unoLanjut(m, s)
    } else if (kartu.nilai === 'lewati') {
      unoLanjut(m, s, 2)
    } else if (kartu.nilai === 'tarik2') {
      unoLanjut(m, s)
      const korban = m.pemain[m.giliran]
      if (korban) unoAmbil(s, korban.token, 2)
      unoLanjut(m, s)
    } else if (kartu.nilai === 'bebas' || kartu.nilai === 'bebas4') {
      if (kartu.nilai === 'bebas4') {
        unoLanjut(m, s)
        const korban = m.pemain[m.giliran]
        if (korban) unoAmbil(s, korban.token, 4)
      }
      s.menungguWarna = pemain.token
      unoLanjut(m, s)
    } else {
      unoLanjut(m, s)
    }
    return { ok: true, pesan: `${pemain.nama} memainkan ${kartu.warna} ${kartu.nilai}` }
  }

  return { ok: false, alasan: `Aksi UNO "${teks(jenis, 20)}" tidak dikenal (pakai main/tarik/lewati/warna).` }
}

function unoPapan(m, s, pemain) {
  const atas = s.buang[s.buang.length - 1]
  const tanganSaya = pemain ? s.tangan[pemain.token] || [] : null
  return {
    jenis: 'uno',
    atas: atas ? { warna: atas.warna, nilai: atas.nilai } : null,
    warnaAktif: s.warnaAktif,
    arah: s.arah > 0 ? 'searah jarum jam' : 'berlawanan jarum jam',
    sisaTumpukan: s.tumpukan.length,
    menungguWarna: s.menungguWarna ? (m.pemain.find((p) => p.token === s.menungguWarna) || {}).nama || true : false,
    pemenang: s.pemenang,
    tanganSaya: tanganSaya ? tanganSaya.map((k) => ({ id: k.id, warna: k.warna, nilai: k.nilai })) : null,
    jumlahKartu: m.pemain.map((p) => ({ nama: p.nama, jumlah: (s.tangan[p.token] || []).length })),
  }
}

/* ── ULAR TANGGA ──────────────────────────────────────────────────────── */

/* Peta tetap supaya semua klien melihat papan yang sama. */
const TANGGA = { 3: 22, 8: 26, 20: 41, 28: 77, 50: 91, 71: 92, 88: 99 }
const ULAR = { 17: 4, 32: 10, 48: 26, 62: 19, 95: 56, 98: 78 }

function snakesMulai(m) {
  const posisi = {}
  for (const p of m.pemain) posisi[p.token] = 0
  return { posisi, dadu: 0, pemenang: null, riwayat: [] }
}

function snakesAksi(m, s, pemain, data) {
  if (s.pemenang) return { ok: false, alasan: 'Permainan sudah selesai.' }
  const giliranPemain = m.pemain[m.giliran]
  if (!giliranPemain || giliranPemain.token !== pemain.token) {
    return { ok: false, alasan: `Bukan giliranmu; sekarang giliran ${giliranPemain ? giliranPemain.nama : '?'}.` }
  }
  const jenis = String(data.aksi || 'kocok').toLowerCase()
  if (jenis !== 'kocok' && jenis !== 'roll') return { ok: false, alasan: 'Aksi di game ini hanya "kocok".' }
  const d = 1 + acak(6)
  s.dadu = d
  const sebelum = s.posisi[pemain.token] || 0
  let kini = sebelum + d
  if (kini > 100) kini = 100 - (kini - 100) // memantul, harus tepat 100
  let catatan = ''
  if (TANGGA[kini]) {
    catatan = ` 🪜 naik ke ${TANGGA[kini]}`
    kini = TANGGA[kini]
  } else if (ULAR[kini]) {
    catatan = ` 🐍 turun ke ${ULAR[kini]}`
    kini = ULAR[kini]
  }
  s.posisi[pemain.token] = kini
  s.riwayat.push(`${pemain.nama}: 🎲${d} → ${kini}${catatan}`)
  if (s.riwayat.length > 20) s.riwayat.shift()
  if (kini === 100) {
    s.pemenang = pemain.nama
    m.phase = 'selesai'
    return { ok: true, pesan: `🎉 ${pemain.nama} mencapai kotak 100!` }
  }
  m.giliran = (m.giliran + 1) % Math.max(1, m.pemain.length)
  return { ok: true, pesan: `${pemain.nama} dapat ${d} → kotak ${kini}${catatan}` }
}

function snakesPapan(m, s) {
  return {
    jenis: 'snakes',
    dadu: s.dadu,
    pemenang: s.pemenang,
    posisi: m.pemain.map((p) => ({ nama: p.nama, kotak: s.posisi[p.token] || 0 })),
    riwayat: s.riwayat.slice(-8),
  }
}

/* ── CATUR ────────────────────────────────────────────────────────────── */

const AWAL_CATUR = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  ['', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
]

const NAMA_BIDAK = { b: 'menteri', n: 'kuda', r: 'benteng', q: 'ratu', k: 'raja', p: 'pion' }

function chessMulai(m) {
  return {
    papan: AWAL_CATUR.map((b) => b.slice()),
    pemenang: null,
    skak: null,
    langkah: [],
    pilihan: null,
  }
}

const dalam = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8
const putih = (k) => k && k === k.toUpperCase()
const warnaBidak = (k) => (k ? (putih(k) ? 'putih' : 'hitam') : null)

function bidakDi(papan, r, c) {
  if (!dalam(r, c)) return null
  return papan[r][c] || null
}

/* jalur bersih untuk menteri/benteng/ratu */
function jalurBersih(papan, r1, c1, r2, c2) {
  const dr = Math.sign(r2 - r1)
  const dc = Math.sign(c2 - c1)
  let r = r1 + dr
  let c = c1 + dc
  while (r !== r2 || c !== c2) {
    if (papan[r][c]) return false
    r += dr
    c += dc
  }
  return true
}

function polaSah(bidak, r1, c1, r2, c2, papan) {
  const jenis = bidak.toLowerCase()
  const dr = r2 - r1
  const dc = c2 - c1
  const adr = Math.abs(dr)
  const adc = Math.abs(dc)
  if (jenis === 'p') {
    const maju = putih(bidak) ? -1 : 1
    const awal = putih(bidak) ? 6 : 1
    if (dc === 0 && dr === maju && !papan[r2][c2]) return true
    if (dc === 0 && dr === 2 * maju && r1 === awal && !papan[r2][c2] && !papan[r1 + maju][c1]) return true
    if (adc === 1 && dr === maju && papan[r2][c2] && warnaBidak(papan[r2][c2]) !== warnaBidak(bidak)) return true
    return false
  }
  if (jenis === 'n') return (adr === 2 && adc === 1) || (adr === 1 && adc === 2)
  if (jenis === 'b') return adr === adc && adr > 0 && jalurBersih(papan, r1, c1, r2, c2)
  if (jenis === 'r') return ((dr === 0) !== (dc === 0)) && jalurBersih(papan, r1, c1, r2, c2)
  if (jenis === 'q') {
    if (adr === adc && adr > 0) return jalurBersih(papan, r1, c1, r2, c2)
    if ((dr === 0) !== (dc === 0)) return jalurBersih(papan, r1, c1, r2, c2)
    return false
  }
  if (jenis === 'k') return Math.max(adr, adc) === 1
  return false
}

/* Serangan bidak `oleh` ke kotak (r,c) — dipakai untuk uji skak. */
function diserang(papan, r, c, oleh) {
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const b = papan[i][j]
      if (!b || warnaBidak(b) !== oleh) continue
      if (polaSah(b, i, j, r, c, papan)) return true
    }
  }
  return false
}

function rajaDi(papan, warna) {
  const target = warna === 'putih' ? 'K' : 'k'
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (papan[r][c] === target) return [r, c]
  return null
}

function chessAksi(m, s, pemain, data) {
  if (s.pemenang) return { ok: false, alasan: 'Permainan sudah selesai.' }
  const giliranPemain = m.pemain[m.giliran]
  if (!giliranPemain || giliranPemain.token !== pemain.token) {
    return { ok: false, alasan: `Bukan giliranmu; sekarang giliran ${giliranPemain ? giliranPemain.nama : '?'}.` }
  }
  const warnaSaya = m.giliran === 0 ? 'putih' : 'hitam'
  const jenis = String(data.aksi || 'gerak').toLowerCase()
  if (jenis === 'menyerah' || jenis === 'resign') {
    s.pemenang = m.pemain[(m.giliran + 1) % m.pemain.length].nama
    m.phase = 'selesai'
    return { ok: true, pesan: `${pemain.nama} menyerah.` }
  }
  if (jenis !== 'gerak' && jenis !== 'move') return { ok: false, alasan: 'Aksi catur hanya "gerak" atau "menyerah".' }
  const dari = Array.isArray(data.dari) ? data.dari : null
  const ke = Array.isArray(data.ke) ? data.ke : null
  if (!dari || !ke || dari.length !== 2 || ke.length !== 2) {
    return { ok: false, alasan: 'Format: { dari: [baris,kolom], ke: [baris,kolom] } (0–7).' }
  }
  const [r1, c1] = dari.map(Number)
  const [r2, c2] = ke.map(Number)
  if (![r1, c1, r2, c2].every((n) => Number.isInteger(n) && n >= 0 && n < 8)) {
    return { ok: false, alasan: 'Posisi harus angka 0–7.' }
  }
  const bidak = s.papan[r1] && s.papan[r1][c1]
  if (!bidak) return { ok: false, alasan: 'Kotak asal kosong.' }
  if (warnaBidak(bidak) !== warnaSaya) return { ok: false, alasan: `Itu bidak ${warnaBidak(bidak)}, bukan milikmu.` }
  const target = s.papan[r2][c2]
  if (target && warnaBidak(target) === warnaSaya) return { ok: false, alasan: 'Tidak boleh memakan bidak sendiri.' }
  if (!polaSah(bidak, r1, c1, r2, c2, s.papan)) {
    return { ok: false, alasan: `${NAMA_BIDAK[bidak.toLowerCase()]} tidak bisa bergerak ke situ.` }
  }
  const uji = s.papan.map((b) => b.slice())
  uji[r2][c2] = bidak
  uji[r1][c1] = ''
  const raja = rajaDi(uji, warnaSaya)
  if (raja && diserang(uji, raja[0], raja[1], warnaSaya === 'putih' ? 'hitam' : 'putih')) {
    return { ok: false, alasan: 'Langkah itu membuat rajamu diserang (ilegal).' }
  }
  s.papan = uji
  s.langkah.push(`${warnaSaya === 'putih' ? 'P' : 'H'}: ${'abcdefgh'[c1]}${8 - r1}-${'abcdefgh'[c2]}${8 - r2}`)
  if (s.langkah.length > 24) s.langkah.shift()
  const rajaLawan = rajaDi(uji, warnaSaya === 'putih' ? 'hitam' : 'putih')
  s.skak = rajaLawan && diserang(uji, rajaLawan[0], rajaLawan[1], warnaSaya) ? warnaSaya === 'putih' ? 'hitam' : 'putih' : null
  if (!rajaLawan) {
    s.pemenang = pemain.nama
    m.phase = 'selesai'
    return { ok: true, pesan: `🎉 ${pemain.nama} menang — raja lawan tertangkap.` }
  }
  m.giliran = (m.giliran + 1) % Math.max(1, m.pemain.length)
  return { ok: true, pesan: `${pemain.nama}: ${'abcdefgh'[c1]}${8 - r1}→${'abcdefgh'[c2]}${8 - r2}` }
}

function chessPapan(m, s) {
  return {
    jenis: 'chess',
    papan: s.papan,
    pemenang: s.pemenang,
    skak: s.skak,
    langkah: s.langkah.slice(-10),
  }
}

/* ── MODE CONSOLE (monopoli, empire, werewolf, uno flip) ──────────────── */

function consoleMulai(m) {
  return { skor: {}, catatan: [], peran: {}, malam: 0 }
}

function consoleAksi(m, s, pemain, data) {
  const jenis = String(data.aksi || '').toLowerCase()
  if (jenis === 'skor') {
    const nilai = Number(data.nilai)
    if (!Number.isFinite(nilai)) return { ok: false, alasan: 'Nilai skor tidak valid.' }
    s.skor[pemain.nama] = (s.skor[pemain.nama] || 0) + Math.max(-1000, Math.min(1000, Math.trunc(nilai)))
    s.catatan.push(`${pemain.nama}: skor ${s.skor[pemain.nama]}`)
    return { ok: true, pesan: `Skor ${pemain.nama} = ${s.skor[pemain.nama]}` }
  }
  const giliranPemain = m.pemain[m.giliran]
  const giliranSaya = giliranPemain && giliranPemain.token === pemain.token
  const bolehBebas = jenis === 'catat' || jenis === 'lapor' || jenis === 'vote' || jenis === 'bunuh'
  if (!giliranSaya && !bolehBebas) {
    return { ok: false, alasan: `Bukan giliranmu; sekarang giliran ${giliranPemain ? giliranPemain.nama : '?'}.` }
  }
  if (jenis === 'vote' || jenis === 'bunuh') {
    const target = teks(data.target, 40)
    const ada = m.pemain.find((p) => p.nama === target)
    if (!ada) return { ok: false, alasan: 'Pemain target tidak ada di meja ini.' }
    s.catatan.push(jenis === 'bunuh' ? `🐺 ${pemain.nama} menyerang ${target}` : `🗳️ ${pemain.nama} memilih ${target}`)
    s.suara = s.suara || {}
    s.suara[target] = (s.suara[target] || 0) + (jenis === 'vote' ? 1 : 3)
    const terbanyak = Object.entries(s.suara).sort((a, b) => b[1] - a[1])[0]
    if (terbanyak && terbanyak[1] >= Math.ceil(m.pemain.length / 2)) {
      s.catatan.push(`➡️ ${terbanyak[0]} tersingkir (${terbanyak[1]} suara)`)
      s.suara = {}
    }
    return { ok: true, pesan: 'Suara dicatat.' }
  }
  if (jenis === 'catat' || jenis === 'lapor') {
    s.catatan.push(`${pemain.nama}: ${teks(data.pesan, 100)}`)
    if (s.catatan.length > 30) s.catatan.shift()
    return { ok: true, pesan: 'Tercatat.' }
  }
  return { ok: false, alasan: `Aksi "${jenis || '?'}" tidak dikenal (pakai catat/skor/vote/bunuh).` }
}

function consolePapan(m, s, pemain) {
  return {
    jenis: 'console',
    skor: s.skor,
    catatan: s.catatan.slice(-12),
    peranSaya: pemain ? s.peran[pemain.token] || null : null,
    daftarPemain: m.pemain.map((p) => p.nama),
  }
}

/* ── pendaftaran ──────────────────────────────────────────────────────── */

const MESIN = {
  uno: { mulai: unoMulai, aksi: unoAksi, papan: unoPapan, label: 'UNO' },
  snakes: { mulai: snakesMulai, aksi: snakesAksi, papan: snakesPapan, label: 'Ular Tangga' },
  chess: { mulai: chessMulai, aksi: chessAksi, papan: chessPapan, label: 'Catur' },
  unoflip: { mulai: unoMulai, aksi: unoAksi, papan: unoPapan, label: 'UNO Flip' },
  monopoly: { mulai: consoleMulai, aksi: consoleAksi, papan: consolePapan, label: 'Monopoli' },
  empire: { mulai: consoleMulai, aksi: consoleAksi, papan: consolePapan, label: 'Property Empire' },
  werewolf: { mulai: consoleMulai, aksi: consoleAksi, papan: consolePapan, label: 'Werewolf' },
}

export const punyaMesin = (game) => Boolean(MESIN[String(game || '')])
export const namaMesin = (game) => (MESIN[String(game || '')] || {}).label || String(game || '')

export function mulaiGame(game, m) {
  const mesin = MESIN[String(game || '')]
  if (!mesin) return null
  return mesin.mulai(m)
}

export function aksiGame(game, m, pemain, data) {
  const mesin = MESIN[String(game || '')]
  if (!mesin) return { ok: false, alasan: 'Game ini belum punya mesin aturan.' }
  return mesin.aksi(m, m.state, pemain, data || {})
}

export function papanGame(game, m, pemain) {
  const mesin = MESIN[String(game || '')]
  if (!mesin || !m.state) return null
  try {
    return mesin.papan(m, m.state, pemain || null)
  } catch {
    return null
  }
}

export const daftarMesin = () => Object.keys(MESIN)

export default { mulaiGame, aksiGame, papanGame, punyaMesin, namaMesin, daftarMesin }

/* Salin berkas ini → `config.js`, lalu isi. `config.js` TIDAK ikut di-commit. */

export default {
  /* Nomor bot format internasional tanpa +. Kosong = bot menampilkan QR. */
  nomor: '',

  /* Prefix perintah & kewajibannya. */
  prefix: '.',
  wajibPrefix: true,

  /* Pemilik bot — boleh lebih dari satu nomor. */
  owner: ['628xxxxxxxxxx'],

  namaBot: 'Umi Base',

  /* Folder sesi (relatif ke root). Jangan pernah commit isinya. */
  sessionDir: 'sessions/main',

  /* true = pesan galat plugin ikut dikirim ke chat. */
  tampilkanError: false,

  /* Penyetelan jaringan; nilai kosong = pakai lib/socket-options.js.
   * Contoh: { connectTimeoutMs: 45000, keepAliveIntervalMs: 15000 } */
  runtimePerformance: {},
}

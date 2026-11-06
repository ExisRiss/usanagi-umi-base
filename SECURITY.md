# Kebijakan Keamanan

## Melaporkan celah

Jangan buka issue publik untuk celah keamanan. Hubungi pemilik repo secara
pribadi (lihat profil GitHub) dengan:

1. langkah reproduksi,
2. dampak yang mungkin terjadi,
3. saran perbaikan (bila ada).

Kamu akan mendapat balasan dalam 7 hari.

## Yang TIDAK boleh masuk repo

- `config.js` berisi nomor/owner asli
- folder `sessions/` berisi kredensial perangkat WhatsApp
- isi `data/` berisi data pengguna
- `.env`, token API, kunci panel, kredensial Cloudflare/GitHub

Kalau tidak sengaja ter-commit: **anggap kredensial itu sudah bocor** — cabut
dan buat ulang, jangan hanya menghapus commit.

## Paket yang dilarang

Lihat tabel di [README](README.md#5-soal-library-koneksi-penting).

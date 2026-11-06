# Berkontribusi

Terima kasih sudah mau mengembangkan base ini.

## Alur

1. **Fork** repo, buat branch: `feat/nama-fitur` atau `fix/nama-bug`.
2. Kerjakan **satu hal** per pull request.
3. `npm test` dan `npm run check` **wajib hijau**.
4. Jelaskan di PR: masalah apa, cara menguji, dan bukti (screenshot/log).

## Gaya kode

- ES modules (`import`/`export`), Node 20+.
- **Tanpa** `||=` dan `??=`.
- Nama variabel/fungsi: bahasa Indonesia **atau** Inggris — pilih satu per berkas.
- Komentar menjelaskan **kenapa**, bukan mengulang **apa** yang baris itu lakukan.
- Tidak ada `console.log` sisa debug di dalam plugin (pakai `throw` untuk pesan
  ke pengguna).

## Plugin baru

- Taruh di `plugins/<kategori>/`.
- Sertakan `handler.command`, `handler.help`, `handler.tags`.
- Tangani input tidak valid dengan pesan yang memandu (`Contoh: .perintah arg`).
- Jangan menambah dependensi baru tanpa membahasnya lebih dulu di issue.

## Yang tidak akan diterima

- Kode yang mencetak/mengirim token, sesi, atau data pengguna.
- Dependensi yang sudah ditandai berbahaya di README.
- Perubahan yang mematikan `npm test` atau menurunkan pemeriksaan keamanan.

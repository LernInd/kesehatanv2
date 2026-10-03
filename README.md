# Kesehatan Pesantren v2

Aplikasi kesehatan santri untuk **Admin Kesehatan Putra** dan **Admin Kesehatan Putri**:
dasbor, santri sakit hari ini, permohonan (penerbitan) surat sakit, riwayat per siswa, dan
cetak surat sakit A5 berkode QR.

Stack: React 19 + Vite, Hono di Cloudflare Workers, Supabase (login & data induk), dan
Cloudflare D1 `presensi-db` (status sakit + presensi).

## Arsitektur singkat

- **Login** memakai Supabase `activity-db` (username → `<username>@admin-kegiatan.internal`).
  Token **tidak pernah** sampai ke peramban: Worker menyimpannya di cookie `__Host-` HttpOnly,
  Secure, SameSite=Strict, dan memverifikasi ulang ke Supabase di setiap permintaan.
  Setelah login pengguna selalu ke `/pilih-peran` (satu pengguna bisa banyak peran).
- Hanya peran `adminkesehatanputra` dan `adminkesehatanputri` yang diizinkan
  (`src/worker/peran.ts`). **Gender (`bagian`) selalu diturunkan dari peran aktif di server**,
  tidak pernah dari peramban.
- **Data santri** (nama, foto, lembaga, kelas) dibaca dari Supabase dengan token pengguna
  (RLS yang memutuskan). Tidak ada `service_role`.
- **Status sakit** dicatat di D1 `presensi-db`. Gangguan sementara Supabase dijawab 503 tanpa
  menghapus sesi.

## Penerapan ke presensi-db (SKEMA.md)

Kesehatan adalah satu-satunya penulis status `sakit`. Satu surat diterbitkan/dibatalkan dalam
**satu transaksi** (`db.batch`) — kode di `src/worker/presensi_sakit.ts`:

| Aksi | Yang ditulis |
|---|---|
| Terbit | `surat_sakit` → jejak `riwayat_presensi` (`Surat sakit <id>: <keterangan>`) → `presensi_pembelajaran.status='sakit'` → `presensi_harian` (tiap tanggal × `masuk`/`pulang`, `cara='surat'`) |
| Batal | pulihkan `presensi_pembelajaran` dari jejak terbaru → hapus `presensi_harian` ber-`cara='surat'` pada rentang surat → tandai surat dibatalkan (tidak dihapus) |

Aturan yang dijaga uji kontrak (`npm test`): awalan jejak penerap = pembatal, penghapusan selalu
berlingkup `cara = 'surat'`, jejak ditulis sebelum menimpa, pembatalan tidak menulis jejak baru.
`presensi_harian.lembaga_id` memakai lembaga ber-kelas santri, bila tak ada → lembaga yang
paling awal didaftarkan; santri tanpa lembaga ditolak (400).

> **Hati-hati:** menimpa tanpa syarat berarti pindai `qr`/izin yang tertimpa surat hilang saat
> surat dibatalkan (perilaku bawaan sistem presensi). Begitu versi ini **dideploy**, surat
> pertama menulis ke presensi **produksi**.

## Menjalankan secara lokal

```bash
npm install
cp .dev.vars.example .dev.vars          # isi SESSION_SECRET (acak, ≥ 32 karakter)

# D1 LOKAL saja (jangan --remote). Jangan memasang dari schema.sql presensi: ia menyimpang
# dari produksi (SKEMA.md §1). Berkas ini salinan DDL hidup presensi-db.
npx wrangler d1 execute presensi-db --local --file=migrations/0001_surat_sakit.sql
npx wrangler d1 execute presensi-db --local --file=migrations/0002_presensi_lokal.sql

npm run dev                              # http://localhost:5173
```

Perintah lain: `npm run lint`, `npm test`, `npm run build`, `npm run cf-typegen`.

Untuk produksi, `SESSION_SECRET` diatur dengan `npx wrangler secret put SESSION_SECRET`.
Kunci Supabase di `wrangler.json` adalah kunci *publishable* (memang publik).

Membaca skema produksi yang sebenarnya (baca saja):

```bash
npx wrangler d1 execute presensi-db --remote \
  --command "select sql from sqlite_master where type in ('table','index')"
```

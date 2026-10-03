-- HANYA untuk D1 LOKAL (wrangler d1 execute presensi-db --local --file=...).
-- JANGAN dijalankan dengan --remote; tabel-tabel ini sudah ada di presensi-db produksi dan
-- dimiliki aplikasi presensi (SKEMA.md §3). Dipakai agar penerapan surat sakit bisa diuji
-- tanpa menyentuh produksi.
--
-- Salinan DDL HIDUP dari presensi-db produksi (dibaca dari sqlite_master), BUKAN dari
-- schema.sql — SKEMA.md §1: schema.sql menyimpang dari produksi. Penyimpangan yang sudah
-- ketahuan: presensi_pembelajaran.status juga mengizinkan 'tidak_hadir'.
-- Bila produksi berubah, salin ulang dengan:
--   npx wrangler d1 execute presensi-db --remote \
--     --command "select sql from sqlite_master where type in ('table','index')"

create table if not exists "presensi_harian" (
  tanggal text not null,                -- 'YYYY-MM-DD' waktu setempat
  santri_id text not null,
  tipe text not null check (tipe in ('masuk','pulang')),
  lembaga_id text not null,
  waktu text not null,                  -- ISO-8601 UTC
  status text not null
    check (status in ('tepat_waktu','terlambat','pulang','sakit','izin')),
  santri_nama text not null,
  kelas_nama text,
  dicatat_oleh text not null,
  cara text not null default 'qr'
    check (cara in ('qr','manual','surat','izin')),
  primary key (tanggal, santri_id, tipe)
);
create index if not exists presensi_harian_lembaga_idx
  on presensi_harian (lembaga_id, tanggal, tipe);

create table if not exists sesi_pembelajaran (
  id text primary key,
  lembaga_id text not null,
  lembaga_nama text not null,
  kelas_id text not null,
  kelas_nama text not null,
  mapel text not null,
  jam_ke integer,
  tanggal text not null,
  status text not null default 'buka' check (status in ('buka','tutup')),
  dibuat_oleh text not null,
  dibuat_oleh_nama text not null,
  created_at text not null default (datetime('now')),
  jadwal_id text,
  terisi integer not null default 1,
  mulai text,
  selesai text,
  guru_id text,
  guru_nama text
);
create index if not exists sesi_lembaga_idx on sesi_pembelajaran (lembaga_id, tanggal);
create index if not exists sesi_kelas_idx on sesi_pembelajaran (kelas_id, tanggal);
create unique index if not exists sesi_unik_idx
  on sesi_pembelajaran (lembaga_id, kelas_id, tanggal, jam_ke)
  where jam_ke is not null;

create table if not exists "presensi_pembelajaran" (
  sesi_id text not null references sesi_pembelajaran(id) on delete cascade,
  santri_id text not null,
  santri_nama text not null,
  status text not null check (status in ('hadir','izin','sakit','alfa','tidak_hadir')),
  status_awal text not null check (status_awal in ('hadir','izin','sakit','alfa')),
  keterangan text,
  diubah_oleh text,
  diubah_pada text,
  primary key (sesi_id, santri_id),
  check (status = status_awal or (keterangan is not null and length(trim(keterangan)) > 0))
);
create index if not exists presensi_pembelajaran_santri_idx on presensi_pembelajaran (santri_id);

create table if not exists riwayat_presensi (
  id integer primary key autoincrement,
  sesi_id text not null,
  santri_id text not null,
  dari_status text not null,
  ke_status text not null,
  keterangan text not null,
  oleh text not null,
  oleh_nama text not null,
  pada text not null default (datetime('now'))
);
create index if not exists riwayat_sesi_idx on riwayat_presensi (sesi_id, santri_id);

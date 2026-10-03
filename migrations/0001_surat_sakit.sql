-- HANYA untuk D1 LOKAL (wrangler d1 execute presensi-db --local --file=...).
-- Salinan DDL hidup surat_sakit dari D1 produksi (SKEMA.md §4.9); tabel itu sudah ada di produksi.
-- Jangan dijalankan dengan --remote.
create table if not exists surat_sakit (
  id text primary key,
  santri_id text not null,
  santri_nama text not null,
  jenis_kelamin text not null check (jenis_kelamin in ('laki_laki','perempuan')),
  mulai text not null,              -- 'YYYY-MM-DD'
  sampai text not null,             -- termasuk hari itu
  keterangan text not null,
  diterbitkan_oleh text not null,
  diterbitkan_oleh_nama text not null,
  diterbitkan_pada text not null,
  dibatalkan_pada text,
  dibatalkan_oleh text,
  check (sampai >= mulai)
);
create index if not exists surat_sakit_santri_idx on surat_sakit (santri_id, mulai, sampai);
create index if not exists surat_sakit_bagian_idx on surat_sakit (jenis_kelamin, mulai, sampai);

/**
 * Penerapan surat sakit ke tabel presensi (milik aplikasi presensi) — SKEMA.md §3, §4.4,
 * §4.6, §4.7, §7. Kesehatan adalah SATU-SATUNYA penulis status `sakit` di
 * `presensi_harian` (cara = 'surat') dan `presensi_pembelajaran`.
 *
 * Berkas ini sengaja tanpa impor relatif supaya uji kontrak (`npm test`) bisa memuatnya
 * langsung. Semua fungsi hanya MENYIAPKAN pernyataan; pemanggil menjalankannya dalam satu
 * `db.batch()` (transaksi atomik) bersama penulisan `surat_sakit`.
 *
 * Aturan yang dijaga (jangan diubah di satu tempat saja):
 *  - Awalan jejak `Surat sakit <id>:` dipakai penerap DAN pembatal dari sumber yang sama.
 *  - Jejak ditulis SEBELUM menimpa, dan menyaring perubahan nol (`status <> 'sakit'`).
 *  - Pembatalan TIDAK menulis jejak baru berawalan sama (merusak `order by id desc limit 1`).
 *  - Penghapusan `presensi_harian` selalu dibatasi `cara = 'surat'`.
 */

/** Nilai `presensi_harian.cara` milik kesehatan; jangan dipakai ulang oleh penulis lain. */
export const CARA_SURAT = "surat";

/** Awalan jejak: ditulis saat menerapkan, dicari (`LIKE`) saat membatalkan. */
export function awalanJejak(suratId: string): string {
	return `Surat sakit ${suratId}:`;
}

export function teksJejak(suratId: string, keterangan: string): string {
	return `${awalanJejak(suratId)} ${keterangan}`;
}

/** Pola `LIKE` untuk mencari jejak surat ini. */
export function polaJejak(suratId: string): string {
	return `${awalanJejak(suratId)}%`;
}

/* ----------------------------------------------------------------- lembaga */

export interface LembagaSantri {
	lembaga_id: string;
	created_at: string;
	/** Ada isinya bila santri punya kelas di lembaga itu (sekolah formal). */
	santri_kelas?: unknown;
}

/**
 * Lembaga untuk presensi_harian.lembaga_id (kolom wajib; surat_sakit tak menyimpannya).
 * Presensi gerbang mencatat santri di lembaga tempat ia punya KELAS (kolom kelas_nama), jadi
 * lembaga ber-kelas diutamakan; setelah itu yang paling awal didaftarkan (created_at, lalu
 * lembaga_id) — selaras izin_santri ("lembaga pertama santri"). Tanpa ini, santri MTS yang
 * juga terdaftar di Madrasah Diniyah akan tercatat sakit di Diniyah.
 * Null bila santri belum terdaftar di lembaga mana pun (pemanggil menolak 400, tak menebak).
 */
export function lembagaUntukPresensi(daftar: LembagaSantri[] | undefined): string | null {
	const punyaKelas = (l: LembagaSantri): boolean =>
		Array.isArray(l.santri_kelas) ? l.santri_kelas.length > 0 : l.santri_kelas != null;
	const urut = [...(daftar ?? [])].sort(
		(a, b) =>
			Number(punyaKelas(b)) - Number(punyaKelas(a)) ||
			a.created_at.localeCompare(b.created_at) ||
			a.lembaga_id.localeCompare(b.lembaga_id),
	);
	return urut[0]?.lembaga_id ?? null;
}

/* ------------------------------------------------------------------ SQL */

/** 1. Jejak dulu: catat status sebelum berubah, hanya untuk baris yang benar-benar berubah. */
export const SQL_JEJAK = `
insert into riwayat_presensi
  (sesi_id, santri_id, dari_status, ke_status, keterangan, oleh, oleh_nama, pada)
select p.sesi_id, p.santri_id, p.status, 'sakit', ?, ?, ?, ?
  from presensi_pembelajaran p
  join sesi_pembelajaran s on s.id = p.sesi_id
 where p.santri_id = ?
   and s.tanggal between ? and ?
   and p.status <> 'sakit'`;

/**
 * 2. Baru menimpa. Alasan yang sudah ditulis guru TIDAK ditimpa (hanya diisi jejak bila
 * kosong), sehingga CHECK `status = status_awal or keterangan terisi` lolos dan alasan guru
 * selamat saat surat dibatalkan.
 */
export const SQL_TERAPKAN_PEMBELAJARAN = `
update presensi_pembelajaran
   set status = 'sakit',
       keterangan = case when keterangan is null or length(trim(keterangan)) = 0
                         then ? else keterangan end,
       diubah_oleh = ?,
       diubah_pada = ?
 where santri_id = ?
   and status <> 'sakit'
   and sesi_id in (select id from sesi_pembelajaran where tanggal between ? and ?)`;

/**
 * 3. Presensi gerbang: tiap tanggal × ('masuk','pulang'). Menimpa tanpa syarat (SKEMA §4.4);
 * `kelas_nama` null untuk baris yang lahir dari surat. Tanggal dibangkitkan dengan CTE agar
 * satu surat 30 hari tetap satu pernyataan dan di bawah batas parameter terikat D1.
 */
export const SQL_TERAPKAN_HARIAN = `
with recursive hari(t) as (
  select ? union all select date(t, '+1 day') from hari where t < ?
)
insert into presensi_harian
  (tanggal, santri_id, tipe, lembaga_id, waktu, status, santri_nama, kelas_nama, dicatat_oleh, cara)
select h.t, ?, k.tipe, ?, ?, 'sakit', ?, null, ?, '${CARA_SURAT}'
  from hari h
 cross join (select 'masuk' as tipe union all select 'pulang') k
 where true
on conflict (tanggal, santri_id, tipe) do update set
  status = 'sakit', cara = '${CARA_SURAT}', dicatat_oleh = excluded.dicatat_oleh`;

const DARI_STATUS = `(select r.dari_status from riwayat_presensi r
                       where r.sesi_id = presensi_pembelajaran.sesi_id
                         and r.santri_id = presensi_pembelajaran.santri_id
                         and r.keterangan like ?
                       order by r.id desc limit 1)`;

/**
 * Pembatalan: kembalikan status dari jejak TERBARU surat ini. Baris tanpa jejak (sakit dari
 * sumber lain) tidak tersentuh. `keterangan` hanya dikosongkan bila isinya jejak kita DAN
 * status hasil pemulihan sama dengan `status_awal` (menjaga CHECK).
 */
export const SQL_PULIHKAN_PEMBELAJARAN = `
update presensi_pembelajaran
   set status = coalesce(${DARI_STATUS}, status),
       keterangan = case when keterangan like ?
                          and coalesce(${DARI_STATUS}, status) = status_awal
                         then null else keterangan end,
       diubah_oleh = ?,
       diubah_pada = ?
 where santri_id = ?
   and status = 'sakit'
   and exists (select 1 from riwayat_presensi r
                where r.sesi_id = presensi_pembelajaran.sesi_id
                  and r.santri_id = presensi_pembelajaran.santri_id
                  and r.keterangan like ?)`;

/** Penghapusan SELALU berlingkup `cara`; pindaian sungguhan tidak pernah tersentuh. */
export const SQL_HAPUS_HARIAN = `
delete from presensi_harian
 where santri_id = ?
   and cara = '${CARA_SURAT}'
   and tanggal between ? and ?`;

/* ------------------------------------------------------------- pernyataan */

export interface Penerapan {
	suratId: string;
	santriId: string;
	santriNama: string;
	/** `presensi_harian.lembaga_id` — lembaga pertama santri (surat_sakit tak menyimpannya). */
	lembagaId: string;
	mulai: string;
	sampai: string;
	keterangan: string;
	olehId: string;
	olehNama: string;
	/** Instan UTC ISO penerapan. */
	waktu: string;
}

/** Urutan penting: jejak → menimpa pembelajaran → presensi gerbang. */
export function pernyataanTerapkan(db: D1Database, p: Penerapan): D1PreparedStatement[] {
	const jejak = teksJejak(p.suratId, p.keterangan);
	return [
		db
			.prepare(SQL_JEJAK)
			.bind(jejak, p.olehId, p.olehNama, p.waktu, p.santriId, p.mulai, p.sampai),
		db
			.prepare(SQL_TERAPKAN_PEMBELAJARAN)
			.bind(jejak, p.olehId, p.waktu, p.santriId, p.mulai, p.sampai),
		db
			.prepare(SQL_TERAPKAN_HARIAN)
			.bind(p.mulai, p.sampai, p.santriId, p.lembagaId, p.waktu, p.santriNama, p.olehId),
	];
}

export interface Pemulihan {
	suratId: string;
	santriId: string;
	mulai: string;
	sampai: string;
	olehId: string;
	waktu: string;
}

export function pernyataanPulihkan(db: D1Database, p: Pemulihan): D1PreparedStatement[] {
	const pola = polaJejak(p.suratId);
	return [
		db
			.prepare(SQL_PULIHKAN_PEMBELAJARAN)
			.bind(pola, pola, pola, p.olehId, p.waktu, p.santriId, pola),
		db.prepare(SQL_HAPUS_HARIAN).bind(p.santriId, p.mulai, p.sampai),
	];
}

/**
 * Penulis tunggal `surat_sakit` di aplikasi ini (milik kesehatan, SKEMA.md §4.9).
 * Tabel TIDAK punya lembaga_id; satu-satunya penyaring pemisahan adalah
 * jenis_kelamin yang disalin ke baris saat terbit.
 */
import { pernyataanPulihkan, pernyataanTerapkan } from "./presensi_sakit";

export type Bagian = "laki_laki" | "perempuan";

export interface Surat {
	id: string;
	santri_id: string;
	santri_nama: string;
	mulai: string;
	sampai: string;
	keterangan: string;
	diterbitkan_oleh_nama: string;
	diterbitkan_pada: string;
	dibatalkan_pada: string | null;
}

const KOLOM =
	"id, santri_id, santri_nama, mulai, sampai, keterangan, diterbitkan_oleh_nama, diterbitkan_pada, dibatalkan_pada";

/** Menambah klausa DAN mengikat nilainya sekaligus; panggil sebelum `order by`/`limit`. */
export function terapkanBagian(
	sql: string,
	nilai: unknown[],
	bagian: unknown,
): string {
	if (bagian !== "laki_laki" && bagian !== "perempuan") {
		throw new Error(`Bagian santri tidak sah: ${String(bagian)}`);
	}
	nilai.push(bagian);
	return `${sql} and jenis_kelamin = ?`;
}

/** Surat berlaku hari ini: kedua ujung inklusif, tanggal dibandingkan sebagai teks. */
export async function sakitHariIni(
	db: D1Database,
	bagian: Bagian,
	hariIni: string,
): Promise<Surat[]> {
	const nilai: unknown[] = [hariIni, hariIni];
	const sql =
		terapkanBagian(
			`select ${KOLOM} from surat_sakit where dibatalkan_pada is null and mulai <= ? and ? <= sampai`,
			nilai,
			bagian,
		) + " order by santri_nama, diterbitkan_pada desc";
	const { results } = await db
		.prepare(sql)
		.bind(...nilai)
		.all<Surat>();
	// Satu santri bisa punya beberapa surat berlaku; tampilkan yang terbaru.
	const terlihat = new Set<string>();
	return results.filter((s) => {
		if (terlihat.has(s.santri_id)) return false;
		terlihat.add(s.santri_id);
		return true;
	});
}

export async function hitungDiterbitkan(
	db: D1Database,
	bagian: Bagian,
	awal: string,
	akhir: string,
): Promise<number> {
	const nilai: unknown[] = [awal, akhir];
	const sql = terapkanBagian(
		"select count(*) as n from surat_sakit where diterbitkan_pada >= ? and diterbitkan_pada < ?",
		nilai,
		bagian,
	);
	const baris = await db
		.prepare(sql)
		.bind(...nilai)
		.first<{ n: number }>();
	return baris?.n ?? 0;
}

export type StatusSurat = "berlaku" | "kedaluwarsa" | "dibatalkan";
export interface SuratRiwayat extends Surat {
	status: StatusSurat;
}

function statusDari(s: Surat, hariIni: string): StatusSurat {
	if (s.dibatalkan_pada) return "dibatalkan";
	return s.sampai < hariIni ? "kedaluwarsa" : "berlaku";
}

/** Surat berlaku yang tumpang tindih dengan [mulai, sampai] (kedua ujung inklusif). */
export async function adaTumpangTindih(
	db: D1Database,
	santriId: string,
	mulai: string,
	sampai: string,
): Promise<boolean> {
	const baris = await db
		.prepare(
			"select 1 as ada from surat_sakit where santri_id = ? and dibatalkan_pada is null and mulai <= ? and ? <= sampai limit 1",
		)
		.bind(santriId, sampai, mulai)
		.first();
	return baris !== null;
}

/**
 * Menerbitkan surat DAN menerapkannya ke presensi dalam satu transaksi (`db.batch`):
 * surat → jejak → menimpa pembelajaran → presensi gerbang. Gagal di tengah = tidak ada
 * yang tertulis. Mengembalikan id surat.
 */
export async function terbitkan(
	db: D1Database,
	s: {
		santriId: string;
		santriNama: string;
		jenisKelamin: Bagian;
		/** Lembaga pertama santri, untuk presensi_harian.lembaga_id. */
		lembagaId: string;
		mulai: string;
		sampai: string;
		keterangan: string;
		olehId: string;
		olehNama: string;
	},
): Promise<string> {
	const id = crypto.randomUUID();
	const waktu = new Date().toISOString();
	const pernyataanSurat = db
		.prepare(
			`insert into surat_sakit (id, santri_id, santri_nama, jenis_kelamin, mulai, sampai, keterangan,
			   diterbitkan_oleh, diterbitkan_oleh_nama, diterbitkan_pada)
			 values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			id,
			s.santriId,
			s.santriNama,
			s.jenisKelamin,
			s.mulai,
			s.sampai,
			s.keterangan,
			s.olehId,
			s.olehNama,
			waktu,
		);
	await db.batch([
		pernyataanSurat,
		...pernyataanTerapkan(db, {
			suratId: id,
			santriId: s.santriId,
			santriNama: s.santriNama,
			lembagaId: s.lembagaId,
			mulai: s.mulai,
			sampai: s.sampai,
			keterangan: s.keterangan,
			olehId: s.olehId,
			olehNama: s.olehNama,
			waktu,
		}),
	]);
	return id;
}

export const KEJADIAN_PER_HALAMAN = 5;

export interface KejadianSakit extends Surat {
	/** Jumlah hari sakit, kedua ujung termasuk. */
	hari: number;
	status: Exclude<StatusSurat, "dibatalkan">;
}

export interface RingkasanSantri {
	/** Jumlah kejadian sakit = surat yang tidak dibatalkan. */
	kali: number;
	totalHari: number;
	terakhir: string | null;
	/** Surat dibatalkan: tidak dihitung sebagai sakit, hanya dicatat jumlahnya. */
	dibatalkan: number;
}

/**
 * Riwayat sakit satu santri berdasar `santri_id` (bukan nama beku, supaya dua santri
 * senama tidak tercampur). Satu surat tidak dibatalkan = satu kejadian sakit.
 * Santri milik bagian seberang tidak menghasilkan baris, jadi keberadaannya tak bocor.
 */
export async function riwayatSantri(
	db: D1Database,
	santriId: string,
	bagian: Bagian,
	hal: number,
	hariIni: string,
): Promise<{ ringkasan: RingkasanSantri; data: KejadianSakit[]; adaBerikut: boolean }> {
	const nilaiR: unknown[] = [santriId];
	const sqlR = terapkanBagian(
		`select count(*) as kali,
		        coalesce(sum(julianday(sampai) - julianday(mulai) + 1), 0) as total_hari,
		        max(mulai) as terakhir
		   from surat_sakit where santri_id = ? and dibatalkan_pada is null`,
		nilaiR,
		bagian,
	);
	const nilaiB: unknown[] = [santriId];
	const sqlB = terapkanBagian(
		"select count(*) as n from surat_sakit where santri_id = ? and dibatalkan_pada is not null",
		nilaiB,
		bagian,
	);
	const nilaiD: unknown[] = [santriId];
	const sqlD =
		terapkanBagian(
			`select ${KOLOM} from surat_sakit where santri_id = ? and dibatalkan_pada is null`,
			nilaiD,
			bagian,
		) + " order by mulai desc, diterbitkan_pada desc, id limit ? offset ?";
	nilaiD.push(KEJADIAN_PER_HALAMAN + 1, (hal - 1) * KEJADIAN_PER_HALAMAN);

	const [r, b, d] = await Promise.all([
		db
			.prepare(sqlR)
			.bind(...nilaiR)
			.first<{ kali: number; total_hari: number; terakhir: string | null }>(),
		db
			.prepare(sqlB)
			.bind(...nilaiB)
			.first<{ n: number }>(),
		db
			.prepare(sqlD)
			.bind(...nilaiD)
			.all<Surat>(),
	]);

	return {
		ringkasan: {
			kali: r?.kali ?? 0,
			totalHari: Math.round(r?.total_hari ?? 0),
			terakhir: r?.terakhir ?? null,
			dibatalkan: b?.n ?? 0,
		},
		data: d.results.slice(0, KEJADIAN_PER_HALAMAN).map((s) => ({
			...s,
			hari: Math.round((Date.parse(s.sampai) - Date.parse(s.mulai)) / 86_400_000) + 1,
			status: s.sampai < hariIni ? "kedaluwarsa" : "berlaku",
		})),
		adaBerikut: d.results.length > KEJADIAN_PER_HALAMAN,
	};
}

/**
 * Satu surat untuk dicetak. Null = tidak ada, atau milik bagian seberang (dirahasiakan).
 * Surat yang kedaluwarsa tetap boleh dicetak ulang; yang dibatalkan tidak (SKEMA §4.9).
 */
export async function ambilSurat(
	db: D1Database,
	id: string,
	bagian: Bagian,
	hariIni: string,
): Promise<SuratRiwayat | null> {
	const nilai: unknown[] = [id];
	const sql = terapkanBagian(
		`select ${KOLOM} from surat_sakit where id = ?`,
		nilai,
		bagian,
	);
	const s = await db
		.prepare(sql)
		.bind(...nilai)
		.first<Surat>();
	return s ? { ...s, status: statusDari(s, hariIni) } : null;
}

/** "tidak_ada" juga berarti baris milik bagian seberang (keberadaannya dirahasiakan). */
export async function batalkan(
	db: D1Database,
	id: string,
	bagian: Bagian,
	olehId: string,
): Promise<"dibatalkan" | "tidak_ada" | "sudah_batal"> {
	const cek: unknown[] = [id];
	const sqlCek = terapkanBagian(
		"select santri_id, mulai, sampai, dibatalkan_pada from surat_sakit where id = ?",
		cek,
		bagian,
	);
	const baris = await db
		.prepare(sqlCek)
		.bind(...cek)
		.first<{
			santri_id: string;
			mulai: string;
			sampai: string;
			dibatalkan_pada: string | null;
		}>();
	if (!baris) return "tidak_ada";
	if (baris.dibatalkan_pada) return "sudah_batal";

	const waktu = new Date().toISOString();
	const nilai: unknown[] = [waktu, olehId, id];
	const sql = terapkanBagian(
		"update surat_sakit set dibatalkan_pada = ?, dibatalkan_oleh = ? where id = ? and dibatalkan_pada is null",
		nilai,
		bagian,
	);
	// Satu transaksi: pulihkan presensi dari jejak, hapus baris cara = surat, tandai surat.
	// Surat TIDAK dihapus (dibatalkan, bukan dihapus) dan tidak ada jejak baru yang ditulis.
	const hasil = await db.batch([
		...pernyataanPulihkan(db, {
			suratId: id,
			santriId: baris.santri_id,
			mulai: baris.mulai,
			sampai: baris.sampai,
			olehId,
			waktu,
		}),
		db.prepare(sql).bind(...nilai),
	]);
	const { meta } = hasil[hasil.length - 1];
	return meta.changes > 0 ? "dibatalkan" : "sudah_batal";
}

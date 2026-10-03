import { Hono } from "hono";
import { bacaJson } from "./keamanan";
import { lembagaUntukPresensi } from "./presensi_sakit";
import { wajibLogin, wajibPeranAktif, type AppEnv } from "./sesi";
import {
	adaTumpangTindih,
	ambilSurat,
	batalkan,
	hitungDiterbitkan,
	riwayatSantri,
	sakitHariIni,
	terbitkan,
} from "./surat_sakit";
import {
	ambilSantri,
	bersihkanCari,
	cariSantri,
	hitungSantri,
	muatOpsiFilter,
} from "./supabase";
import {
	adalahTanggal,
	awalHariUtc,
	geserHari,
	selisihHari,
	tanggalSetempat,
} from "./waktu";

const POLA_UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KETERANGAN_MAKS = 160;
const RENTANG_MAKS_HARI = 30;

export const rutKesehatan = new Hono<AppEnv>();
rutKesehatan.use("*", wajibLogin, wajibPeranAktif);

/** Bagian selalu dari peran aktif yang sudah diverifikasi, tidak pernah dari permintaan. */
function bagianDari(c: { get: (k: "peranAktif") => { bagian: "laki_laki" | "perempuan" } | null }) {
	const peran = c.get("peranAktif");
	if (!peran) throw new Error("peranAktif kosong setelah wajibPeranAktif");
	return peran.bagian;
}

rutKesehatan.get("/dashboard", async (c) => {
	const bagian = bagianDari(c);
	const hariIni = tanggalSetempat();
	const [sakit, diterbitkan, totalSantri] = await Promise.all([
		sakitHariIni(c.env.DB, bagian, hariIni),
		hitungDiterbitkan(
			c.env.DB,
			bagian,
			awalHariUtc(hariIni),
			awalHariUtc(geserHari(hariIni, 1)),
		),
		hitungSantri(c.env, c.get("token"), bagian),
	]);
	return c.json({
		sakitHariIni: sakit.length,
		diterbitkanHariIni: diterbitkan,
		totalSantri,
	});
});

rutKesehatan.get("/sakit", async (c) => {
	const hariIni = tanggalSetempat();
	const data = await sakitHariIni(c.env.DB, bagianDari(c), hariIni);
	return c.json({ hariIni, data });
});

const HALAMAN_MAKS = 200;

rutKesehatan.get("/filter", async (c) => {
	const data = await muatOpsiFilter(c.env, c.get("token"));
	if (!data) {
		return c.json({ galat: "layanan", pesan: "Daftar lembaga belum dapat dimuat." }, 503);
	}
	return c.json(data);
});

/** Pencarian dipicu tombol Cari: minimal nama (2+ huruf), lembaga, atau kelas. Maksimal 5 hasil. */
/** Riwayat sakit satu santri: berapa kali, kapan, dan keterangannya (5 per halaman). */
rutKesehatan.get("/riwayat-santri", async (c) => {
	const santri = c.req.query("santri") ?? "";
	const hal = c.req.query("hal") ? Number(c.req.query("hal")) : 1;
	if (!POLA_UUID.test(santri)) {
		return c.json({ galat: "tidak_sah", pesan: "Pilih santri terlebih dahulu." }, 400);
	}
	if (!Number.isInteger(hal) || hal < 1 || hal > HALAMAN_MAKS) {
		return c.json({ galat: "tidak_sah", pesan: "Halaman tidak sah." }, 400);
	}
	const hasil = await riwayatSantri(
		c.env.DB,
		santri,
		bagianDari(c),
		hal,
		tanggalSetempat(),
	);
	return c.json({ ...hasil, hal });
});

/** Data satu surat untuk lembar cetak. Surat dibatalkan tidak boleh dicetak (409). */
rutKesehatan.get("/surat/:id/cetak", async (c) => {
	const id = c.req.param("id");
	const tidakAda = () =>
		c.json({ galat: "tidak_ada", pesan: "Surat tidak ditemukan." }, 404);
	if (!POLA_UUID.test(id)) return tidakAda();
	const surat = await ambilSurat(c.env.DB, id, bagianDari(c), tanggalSetempat());
	if (!surat) return tidakAda();
	if (surat.status === "dibatalkan") {
		return c.json(
			{ galat: "dibatalkan", pesan: "Surat ini sudah dibatalkan dan tidak dapat dicetak." },
			409,
		);
	}
	return c.json({ surat, peran: c.get("peranAktif")?.nama ?? "" });
});

rutKesehatan.get("/santri", async (c) => {
	const nama = bersihkanCari(c.req.query("nama") ?? "");
	const lembaga = c.req.query("lembaga") || null;
	const kelas = c.req.query("kelas") || null;
	if (
		nama.length > 50 ||
		(lembaga && !POLA_UUID.test(lembaga)) ||
		(kelas && !POLA_UUID.test(kelas))
	) {
		return c.json({ galat: "tidak_sah", pesan: "Pencarian tidak sah." }, 400);
	}
	if (nama.length < 2 && !lembaga && !kelas) {
		return c.json(
			{ galat: "tidak_sah", pesan: "Isi nama (minimal 2 huruf), atau pilih lembaga/kelas." },
			400,
		);
	}
	const data = await cariSantri(c.env, c.get("token"), bagianDari(c), {
		nama: nama.length >= 2 ? nama : "",
		lembagaId: lembaga,
		kelasId: kelas,
	});
	if (!data) {
		return c.json({ galat: "layanan", pesan: "Data santri belum dapat dimuat." }, 503);
	}
	return c.json({ data });
});

rutKesehatan.post("/surat", async (c) => {
	const bagian = bagianDari(c);
	const b = await bacaJson(c.req.raw);
	const tidakSah = (pesan: string) =>
		c.json({ galat: "tidak_sah", pesan }, 400);

	const santriId = typeof b?.santri_id === "string" ? b.santri_id : "";
	if (!POLA_UUID.test(santriId)) return tidakSah("Pilih santri terlebih dahulu.");

	const hariIni = tanggalSetempat();
	const mulai = b?.mulai === undefined || b.mulai === "" ? hariIni : b.mulai;
	const sampai = b?.sampai;
	if (!adalahTanggal(mulai) || !adalahTanggal(sampai)) {
		return tidakSah("Tanggal mulai dan sampai tidak sah.");
	}
	if (sampai < mulai) return tidakSah("Tanggal sampai tidak boleh sebelum tanggal mulai.");
	if (selisihHari(mulai, sampai) + 1 > RENTANG_MAKS_HARI) {
		return tidakSah(`Masa sakit maksimal ${RENTANG_MAKS_HARI} hari.`);
	}
	const keterangan = typeof b?.keterangan === "string" ? b.keterangan.trim() : "";
	if (!keterangan) return tidakSah("Keterangan wajib diisi.");
	if ([...keterangan].length > KETERANGAN_MAKS) {
		return tidakSah(`Keterangan maksimal ${KETERANGAN_MAKS} huruf.`);
	}

	const santri = await ambilSantri(c.env, c.get("token"), santriId);
	if (santri === undefined) {
		return c.json({ galat: "layanan", pesan: "Data santri belum dapat dimuat." }, 503);
	}
	if (santri === null) {
		return c.json({ galat: "tidak_ada", pesan: "Santri tidak ditemukan." }, 404);
	}
	if (!santri.jenis_kelamin) {
		return tidakSah(
			`Jenis kelamin ${santri.nama_lengkap} belum diisi. Lengkapi dahulu di data induk.`,
		);
	}
	if (santri.jenis_kelamin !== bagian) {
		return c.json(
			{
				galat: "bagian_seberang",
				pesan: `${santri.nama_lengkap} bukan santri ${bagian === "laki_laki" ? "putra" : "putri"}, tidak dapat diterbitkan dari peran ini.`,
			},
			403,
		);
	}
	// presensi_harian.lembaga_id wajib terisi; tidak menebak dan tidak memakai "semua".
	const lembagaId = lembagaUntukPresensi(santri.santri_lembaga);
	if (!lembagaId) {
		return tidakSah(
			`${santri.nama_lengkap} belum terdaftar di lembaga mana pun. Lengkapi dahulu di data induk.`,
		);
	}
	if (await adaTumpangTindih(c.env.DB, santri.id, mulai, sampai)) {
		return c.json(
			{
				galat: "tumpang_tindih",
				pesan: `${santri.nama_lengkap} sudah memiliki surat sakit yang berlaku pada rentang tersebut.`,
			},
			409,
		);
	}

	const { profil } = c.get("akun");
	const id = await terbitkan(c.env.DB, {
		santriId: santri.id,
		santriNama: santri.nama_lengkap,
		jenisKelamin: santri.jenis_kelamin,
		lembagaId,
		mulai,
		sampai,
		keterangan,
		olehId: profil.id,
		olehNama: profil.nama_lengkap,
	});
	return c.json({ id }, 201);
});

rutKesehatan.post("/surat/:id/batal", async (c) => {
	const id = c.req.param("id");
	if (!POLA_UUID.test(id)) {
		return c.json({ galat: "tidak_ada", pesan: "Surat tidak ditemukan." }, 404);
	}
	const hasil = await batalkan(
		c.env.DB,
		id,
		bagianDari(c),
		c.get("akun").profil.id,
	);
	if (hasil === "tidak_ada") {
		return c.json({ galat: "tidak_ada", pesan: "Surat tidak ditemukan." }, 404);
	}
	if (hasil === "sudah_batal") {
		return c.json({ galat: "sudah_batal", pesan: "Surat ini sudah dibatalkan." }, 409);
	}
	return c.json({ ok: true });
});

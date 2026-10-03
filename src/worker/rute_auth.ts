import { Hono } from "hono";
import {
	bacaSesi,
	hapusPeran,
	hapusSemua,
	tulisPeran,
	tulisSesi,
} from "./cookies";
import { bacaJson } from "./keamanan";
import { adalahKodePeran } from "./peran";
import { wajibLogin, type AppEnv } from "./sesi";
import { GALAT_LAYANAN, keluar, masuk, muatAkun } from "./supabase";

const POLA_USERNAME = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const SANDI_MAKS = 128;

/** Satu pesan untuk username salah, sandi salah, dan akun nonaktif: tidak membocorkan akun mana yang ada. */
const SALAH_KREDENSIAL = "Username atau kata sandi salah.";

export const rutAuth = new Hono<AppEnv>();

rutAuth.post("/login", async (c) => {
	const b = await bacaJson(c.req.raw);
	const username =
		typeof b?.username === "string" ? b.username.trim().toLowerCase() : "";
	const password = typeof b?.password === "string" ? b.password : "";

	if (!POLA_USERNAME.test(username) || !password || password.length > SANDI_MAKS) {
		// Bentuk tidak sah dijawab sama dengan kredensial salah.
		return c.json({ galat: "kredensial", pesan: SALAH_KREDENSIAL }, 401);
	}

	const ip = c.req.header("CF-Connecting-IP") ?? "tak-dikenal";
	const [perIp, perAkun] = await Promise.all([
		c.env.BATAS_LOGIN_IP?.limit({ key: ip }),
		c.env.BATAS_LOGIN_AKUN?.limit({ key: `${ip}:${username}` }),
	]);
	if (perIp?.success === false || perAkun?.success === false) {
		c.header("Retry-After", "60");
		return c.json(
			{
				galat: "dibatasi",
				pesan: "Terlalu banyak percobaan masuk. Coba lagi dalam satu menit.",
			},
			429,
		);
	}

	const hasil = await masuk(c.env, username, password);
	if (!hasil.ok) {
		if (hasil.sebab === "kredensial") {
			return c.json({ galat: "kredensial", pesan: SALAH_KREDENSIAL }, 401);
		}
		if (hasil.sebab === "dibatasi") {
			c.header("Retry-After", "60");
			return c.json(
				{
					galat: "dibatasi",
					pesan: "Terlalu banyak percobaan masuk. Coba lagi beberapa saat lagi.",
				},
				429,
			);
		}
		return c.json(
			{
				galat: "layanan",
				pesan: "Layanan masuk sedang tidak dapat dihubungi. Coba lagi nanti.",
			},
			503,
		);
	}

	const { sesi } = hasil;
	const akun = await muatAkun(c.env, sesi.access_token, sesi.user.id);

	// Gangguan sementara saat membaca profil: bukan salah pengguna. Cabut sesi yang baru
	// dibuat (belum dipakai) dan minta mencoba lagi.
	if (akun === GALAT_LAYANAN) {
		await keluar(c.env, sesi.access_token);
		return c.json(
			{
				galat: "layanan",
				pesan: "Layanan masuk sedang tidak dapat dihubungi. Coba lagi nanti.",
			},
			503,
		);
	}
	// Akun nonaktif atau profil tak terbaca: jawab seperti kredensial salah dan cabut sesinya.
	if (!akun) {
		await keluar(c.env, sesi.access_token);
		return c.json({ galat: "kredensial", pesan: SALAH_KREDENSIAL }, 401);
	}
	// Kredensial sah, tetapi tidak punya peran yang diizinkan di aplikasi ini.
	if (akun.peran.length === 0) {
		await keluar(c.env, sesi.access_token);
		return c.json(
			{
				galat: "tanpa_akses",
				pesan:
					"Akun Anda tidak memiliki peran untuk aplikasi kesehatan ini. Hubungi admin.",
			},
			403,
		);
	}

	tulisSesi(c, sesi);
	// Peran dipilih ulang tiap login; cookie peran lama tidak boleh terbawa.
	hapusPeran(c);
	return c.json({ profil: akun.profil, peran: akun.peran, peranAktif: null });
});

rutAuth.post("/logout", async (c) => {
	const { at } = bacaSesi(c);
	if (at) await keluar(c.env, at);
	hapusSemua(c);
	return c.json({ ok: true });
});

rutAuth.get("/me", wajibLogin, (c) => {
	const { profil, peran } = c.get("akun");
	return c.json({ profil, peran, peranAktif: c.get("peranAktif") });
});

rutAuth.post("/peran", wajibLogin, async (c) => {
	const b = await bacaJson(c.req.raw, 256);
	const kode = b?.kode;
	const { akun } = { akun: c.get("akun") };
	if (!adalahKodePeran(kode) || !akun.peran.some((p) => p.kode === kode)) {
		return c.json({ galat: "peran_tidak_sah" }, 403);
	}
	await tulisPeran(c, akun.profil.id, kode);
	return c.json({
		peranAktif: akun.peran.find((p) => p.kode === kode),
	});
});

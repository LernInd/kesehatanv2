import type { Context, MiddlewareHandler } from "hono";
import {
	bacaPeran,
	bacaSesi,
	hapusSemua,
	tulisSesi,
} from "./cookies";
import { keRincianPeran, type Peran } from "./peran";
import {
	GALAT_LAYANAN,
	idPengguna,
	muatAkun,
	segarkan,
	type Akun,
} from "./supabase";

export interface Variabel {
	token: string;
	akun: Akun;
	/** Peran aktif, sudah diverifikasi ulang terhadap user_roles. Null sebelum memilih. */
	peranAktif: Peran | null;
}

export type AppEnv = { Bindings: Env; Variables: Variabel };
export type Konteks = Context<AppEnv>;

const PESAN_LAYANAN = "Layanan sedang terganggu. Coba lagi sebentar lagi.";

/** Gangguan sementara: jawab 503 TANPA menyentuh cookie, supaya sesi yang sah tidak hilang. */
function layananTerganggu(c: Konteks) {
	return c.json({ galat: "layanan", pesan: PESAN_LAYANAN }, 503);
}

/**
 * Memulihkan sesi dari cookie. Semua kewenangan diturunkan dari database pada
 * tiap permintaan: token divalidasi ke GoTrue, peran dibaca ulang lewat RLS.
 * Cookie hanya pembawa identitas, bukan sumber kebenaran.
 *
 * Cookie hanya dihapus bila sesi TERBUKTI tidak sah (token/refresh ditolak, akun nonaktif,
 * peran dicabut). Galat jaringan, timeout, atau 5xx dari Supabase menghasilkan 503 dan
 * sesi dibiarkan utuh.
 */
export const wajibLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
	const { rt, at: atAwal } = bacaSesi(c);
	let at = atAwal;
	let userId: string | null = null;

	if (at) {
		const r = await idPengguna(c.env, at);
		if (r === GALAT_LAYANAN) return layananTerganggu(c);
		userId = r;
	}

	if (!userId && rt) {
		const baru = await segarkan(c.env, rt);
		if (baru === GALAT_LAYANAN) return layananTerganggu(c);
		if (baru) {
			tulisSesi(c, baru);
			at = baru.access_token;
			userId = baru.user.id;
		}
	}

	if (!at || !userId) {
		hapusSemua(c);
		return c.json({ galat: "tidak_login" }, 401);
	}

	const akun = await muatAkun(c.env, at, userId);
	if (akun === GALAT_LAYANAN) return layananTerganggu(c);
	if (!akun || akun.peran.length === 0) {
		hapusSemua(c);
		return c.json({ galat: "tidak_login" }, 401);
	}

	c.set("token", at);
	c.set("akun", akun);

	const kode = await bacaPeran(c, userId);
	// Peran di cookie masih harus dimiliki pengguna sekarang.
	const peranAktif = kode ? akun.peran.find((p) => p.kode === kode) : undefined;
	c.set("peranAktif", peranAktif ? keRincianPeran(peranAktif.kode) : null);
	await next();
};

export const wajibPeranAktif: MiddlewareHandler<AppEnv> = async (c, next) => {
	if (!c.get("peranAktif")) return c.json({ galat: "belum_pilih_peran" }, 403);
	await next();
};

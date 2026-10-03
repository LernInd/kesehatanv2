import { adalahKodePeran, keRincianPeran, type Peran } from "./peran";
import type { LembagaSantri } from "./presensi_sakit";

/** Sesi GoTrue. Hanya hidup di dalam Worker; tidak pernah dikirim ke peramban. */
export interface SesiSupabase {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	user: { id: string };
}

export interface Profil {
	id: string;
	username: string;
	nama_lengkap: string;
	foto_path: string | null;
	is_active: boolean;
}

export interface Akun {
	profil: Profil;
	/** Hanya peran yang ada di allowlist aplikasi ini. */
	peran: Peran[];
}

export type HasilMasuk =
	| { ok: true; sesi: SesiSupabase }
	/** `kredensial` = username/sandi salah; `layanan` = Supabase tak terjangkau atau galat. */
	| { ok: false; sebab: "kredensial" | "dibatasi" | "layanan" };

const BATAS_WAKTU_MS = 8000;

/**
 * Galat sementara (jaringan, timeout, 5xx, 429). Ini BUKAN bukti bahwa sesi tidak sah,
 * jadi pemanggil tidak boleh menghapus cookie sesi — cukup jawab 503 supaya klien mencoba lagi.
 */
export const GALAT_LAYANAN = "layanan" as const;
export type GalatLayanan = typeof GALAT_LAYANAN;

function sementara(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

function tajuk(env: Env, token?: string): HeadersInit {
	return {
		apikey: env.SUPABASE_ANON_KEY,
		Authorization: `Bearer ${token ?? env.SUPABASE_ANON_KEY}`,
		"Content-Type": "application/json",
	};
}

function panggil(url: string, init: RequestInit): Promise<Response> {
	return fetch(url, { ...init, signal: AbortSignal.timeout(BATAS_WAKTU_MS) });
}

/** Cocok dengan public.username_to_email di activity-db. */
export function usernameKeEmail(username: string): string {
	return `${username.trim().toLowerCase()}@admin-kegiatan.internal`;
}

export async function masuk(
	env: Env,
	username: string,
	password: string,
): Promise<HasilMasuk> {
	try {
		const res = await panggil(
			`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
			{
				method: "POST",
				headers: tajuk(env),
				body: JSON.stringify({
					email: usernameKeEmail(username),
					password,
				}),
			},
		);
		if (res.ok) return { ok: true, sesi: (await res.json()) as SesiSupabase };
		if (res.status === 429) return { ok: false, sebab: "dibatasi" };
		if (res.status === 400 || res.status === 401 || res.status === 422) {
			return { ok: false, sebab: "kredensial" };
		}
		return { ok: false, sebab: "layanan" };
	} catch {
		return { ok: false, sebab: "layanan" };
	}
}

export async function segarkan(
	env: Env,
	refreshToken: string,
): Promise<SesiSupabase | null | GalatLayanan> {
	try {
		const res = await panggil(
			`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
			{
				method: "POST",
				headers: tajuk(env),
				body: JSON.stringify({ refresh_token: refreshToken }),
			},
		);
		if (res.ok) return (await res.json()) as SesiSupabase;
		return sementara(res.status) ? GALAT_LAYANAN : null;
	} catch {
		return GALAT_LAYANAN;
	}
}

/** Memvalidasi token ke GoTrue sehingga sesi yang sudah dicabut langsung gagal. */
export async function idPengguna(
	env: Env,
	accessToken: string,
): Promise<string | null | GalatLayanan> {
	try {
		const res = await panggil(`${env.SUPABASE_URL}/auth/v1/user`, {
			headers: tajuk(env, accessToken),
		});
		if (!res.ok) return sementara(res.status) ? GALAT_LAYANAN : null;
		const { id } = (await res.json()) as { id?: unknown };
		return typeof id === "string" ? id : null;
	} catch {
		return GALAT_LAYANAN;
	}
}

export async function keluar(env: Env, accessToken: string): Promise<void> {
	try {
		await panggil(`${env.SUPABASE_URL}/auth/v1/logout`, {
			method: "POST",
			headers: tajuk(env, accessToken),
		});
	} catch {
		// Cookie tetap dihapus; token akan kedaluwarsa sendiri.
	}
}

interface BarisProfil extends Profil {
	user_roles: { roles: { code: string } | null }[];
}

/**
 * Satu kueri PostgREST dengan token pengguna; RLS yang memutuskan.
 * Null = profil tak terbaca/token tak sah atau akun nonaktif.
 * GALAT_LAYANAN = gangguan sementara (bukan alasan untuk mengeluarkan pengguna).
 */
export async function muatAkun(
	env: Env,
	accessToken: string,
	userId: string,
): Promise<Akun | null | GalatLayanan> {
	try {
		const query = new URLSearchParams({
			select:
				"id,username,nama_lengkap,foto_path,is_active,user_roles!user_roles_user_id_fkey(roles(code))",
			id: `eq.${userId}`,
		});
		const res = await panggil(`${env.SUPABASE_URL}/rest/v1/profiles?${query}`, {
			headers: tajuk(env, accessToken),
		});
		if (!res.ok) return sementara(res.status) ? GALAT_LAYANAN : null;
		const baris = (await res.json()) as BarisProfil[];
		const b = baris[0];
		if (!b || b.is_active !== true) return null;

		const peran: Peran[] = [];
		for (const ur of b.user_roles ?? []) {
			const kode = ur.roles?.code;
			if (adalahKodePeran(kode)) peran.push(keRincianPeran(kode));
		}
		const profil: Profil = {
			id: b.id,
			username: b.username,
			nama_lengkap: b.nama_lengkap,
			foto_path: b.foto_path,
			is_active: b.is_active,
		};
		return { profil, peran };
	} catch {
		return GALAT_LAYANAN;
	}
}

export interface Santri {
	id: string;
	nama_lengkap: string;
	jenis_kelamin: "laki_laki" | "perempuan" | null;
	/** Hanya terisi oleh ambilSantri(); dipakai memilih lembaga untuk presensi_harian. */
	santri_lembaga?: LembagaSantri[];
}

/** Buang karakter yang bermakna di filter PostgREST atau pola ilike. */
export function bersihkanCari(q: string): string {
	return q.replace(/[*,()\\%_:.]/g, " ").replace(/\s+/g, " ").trim();
}

export interface HasilSantri {
	id: string;
	nama_lengkap: string;
	foto_url: string | null;
	lembaga: { id: string; nama: string; kelas: string | null }[];
}

interface BarisSantri {
	id: string;
	nama_lengkap: string;
	foto_path: string | null;
	santri_lembaga: {
		lembaga_id: string;
		lembaga: { nama: string } | null;
		santri_kelas:
			| { kelas: { nama: string } | null }
			| { kelas: { nama: string } | null }[]
			| null;
	}[];
}

const BUCKET_FOTO_SANTRI = "foto-santri";
const BATAS_HASIL = 5;

export interface FilterSantri {
	nama: string;
	lembagaId: string | null;
	kelasId: string | null;
}

/**
 * Pencarian santri satu bagian lewat token pengguna (RLS tetap berlaku), maksimal 5 hasil
 * terurut nama. Dua langkah supaya filter lembaga/kelas tidak mempersempit daftar
 * "lembaga naungan" yang ditampilkan: (1) cari id yang cocok, (2) muat rincian lengkapnya.
 * Null bila galat.
 */
export async function cariSantri(
	env: Env,
	accessToken: string,
	bagian: string,
	f: FilterSantri,
): Promise<HasilSantri[] | null> {
	try {
		const tahap1 = new URLSearchParams({
			select: f.kelasId
				? "id,santri_lembaga!inner(santri_kelas!inner(kelas_id))"
				: f.lembagaId
					? "id,santri_lembaga!inner(lembaga_id)"
					: "id",
			jenis_kelamin: `eq.${bagian}`,
			order: "nama_lengkap.asc",
			limit: String(BATAS_HASIL),
		});
		if (f.nama) tahap1.set("nama_lengkap", `ilike.*${f.nama}*`);
		if (f.lembagaId) tahap1.set("santri_lembaga.lembaga_id", `eq.${f.lembagaId}`);
		if (f.kelasId) tahap1.set("santri_lembaga.santri_kelas.kelas_id", `eq.${f.kelasId}`);

		const r1 = await panggil(`${env.SUPABASE_URL}/rest/v1/santri?${tahap1}`, {
			headers: tajuk(env, accessToken),
		});
		if (!r1.ok) return null;
		const ids = ((await r1.json()) as { id: string }[]).map((x) => x.id);
		if (ids.length === 0) return [];

		const tahap2 = new URLSearchParams({
			select:
				"id,nama_lengkap,foto_path,santri_lembaga(lembaga_id,lembaga(nama),santri_kelas(kelas(nama)))",
			id: `in.(${ids.join(",")})`,
			order: "nama_lengkap.asc",
		});
		const r2 = await panggil(`${env.SUPABASE_URL}/rest/v1/santri?${tahap2}`, {
			headers: tajuk(env, accessToken),
		});
		if (!r2.ok) return null;
		return ((await r2.json()) as BarisSantri[]).map((b) => ({
			id: b.id,
			nama_lengkap: b.nama_lengkap,
			foto_url: b.foto_path
				? `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTO_SANTRI}/${b.foto_path
						.split("/")
						.map(encodeURIComponent)
						.join("/")}`
				: null,
			lembaga: (b.santri_lembaga ?? []).map((sl) => {
				const k = Array.isArray(sl.santri_kelas) ? sl.santri_kelas[0] : sl.santri_kelas;
				return {
					id: sl.lembaga_id,
					nama: sl.lembaga?.nama ?? "-",
					kelas: k?.kelas?.nama ?? null,
				};
			}),
		}));
	} catch {
		return null;
	}
}

export interface OpsiFilter {
	lembaga: { id: string; nama: string }[];
	kelas: { id: string; nama: string; lembaga_id: string }[];
}

export async function muatOpsiFilter(
	env: Env,
	accessToken: string,
): Promise<OpsiFilter | null> {
	try {
		const [a, b] = await Promise.all([
			panggil(`${env.SUPABASE_URL}/rest/v1/lembaga?select=id,nama&order=nama.asc`, {
				headers: tajuk(env, accessToken),
			}),
			panggil(
				`${env.SUPABASE_URL}/rest/v1/kelas?select=id,nama,lembaga_id&order=nama.asc`,
				{ headers: tajuk(env, accessToken) },
			),
		]);
		if (!a.ok || !b.ok) return null;
		return {
			lembaga: (await a.json()) as OpsiFilter["lembaga"],
			kelas: (await b.json()) as OpsiFilter["kelas"],
		};
	} catch {
		return null;
	}
}

/** `undefined` = galat jaringan/server; `null` = santri tidak ada. */
export async function ambilSantri(
	env: Env,
	accessToken: string,
	id: string,
): Promise<Santri | null | undefined> {
	try {
		const query = new URLSearchParams({
			select:
				"id,nama_lengkap,jenis_kelamin,santri_lembaga(lembaga_id,created_at,santri_kelas(kelas_id))",
			id: `eq.${id}`,
		});
		const res = await panggil(`${env.SUPABASE_URL}/rest/v1/santri?${query}`, {
			headers: tajuk(env, accessToken),
		});
		if (!res.ok) return undefined;
		return ((await res.json()) as Santri[])[0] ?? null;
	} catch {
		return undefined;
	}
}

export async function hitungSantri(
	env: Env,
	accessToken: string,
	bagian: string,
): Promise<number | null> {
	try {
		const query = new URLSearchParams({ select: "id", jenis_kelamin: `eq.${bagian}` });
		const res = await panggil(`${env.SUPABASE_URL}/rest/v1/santri?${query}`, {
			method: "HEAD",
			headers: { ...tajuk(env, accessToken), Prefer: "count=exact" },
		});
		const rentang = res.headers.get("content-range"); // "0-9/451" atau "*/0"
		const total = rentang?.split("/")[1];
		return res.ok && total && /^\d+$/.test(total) ? Number(total) : null;
	} catch {
		return null;
	}
}

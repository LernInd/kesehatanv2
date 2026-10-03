import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { adalahKodePeran, type KodePeran } from "./peran";
import type { Konteks } from "./sesi";
import type { SesiSupabase } from "./supabase";

/**
 * Prefiks `__Host-` memaksa Secure, Path=/ dan tanpa Domain, sehingga cookie
 * tidak bisa ditimpa dari subdomain lain.
 */
const AT = "__Host-at";
const RT = "__Host-rt";
const PERAN = "__Host-peran";

/** Masa hidup refresh token di peramban: 8 jam sejak aktivitas terakhir. */
const UMUR_REFRESH_DETIK = 8 * 60 * 60;
const UMUR_PERAN_DETIK = 8 * 60 * 60;

const dasar = {
	httpOnly: true,
	secure: true,
	sameSite: "Strict",
	path: "/",
} as const;

export function tulisSesi(c: Konteks, sesi: SesiSupabase): void {
	setCookie(c, AT, sesi.access_token, {
		...dasar,
		maxAge: Math.max(1, Math.min(sesi.expires_in, 3600)),
	});
	setCookie(c, RT, sesi.refresh_token, {
		...dasar,
		maxAge: UMUR_REFRESH_DETIK,
	});
}

export function bacaSesi(c: Konteks): { at?: string; rt?: string } {
	return { at: getCookie(c, AT), rt: getCookie(c, RT) };
}

export function hapusSemua(c: Konteks): void {
	for (const nama of [AT, RT, PERAN]) {
		deleteCookie(c, nama, { path: "/", secure: true });
	}
}

export function hapusPeran(c: Konteks): void {
	deleteCookie(c, PERAN, { path: "/", secure: true });
}

/* ---- peran aktif: ditandatangani HMAC, terikat ke id pengguna ---- */

const enc = new TextEncoder();

async function kunci(env: Env): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		enc.encode(env.SESSION_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

function keHex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function dariHex(hex: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[0-9a-f]{64}$/.test(hex)) return null;
	const out = new Uint8Array(32);
	for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

export async function tulisPeran(
	c: Konteks,
	userId: string,
	kode: KodePeran,
): Promise<void> {
	const kedaluwarsa = Math.floor(Date.now() / 1000) + UMUR_PERAN_DETIK;
	const isi = `${userId}.${kode}.${kedaluwarsa}`;
	const sig = keHex(
		await crypto.subtle.sign("HMAC", await kunci(c.env), enc.encode(isi)),
	);
	setCookie(c, PERAN, `${isi}.${sig}`, { ...dasar, maxAge: UMUR_PERAN_DETIK });
}

/** Null bila tidak ada, rusak, kedaluwarsa, atau milik pengguna lain. */
export async function bacaPeran(
	c: Konteks,
	userId: string,
): Promise<KodePeran | null> {
	const mentah = getCookie(c, PERAN);
	if (!mentah) return null;
	const bagian = mentah.split(".");
	if (bagian.length !== 4) return null;
	const [uid, kode, exp, sigHex] = bagian;
	const sig = dariHex(sigHex);
	if (!sig) return null;
	const sah = await crypto.subtle.verify(
		"HMAC",
		await kunci(c.env),
		sig,
		enc.encode(`${uid}.${kode}.${exp}`),
	);
	if (!sah || uid !== userId || !adalahKodePeran(kode)) return null;
	if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return null;
	return kode;
}

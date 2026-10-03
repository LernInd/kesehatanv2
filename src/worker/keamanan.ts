import type { MiddlewareHandler } from "hono";

/** Header keamanan untuk semua respons Worker (aset statis memakai public/_headers). */
export const headerKeamanan: MiddlewareHandler = async (c, next) => {
	await next();
	const h = c.res.headers;
	h.set("X-Content-Type-Options", "nosniff");
	h.set("X-Frame-Options", "DENY");
	h.set("Referrer-Policy", "no-referrer");
	h.set("Cross-Origin-Opener-Policy", "same-origin");
	h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
	h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
	h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
	h.set("Cache-Control", "no-store");
};

/**
 * Perlindungan CSRF untuk metode yang mengubah keadaan: Origin harus sama dengan
 * origin permintaan, dan header kustom wajib ada (tidak bisa dikirim form lintas situs).
 * SameSite=Strict pada cookie menjadi lapis kedua.
 */
export const tolakLintasAsal: MiddlewareHandler = async (c, next) => {
	const metode = c.req.method;
	if (metode !== "GET" && metode !== "HEAD" && metode !== "OPTIONS") {
		const origin = c.req.header("Origin");
		const asal = new URL(c.req.url).origin;
		if (origin !== asal || c.req.header("X-Requested-With") !== "fetch") {
			return c.json({ galat: "terlarang" }, 403);
		}
	}
	await next();
};

/** Baca badan JSON kecil dengan batas ukuran; null bila tidak sah. */
export async function bacaJson(
	req: Request,
	batasByte = 2048,
): Promise<Record<string, unknown> | null> {
	if (!req.headers.get("Content-Type")?.startsWith("application/json")) {
		return null;
	}
	const teks = await req.text();
	if (teks.length > batasByte) return null;
	try {
		const nilai: unknown = JSON.parse(teks);
		return nilai !== null && typeof nilai === "object" && !Array.isArray(nilai)
			? (nilai as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

export const ZONA = "Asia/Jakarta";

/** 'YYYY-MM-DD' di zona setempat. Kolom tanggal telanjang dibandingkan sebagai teks. */
export function tanggalSetempat(zona = ZONA, saat = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: zona,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(saat);
}

function selisihZonaMs(zona: string, saat: number): number {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat("en-US", {
			timeZone: zona,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		})
			.formatToParts(new Date(saat))
			.map((x) => [x.type, x.value]),
	);
	const lokalSebagaiUtc = Date.UTC(
		+p.year,
		+p.month - 1,
		+p.day,
		+p.hour,
		+p.minute,
		+p.second,
	);
	return lokalSebagaiUtc - saat;
}

/** Awal hari setempat sebagai instan UTC ISO: batas bawah inklusif (SKEMA §2). */
export function awalHariUtc(tanggal: string, zona = ZONA): string {
	const [y, m, d] = tanggal.split("-").map(Number);
	const tengahMalamUtc = Date.UTC(y, m - 1, d);
	return new Date(
		tengahMalamUtc - selisihZonaMs(zona, tengahMalamUtc),
	).toISOString();
}

export function geserHari(tanggal: string, n: number): string {
	const [y, m, d] = tanggal.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function adalahTanggal(s: unknown): s is string {
	if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const [y, m, d] = s.split("-").map(Number);
	const t = new Date(Date.UTC(y, m - 1, d));
	return (
		t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
	);
}

export function selisihHari(dari: string, sampai: string): number {
	return Math.round((Date.parse(sampai) - Date.parse(dari)) / 86_400_000);
}

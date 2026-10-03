/**
 * Allowlist peran yang boleh memakai aplikasi ini. Kode berasal dari `roles.code`
 * di activity-db. Peran lain (guru, ndalem, dst.) ditolak walau akunnya sah.
 *
 * `bagian` diturunkan dari peran aktif di server, tidak pernah dari peramban
 * (SKEMA.md §5 dan §7.4).
 */
export const PERAN_DIIZINKAN = {
	adminkesehatanputra: {
		nama: "Admin Kesehatan Putra",
		bagian: "laki_laki",
	},
	adminkesehatanputri: {
		nama: "Admin Kesehatan Putri",
		bagian: "perempuan",
	},
} as const;

export type KodePeran = keyof typeof PERAN_DIIZINKAN;

export interface Peran {
	kode: KodePeran;
	nama: string;
	bagian: "laki_laki" | "perempuan";
}

export function adalahKodePeran(kode: unknown): kode is KodePeran {
	return (
		typeof kode === "string" &&
		Object.prototype.hasOwnProperty.call(PERAN_DIIZINKAN, kode)
	);
}

export function keRincianPeran(kode: KodePeran): Peran {
	return { kode, ...PERAN_DIIZINKAN[kode] };
}

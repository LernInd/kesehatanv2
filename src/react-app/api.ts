export interface Peran {
	kode: "adminkesehatanputra" | "adminkesehatanputri";
	nama: string;
	bagian: "laki_laki" | "perempuan";
}

export interface Profil {
	id: string;
	username: string;
	nama_lengkap: string;
	foto_path: string | null;
}

export interface DataSesi {
	profil: Profil;
	peran: Peran[];
	peranAktif: Peran | null;
}

export interface HasilApi<T> {
	status: number;
	data: T | null;
	/** Pesan siap tampil untuk pengguna; terisi saat galat. */
	pesan: string | null;
}

/**
 * Semua panggilan ke Worker lewat sini. Cookie sesi HttpOnly dikirim otomatis;
 * header `X-Requested-With` wajib untuk perlindungan CSRF di server.
 */
export async function panggilApi<T>(
	jalur: string,
	badan?: unknown,
): Promise<HasilApi<T>> {
	try {
		const res = await fetch(jalur, {
			method: badan === undefined ? "GET" : "POST",
			credentials: "same-origin",
			headers: {
				"X-Requested-With": "fetch",
				...(badan === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: badan === undefined ? undefined : JSON.stringify(badan),
		});
		const json = (await res.json().catch(() => null)) as
			| (T & { pesan?: string })
			| null;
		if (res.ok) return { status: res.status, data: json, pesan: null };
		return {
			status: res.status,
			data: null,
			pesan:
				json?.pesan ??
				(res.status >= 500
					? "Terjadi gangguan pada server. Coba lagi nanti."
					: "Permintaan ditolak."),
		};
	} catch {
		return {
			status: 0,
			data: null,
			pesan: "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.",
		};
	}
}

/** Segmen URL laman tiap peran: /putra/... atau /putri/... */
export function segmenPeran(p: Peran): "putra" | "putri" {
	return p.bagian === "laki_laki" ? "putra" : "putri";
}

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

export interface SantriHasil {
	id: string;
	nama_lengkap: string;
	foto_url: string | null;
	lembaga: { id: string; nama: string; kelas: string | null }[];
}

export interface OpsiFilter {
	lembaga: { id: string; nama: string }[];
	kelas: { id: string; nama: string; lembaga_id: string }[];
}

export type StatusSurat = "berlaku" | "kedaluwarsa" | "dibatalkan";

export interface SuratRiwayat extends Surat {
	status: StatusSurat;
}

export interface KejadianSakit extends Surat {
	/** Jumlah hari sakit, kedua ujung termasuk. */
	hari: number;
	status: "berlaku" | "kedaluwarsa";
}

export interface RiwayatSantri {
	ringkasan: {
		kali: number;
		totalHari: number;
		terakhir: string | null;
		/** Surat dibatalkan: tidak dihitung sebagai sakit. */
		dibatalkan: number;
	};
	data: KejadianSakit[];
	adaBerikut: boolean;
	hal: number;
}

export interface SuratCetak {
	surat: SuratRiwayat;
	/** Nama peran aktif, mis. "Admin Kesehatan Putra". */
	peran: string;
}

/** 'YYYY-MM-DD' -> '27 Sep 2026' tanpa menggeser zona waktu. */
export function formatTanggal(t: string): string {
	const [y, m, d] = t.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("id-ID", {
		timeZone: "UTC",
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

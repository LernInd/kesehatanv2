import { useCallback, useEffect, useState } from "react";
import {
	formatTanggal,
	panggilApi,
	segmenPeran,
	type KejadianSakit,
	type RiwayatSantri,
	type SantriHasil,
} from "../api";
import { useAuth } from "../auth/AuthProvider";
import { KonfirmasiBatal } from "./KonfirmasiBatal";
import { PopupGalat } from "./PopupGalat";

const LABEL_STATUS: Record<KejadianSakit["status"], string> = {
	berlaku: "Berlaku",
	kedaluwarsa: "Selesai",
};

function formatWaktu(iso: string): string {
	return new Date(iso).toLocaleString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

interface Props {
	santri: SantriHasil;
	/**
	 * `batalkan`: Riwayat Siswa (Batalkan pada kejadian "Berlaku").
	 * `cetak`: Cetak Surat (tautan Cetak lembar A5 pada tiap kejadian).
	 */
	aksi: "batalkan" | "cetak";
}

/**
 * Riwayat sakit satu santri: berapa kali, kapan, dan keterangannya, 5 per halaman
 * (halaman berikutnya dimuat saat pindah halaman). Satu surat yang tidak dibatalkan
 * dihitung satu kejadian; surat dibatalkan tidak ditampilkan sehingga tidak bisa dicetak.
 * Pasang dengan `key={santri.id}` agar pindah santri memuat ulang dari awal.
 */
export function PanelRiwayatSantri({ santri, aksi }: Props) {
	const { sesi } = useAuth();
	const segmen = sesi?.peranAktif ? segmenPeran(sesi.peranAktif) : "putra";

	const [riwayat, setRiwayat] = useState<RiwayatSantri | null>(null);
	const [hal, setHal] = useState(1);
	const [memuat, setMemuat] = useState(false);
	const [popup, setPopup] = useState<{ judul: string; pesan: string } | null>(null);
	// Kejadian yang sedang menunggu konfirmasi pembatalan.
	const [konfirmasi, setKonfirmasi] = useState<KejadianSakit | null>(null);

	const muat = useCallback(async (id: string, h: number) => {
		setMemuat(true);
		let halaman = h;
		let r = await panggilApi<RiwayatSantri>(
			`/api/kesehatan/riwayat-santri?santri=${id}&hal=${halaman}`,
		);
		// Halaman terakhir bisa kosong setelah pembatalan: mundur satu halaman.
		if (r.data && r.data.data.length === 0 && halaman > 1) {
			halaman -= 1;
			r = await panggilApi<RiwayatSantri>(
				`/api/kesehatan/riwayat-santri?santri=${id}&hal=${halaman}`,
			);
		}
		setMemuat(false);
		if (!r.data) {
			setPopup({ judul: "Gagal memuat riwayat", pesan: r.pesan ?? "Gagal." });
			return;
		}
		setHal(halaman);
		setRiwayat(r.data);
	}, []);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		muat(santri.id, 1);
	}, [santri.id, muat]);

	function pindah(h: number) {
		setHal(h);
		muat(santri.id, h);
	}

	async function batalkan(k: KejadianSakit) {
		const r = await panggilApi(`/api/kesehatan/surat/${k.id}/batal`, {});
		setKonfirmasi(null);
		if (r.pesan) setPopup({ judul: "Gagal membatalkan", pesan: r.pesan });
		await muat(santri.id, hal);
	}

	if (riwayat === null) {
		return (
			<>
				<p className="sub">Memuat riwayat…</p>
				{popup && (
					<PopupGalat judul={popup.judul} pesan={popup.pesan} onTutup={() => setPopup(null)} />
				)}
			</>
		);
	}

	const { ringkasan } = riwayat;

	return (
		<>
			<div className="kartu-ringkas">
				<div className="ringkas">
					<span className="ringkas-angka">{ringkasan.kali}</span>
					<span>{aksi === "cetak" ? "Kali izin sakit" : "Kali sakit"}</span>
				</div>
				{/* Cetak Surat hanya butuh jumlah sakit; rincian lain ada di Riwayat Siswa. */}
				{aksi === "batalkan" && (
					<>
						<div className="ringkas">
							<span className="ringkas-angka">{ringkasan.totalHari}</span>
							<span>Total hari sakit</span>
						</div>
						<div className="ringkas">
							<span className="ringkas-angka ringkas-tanggal">
								{ringkasan.terakhir ? formatTanggal(ringkasan.terakhir) : "–"}
							</span>
							<span>Terakhir sakit</span>
						</div>
					</>
				)}
			</div>
			{aksi === "batalkan" && ringkasan.dibatalkan > 0 && (
				<p className="sub">
					{ringkasan.dibatalkan} surat dibatalkan, tidak dihitung sebagai sakit.
				</p>
			)}

			{riwayat.data.length === 0 ? (
				<p className="kosong">{santri.nama_lengkap} belum pernah sakit.</p>
			) : (
				<ul className="daftar-kartu">
					{riwayat.data.map((k) => (
						<li key={k.id} className="item-kartu">
							<div className="item-isi">
								<div className="item-baris">
									<strong>
										{formatTanggal(k.mulai)}
										{k.sampai !== k.mulai && ` – ${formatTanggal(k.sampai)}`}
									</strong>
									<span className="sub">({k.hari} hari)</span>
									<span className={`lencana lencana-${k.status}`}>
										{LABEL_STATUS[k.status]}
									</span>
								</div>
								<div className="teks-bungkus">{k.keterangan}</div>
								<div className="sub">
									Diterbitkan {formatWaktu(k.diterbitkan_pada)} oleh {k.diterbitkan_oleh_nama}
								</div>
							</div>
							{aksi === "batalkan" && k.status === "berlaku" && (
								<button
									type="button"
									className="tombol-teks bahaya"
									onClick={() => setKonfirmasi(k)}
								>
									Batalkan
								</button>
							)}
							{aksi === "cetak" && (
								<a
									className="tombol tombol-sekunder tombol-tautan"
									href={`/${segmen}/cetak/${k.id}?cetak=1`}
									target="_blank"
									rel="noopener"
								>
									Cetak
								</a>
							)}
						</li>
					))}
				</ul>
			)}

			{(hal > 1 || riwayat.adaBerikut) && (
				<nav className="paginasi" aria-label="Halaman riwayat siswa">
					<button
						type="button"
						className="tombol tombol-sekunder"
						disabled={hal <= 1 || memuat}
						onClick={() => pindah(hal - 1)}
					>
						Sebelumnya
					</button>
					<span className="sub">Halaman {hal}</span>
					<button
						type="button"
						className="tombol tombol-sekunder"
						disabled={!riwayat.adaBerikut || memuat}
						onClick={() => pindah(hal + 1)}
					>
						Berikutnya
					</button>
				</nav>
			)}

			{konfirmasi && (
				<KonfirmasiBatal
					surat={{
						santri_nama: konfirmasi.santri_nama,
						mulai: konfirmasi.mulai,
						sampai: konfirmasi.sampai,
					}}
					onBatalkan={() => batalkan(konfirmasi)}
					onTutup={() => setKonfirmasi(null)}
				/>
			)}

			{popup && (
				<PopupGalat judul={popup.judul} pesan={popup.pesan} onTutup={() => setPopup(null)} />
			)}
		</>
	);
}

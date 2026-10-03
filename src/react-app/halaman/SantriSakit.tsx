import { useCallback, useEffect, useState } from "react";
import { formatTanggal, panggilApi, type Surat } from "../api";
import { KonfirmasiBatal } from "../komponen/KonfirmasiBatal";
import { PopupGalat } from "../komponen/PopupGalat";

export default function SantriSakit() {
	const [data, setData] = useState<Surat[] | null>(null);
	const [hariIni, setHariIni] = useState("");
	const [galat, setGalat] = useState<string | null>(null);
	// Surat yang sedang menunggu konfirmasi pembatalan.
	const [konfirmasi, setKonfirmasi] = useState<Surat | null>(null);

	const muat = useCallback(async () => {
		const r = await panggilApi<{ hariIni: string; data: Surat[] }>(
			"/api/kesehatan/sakit",
		);
		if (r.data) {
			setData(r.data.data);
			setHariIni(r.data.hariIni);
		} else {
			setGalat(r.pesan);
		}
	}, []);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		muat();
	}, [muat]);

	async function batalkan(s: Surat) {
		const r = await panggilApi(`/api/kesehatan/surat/${s.id}/batal`, {});
		setKonfirmasi(null);
		if (r.pesan) setGalat(r.pesan);
		await muat();
	}

	return (
		<div className="konten">
			<h1>Santri Sakit Hari Ini</h1>
			{hariIni && <p className="sub">{formatTanggal(hariIni)}</p>}

			{data === null ? (
				<p className="sub">Memuat…</p>
			) : data.length === 0 ? (
				<p className="kosong">Tidak ada santri sakit hari ini.</p>
			) : (
				<ul className="daftar-kartu">
					{data.map((s) => (
						<li key={s.id} className="item-kartu">
							<div>
								<strong>{s.santri_nama}</strong>
								<div className="sub">
									{formatTanggal(s.mulai)} – {formatTanggal(s.sampai)}
								</div>
								<div>{s.keterangan}</div>
								<div className="sub">Diterbitkan oleh {s.diterbitkan_oleh_nama}</div>
							</div>
							<button
								type="button"
								className="tombol-teks bahaya"
								onClick={() => setKonfirmasi(s)}
							>
								Batalkan
							</button>
						</li>
					))}
				</ul>
			)}

			{konfirmasi && (
				<KonfirmasiBatal
					surat={konfirmasi}
					onBatalkan={() => batalkan(konfirmasi)}
					onTutup={() => setKonfirmasi(null)}
				/>
			)}

			{galat && (
				<PopupGalat judul="Terjadi kendala" pesan={galat} onTutup={() => setGalat(null)} />
			)}
		</div>
	);
}

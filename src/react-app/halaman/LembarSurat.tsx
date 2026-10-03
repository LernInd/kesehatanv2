import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { panggilApi, type SuratCetak } from "../api";

const NAMA_INSTANSI = "Pondok Pesantren Darun Najah";
const INSTANSI = NAMA_INSTANSI.toUpperCase();

function tanggalPanjang(t: string): string {
	const [y, m, d] = t.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("id-ID", {
		timeZone: "UTC",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

function jumlahHari(mulai: string, sampai: string): number {
	return Math.round((Date.parse(sampai) - Date.parse(mulai)) / 86_400_000) + 1;
}

/**
 * Lembar surat sakit ukuran A5. Tanda tangan diganti kode QR yang memuat ID surat.
 * Dibuka di tab baru dari halaman Cetak Surat; `?cetak=1` langsung memanggil dialog cetak.
 */
export default function LembarSurat() {
	const { id } = useParams();
	const [params] = useSearchParams();
	const [data, setData] = useState<SuratCetak | null>(null);
	const [qr, setQr] = useState<string | null>(null);
	const [galat, setGalat] = useState<string | null>(null);

	useEffect(() => {
		let batal = false;
		(async () => {
			const r = await panggilApi<SuratCetak>(`/api/kesehatan/surat/${id}/cetak`);
			if (batal) return;
			if (!r.data) {
				setGalat(r.pesan ?? "Surat tidak dapat dimuat.");
				return;
			}
			setData(r.data);
			const url = await QRCode.toDataURL(r.data.surat.id, {
				errorCorrectionLevel: "M",
				margin: 1,
				width: 240,
			});
			if (!batal) setQr(url);
		})();
		return () => {
			batal = true;
		};
	}, [id]);

	// Judul tab menjadi nama berkas bawaan saat "Simpan sebagai PDF".
	useEffect(() => {
		if (!data) return;
		const lama = document.title;
		document.title = `Surat Sakit - ${data.surat.santri_nama}`;
		return () => {
			document.title = lama;
		};
	}, [data]);

	// Cetak otomatis setelah QR siap, hanya bila diminta lewat ?cetak=1.
	useEffect(() => {
		if (!qr || params.get("cetak") !== "1") return;
		const t = setTimeout(() => window.print(), 400);
		return () => clearTimeout(t);
	}, [qr, params]);

	if (galat) {
		return (
			<main className="halaman-tengah">
				<div className="kartu">
					<h1>Surat tidak dapat dicetak</h1>
					<p className="sub">{galat}</p>
					<button type="button" className="tombol" onClick={() => window.close()}>
						Tutup
					</button>
				</div>
			</main>
		);
	}

	if (!data) {
		return (
			<div className="memuat" role="status" aria-live="polite">
				Memuat surat…
			</div>
		);
	}

	const { surat, peran } = data;
	const bagian = peran.toLowerCase().includes("putri") ? "Putri" : "Putra";
	const hari = jumlahHari(surat.mulai, surat.sampai);
	const terbit = new Date(surat.diterbitkan_pada).toLocaleDateString("id-ID", {
		timeZone: "Asia/Jakarta",
		day: "numeric",
		month: "long",
		year: "numeric",
	});

	return (
		<div className="lembar-latar">
			<div className="alat-cetak">
				<button type="button" className="tombol" disabled={!qr} onClick={() => window.print()}>
					Cetak / Simpan PDF
				</button>
				<button type="button" className="tombol tombol-sekunder" onClick={() => window.close()}>
					Tutup
				</button>
			</div>

			<article className="lembar" aria-label="Surat keterangan sakit">
				<header className="lembar-kop">
					<strong>{INSTANSI}</strong>
					<span>Unit Kesehatan Santri {bagian}</span>
				</header>

				<h1 className="lembar-judul">SURAT KETERANGAN SAKIT</h1>
				<p className="lembar-nomor">No. SKS/{surat.id.slice(0, 8).toUpperCase()}</p>

				<p>
					Yang bertanda di bawah ini, Unit Kesehatan Santri {bagian} {NAMA_INSTANSI},
					menerangkan bahwa santri:
				</p>

				<table className="lembar-data">
					<tbody>
						<tr>
							<th scope="row">Nama</th>
							<td>{surat.santri_nama}</td>
						</tr>
						<tr>
							<th scope="row">Keterangan</th>
							<td>{surat.keterangan}</td>
						</tr>
						<tr>
							<th scope="row">Masa istirahat</th>
							<td>
								{tanggalPanjang(surat.mulai)} s.d. {tanggalPanjang(surat.sampai)} ({hari} hari)
							</td>
						</tr>
					</tbody>
				</table>

				<p>
					Benar yang bersangkutan sedang sakit dan memerlukan istirahat pada masa tersebut.
					Demikian surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.
				</p>

				<footer className="lembar-kaki">
					<div className="lembar-tanggal">Diterbitkan {terbit}</div>
					<div className="lembar-qr">
						<span>Petugas Kesehatan</span>
						{qr ? <img src={qr} alt={`Kode QR surat ${surat.id}`} /> : <div className="qr-kosong" />}
						<strong>{surat.diterbitkan_oleh_nama}</strong>
						<small>{surat.id}</small>
					</div>
				</footer>
			</article>
		</div>
	);
}

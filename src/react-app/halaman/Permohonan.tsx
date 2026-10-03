import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatTanggal, panggilApi, segmenPeran, type SantriHasil } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { KartuSantri, PencarianSantri } from "../komponen/PencarianSantri";
import { PopupGalat } from "../komponen/PopupGalat";

const KETERANGAN_MAKS = 160;

function hariIniLokal(): string {
	return new Date().toLocaleDateString("en-CA");
}

interface IsiPopup {
	judul: string;
	pesan: string;
	/** Terisi hanya setelah surat terbit: tombol utama mengarah ke halaman Cetak Surat. */
	terbit?: SantriHasil;
}

export default function Permohonan() {
	const { sesi } = useAuth();
	const navigate = useNavigate();
	const segmen = sesi?.peranAktif ? segmenPeran(sesi.peranAktif) : "putra";
	const [santri, setSantri] = useState<SantriHasil | null>(null);
	// Dinaikkan setelah surat terbit agar pencarian kembali bersih.
	const [kunciCari, setKunciCari] = useState(0);
	const [mulai, setMulai] = useState(hariIniLokal);
	const [sampai, setSampai] = useState(hariIniLokal);
	const [keterangan, setKeterangan] = useState("");
	const [sibuk, setSibuk] = useState(false);
	const [popup, setPopup] = useState<IsiPopup | null>(null);

	async function kirim(e: React.FormEvent) {
		e.preventDefault();
		if (!santri || sibuk) return;
		setSibuk(true);
		const r = await panggilApi<{ id: string }>("/api/kesehatan/surat", {
			santri_id: santri.id,
			mulai,
			sampai,
			keterangan,
		});
		setSibuk(false);
		if (r.data) {
			setPopup({
				judul: "Surat sakit terbit",
				pesan: `${santri.nama_lengkap} tercatat sakit pada ${formatTanggal(mulai)} – ${formatTanggal(sampai)}.`,
				terbit: santri,
			});
			setSantri(null);
			setKunciCari((k) => k + 1);
			setKeterangan("");
		} else {
			setPopup({ judul: "Gagal menerbitkan surat", pesan: r.pesan ?? "Gagal." });
		}
	}

	return (
		<div className="konten">
			<h1>Permohonan Surat Sakit</h1>
			<p className="sub">
				Cari santri, pilih, lalu terbitkan surat sakit; hasil tampil setelah tombol Cari ditekan.
			</p>

			<PencarianSantri key={kunciCari} tersembunyi={santri !== null} onPilih={setSantri} />

			{santri && (
				<form className="kartu-form" onSubmit={kirim} noValidate>
					<div className="item-kartu item-terpilih">
						<KartuSantri s={santri} />
						<button type="button" className="tombol-teks" onClick={() => setSantri(null)}>
							Ganti
						</button>
					</div>

					<div className="dua-kolom">
						<div className="saring-kolom">
							<label htmlFor="mulai">Mulai</label>
							<input
								id="mulai"
								type="date"
								value={mulai}
								onChange={(e) => setMulai(e.target.value)}
								required
							/>
						</div>
						<div className="saring-kolom">
							<label htmlFor="sampai">Sampai (termasuk)</label>
							<input
								id="sampai"
								type="date"
								value={sampai}
								min={mulai}
								onChange={(e) => setSampai(e.target.value)}
								required
							/>
						</div>
					</div>

					<div className="saring-kolom">
						<label htmlFor="keterangan">Keterangan</label>
						<textarea
							id="keterangan"
							value={keterangan}
							maxLength={KETERANGAN_MAKS}
							rows={3}
							onChange={(e) => setKeterangan(e.target.value)}
							required
						/>
						<span className="sub hitung">
							{keterangan.length}/{KETERANGAN_MAKS}
						</span>
					</div>

					<div className="saring-aksi">
						<button
							type="submit"
							className="tombol"
							disabled={sibuk || !keterangan.trim() || !mulai || !sampai}
						>
							{sibuk ? "Menerbitkan…" : "Terbitkan surat"}
						</button>
					</div>
				</form>
			)}

			{popup && (
				<PopupGalat
					judul={popup.judul}
					pesan={popup.pesan}
					jenis={popup.terbit ? "sukses" : "galat"}
					aksi={
						popup.terbit
							? {
									label: "Cetak surat",
									// Kirim santri agar halaman Cetak Surat langsung menampilkan suratnya.
									onKlik: () => navigate(`/${segmen}/cetak`, { state: { santri: popup.terbit } }),
								}
							: undefined
					}
					onTutup={() => setPopup(null)}
				/>
			)}
		</div>
	);
}

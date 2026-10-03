import { useState } from "react";
import { type SantriHasil } from "../api";
import { KartuSantri, PencarianSantri } from "../komponen/PencarianSantri";
import { PanelRiwayatSantri } from "../komponen/PanelRiwayatSantri";

/**
 * Riwayat siswa: pilih seorang santri, lihat berapa kali ia sakit, tanggal, dan keterangannya.
 * Satu surat yang tidak dibatalkan dihitung satu kejadian sakit.
 */
export default function Riwayat() {
	const [santri, setSantri] = useState<SantriHasil | null>(null);

	return (
		<div className="konten">
			<h1>Riwayat Siswa</h1>
			<p className="sub">
				Cari santri untuk melihat berapa kali ia sakit, kapan, dan keterangannya; hasil tampil
				setelah tombol Cari ditekan.
			</p>

			<PencarianSantri tersembunyi={santri !== null} onPilih={setSantri} />

			{santri && (
				<>
					<div className="item-kartu item-terpilih">
						<KartuSantri s={santri} />
						<button type="button" className="tombol-teks" onClick={() => setSantri(null)}>
							Ganti
						</button>
					</div>
					<PanelRiwayatSantri key={santri.id} santri={santri} aksi="batalkan" />
				</>
			)}
		</div>
	);
}

import { useState } from "react";
import { formatTanggal } from "../api";
import { PopupGalat } from "./PopupGalat";

interface Props {
	surat: { santri_nama: string; mulai: string; sampai: string };
	/** Melakukan pembatalan (panggilan API + muat ulang); penutupan dialog diurus pemanggil. */
	onBatalkan: () => Promise<void>;
	onTutup: () => void;
}

/** Dialog konfirmasi pembatalan surat sakit (pengganti window.confirm). */
export function KonfirmasiBatal({ surat, onBatalkan, onTutup }: Props) {
	const [sibuk, setSibuk] = useState(false);
	const rentang =
		surat.mulai === surat.sampai
			? formatTanggal(surat.mulai)
			: `${formatTanggal(surat.mulai)} – ${formatTanggal(surat.sampai)}`;

	async function lanjut() {
		if (sibuk) return;
		setSibuk(true);
		await onBatalkan();
		// Pemanggil menutup dialog setelah selesai; tidak ada setSibuk(false) agar tak berkedip.
	}

	return (
		<PopupGalat
			jenis="tanya"
			judul="Batalkan surat sakit?"
			pesan={`Surat sakit ${surat.santri_nama} (${rentang}) akan dibatalkan dan tidak lagi dihitung sebagai sakit. Surat yang dibatalkan tidak dapat dicetak.`}
			labelTutup="Kembali"
			aksi={{
				label: sibuk ? "Membatalkan…" : "Ya, batalkan",
				onKlik: lanjut,
				bahaya: true,
				nonaktif: sibuk,
			}}
			// Selama proses berjalan dialog tidak boleh ditutup (Esc/klik latar diabaikan).
			onTutup={() => {
				if (!sibuk) onTutup();
			}}
		/>
	);
}

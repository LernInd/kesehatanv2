import { useEffect, useRef } from "react";

interface Props {
	judul: string;
	pesan: string;
	onTutup: () => void;
	/** `sukses`: ikon centang hijau; `tanya`: ikon tanya kuning (konfirmasi); bawaan `galat`. */
	jenis?: "galat" | "sukses" | "tanya";
	/** Tombol utama tambahan (mis. "Cetak surat"); tombol tutup menjadi sekunder. */
	aksi?: {
		label: string;
		onKlik: () => void;
		/** Gaya merah untuk tindakan yang merusak/tak terpulihkan. */
		bahaya?: boolean;
		nonaktif?: boolean;
	};
	/** Teks tombol tutup; bawaan "Tutup" (konfirmasi memakai "Kembali"). */
	labelTutup?: string;
}

const IKON = { galat: "!", sukses: "✓", tanya: "?" } as const;

/**
 * Dialog modal. Fokus dikunci di dalam dialog, Esc dan klik latar menutup.
 * Tanpa `aksi`: satu tombol "Tutup". Dengan `aksi`: tombol utama + "Tutup".
 */
export function PopupGalat({
	judul,
	pesan,
	onTutup,
	jenis = "galat",
	aksi,
	labelTutup = "Tutup",
}: Props) {
	const dialog = useRef<HTMLDivElement>(null);
	const utama = useRef<HTMLButtonElement>(null);
	const aman = useRef<HTMLButtonElement>(null);
	const bahaya = aksi?.bahaya ?? false;

	useEffect(() => {
		// Tindakan merusak: fokus awal pada pilihan aman agar Enter tidak membatalkan tanpa sengaja.
		(bahaya ? aman : utama).current?.focus();
		const saatTekan = (e: KeyboardEvent) => {
			if (e.key === "Escape") onTutup();
			if (e.key !== "Tab") return;
			// Putar fokus di antara tombol dialog saja.
			const tombol = [...(dialog.current?.querySelectorAll("button") ?? [])];
			if (tombol.length === 0) return;
			e.preventDefault();
			const sekarang = tombol.indexOf(document.activeElement as HTMLButtonElement);
			const arah = e.shiftKey ? -1 : 1;
			tombol[(sekarang + arah + tombol.length) % tombol.length].focus();
		};
		document.addEventListener("keydown", saatTekan);
		return () => document.removeEventListener("keydown", saatTekan);
	}, [onTutup, bahaya]);

	return (
		<div className="popup-latar" onClick={onTutup}>
			<div
				ref={dialog}
				className="popup"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="popup-judul"
				aria-describedby="popup-pesan"
				onClick={(e) => e.stopPropagation()}
			>
				<div className={`popup-ikon popup-ikon-${jenis}`} aria-hidden="true">
					{IKON[jenis]}
				</div>
				<h2 id="popup-judul">{judul}</h2>
				<p id="popup-pesan">{pesan}</p>
				<div className="popup-aksi">
					{aksi ? (
						<>
							<button
								ref={utama}
								type="button"
								className={aksi.bahaya ? "tombol tombol-bahaya" : "tombol"}
								disabled={aksi.nonaktif}
								onClick={aksi.onKlik}
							>
								{aksi.label}
							</button>
							<button
								ref={aman}
								type="button"
								className="tombol tombol-sekunder"
								onClick={onTutup}
							>
								{labelTutup}
							</button>
						</>
					) : (
						<button ref={utama} type="button" className="tombol" onClick={onTutup}>
							{labelTutup}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

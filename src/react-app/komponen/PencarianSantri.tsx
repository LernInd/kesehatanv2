import { useEffect, useState } from "react";
import { panggilApi, type OpsiFilter, type SantriHasil } from "../api";
import { PopupGalat } from "./PopupGalat";

const BATAS_HASIL = 5;

/** Foto, nama lengkap, dan lembaga naungan (beserta kelas) seorang santri. */
export function KartuSantri({ s }: { s: SantriHasil }) {
	const [rusak, setRusak] = useState(false);
	const inisial = s.nama_lengkap.trim().charAt(0).toUpperCase();
	return (
		<span className="kartu-santri">
			{s.foto_url && !rusak ? (
				<img
					className="foto-santri"
					src={s.foto_url}
					alt=""
					loading="lazy"
					referrerPolicy="no-referrer"
					onError={() => setRusak(true)}
				/>
			) : (
				<span className="foto-santri foto-kosong" aria-hidden="true">
					{inisial}
				</span>
			)}
			<span className="kartu-santri-teks">
				<strong>{s.nama_lengkap}</strong>
				<span className="sub">
					{s.lembaga.length === 0
						? "Belum terdaftar di lembaga"
						: s.lembaga
								.map((l) => (l.kelas ? `${l.nama} · ${l.kelas}` : l.nama))
								.join(" | ")}
				</span>
			</span>
		</span>
	);
}

interface Props {
	onPilih: (santri: SantriHasil) => void;
	/**
	 * Disembunyikan tanpa dilepas dari pohon, sehingga isian dan hasil pencarian
	 * tetap ada saat pengguna menekan "Ganti".
	 */
	tersembunyi?: boolean;
}

/**
 * Pencarian santri bersaringan nama/lembaga/kelas. Pencarian hanya berjalan saat
 * tombol Cari ditekan; server mengembalikan maksimal 5 santri teratas dari gender peran aktif.
 */
export function PencarianSantri({ onPilih, tersembunyi = false }: Props) {
	const [opsi, setOpsi] = useState<OpsiFilter | null>(null);
	const [nama, setNama] = useState("");
	const [lembagaId, setLembagaId] = useState("");
	const [kelasId, setKelasId] = useState("");
	// null = belum pernah menekan Cari; [] = dicari tetapi tidak ada yang cocok.
	const [hasil, setHasil] = useState<SantriHasil[] | null>(null);
	const [mencari, setMencari] = useState(false);
	const [popup, setPopup] = useState<{ judul: string; pesan: string } | null>(null);

	useEffect(() => {
		panggilApi<OpsiFilter>("/api/kesehatan/filter").then((r) => {
			if (r.data) setOpsi(r.data);
			else if (r.pesan) setPopup({ judul: "Gagal memuat filter", pesan: r.pesan });
		});
	}, []);

	const kelasTersedia = (opsi?.kelas ?? []).filter((k) => k.lembaga_id === lembagaId);
	const bolehCari = nama.trim().length >= 2 || lembagaId !== "" || kelasId !== "";

	async function cari() {
		if (!bolehCari || mencari) return;
		setMencari(true);
		const params = new URLSearchParams();
		if (nama.trim().length >= 2) params.set("nama", nama.trim());
		if (lembagaId) params.set("lembaga", lembagaId);
		if (kelasId) params.set("kelas", kelasId);
		const r = await panggilApi<{ data: SantriHasil[] }>(
			`/api/kesehatan/santri?${params}`,
		);
		setMencari(false);
		if (r.data) setHasil(r.data.data);
		else setPopup({ judul: "Gagal mencari santri", pesan: r.pesan ?? "Gagal." });
	}

	function reset() {
		setNama("");
		setLembagaId("");
		setKelasId("");
		setHasil(null);
	}

	return (
		<div hidden={tersembunyi}>
			<form
				className="saring-riwayat saring-santri"
				onSubmit={(e) => {
					e.preventDefault();
					cari();
				}}
			>
				<div className="saring-kolom saring-nama">
					<label htmlFor="cari-nama">Nama santri</label>
					<input
						id="cari-nama"
						value={nama}
						onChange={(e) => setNama(e.target.value)}
						placeholder="Minimal 2 huruf"
						autoComplete="off"
						maxLength={50}
					/>
				</div>
				<div className="saring-kolom">
					<label htmlFor="cari-lembaga">Lembaga</label>
					<select
						id="cari-lembaga"
						value={lembagaId}
						onChange={(e) => {
							setLembagaId(e.target.value);
							setKelasId("");
						}}
					>
						<option value="">Semua lembaga</option>
						{opsi?.lembaga.map((l) => (
							<option key={l.id} value={l.id}>
								{l.nama}
							</option>
						))}
					</select>
				</div>
				<div className="saring-kolom">
					<label htmlFor="cari-kelas">Kelas</label>
					<select
						id="cari-kelas"
						value={kelasId}
						disabled={!lembagaId}
						onChange={(e) => setKelasId(e.target.value)}
					>
						<option value="">{lembagaId ? "Semua kelas" : "Pilih lembaga dahulu"}</option>
						{kelasTersedia.map((k) => (
							<option key={k.id} value={k.id}>
								{k.nama}
							</option>
						))}
					</select>
				</div>
				<div className="saring-aksi">
					<button type="submit" className="tombol" disabled={!bolehCari || mencari}>
						{mencari ? "Mencari…" : "Cari"}
					</button>
					<button type="button" className="tombol tombol-sekunder" onClick={reset}>
						Reset
					</button>
				</div>
			</form>

			{hasil === null ? (
				<p className="kosong">
					Isi nama, atau pilih lembaga/kelas, lalu tekan <strong>Cari</strong> untuk menampilkan
					santri.
				</p>
			) : hasil.length === 0 ? (
				<p className="kosong">Tidak ada santri yang cocok.</p>
			) : (
				<>
					<ul className="daftar-kartu">
						{hasil.map((h) => (
							<li key={h.id} className="item-kartu">
								<KartuSantri s={h} />
								<button type="button" className="tombol-teks" onClick={() => onPilih(h)}>
									Pilih
								</button>
							</li>
						))}
					</ul>
					{hasil.length >= BATAS_HASIL && (
						<p className="sub">
							Menampilkan {BATAS_HASIL} teratas. Persempit pencarian bila santri belum muncul.
						</p>
					)}
				</>
			)}

			{popup && (
				<PopupGalat judul={popup.judul} pesan={popup.pesan} onTutup={() => setPopup(null)} />
			)}
		</div>
	);
}

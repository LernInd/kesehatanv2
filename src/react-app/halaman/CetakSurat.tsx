import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import {
	formatTanggal,
	panggilApi,
	segmenPeran,
	type SantriHasil,
	type Surat,
} from "../api";
import { useAuth } from "../auth/AuthProvider";
import { PanelRiwayatSantri } from "../komponen/PanelRiwayatSantri";
import { KartuSantri, PencarianSantri } from "../komponen/PencarianSantri";
import { PopupGalat } from "../komponen/PopupGalat";

type Tab = "hariini" | "santri";

const TAB: { id: Tab; label: string }[] = [
	{ id: "hariini", label: "Hari ini" },
	{ id: "santri", label: "Per santri" },
];

/** Santri yang surat sakitnya berlaku hari ini; langsung dimuat tanpa menekan Cari. */
function PanelHariIni() {
	const { sesi } = useAuth();
	const segmen = sesi?.peranAktif ? segmenPeran(sesi.peranAktif) : "putra";
	const [data, setData] = useState<Surat[] | null>(null);
	const [hariIni, setHariIni] = useState("");
	const [memuat, setMemuat] = useState(false);
	const [galat, setGalat] = useState<string | null>(null);

	const muat = useCallback(async () => {
		setMemuat(true);
		const r = await panggilApi<{ hariIni: string; data: Surat[] }>("/api/kesehatan/sakit");
		setMemuat(false);
		if (r.data) {
			setData(r.data.data);
			setHariIni(r.data.hariIni);
		} else {
			setGalat(r.pesan ?? "Gagal memuat.");
		}
	}, []);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		muat();
	}, [muat]);

	return (
		<>
			<div className="baris-judul">
				<p className="sub">
					{hariIni && `${formatTanggal(hariIni)} · `}
					{data === null
						? "Memuat…"
						: data.length === 0
							? "tidak ada santri sakit"
							: `${data.length} santri sakit`}
				</p>
				<button
					type="button"
					className="tombol-teks"
					disabled={memuat}
					onClick={muat}
				>
					{memuat ? "Memuat…" : "Muat ulang"}
				</button>
			</div>

			{data !== null &&
				(data.length === 0 ? (
					<p className="kosong">Tidak ada santri sakit hari ini.</p>
				) : (
					<ul className="daftar-kartu">
						{data.map((s) => (
							<li key={s.id} className="item-kartu">
								<div className="item-isi">
									<strong>{s.santri_nama}</strong>
									<div className="sub">
										{formatTanggal(s.mulai)}
										{s.sampai !== s.mulai && ` – ${formatTanggal(s.sampai)}`}
									</div>
									<div className="teks-bungkus">{s.keterangan}</div>
								</div>
								<a
									className="tombol tombol-sekunder tombol-tautan"
									href={`/${segmen}/cetak/${s.id}?cetak=1`}
									target="_blank"
									rel="noopener"
								>
									Cetak
								</a>
							</li>
						))}
					</ul>
				))}

			{galat && (
				<PopupGalat judul="Gagal memuat" pesan={galat} onTutup={() => setGalat(null)} />
			)}
		</>
	);
}

/** Cetak surat sakit: otomatis per hari ini, atau memilih santri seperti di Riwayat Siswa. */
/** Santri kiriman dari popup "Surat sakit terbit" di Permohonan (state riwayat navigasi). */
function santriDariNavigasi(state: unknown): SantriHasil | null {
	const s = (state as { santri?: Partial<SantriHasil> } | null)?.santri;
	return s && typeof s.id === "string" && typeof s.nama_lengkap === "string"
		? (s as SantriHasil)
		: null;
}

export default function CetakSurat() {
	const lokasi = useLocation();
	const [santri, setSantri] = useState<SantriHasil | null>(() =>
		santriDariNavigasi(lokasi.state),
	);
	// Datang dari Permohonan dengan santri terpilih → langsung ke tab "Per santri".
	const [tab, setTab] = useState<Tab>(() => (santri ? "santri" : "hariini"));

	// Panah kiri/kanan berpindah tab (pola WAI-ARIA tabs).
	function saatTekan(e: KeyboardEvent) {
		if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
		e.preventDefault();
		const baru = tab === "hariini" ? "santri" : "hariini";
		setTab(baru);
		document.getElementById(`tab-${baru}`)?.focus();
	}

	return (
		<div className="konten">
			<h1>Cetak Surat Sakit</h1>
			<p className="sub">
				Cetak lembar A5 berkode QR: otomatis untuk yang sakit hari ini, atau pilih santri tertentu.
			</p>

			<div className="tab-daftar" role="tablist" aria-label="Cara mencetak" onKeyDown={saatTekan}>
				{TAB.map((t) => (
					<button
						key={t.id}
						id={`tab-${t.id}`}
						type="button"
						role="tab"
						className="tab"
						aria-selected={tab === t.id}
						aria-controls={`panel-${t.id}`}
						tabIndex={tab === t.id ? 0 : -1}
						onClick={() => setTab(t.id)}
					>
						{t.label}
					</button>
				))}
			</div>

			{/* Kedua panel tetap terpasang; yang tidak aktif hanya disembunyikan agar pilihan tidak hilang. */}
			<section
				id="panel-hariini"
				role="tabpanel"
				aria-labelledby="tab-hariini"
				hidden={tab !== "hariini"}
			>
				<PanelHariIni />
			</section>

			<section
				id="panel-santri"
				role="tabpanel"
				aria-labelledby="tab-santri"
				hidden={tab !== "santri"}
			>
				<PencarianSantri tersembunyi={santri !== null} onPilih={setSantri} />
				{santri && (
					<>
						<div className="item-kartu item-terpilih">
							<KartuSantri s={santri} />
							<button type="button" className="tombol-teks" onClick={() => setSantri(null)}>
								Ganti
							</button>
						</div>
						<PanelRiwayatSantri key={santri.id} santri={santri} aksi="cetak" />
					</>
				)}
			</section>
		</div>
	);
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Peran } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { PopupGalat } from "../komponen/PopupGalat";

export default function PilihPeran() {
	const { sesi, pilihPeran, keluar } = useAuth();
	const navigate = useNavigate();
	const [sibuk, setSibuk] = useState<string | null>(null);
	const [galat, setGalat] = useState<string | null>(null);

	if (!sesi) return null;

	async function pilih(kode: Peran["kode"]) {
		if (sibuk) return;
		setSibuk(kode);
		const pesan = await pilihPeran(kode);
		setSibuk(null);
		if (pesan) setGalat(pesan);
		else navigate(`/${kode === "adminkesehatanputra" ? "putra" : "putri"}/dashboard`, { replace: true });
	}

	return (
		<main className="halaman-tengah">
			<section className="kartu kartu-lebar">
				<h1>Pilih peran</h1>
				<p className="sub">
					Halo, {sesi.profil.nama_lengkap}. Masuk sebagai peran apa hari ini?
				</p>

				<ul className="daftar-peran">
					{sesi.peran.map((p) => (
						<li key={p.kode}>
							<button
								type="button"
								className="kartu-peran"
								disabled={sibuk !== null}
								onClick={() => pilih(p.kode)}
							>
								<span className="kartu-peran-nama">{p.nama}</span>
								<span className="kartu-peran-bagian">
									{p.bagian === "laki_laki" ? "Santri putra" : "Santri putri"}
								</span>
								{sibuk === p.kode && <span className="sub">Memuat…</span>}
							</button>
						</li>
					))}
				</ul>

				<button type="button" className="tombol-teks" onClick={keluar}>
					Keluar
				</button>
			</section>

			{galat && (
				<PopupGalat
					judul="Gagal memilih peran"
					pesan={galat}
					onTutup={() => setGalat(null)}
				/>
			)}
		</main>
	);
}

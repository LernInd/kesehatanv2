import { useEffect, useState } from "react";
import { panggilApi } from "../api";
import { useAuth } from "../auth/AuthProvider";

interface Ringkasan {
	sakitHariIni: number;
	diterbitkanHariIni: number;
	totalSantri: number | null;
}

export default function Dashboard() {
	const { sesi } = useAuth();
	const [data, setData] = useState<Ringkasan | null>(null);
	const [galat, setGalat] = useState<string | null>(null);

	useEffect(() => {
		let batal = false;
		panggilApi<Ringkasan>("/api/kesehatan/dashboard").then((r) => {
			if (batal) return;
			if (r.data) setData(r.data);
			else setGalat(r.pesan);
		});
		return () => {
			batal = true;
		};
	}, []);

	const putra = sesi?.peranAktif?.bagian === "laki_laki";

	return (
		<div className="konten">
			<h1>Dasbor {sesi?.peranAktif?.nama}</h1>
			{galat && <p className="galat-inline">{galat}</p>}
			<div className="kartu-ringkas">
				<div className="ringkas">
					<span className="ringkas-angka">{data?.sakitHariIni ?? "…"}</span>
					<span>Santri sakit hari ini</span>
				</div>
				<div className="ringkas">
					<span className="ringkas-angka">{data?.diterbitkanHariIni ?? "…"}</span>
					<span>Surat terbit hari ini</span>
				</div>
				<div className="ringkas">
					<span className="ringkas-angka">{data ? (data.totalSantri ?? "–") : "…"}</span>
					<span>Total santri {putra ? "putra" : "putri"}</span>
				</div>
			</div>
		</div>
	);
}

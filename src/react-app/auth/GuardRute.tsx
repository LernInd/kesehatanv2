import { Navigate, Outlet } from "react-router-dom";
import { segmenPeran } from "../api";
import { useAuth } from "./AuthProvider";

function Memuat() {
	return (
		<div className="memuat" role="status" aria-live="polite">
			Memuat…
		</div>
	);
}

/** Server atau Supabase terganggu: sesi tidak dibuang, pengguna diberi pilihan mencoba lagi. */
function LayananTerganggu() {
	const { pesanGalat, muatUlang } = useAuth();
	return (
		<main className="halaman-tengah">
			<div className="kartu" role="alert">
				<h1>Layanan terganggu</h1>
				<p className="sub">
					{pesanGalat ?? "Layanan sedang terganggu."} Sesi Anda tidak terpengaruh.
				</p>
				<button type="button" className="tombol" onClick={muatUlang}>
					Coba lagi
				</button>
			</div>
		</main>
	);
}

/** Wajib sudah login. Belum login → /masuk. */
export function WajibLogin() {
	const { status } = useAuth();
	if (status === "memuat") return <Memuat />;
	if (status === "galat") return <LayananTerganggu />;
	if (status === "keluar") return <Navigate to="/masuk" replace />;
	return <Outlet />;
}

/** Wajib sudah memilih peran. Belum → /pilih-peran. */
export function WajibPeran() {
	const { sesi } = useAuth();
	if (!sesi?.peranAktif) return <Navigate to="/pilih-peran" replace />;
	return <Outlet />;
}

/**
 * Segmen URL (/putra atau /putri) harus cocok dengan peran aktif.
 * Pemisahan sebenarnya ditegakkan server; ini hanya mencegah laman yang salah tampil.
 */
export function WajibBagian({ segmen }: { segmen: "putra" | "putri" }) {
	const { sesi } = useAuth();
	if (!sesi?.peranAktif) return <Navigate to="/pilih-peran" replace />;
	const milikPeran = segmenPeran(sesi.peranAktif);
	if (milikPeran !== segmen) {
		return <Navigate to={`/${milikPeran}/dashboard`} replace />;
	}
	return <Outlet />;
}

/** Halaman tamu: bila sudah login, arahkan sesuai ada/tidaknya peran aktif. */
export function HanyaTamu() {
	const { status, sesi } = useAuth();
	if (status === "memuat") return <Memuat />;
	if (status === "masuk") {
		return (
			<Navigate
				to={
					sesi?.peranAktif
						? `/${segmenPeran(sesi.peranAktif)}/dashboard`
						: "/pilih-peran"
				}
				replace
			/>
		);
	}
	return <Outlet />;
}

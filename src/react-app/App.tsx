import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { segmenPeran } from "./api";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import {
	HanyaTamu,
	WajibBagian,
	WajibLogin,
	WajibPeran,
} from "./auth/GuardRute";
import CetakSurat from "./halaman/CetakSurat";
import Dashboard from "./halaman/Dashboard";
import LembarSurat from "./halaman/LembarSurat";
import Masuk from "./halaman/Masuk";
import Permohonan from "./halaman/Permohonan";
import PilihPeran from "./halaman/PilihPeran";
import Riwayat from "./halaman/Riwayat";
import SantriSakit from "./halaman/SantriSakit";
import { LayoutAplikasi } from "./komponen/LayoutAplikasi";

/** Rute lama /beranda → dasbor milik peran aktif. */
function Beranda() {
	const { sesi } = useAuth();
	return (
		<Navigate
			to={
				sesi?.peranAktif ? `/${segmenPeran(sesi.peranAktif)}/dashboard` : "/pilih-peran"
			}
			replace
		/>
	);
}

/** Lembar cetak A5: halaman penuh tanpa header/sidebar, tetap dijaga bagian & peran. */
function RuteLembar({ segmen }: { segmen: "putra" | "putri" }) {
	return (
		<Route path={`${segmen}/cetak/:id`} element={<WajibBagian segmen={segmen} />}>
			<Route index element={<LembarSurat />} />
		</Route>
	);
}

function RuteBagian({ segmen }: { segmen: "putra" | "putri" }) {
	return (
		<Route path={segmen} element={<WajibBagian segmen={segmen} />}>
			<Route index element={<Navigate to="dashboard" replace />} />
			<Route path="dashboard" element={<Dashboard />} />
			<Route path="sakit" element={<SantriSakit />} />
			<Route path="permohonan" element={<Permohonan />} />
			<Route path="riwayat" element={<Riwayat />} />
			<Route path="cetak" element={<CetakSurat />} />
		</Route>
	);
}

export default function App() {
	return (
		<BrowserRouter>
			<AuthProvider>
				<Routes>
					<Route element={<HanyaTamu />}>
						<Route path="/masuk" element={<Masuk />} />
					</Route>
					<Route element={<WajibLogin />}>
						<Route path="/pilih-peran" element={<PilihPeran />} />
						<Route element={<WajibPeran />}>
							<Route path="/beranda" element={<Beranda />} />
							{RuteLembar({ segmen: "putra" })}
							{RuteLembar({ segmen: "putri" })}
							<Route element={<LayoutAplikasi />}>
								{RuteBagian({ segmen: "putra" })}
								{RuteBagian({ segmen: "putri" })}
							</Route>
						</Route>
					</Route>
					<Route path="*" element={<Navigate to="/masuk" replace />} />
				</Routes>
			</AuthProvider>
		</BrowserRouter>
	);
}

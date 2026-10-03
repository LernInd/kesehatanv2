import { NavLink } from "react-router-dom";
import { segmenPeran } from "../api";
import { useAuth } from "../auth/AuthProvider";

interface Props {
	onPilih: () => void;
}

/** Menu samping untuk peran aktif; tautannya berprefiks /putra atau /putri. */
export function Sidebar({ onPilih }: Props) {
	const { sesi } = useAuth();
	if (!sesi?.peranAktif) return null;
	const dasar = `/${segmenPeran(sesi.peranAktif)}`;

	const menu = [
		{ ke: `${dasar}/dashboard`, label: "Dasbor" },
		{ ke: `${dasar}/sakit`, label: "Santri Sakit Hari Ini" },
		{ ke: `${dasar}/permohonan`, label: "Permohonan" },
		{ ke: `${dasar}/riwayat`, label: "Riwayat Siswa" },
		{ ke: `${dasar}/cetak`, label: "Cetak Surat" },
	];

	return (
		<nav className="menu-samping" aria-label="Navigasi utama">
			{menu.map((m) => (
				<NavLink
					key={m.ke}
					to={m.ke}
					onClick={onPilih}
					className={({ isActive }) =>
						isActive ? "menu-samping-tautan aktif" : "menu-samping-tautan"
					}
				>
					{m.label}
				</NavLink>
			))}
		</nav>
	);
}

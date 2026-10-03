import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

function inisial(nama: string): string {
	const kata = nama.trim().split(/\s+/).filter(Boolean);
	return ((kata[0]?.[0] ?? "") + (kata.length > 1 ? kata[kata.length - 1][0] : ""))
		.toUpperCase();
}

interface Props {
	sidebarTerbuka: boolean;
	onBukaSidebar: () => void;
}

export function Header({ sidebarTerbuka, onBukaSidebar }: Props) {
	const { sesi, keluar } = useAuth();
	const navigate = useNavigate();
	const [terbuka, setTerbuka] = useState(false);
	const wadah = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!terbuka) return;
		const klik = (e: MouseEvent) => {
			if (!wadah.current?.contains(e.target as Node)) setTerbuka(false);
		};
		const tekan = (e: KeyboardEvent) => {
			if (e.key === "Escape") setTerbuka(false);
		};
		document.addEventListener("mousedown", klik);
		document.addEventListener("keydown", tekan);
		return () => {
			document.removeEventListener("mousedown", klik);
			document.removeEventListener("keydown", tekan);
		};
	}, [terbuka]);

	if (!sesi) return null;
	const { nama_lengkap } = sesi.profil;

	return (
		<header className="header">
			<button
				type="button"
				className="burger"
				aria-label="Buka menu"
				aria-expanded={sidebarTerbuka}
				aria-controls="sidebar"
				onClick={onBukaSidebar}
			>
				<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M4 6h16M4 12h16M4 18h16"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						fill="none"
					/>
				</svg>
			</button>
			<span className="header-judul">Kesehatan Pesantren</span>

			<div className="profil" ref={wadah}>
				<button
					type="button"
					className="profil-tombol"
					aria-haspopup="menu"
					aria-expanded={terbuka}
					aria-label={`Menu profil ${nama_lengkap}`}
					onClick={() => setTerbuka((v) => !v)}
				>
					<span className="avatar" aria-hidden="true">
						{inisial(nama_lengkap)}
					</span>
					<span className="profil-nama">{nama_lengkap}</span>
					<svg
						className="profil-panah"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							d="m6 9 6 6 6-6"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							fill="none"
						/>
					</svg>
				</button>

				{terbuka && (
					<div className="menu" role="menu">
						<div className="menu-info">
							<strong>{nama_lengkap}</strong>
							<span>{sesi.peranAktif?.nama}</span>
						</div>
						<button
							type="button"
							role="menuitem"
							onClick={() => {
								setTerbuka(false);
								navigate("/pilih-peran");
							}}
						>
							Ganti peran
						</button>
						<button
							type="button"
							role="menuitem"
							className="menu-bahaya"
							onClick={() => {
								setTerbuka(false);
								keluar();
							}}
						>
							Keluar
						</button>
					</div>
				)}
			</div>
		</header>
	);
}

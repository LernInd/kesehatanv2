import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

/** Kerangka: header, sidebar kosong (drawer di mobile), dan area konten. */
export function LayoutAplikasi() {
	const [sidebarTerbuka, setSidebarTerbuka] = useState(false);

	useEffect(() => {
		if (!sidebarTerbuka) return;
		const tekan = (e: KeyboardEvent) => {
			if (e.key === "Escape") setSidebarTerbuka(false);
		};
		document.addEventListener("keydown", tekan);
		return () => document.removeEventListener("keydown", tekan);
	}, [sidebarTerbuka]);

	return (
		<div className="aplikasi">
			<Header
				sidebarTerbuka={sidebarTerbuka}
				onBukaSidebar={() => setSidebarTerbuka((v) => !v)}
			/>
			<div className="badan">
				<aside
					id="sidebar"
					className={sidebarTerbuka ? "sidebar terbuka" : "sidebar"}
					aria-label="Menu samping"
				>
					<Sidebar onPilih={() => setSidebarTerbuka(false)} />
				</aside>
				{sidebarTerbuka && (
					<div
						className="sidebar-latar"
						onClick={() => setSidebarTerbuka(false)}
						aria-hidden="true"
					/>
				)}
				<main className="isi">
					<Outlet />
				</main>
			</div>
		</div>
	);
}

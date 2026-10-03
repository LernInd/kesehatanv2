import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { panggilApi, type DataSesi, type Peran } from "../api";

/** `galat` = server/Supabase terganggu; sesi tidak diketahui dan TIDAK dianggap berakhir. */
type Status = "memuat" | "keluar" | "masuk" | "galat";

interface Nilai {
	status: Status;
	sesi: DataSesi | null;
	/** Pesan siap tampil saat status `galat`. */
	pesanGalat: string | null;
	muatUlang: () => void;
	/** Mengembalikan pesan galat, atau null bila berhasil. */
	masuk: (username: string, password: string) => Promise<string | null>;
	pilihPeran: (kode: Peran["kode"]) => Promise<string | null>;
	keluar: () => Promise<void>;
}

const Konteks = createContext<Nilai | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<Status>("memuat");
	const [sesi, setSesi] = useState<DataSesi | null>(null);

	const [pesanGalat, setPesanGalat] = useState<string | null>(null);

	const terapkan = useCallback((data: DataSesi | null) => {
		setSesi(data);
		setStatus(data ? "masuk" : "keluar");
	}, []);

	const muat = useCallback(async () => {
		const r = await panggilApi<DataSesi>("/api/auth/me");
		if (r.data) {
			terapkan(r.data);
		} else if (r.status === 401) {
			terapkan(null);
		} else {
			// 503 atau gagal jaringan: jangan memaksa login ulang, cukup tawarkan coba lagi.
			setPesanGalat(r.pesan);
			setStatus("galat");
		}
	}, [terapkan]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		muat();
	}, [muat]);

	const muatUlang = useCallback(() => {
		setStatus("memuat");
		muat();
	}, [muat]);

	const masuk = useCallback<Nilai["masuk"]>(
		async (username, password) => {
			const r = await panggilApi<DataSesi>("/api/auth/login", {
				username,
				password,
			});
			if (!r.data) return r.pesan ?? "Gagal masuk.";
			terapkan(r.data);
			return null;
		},
		[terapkan],
	);

	const pilihPeran = useCallback<Nilai["pilihPeran"]>(
		async (kode) => {
			const r = await panggilApi<{ peranAktif: Peran }>("/api/auth/peran", {
				kode,
			});
			if (!r.data) {
				if (r.status === 401) terapkan(null);
				return r.pesan ?? "Gagal memilih peran.";
			}
			setSesi((s) => (s ? { ...s, peranAktif: r.data!.peranAktif } : s));
			return null;
		},
		[terapkan],
	);

	const keluar = useCallback(async () => {
		await panggilApi("/api/auth/logout", {});
		terapkan(null);
	}, [terapkan]);

	const nilai = useMemo(
		() => ({ status, sesi, pesanGalat, muatUlang, masuk, pilihPeran, keluar }),
		[status, sesi, pesanGalat, muatUlang, masuk, pilihPeran, keluar],
	);
	return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): Nilai {
	const n = useContext(Konteks);
	if (!n) throw new Error("useAuth harus di dalam AuthProvider");
	return n;
}

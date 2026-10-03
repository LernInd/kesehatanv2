import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { PopupGalat } from "../komponen/PopupGalat";

export default function Masuk() {
	const { masuk } = useAuth();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [lihat, setLihat] = useState(false);
	const [memuat, setMemuat] = useState(false);
	const [galat, setGalat] = useState<string | null>(null);

	async function kirim(e: FormEvent) {
		e.preventDefault();
		if (memuat) return;
		setMemuat(true);
		const pesan = await masuk(username, password);
		setMemuat(false);
		// Sukses: AuthProvider mengubah status dan HanyaTamu mengarahkan ke /pilih-peran.
		if (pesan) {
			setPassword("");
			setGalat(pesan);
		}
	}

	return (
		<main className="halaman-tengah">
			<form className="kartu" onSubmit={kirim} noValidate>
				<h1>Kesehatan Pesantren</h1>
				<p className="sub">Masuk dengan akun Admin Kegiatan Anda.</p>

				<label htmlFor="username">Username</label>
				<input
					id="username"
					name="username"
					autoComplete="username"
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					maxLength={30}
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					required
				/>

				<label htmlFor="password">Kata sandi</label>
				<div className="isian-sandi">
					<input
						id="password"
						name="password"
						type={lihat ? "text" : "password"}
						autoComplete="current-password"
						maxLength={128}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
					<button
						type="button"
						className="tombol-teks"
						aria-pressed={lihat}
						onClick={() => setLihat((v) => !v)}
					>
						{lihat ? "Sembunyikan" : "Lihat"}
					</button>
				</div>

				<button
					type="submit"
					className="tombol"
					disabled={memuat || !username || !password}
				>
					{memuat ? "Memeriksa…" : "Masuk"}
				</button>
			</form>

			{galat && (
				<PopupGalat
					judul="Gagal masuk"
					pesan={galat}
					onTutup={() => setGalat(null)}
				/>
			)}
		</main>
	);
}

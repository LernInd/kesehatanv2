import { Hono } from "hono";
import { headerKeamanan, tolakLintasAsal } from "./keamanan";
import { rutAuth } from "./rute_auth";
import { rutKesehatan } from "./rute_kesehatan";
import type { AppEnv } from "./sesi";

const app = new Hono<AppEnv>();

app.use("/api/*", headerKeamanan, tolakLintasAsal);
app.route("/api/auth", rutAuth);
app.route("/api/kesehatan", rutKesehatan);
app.notFound((c) => c.json({ galat: "tidak_ditemukan" }, 404));
app.onError((galat, c) => {
	// Hanya pesan galat yang dicatat; jangan pernah isi permintaan, token, atau sandi.
	console.error("galat server:", galat instanceof Error ? galat.message : String(galat));
	return c.json({ galat: "server" }, 500);
});

export default app;

/**
 * Penjaga kontrak penerapan surat sakit ke presensi-db (SKEMA.md §7.1, §9).
 * Jalankan: npm test  (node --test, tanpa dependensi tambahan).
 *
 * Penerap dan pembatal hanya terikat oleh SATU literal string; mengubahnya di satu tempat
 * membuat pembatalan berjalan tanpa galat tetapi tidak memulihkan apa pun. Uji ini memaku
 * pasangan itu dan aturan kepemilikan `cara`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	CARA_SURAT,
	SQL_HAPUS_HARIAN,
	SQL_JEJAK,
	SQL_PULIHKAN_PEMBELAJARAN,
	SQL_TERAPKAN_HARIAN,
	SQL_TERAPKAN_PEMBELAJARAN,
	awalanJejak,
	lembagaUntukPresensi,
	polaJejak,
	teksJejak,
} from "../src/worker/presensi_sakit.ts";

const ID = "3f2a9c1e-0b7d-4e55-9a10-2d6f8c4b7e11";

test("jejak yang ditulis penerap cocok dengan pola yang dicari pembatal", () => {
	const jejak = teksJejak(ID, "Demam, istirahat di poliklinik");
	const pola = polaJejak(ID); // "Surat sakit <id>:%"
	assert.ok(pola.endsWith("%"));
	assert.ok(jejak.startsWith(pola.slice(0, -1)), "penerap dan pembatal harus satu awalan");
	assert.equal(awalanJejak(ID), `Surat sakit ${ID}:`);
});

test("awalan kesehatan tidak bersinggungan dengan awalan perizinan (Izin <id>:)", () => {
	const izin = `Izin ${ID}:`;
	assert.ok(!izin.startsWith(awalanJejak(ID)));
	assert.ok(!awalanJejak(ID).startsWith("Izin "));
});

test("awalan satu surat tidak bisa mencocokkan jejak surat lain", () => {
	const lain = "3f2a9c1e-0b7d-4e55-9a10-2d6f8c4b7e12";
	const awalan = polaJejak(ID).slice(0, -1);
	assert.ok(!teksJejak(lain, "x").startsWith(awalan));
});

test("kesehatan memakai nilai cara 'surat' dan tidak pernah 'izin'/'qr'/'manual'", () => {
	assert.equal(CARA_SURAT, "surat");
	for (const sql of [SQL_TERAPKAN_HARIAN, SQL_HAPUS_HARIAN]) {
		assert.ok(sql.includes("'surat'"));
		assert.ok(!/'izin'|'qr'|'manual'/.test(sql.replace(/status = 'sakit'/g, "")));
	}
});

test("penghapusan presensi_harian selalu berlingkup cara = 'surat' (tak pernah menyapu)", () => {
	assert.match(SQL_HAPUS_HARIAN, /cara\s*=\s*'surat'/);
	assert.match(SQL_HAPUS_HARIAN, /santri_id\s*=\s*\?/);
	assert.match(SQL_HAPUS_HARIAN, /tanggal between \? and \?/);
});

test("jejak menyaring perubahan nol dan tidak menimpa sebelum jejak ditulis", () => {
	assert.match(SQL_JEJAK, /insert into riwayat_presensi/);
	assert.match(SQL_JEJAK, /p\.status <> 'sakit'/);
	assert.match(SQL_TERAPKAN_PEMBELAJARAN, /status <> 'sakit'/);
});

test("pemulihan membaca jejak terbaru dan tidak menulis jejak baru", () => {
	assert.match(SQL_PULIHKAN_PEMBELAJARAN, /order by r\.id desc limit 1/);
	assert.match(SQL_PULIHKAN_PEMBELAJARAN, /r\.keterangan like \?/);
	assert.ok(!/insert into riwayat_presensi/.test(SQL_PULIHKAN_PEMBELAJARAN));
});

test("penerapan presensi_harian menimpa tanpa syarat dan memakai kunci (tanggal, santri_id, tipe)", () => {
	assert.match(SQL_TERAPKAN_HARIAN, /on conflict \(tanggal, santri_id, tipe\) do update/);
	assert.ok(!/where presensi_harian\.cara <> /.test(SQL_TERAPKAN_HARIAN)); // itu milik perizinan
	assert.match(SQL_TERAPKAN_HARIAN, /select 'masuk' as tipe union all select 'pulang'/);
});

test("lembaga presensi: lembaga ber-kelas diutamakan, bukan sekadar yang pertama didaftarkan", () => {
	const diniyah = { lembaga_id: "A-diniyah", created_at: "2026-01-01", santri_kelas: null };
	const mts = { lembaga_id: "B-mts", created_at: "2026-02-01", santri_kelas: { kelas_id: "k1" } };
	assert.equal(lembagaUntukPresensi([diniyah, mts]), "B-mts");
	assert.equal(lembagaUntukPresensi([mts, diniyah]), "B-mts");
});

test("lembaga presensi: tanpa kelas → paling awal didaftarkan, seri → lembaga_id terkecil", () => {
	const a = { lembaga_id: "L2", created_at: "2026-03-01" };
	const b = { lembaga_id: "L1", created_at: "2026-03-01" };
	const c = { lembaga_id: "L0", created_at: "2026-04-01" };
	assert.equal(lembagaUntukPresensi([c, a, b]), "L1");
});

test("lembaga presensi: santri tanpa lembaga menghasilkan null (pemanggil menolak 400)", () => {
	assert.equal(lembagaUntukPresensi([]), null);
	assert.equal(lembagaUntukPresensi(undefined), null);
});

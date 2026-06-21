// api/auth/signup.js
import { kv } from "../_kv.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	if (req.method === "OPTIONS") return res.status(200).end();
	if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

	const { email, password } = req.body || {};
	if (!email || !password || password.length < 6) {
		return res.status(400).json({ error: "Email e senha (minimo 6 caracteres) sao obrigatorios." });
	}

	const normalizedEmail = email.trim().toLowerCase();
	const existing = await kv.get(`user:${normalizedEmail}`);
	if (existing) {
		return res.status(409).json({ error: "Ja existe uma conta com esse email." });
	}

	const passwordHash = await bcrypt.hash(password, 10);
	const user = {
		email: normalizedEmail,
		passwordHash,
		geminiApiKey: null,
		createdAt: Date.now(),
	};
	await kv.set(`user:${normalizedEmail}`, user);

	const token = crypto.randomBytes(32).toString("hex");
	await kv.set(`session:${token}`, normalizedEmail, { ex: 60 * 60 * 24 * 30 }); // 30 dias

	return res.status(200).json({ token, email: normalizedEmail });
}

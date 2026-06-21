// api/user/apikey.js
import { kv } from "../_kv.js";
import { getUserFromRequest } from "../_auth.js";

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
	if (req.method === "OPTIONS") return res.status(200).end();
	if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

	const auth = await getUserFromRequest(req);
	if (!auth) return res.status(401).json({ error: "Nao autenticado." });

	const { apiKey } = req.body || {};
	if (typeof apiKey !== "string") {
		return res.status(400).json({ error: "Campo 'apiKey' obrigatorio (pode ser string vazia pra remover)." });
	}

	const updatedUser = { ...auth.user, geminiApiKey: apiKey.trim() || null };
	await kv.set(`user:${auth.email}`, updatedUser);

	return res.status(200).json({ ok: true, hasApiKey: !!updatedUser.geminiApiKey });
}

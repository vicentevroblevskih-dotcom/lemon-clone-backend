// api/history.js
import { kv } from "./_kv.js";
import { getUserFromRequest } from "./_auth.js";

const MAX_HISTORY_ITEMS = 50;

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
	if (req.method === "OPTIONS") return res.status(200).end();

	const auth = await getUserFromRequest(req);
	if (!auth) return res.status(401).json({ error: "Nao autenticado." });

	const key = `history:${auth.email}`;

	if (req.method === "GET") {
		const history = (await kv.get(key)) || [];
		return res.status(200).json({ history });
	}

	if (req.method === "POST") {
		const { kind, prompt, destination } = req.body || {};
		if (!kind || !prompt) {
			return res.status(400).json({ error: "Campos 'kind' e 'prompt' obrigatorios." });
		}

		const history = (await kv.get(key)) || [];
		history.unshift({
			kind,
			prompt: prompt.slice(0, 300),
			destination: destination || null,
			createdAt: Date.now(),
		});

		const trimmed = history.slice(0, MAX_HISTORY_ITEMS);
		await kv.set(key, trimmed);

		return res.status(200).json({ ok: true });
	}

	return res.status(405).json({ error: "Use GET ou POST." });
}

// api/generate.js
//
// Funcao serverless do Vercel.
// Recebe: { prompt: "descricao do que o usuario quer" }
// Devolve: { code: "codigo luau gerado" }
//
// Usa a API do Google Gemini (tem cota gratuita).
// Precisa configurar a variavel de ambiente GEMINI_API_KEY no Vercel
// (Project Settings > Environment Variables).
// Pegue a chave de graca em: https://aistudio.google.com/app/apikey

export default async function handler(req, res) {
	// Permitir requests vindos do plugin do Roblox Studio
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		return res.status(200).end();
	}

	if (req.method !== "POST") {
		return res.status(405).json({ error: "Use POST." });
	}

	const { prompt } = req.body || {};

	if (!prompt || typeof prompt !== "string") {
		return res.status(400).json({ error: "Campo 'prompt' obrigatorio." });
	}

	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		return res.status(500).json({ error: "GEMINI_API_KEY nao configurada no servidor." });
	}

	const systemPrompt = `Voce e um especialista em Luau e na API do Roblox.
Gere APENAS codigo Luau funcional, sem nenhuma explicacao, sem markdown, sem cercas de codigo (\`\`\`).
Siga boas praticas: use 'local', evite globais, use nomes claros em ingles para variaveis e PascalCase para servicos.
Se o pedido envolver RemoteEvents, crie-os corretamente dentro de ReplicatedStorage quando necessario.
Responda SOMENTE com o codigo, nada mais.`;

	try {
		const model = "gemini-2.0-flash";
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				systemInstruction: {
					parts: [{ text: systemPrompt }],
				},
				contents: [
					{
						role: "user",
						parts: [{ text: prompt }],
					},
				],
			}),
		});

		if (!response.ok) {
			const errText = await response.text();
			return res.status(502).json({ error: "Erro na API da IA: " + errText });
		}

		const data = await response.json();
		let code = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

		// Remove cercas de codigo se a IA mandar por engano
		code = code.replace(/^```(?:lua|luau)?\s*/i, "").replace(/```\s*$/i, "").trim();

		if (!code) {
			return res.status(502).json({ error: "A IA nao retornou codigo. Resposta: " + JSON.stringify(data) });
		}

		return res.status(200).json({ code });
	} catch (err) {
		return res.status(500).json({ error: "Erro interno: " + err.message });
	}
}


// api/generate.js
//
// Funcao serverless do Vercel.
// Recebe: { prompt: "descricao do que o usuario quer" }
// Devolve: { code: "codigo luau gerado" }
//
// Precisa configurar a variavel de ambiente ANTHROPIC_API_KEY no Vercel
// (Project Settings > Environment Variables).

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

	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		return res.status(500).json({ error: "ANTHROPIC_API_KEY nao configurada no servidor." });
	}

	const systemPrompt = `Voce e um especialista em Luau e na API do Roblox.
Gere APENAS codigo Luau funcional, sem nenhuma explicacao, sem markdown, sem cercas de codigo (\`\`\`).
Siga boas praticas: use 'local', evite globais, use nomes claros em ingles para variaveis e PascalCase para servicos.
Se o pedido envolver RemoteEvents, crie-os corretamente dentro de ReplicatedStorage quando necessario.
Responda SOMENTE com o codigo, nada mais.`;

	try {
		const response = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: "claude-sonnet-4-6",
				max_tokens: 2000,
				system: systemPrompt,
				messages: [
					{ role: "user", content: prompt },
				],
			}),
		});

		if (!response.ok) {
			const errText = await response.text();
			return res.status(502).json({ error: "Erro na API da IA: " + errText });
		}

		const data = await response.json();
		const textBlock = data.content?.find((block) => block.type === "text");
		let code = textBlock ? textBlock.text : "";

		// Remove cercas de codigo se a IA mandar por engano
		code = code.replace(/^```(?:lua|luau)?\s*/i, "").replace(/```\s*$/i, "").trim();

		return res.status(200).json({ code });
	} catch (err) {
		return res.status(500).json({ error: "Erro interno: " + err.message });
	}
}

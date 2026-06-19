// api/generate.js
//
// Funcao serverless do Vercel.
// Recebe: { prompt: "descricao do que o usuario quer" }
// Devolve: { code: "codigo luau gerado" }
//
// Usa a API da Groq (tem modelos gratuitos/baratos e rapidos).
// Precisa configurar a variavel de ambiente GROQ_API_KEY no Vercel
// (Project Settings > Environment Variables).
// Pegue a chave de graca em: https://console.groq.com/keys

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

	const apiKey = process.env.GROQ_API_KEY;
	if (!apiKey) {
		return res.status(500).json({ error: "GROQ_API_KEY nao configurada no servidor." });
	}

	const systemPrompt = `Voce e um especialista em Luau e na API do Roblox.
Sua tarefa: gerar codigo Luau funcional E decidir onde esse codigo deve ser colocado na arvore do jogo.

Regras de classificacao de destino (escolha UMA das opcoes abaixo, exatamente como escrito):
- "ServerScriptService" -> Script (servidor) que roda logica de jogo geral, NPCs, economia, drops, RemoteEvents do lado servidor, sistemas de loja, etc.
- "StarterPlayerScripts" -> LocalScript que roda uma vez por jogador, nao depende do personagem existir (ex: UI geral, camera, input de menu).
- "StarterCharacterScripts" -> LocalScript que precisa ser recriado a cada respawn do personagem (ex: scripts que mexem no Humanoid, animacoes, movimento, camera que segue o character, sistemas de vida/dano visual no character).
- "Workspace" -> Script (servidor) que fica anexado a uma parte fisica do mapa (ex: parte que gira, porta automatica, plataforma).
- "ReplicatedStorage" -> ModuleScript reutilizavel por varios scripts (ex: modulo de dados compartilhado, classe utilitaria) OU pasta de configuracao de RemoteEvents.

Regra de ouro: se o pedido menciona "personagem", "character", "humanoid", "animacao do jogador", "vida do jogador", "movimento do jogador" -> use "StarterCharacterScripts".

Responda SOMENTE em JSON valido, sem markdown, sem cercas de codigo, no formato exato:
{"destination": "UMA_DAS_OPCOES_ACIMA", "code": "codigo luau aqui, com \\n para quebras de linha"}

Siga boas praticas no codigo: use 'local', evite globais, use nomes claros em ingles para variaveis e PascalCase para servicos.
Se o pedido envolver RemoteEvents, crie-os corretamente dentro de ReplicatedStorage quando necessario.`;

	try {
		const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: "llama-3.3-70b-versatile",
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: prompt },
				],
				max_tokens: 2000,
			}),
		});

		if (!response.ok) {
			const errText = await response.text();
			return res.status(502).json({ error: "Erro na API da IA: " + errText });
		}

		const data = await response.json();
		let raw = data.choices?.[0]?.message?.content || "";

		// Remove cercas de codigo se a IA mandar por engano
		raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

		let code = "";
		let destination = "ServerScriptService"; // fallback seguro

		try {
			const parsed = JSON.parse(raw);
			code = parsed.code || "";
			if (parsed.destination) {
				destination = parsed.destination;
			}
		} catch (parseErr) {
			// A IA nao respondeu em JSON valido: usa o texto cru como codigo
			// e mantem o destino padrao.
			code = raw.replace(/^```(?:lua|luau)?\s*/i, "").replace(/```\s*$/i, "").trim();
		}

		const validDestinations = [
			"ServerScriptService",
			"StarterPlayerScripts",
			"StarterCharacterScripts",
			"Workspace",
			"ReplicatedStorage",
		];
		if (!validDestinations.includes(destination)) {
			destination = "ServerScriptService";
		}

		if (!code) {
			return res.status(502).json({ error: "A IA nao retornou codigo. Resposta: " + JSON.stringify(data) });
		}

		return res.status(200).json({ code, destination });
	} catch (err) {
		return res.status(500).json({ error: "Erro interno: " + err.message });
	}
}

// api/generate.js
//
// Motor híbrido: Usa Gemini 2.0 Flash (via GEMINI_API_KEY) para criar as interfaces (JSON)
// e Groq Llama 3.3 (via GROQ_API_KEY) para gerar os scripts normais (Luau).

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		return res.status(200).end();
	}

	if (req.method !== "POST") {
		return res.status(405).json({ error: "Utilize POST." });
	}

	const { prompt, existingCode } = req.body || {};

	if (!prompt || typeof prompt !== "string") {
		return res.status(400).json({ error: "Campo 'prompt' obrigatório." });
	}

	// Identificar para onde enviar com base no pedido de interface
	const isGuiRequest = prompt.toLowerCase().includes("gui") || 
	                     prompt.toLowerCase().includes("tela") || 
	                     prompt.toLowerCase().includes("loja") || 
	                     prompt.toLowerCase().includes("hud") || 
	                     prompt.toLowerCase().includes("menu") || 
	                     prompt.toLowerCase().includes("button") || 
	                     prompt.toLowerCase().includes("botao");

	const geminiKey = process.env.GEMINI_API_KEY;
	const groqKey = process.env.GROQ_API_KEY;

	// Se for GUI e tiver a chave do Gemini, vamos usar o Gemini 2.0 Flash!
	if (isGuiRequest && geminiKey) {
		const systemPrompt = `Você é uma UI/UX Designer Profissional de Roblox Studio. 
Sua tarefa é criar interfaces de altíssimo nível visual, limpas e modernas.
Como o destino é "StarterGui", você NÃO vai gerar código Luau. O campo "code" deve conter obrigatoriamente um array JSON estruturado com a árvore de elementos físicos a serem criados.

Use sempre UICorner (cantos arredondados entre 0,8 e 0,12), UIGradient (para dar profundidade nos frames e botões) e UIPadding (para margens internas).
Use cores modernas escuras (como "32,32,36") e cores de destaque vibrantes (como azul "0,162,255" ou amarelo "255,221,87").

Formato OBRIGATÓRIO do campo "code" (string do array JSON de objetos):
"[{\\"ClassName\\":\\"ScreenGui\\",\\"Name\\":\\"ShopGui\\",\\"Properties\\":{\\"IgnoreGuiInset\\":true},\\"Children\\":[{\\"ClassName\\":\\"Frame\\",\\"Name\\":\\"MainFrame\\",\\"Properties\\":{\\"Size\\":\\"0.4,0,0.6,0\\",\\"Position\\":\\"0.5,0,0.5,0\\",\\"AnchorPoint\\":\\"0.5,0.5\\",\\"BackgroundColor3\\":\\"32,32,36\\"},\\"Children\\":[{\\"ClassName\\":\\"UICorner\\",\\"Name\\":\\"FrameCorner\\",\\"Properties\\":{\\"CornerRadius\\":\\"0,10\\"}}]}]}]"

Responda estritamente no formato JSON:
{
  "destination": "StarterGui",
  "code": "STRING_DO_ARRAY_JSON_DE_INSTANCIAS_AQUI"
}`;

		try {
			const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					contents: [{
						parts: [{ text: `Pedido do usuário: ${prompt}\n\nCódigo anterior opcional: ${existingCode || ""}` }]
					}],
					systemInstruction: {
						parts: [{ text: systemPrompt }]
					},
					generationConfig: {
						responseMimeType: "application/json",
						temperature: 0.2
					}
				})
			});

			if (!response.ok) {
				throw new Error(await response.text());
			}

			const data = await response.json();
			const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
			const parsedResult = JSON.parse(textResult);

			return res.status(200).json({
				code: parsedResult.code || "",
				destination: "StarterGui",
				model: "Gemini 2.0 Flash"
			});
		} catch (err) {
			// Se o Gemini falhar por algum motivo, deixa cair no fallback do Groq abaixo
			console.error("Falha no Gemini, tentando Groq:", err.message);
		}
	}

	// FALLBACK OU SCRIPTS GERAIS (Groq Llama 3.3)
	if (!groqKey) {
		return res.status(200).json({ 
			error: "Nenhuma chave de API configurada no backend (Vercel).", 
			destination: "ServerScriptService" 
		});
	}

	const systemPromptGroq = `Você é um programador Luau especialista em Roblox Studio.
Sua tarefa é gerar código Luau limpo, otimizado e profissional de acordo com o pedido.
Decida o destino com base nas regras: "ServerScriptService", "StarterPlayerScripts", "StarterCharacterScripts", "Workspace", "ReplicatedStorage".

Responda OBRIGATORIAMENTE em JSON:
{"destination": "NOME_DO_DESTINO", "code": "CÓDIGO_LUAU_AQUI"}`;

	try {
		const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${groqKey}`
			},
			body: JSON.stringify({
				model: "llama-3.3-70b-versatile",
				messages: [
					{ role: "system", content: systemPromptGroq },
					{ role: "user", content: prompt }
				],
				max_tokens: 2000
			})
		});

		if (!response.ok) {
			const errText = await response.text();
			return res.status(200).json({ error: "Erro na Groq: " + errText, destination: "ServerScriptService" });
		}

		const data = await response.json();
		let raw = data.choices?.[0]?.message?.content || "";
		raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

		const parsed = JSON.parse(raw);
		return res.status(200).json({
			code: parsed.code || "",
			destination: parsed.destination || "ServerScriptService",
			model: "Llama 3.3 (Groq)"
		});
	} catch (err) {
		return res.status(200).json({ 
			error: "Erro crítico de processamento: " + err.message, 
			destination: "ServerScriptService" 
		});
	}
}

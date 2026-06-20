// api/generate.js
//
// Funcao serverless do Vercel.
// Recebe: { prompt: "descricao do que o usuario quer", existingCode?: "codigo anterior se for edicao" }
// Devolve UM dos dois formatos:
//   - Para scripts normais: { kind: "script", code: "...luau...", destination: "ServerScriptService" }
//   - Para GUI: { kind: "gui", guiTree: { ClassName, Name, Properties, Children }, destination: "StarterGui" }
//
// O guiTree e' uma arvore de Instances que o PLUGIN cria de verdade no Explorer
// (em vez de pedir pra IA escrever um script que constroi a UI via codigo,
// o que costuma sair feio e fragil).
//
// Roteamento de modelo:
// - Pedidos de GUI/UI/interface -> Gemini 3.5 Flash (melhor pra design visual)
// - Demais pedidos (scripts de jogo, logica, etc) -> Groq (rapido e gratuito)
//
// Variaveis de ambiente necessarias no Vercel:
// - GROQ_API_KEY   (https://console.groq.com/keys)
// - GEMINI_API_KEY (https://aistudio.google.com/app/apikey)

function isGuiRequest(text) {
	const guiKeywords = [
		"gui", "ui ", " ui", "interface", "tela", "menu", "hud",
		"botao", "botão", "painel", "inventario", "inventário",
		"loja visual", "shop", "tela de", "janela", "popup",
	];
	const lower = text.toLowerCase();
	return guiKeywords.some((kw) => lower.includes(kw));
}

const SCRIPT_SYSTEM_PROMPT = `Voce e um especialista em Luau e na API do Roblox.
Sua tarefa: gerar codigo Luau funcional E decidir onde esse codigo deve ser colocado na arvore do jogo.

Regras de classificacao de destino (escolha UMA das opcoes abaixo, exatamente como escrito):
- "ServerScriptService" -> Script (servidor) que roda logica de jogo geral, NPCs, economia, drops, RemoteEvents do lado servidor, sistemas de loja, etc.
- "StarterPlayerScripts" -> LocalScript que roda uma vez por jogador, nao depende do personagem existir.
- "StarterCharacterScripts" -> LocalScript que precisa ser recriado a cada respawn do personagem (mexe no Humanoid, animacoes, movimento, camera que segue o character).
- "Workspace" -> Script (servidor) anexado a uma parte fisica do mapa (parte que gira, porta automatica, plataforma).
- "ReplicatedStorage" -> ModuleScript reutilizavel ou pasta de configuracao de RemoteEvents.

Regra de ouro: se mencionar "personagem", "character", "humanoid", "animacao do jogador" -> "StarterCharacterScripts".

Responda SOMENTE em JSON valido, sem markdown, sem cercas de codigo, no formato exato:
{"destination": "UMA_DAS_OPCOES_ACIMA", "code": "codigo luau aqui, com \\n para quebras de linha"}

Siga boas praticas: use 'local', evite globais, nomes claros em ingles, PascalCase para servicos.
Se envolver RemoteEvents, crie-os dentro de ReplicatedStorage quando necessario.`;

const GUI_SYSTEM_PROMPT = `Voce e um especialista em design de interfaces (UI/UX) para jogos Roblox.
Sua tarefa: gerar uma ARVORE DE INSTANCES (nao um script!) que representa a interface pedida, pronta pra ser criada de verdade no Explorer do Roblox Studio.

Responda SOMENTE em JSON valido, sem markdown, sem cercas de codigo, EXATAMENTE neste formato:
{
  "destination": "StarterGui",
  "guiTree": {
    "ClassName": "ScreenGui",
    "Name": "NomeDaTela",
    "Properties": { "IgnoreGuiInset": true, "ResetOnSpawn": false },
    "Children": [ ... mais nodes no mesmo formato ... ]
  }
}

Cada node tem: "ClassName" (ex: Frame, TextLabel, TextButton, UICorner, UIListLayout, UIPadding, UIStroke, ScrollingFrame, ImageLabel, UIGridLayout),
"Name" (string, PascalCase, descritivo), "Properties" (objeto chave-valor) e "Children" (array, pode ser vazio).

Para valores de propriedade que NAO sao numero/string/bool simples, use estes formatos especiais (eles serao decodificados pelo plugin):
- UDim2: {"__type":"UDim2","v":[xScale,xOffset,yScale,yOffset]}
- UDim: {"__type":"UDim","v":[scale,offset]}
- Color3 (RGB 0-255): {"__type":"Color3","v":[r,g,b]}
- Vector2: {"__type":"Vector2","v":[x,y]}
- Enum: {"__type":"Enum","v":"Font.GothamBold"}  (ou "TextXAlignment.Center", etc)

REGRAS DE DESIGN (obrigatorias, interfaces malfeitas sao o erro mais comum, evite a todo custo):
- ScreenGui: IgnoreGuiInset=true, ResetOnSpawn=false.
- O Frame principal deve ter Size em UDim2 por Scale (ex: [0.5,0,0.6,0]), AnchorPoint Vector2 [0.5,0.5] e Position UDim2 [0.5,0,0.5,0] pra ficar centralizado.
- TODO Frame e botao precisa ter um filho UICorner com Properties {"CornerRadius": {"__type":"UDim","v":[0,12]}}.
- Paleta moderna: fundo escuro Color3 [24,24,28] ou [30,30,36], cor de destaque vibrante (amarelo [255,221,87], azul [88,166,255] ou verde [88,255,150]), texto branco/cinza claro [235,235,235].
- Containers com mais de 1 filho visual devem ter um UIListLayout ou UIGridLayout como filho, com Padding (UDim [0,8] a [0,12]) e definir SortOrder como Enum LayoutOrder.
- Use UIPadding como filho de containers pra dar respiro interno (8 a 16px = UDim [0,8] a [0,16] em cada lado: PaddingTop/Bottom/Left/Right).
- Botoes: BackgroundColor3 = cor de destaque, TextColor3 = contrastante, Font = Enum "Font.GothamBold", TextSize 16-22.
- Titulos (TextLabel no topo): Font "Font.GothamBold", TextSize 20-28.
- Adicione UIStroke (Thickness 1-2, Color semi-claro) no Frame principal pra dar profundidade, quando fizer sentido.
- Texto sempre com BackgroundTransparency 1 quando for so texto.
- Nomeie tudo de forma clara: "MainFrame", "TitleLabel", "CloseButton", "ItemList", etc.`;

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		return res.status(200).end();
	}
	if (req.method !== "POST") {
		return res.status(405).json({ error: "Use POST." });
	}

	const { prompt, existingCode } = req.body || {};

	if (!prompt || typeof prompt !== "string") {
		return res.status(400).json({ error: "Campo 'prompt' obrigatorio." });
	}

	const useGemini = isGuiRequest(prompt);

	const groqKey = process.env.GROQ_API_KEY;
	const geminiKey = process.env.GEMINI_API_KEY;

	if (useGemini && !geminiKey) {
		return res.status(500).json({ error: "GEMINI_API_KEY nao configurada no servidor." });
	}
	if (!useGemini && !groqKey) {
		return res.status(500).json({ error: "GROQ_API_KEY nao configurada no servidor." });
	}

	const systemPrompt = useGemini ? GUI_SYSTEM_PROMPT : SCRIPT_SYSTEM_PROMPT;

	const userMessage = existingCode
		? `Pedido do usuario: ${prompt}\n\nIMPORTANTE: ja existe algo anterior que precisa ser MODIFICADO (nao crie do zero, edite/expanda o que ja existe abaixo, aplicando a mudanca pedida):\n\n${existingCode}`
		: prompt;

	try {
		let rawContent = "";

		if (useGemini) {
			const model = "gemini-3.5-flash";
			const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					systemInstruction: { parts: [{ text: systemPrompt }] },
					contents: [{ role: "user", parts: [{ text: userMessage }] }],
				}),
			});

			if (!response.ok) {
				const errText = await response.text();
				return res.status(502).json({ error: "Erro na API do Gemini: " + errText });
			}

			const data = await response.json();
			rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
		} else {
			const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${groqKey}`,
				},
				body: JSON.stringify({
					model: "llama-3.3-70b-versatile",
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: userMessage },
					],
					max_tokens: 3000,
				}),
			});

			if (!response.ok) {
				const errText = await response.text();
				return res.status(502).json({ error: "Erro na API da Groq: " + errText });
			}

			const data = await response.json();
			rawContent = data.choices?.[0]?.message?.content || "";
		}

		const raw = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

		let parsed;
		try {
			parsed = JSON.parse(raw);
		} catch (parseErr) {
			return res.status(502).json({ error: "A IA nao respondeu em JSON valido. Resposta cru: " + rawContent });
		}

		if (useGemini) {
			if (!parsed.guiTree) {
				return res.status(502).json({ error: "A IA nao retornou guiTree. Resposta cru: " + rawContent });
			}
			return res.status(200).json({
				kind: "gui",
				destination: "StarterGui",
				guiTree: parsed.guiTree,
			});
		} else {
			const validDestinations = [
				"ServerScriptService",
				"StarterPlayerScripts",
				"StarterCharacterScripts",
				"Workspace",
				"ReplicatedStorage",
			];
			let destination = validDestinations.includes(parsed.destination)
				? parsed.destination
				: "ServerScriptService";

			if (!parsed.code) {
				return res.status(502).json({ error: "A IA nao retornou codigo. Resposta cru: " + rawContent });
			}

			return res.status(200).json({
				kind: "script",
				destination,
				code: parsed.code,
			});
		}
	} catch (err) {
		return res.status(500).json({ error: "Erro interno: " + err.message });
	}
}

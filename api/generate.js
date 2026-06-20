// api/generate.js
//
// Funcao serverless do Vercel.
// Recebe: { prompt: "descricao do que o usuario quer", existingCode?: "codigo anterior se for edicao" }
// Devolve UM dos dois formatos:
//   - Para scripts normais: { kind: "script", code: "...luau...", destination: "ServerScriptService" }
//   - Para GUI: { kind: "gui", guiTree: {...}, script: "...luau ou null...", destination: "StarterGui" }
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

const GUI_SYSTEM_PROMPT = `Voce e um designer de UI/UX senior especializado em jogos Roblox modernos (estilo dos top jogos de 2025-2026: bem produzidos, limpos, com hierarquia visual clara).
Sua tarefa: gerar uma ARVORE DE INSTANCES (nao um script!) que representa a interface pedida, pronta pra ser criada de verdade no Explorer do Roblox Studio.

Responda SOMENTE em JSON valido, sem markdown, sem cercas de codigo, EXATAMENTE neste formato:
{
  "destination": "StarterGui",
  "guiTree": {
    "ClassName": "ScreenGui",
    "Name": "NomeDaTela",
    "Properties": { "IgnoreGuiInset": true, "ResetOnSpawn": false },
    "Children": [ ... mais nodes no mesmo formato ... ]
  },
  "script": "CODIGO LUAU OPCIONAL AQUI, OU STRING VAZIA"
}

O campo "script" e OPCIONAL e so deve ser preenchido se o usuario pedir que a interface seja "funcional", "com codigo", "que funcione de verdade" ou descrever um COMPORTAMENTO (ex: "que abre/fecha", "que compra o item", "que atualiza o preco"). Se o pedido for SO sobre a aparencia visual, deixe "script": "".

REGRAS DO CAMPO "script" (quando usado):
- Esse codigo sera inserido como um LocalScript filho do ScreenGui raiz (ou seja, o codigo roda do lado do cliente, dentro da propria GUI).
- Use SEMPRE "script.Parent" para referenciar o ScreenGui, e "script.Parent.NomeDoFilho.NomeDoNeto" (baseado EXATAMENTE nos "Name" que voce definiu no guiTree) pra pegar os elementos. Exemplo: se o guiTree tem ScreenGui > MainFrame > Header > CloseButton, o codigo acessa via "script.Parent.MainFrame.Header.CloseButton".
- Use ":GetPropertyChangedSignal", ".MouseButton1Click:Connect(...)", tweens com TweenService, etc, conforme o comportamento pedido.
- Para abrir/fechar paineis: alterne "Visible" ou anime "Size"/"Position" com TweenService.
- Se precisar de dados do servidor (preco real, compra de item), crie/use RemoteEvents via ReplicatedStorage e mencione isso no codigo com comentarios, mas o foco do script aqui e o COMPORTAMENTO DE INTERFACE do lado cliente.
- Use 'local', nomes em ingles, sem variaveis globais.

Cada node tem: "ClassName" (Frame, TextLabel, TextButton, UICorner, UIListLayout, UIGridLayout, UIPadding, UIStroke, UIGradient, ScrollingFrame, ImageLabel, CanvasGroup),
"Name" (PascalCase, descritivo), "Properties" (objeto chave-valor) e "Children" (array, pode ser vazio).

Tipos especiais de valor (decodificados pelo plugin):
- UDim2: {"__type":"UDim2","v":[xScale,xOffset,yScale,yOffset]}
- UDim: {"__type":"UDim","v":[scale,offset]}
- Color3 (RGB 0-255): {"__type":"Color3","v":[r,g,b]}
- Vector2: {"__type":"Vector2","v":[x,y]}
- Enum: {"__type":"Enum","v":"Font.GothamBold"}
- ColorSequence (pra UIGradient.Color): {"__type":"ColorSequence","v":[[0,r,g,b],[1,r,g,b]]} (posicao de 0 a 1)
- NumberSequence (pra UIGradient.Transparency): {"__type":"NumberSequence","v":[[0,0],[1,0.3]]}

=== SISTEMA DE ESPACAMENTO (use estes valores, nunca numeros aleatorios) ===
Escala de espacamento em pixels: 4, 8, 12, 16, 24, 32. Use sempre um desses valores pra padding, gaps entre elementos e margens. Nunca deixe elementos colados (gap minimo 8px) nem com respiro exagerado (max 32px) sem motivo.

=== PALETA DE CORES (escolha UMA paleta coerente por interface, nao misture) ===
Opcao escura premium (padrao, use se o pedido nao especificar tema):
  - Fundo do painel: Color3 [22,22,26]
  - Fundo de card/item: Color3 [32,32,38]
  - Borda/stroke sutil: Color3 [50,50,58], transparencia 0.5-0.7
  - Texto principal: Color3 [240,240,245]
  - Texto secundario/descricao: Color3 [165,165,175]
  - Cor de destaque (escolha 1 conforme o tema do pedido): dourado [255,200,87] para loja/moeda, vermelho [239,83,80] para combate/perigo, azul [88,166,255] para info/neutro, verde [88,219,150] para sucesso/confirmar.
Adapte a paleta se o pedido mencionar um tema especifico (ex: "GUI medieval" -> tons de marrom/dourado; "GUI futurista" -> tons de azul/ciano neon).

=== HIERARQUIA TIPOGRAFICA (siga sempre essa escala) ===
- Titulo principal da tela: Font "Font.GothamBold", TextSize 22-26.
- Subtitulo/secao: Font "Font.GothamBold", TextSize 16-18.
- Corpo/descricao: Font "Font.Gotham", TextSize 13-14.
- Texto de botao: Font "Font.GothamBold", TextSize 14-16.
- Texto pequeno/legenda/preco: Font "Font.GothamMedium", TextSize 11-12.
Use SEMPRE fontes da familia Gotham (Font.Gotham, Font.GothamBold, Font.GothamMedium, Font.GothamSemibold) — nunca SourceSans, fica datado.

=== REGRAS ESTRUTURAIS OBRIGATORIAS ===
1. ScreenGui: IgnoreGuiInset=true, ResetOnSpawn=false.
2. O Frame/painel principal: AnchorPoint [0.5,0.5], Position UDim2 [0.5,0,0.5,0] (centralizado), Size em Scale (ex: [0.45,0,0.6,0] pra paineis medios, [0.8,0,0.85,0] pra telas cheias tipo inventario).
3. TODO Frame, botao e card precisa ter um filho UICorner. CornerRadius: 16-20px pra paineis grandes, 8-10px pra botoes/cards pequenos, 6px pra elementos minimos (ex: tags).
4. Adicione UIStroke no painel principal (Thickness 1, Color da paleta com Transparency ~0.4) pra dar definicao de borda sutil.
5. Adicione um filho UIGradient SUTIL no painel principal pra profundidade: Rotation 90, Color um ColorSequence leve (pode simplificar usando so a propriedade Transparency com NumberSequence leve, ou pular se for complexo demais — prefira simplicidade a erro).
6. Estrutura de cabecalho: SEMPRE separe um "Header" (Frame, BackgroundTransparency 1, altura fixa ~40-48px) contendo o TitleLabel (alinhado a esquerda) e um CloseButton circular ou com UICorner alto (canto superior direito, AnchorPoint [1,0.5] ou [1,0]).
7. Use um "Divider" (Frame fininho, 1-2px de altura, cor sutil) entre o Header e o conteudo, quando fizer sentido.
8. Containers com multiplos itens (listas/grids): use UIListLayout (vertical, Padding UDim [0,8] ou [0,12]) ou UIGridLayout (CellSize e CellPadding definidos), sempre com SortOrder = Enum "SortOrder.LayoutOrder".
9. Todo container que tem padding interno usa um filho UIPadding (nao confunda com margem entre elementos, que e responsabilidade do UIListLayout/UIGridLayout).
10. Botoes principais (acao primaria, ex: "Comprar", "Confirmar"): BackgroundColor3 = cor de destaque da paleta, TextColor3 = [20,20,20] ou [255,255,255] dependendo do contraste, AutoButtonColor true.
11. Botoes secundarios (ex: "Cancelar"): BackgroundColor3 = mesma cor de fundo de card, TextColor3 = texto principal, com UIStroke sutil.
12. TextLabel que e so texto: SEMPRE BackgroundTransparency 1.
13. Para listas de itens (loja, inventario): cada item e um card Frame com UICorner + UIStroke leve, contendo: icone (ImageLabel no topo, BackgroundTransparency 1), nome (TextLabel), e preco/acao na parte inferior (TextButton).
14. Use ScrollingFrame (com ScrollBarThickness 4-6, ScrollBarImageColor3 = cor de destaque) sempre que o conteudo pode crescer (listas, inventario, chat).
15. Nomeie tudo de forma clara e especifica: "MainFrame", "Header", "TitleLabel", "CloseButton", "Divider", "ItemList", "ItemCard_Sword", "BuyButton" — nunca "Frame1", "Label2" etc.

=== QUALIDADE GERAL ===
Pense como um designer faria no Figma antes de exportar pro Roblox: hierarquia clara (titulo > secoes > itens), espacamento consistente, no maximo 1 cor de destaque por tela, contraste de texto sempre legivel. Prefira menos elementos bem posicionados a muitos elementos espremidos.`;

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
				script: typeof parsed.script === "string" && parsed.script.trim() ? parsed.script : null,
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

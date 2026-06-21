// api/generate.js
//
// Funcao serverless do Vercel.
// Recebe: { prompt: "descricao do que o usuario quer", existingCode?: "codigo anterior se for edicao" }
// Devolve UM dos tres formatos:
//   - Script: { kind: "script", code: "...luau...", destination: "...", auxObjects: [...], templates: [...] }
//   - GUI:    { kind: "gui", guiTree: {...}, script: "...luau ou null...", destination: "StarterGui" }
//   - Build:  { kind: "build", buildTree: {...}, destination: "Workspace" }
//
// guiTree/buildTree sao arvores de Instances que o PLUGIN cria de verdade no
// Explorer/Workspace (em vez de pedir pra IA escrever um script que constroi
// tudo via Instance.new(), o que costuma sair feio e fragil).
//
// Modelo: Gemini 3.5 Flash para tudo (scripts, GUI e construcao 3D).
//
// Variavel de ambiente necessaria no Vercel:
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

function isBuildRequest(text) {
	const buildKeywords = [
		"constru", "monte", "monta", "criar uma casa", "crie uma casa",
		"predio", "prédio", "castelo", "mapa", "cenario", "cenário",
		"plataforma", "terreno", "estrutura", "torre", "ponte",
		"arena", "labirinto", "ilha", "build ", "faça um mapa",
	];
	const lower = text.toLowerCase();
	return buildKeywords.some((kw) => lower.includes(kw));
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

REGRA IMPORTANTE SOBRE OBJETOS AUXILIARES (RemoteEvent, RemoteFunction, Folder, BindableEvent, etc):
NUNCA crie esses objetos via Instance.new() dentro do codigo do script. Em vez disso, liste-os no campo "auxObjects" pra serem criados de verdade no Explorer, e no codigo use SEMPRE ":WaitForChild('Nome')" pra pegar a referencia.
Exemplo: precisa de um RemoteEvent chamado "BuyItem" em ReplicatedStorage? Adicione em auxObjects: {"ClassName":"RemoteEvent","Name":"BuyItem","Parent":"ReplicatedStorage"}, e no codigo use: local BuyItem = game:GetService("ReplicatedStorage"):WaitForChild("BuyItem").
"Parent" deve ser um destes: "ReplicatedStorage", "ServerStorage", "ServerScriptService", "Workspace".
Se nao precisar de nenhum objeto auxiliar, retorne "auxObjects": [].

REGRA IMPORTANTE SOBRE ELEMENTOS VISUAIS ANEXADOS A PERSONAGENS/PARTES (tags flutuantes, indicadores acima da cabeca, BillboardGui, status visual tipo "AFK", nivel, vida, nome customizado, etc):
NUNCA construa esses elementos visuais via Instance.new() dentro do codigo (BillboardGui, TextLabel, ImageLabel feitos linha por linha no script SEMPRE ficam invisiveis ou bugados nesse contexto). Em vez disso, defina um "template" pronto (a arvore completa do elemento, ex: BillboardGui > Frame > TextLabel) no campo "templates", e no codigo apenas CLONE esse template em runtime e parente no lugar certo (ex: no Head do personagem).
Formato de "templates": array de objetos {"Name": "NomeDoTemplate", "tree": { ...mesmo formato de node usado em GUI: ClassName, Name, Properties, Children... }}.
Os templates sao salvos em ReplicatedStorage dentro de uma pasta "Templates" (criada automaticamente). No codigo, pegue assim: local template = game:GetService("ReplicatedStorage"):WaitForChild("Templates"):WaitForChild("NomeDoTemplate"); depois local clone = template:Clone(); clone.Parent = character:WaitForChild("Head") (ou outro alvo apropriado).
Tipos especiais de valor dentro de "tree" (mesmos da GUI): UDim2 {"__type":"UDim2","v":[xS,xO,yS,yO]}, UDim {"__type":"UDim","v":[s,o]}, Color3 {"__type":"Color3","v":[r,g,b]}, Vector2 {"__type":"Vector2","v":[x,y]}, Enum {"__type":"Enum","v":"Font.GothamBold"}.
Exemplo de uso: tag de "AFK" acima da cabeca = template "AfkTag" com BillboardGui (Size UDim2 [0,80,0,30], AlwaysOnTop true, StudsOffset Vector3 nao suportado entao use apenas propriedades 2D) contendo um TextLabel com Text "AFK", fundo semi-transparente e cantos arredondados (UICorner).
Se nao precisar de nenhum template visual, retorne "templates": [].

Responda SOMENTE em JSON valido, sem markdown, sem cercas de codigo, no formato exato:
{"destination": "UMA_DAS_OPCOES_ACIMA", "code": "codigo luau aqui, com \\n para quebras de linha", "auxObjects": [{"ClassName": "RemoteEvent", "Name": "NomeDoEvento", "Parent": "ReplicatedStorage"}], "templates": [{"Name": "NomeDoTemplate", "tree": { "ClassName": "BillboardGui", "Name": "NomeDoTemplate", "Properties": {}, "Children": [] }}]}

Siga boas praticas: use 'local', evite globais, nomes claros em ingles, PascalCase para servicos.`;

const BUILD_SYSTEM_PROMPT = `Voce e um construtor 3D especialista em Roblox Studio, equivalente a um level designer que constroi estruturas usando Parts e Models.
Sua tarefa: gerar uma ARVORE DE INSTANCES 3D (Model/Part/UnionOperation/etc) que representa a construcao pedida, pronta pra ser criada de verdade no Workspace.

Responda SOMENTE em JSON valido, sem markdown, sem cercas de codigo, EXATAMENTE neste formato:
{
  "destination": "Workspace",
  "buildTree": {
    "ClassName": "Model",
    "Name": "NomeDaConstrucao",
    "Properties": {},
    "Children": [ ... Parts e sub-models no mesmo formato ... ]
  }
}

Cada node tem: "ClassName" (use principalmente "Part" pra blocos, "Model" pra agrupar partes relacionadas, "WedgePart" pra rampas/telhados triangulares),
"Name" (PascalCase, descritivo, ex: "Parede_Frente", "Telhado", "Porta", "Pilar1"), "Properties" e "Children".

Tipos especiais de valor (decodificados pelo plugin):
- Vector3 (posicao/tamanho, em studs): {"__type":"Vector3","v":[x,y,z]}
- Color3 (RGB 0-255): {"__type":"Color3","v":[r,g,b]}
- Enum: {"__type":"Enum","v":"Material.Wood"} (ou "Material.Brick", "Material.Concrete", "Material.Glass", "PartType.Cylinder", etc)

PROPRIEDADES ESSENCIAIS DE TODO "Part" (sempre defina):
- "Size": Vector3 com as dimensoes em studs (ex: [10,1,10] pra um piso fino e largo).
- "Position": Vector3 com a posicao no mundo. IMPORTANTE: planeje as posicoes RELATIVAS ENTRE SI pra as pecas se encaixarem corretamente (ex: paredes nas bordas do piso, telhado acima das paredes, porta no meio de uma parede). Calcule as coordenadas com cuidado, baseado no Size de cada peca.
- "Anchored": true (SEMPRE true, senao a construcao cai com a gravidade).
- "Material": Enum "Material.XXX" (escolha um material coerente com o pedido: madeira="Material.Wood", pedra="Material.Concrete" ou "Material.Slate", metal="Material.Metal" ou "Material.DiamondPlate", vidro="Material.Glass", tijolo="Material.Brick", grama="Material.Grass").
- "Color": Color3 coerente com o material/tema (ex: madeira tons de marrom [120,80,50], pedra tons de cinza [140,140,140], grama verde [90,140,60]).
- "BrickColor" NAO deve ser usado, use sempre "Color" (Color3).
- "TopSurface" e "BottomSurface": Enum "SurfaceType.Smooth" (evita unioes visuais estranhas entre pecas).

REGRAS DE CONSTRUCAO:
1. Sempre comece com um "Model" raiz contendo todas as partes, com um nome descritivo.
2. Pense na estrutura como um arquiteto: fundacao/piso primeiro, depois paredes, depois teto/telhado, depois detalhes (portas, janelas, decoracoes).
3. Para casas/predios: defina um Size de planta baixa (ex: piso 20x1x16), depois paredes de altura proporcional (ex: 1x8x16 ou 20x8x1 dependendo da orientacao), encaixando nas bordas do piso usando a matematica de Position corretamente (centro do piso +/- metade da largura).
4. Use WedgePart pra telhados inclinados quando fizer sentido, ou Parts normais empilhadas formando um teto simples se for mais facil de calcular.
5. Adicione pelo menos um nivel de detalhe (janelas como Parts mais escuras/com Material Glass, porta como Part de cor diferente) pra nao ficar uma caixa generica.
6. Para estruturas grandes (mapas, arenas), pode usar mais Parts repetidas em padrao (ex: arquibancada com Parts em escada), mas mantenha o JSON razoavel em tamanho (max ~40-60 parts).
7. Nao use fisica complexa, juntas ou scripts aqui — essa tarefa e SOMENTE sobre geometria estatica (Anchored true).
8. Posicione a construcao com a base proxima de Y=0 a Y=5 (nivel do chao), a menos que o pedido peca algo flutuante/elevado.`;

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

	const isGui = isGuiRequest(prompt);
	const isBuild = !isGui && isBuildRequest(prompt);

	// Se o usuario estiver logado no site e tiver configurado a propria chave,
	// usa ela. Senao, cai pra chave padrao do servidor (uso sem conta/site).
	let geminiKey = process.env.GEMINI_API_KEY;
	let authedUser = null;
	try {
		const { getUserFromRequest } = await import("./_auth.js");
		authedUser = await getUserFromRequest(req);
		if (authedUser?.user?.geminiApiKey) {
			geminiKey = authedUser.user.geminiApiKey;
		}
	} catch (_e) {
		// Sem KV configurado ou sem token: segue com a chave padrao do servidor.
	}

	if (!geminiKey) {
		return res.status(500).json({ error: "Nenhuma GEMINI_API_KEY disponivel (nem no servidor, nem na sua conta)." });
	}

	const systemPrompt = isGui ? GUI_SYSTEM_PROMPT : (isBuild ? BUILD_SYSTEM_PROMPT : SCRIPT_SYSTEM_PROMPT);

	const userMessage = existingCode
		? `Pedido do usuario: ${prompt}\n\nIMPORTANTE: ja existe algo anterior que precisa ser MODIFICADO (nao crie do zero, edite/expanda o que ja existe abaixo, aplicando a mudanca pedida):\n\n${existingCode}`
		: prompt;

	try {
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
		const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

		const raw = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

		let parsed;
		try {
			parsed = JSON.parse(raw);
		} catch (parseErr) {
			return res.status(502).json({ error: "A IA nao respondeu em JSON valido. Resposta cru: " + rawContent });
		}

		let responsePayload;

		if (isGui) {
			if (!parsed.guiTree) {
				return res.status(502).json({ error: "A IA nao retornou guiTree. Resposta cru: " + rawContent });
			}
			responsePayload = {
				kind: "gui",
				destination: "StarterGui",
				guiTree: parsed.guiTree,
				script: typeof parsed.script === "string" && parsed.script.trim() ? parsed.script : null,
			};
		} else if (isBuild) {
			if (!parsed.buildTree) {
				return res.status(502).json({ error: "A IA nao retornou buildTree. Resposta cru: " + rawContent });
			}
			responsePayload = {
				kind: "build",
				destination: "Workspace",
				buildTree: parsed.buildTree,
			};
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

			const validAuxParents = ["ReplicatedStorage", "ServerStorage", "ServerScriptService", "Workspace"];
			const auxObjects = Array.isArray(parsed.auxObjects)
				? parsed.auxObjects.filter((obj) => obj && obj.ClassName && obj.Name && validAuxParents.includes(obj.Parent))
				: [];

			const templates = Array.isArray(parsed.templates)
				? parsed.templates.filter((tpl) => tpl && tpl.Name && tpl.tree && tpl.tree.ClassName)
				: [];

			responsePayload = {
				kind: "script",
				destination,
				code: parsed.code,
				auxObjects,
				templates,
			};
		}

		// Se o usuario estiver logado, salva no historico (nao bloqueia a resposta se falhar).
		if (authedUser) {
			try {
				const { kv } = await import("./_kv.js");
				const key = `history:${authedUser.email}`;
				const history = (await kv.get(key)) || [];
				history.unshift({
					kind: responsePayload.kind,
					prompt: prompt.slice(0, 300),
					destination: responsePayload.destination || null,
					createdAt: Date.now(),
				});
				await kv.set(key, history.slice(0, 50));
			} catch (_histErr) {
				// Falha ao salvar historico nao deve quebrar a geracao.
			}
		}

		return res.status(200).json(responsePayload);
	} catch (err) {
		return res.status(500).json({ error: "Erro interno: " + err.message });
	}
}

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

	const { prompt, existingCode } = req.body || {};

	if (!prompt || typeof prompt !== "string") {
		return res.status(400).json({ error: "Campo 'prompt' obrigatorio." });
	}

	const apiKey = process.env.GROQ_API_KEY;
	if (!apiKey) {
		return res.status(500).json({ error: "GROQ_API_KEY nao configurada no servidor." });
	}

	const systemPrompt = `Voce e um especialista em Luau, na API do Roblox e em design de interfaces (UI/UX) para jogos.
Sua tarefa: gerar codigo Luau funcional E decidir onde esse codigo deve ser colocado na arvore do jogo.

Regras de classificacao de destino (escolha UMA das opcoes abaixo, exatamente como escrito):
- "ServerScriptService" -> Script (servidor) que roda logica de jogo geral, NPCs, economia, drops, RemoteEvents do lado servidor, sistemas de loja, etc.
- "StarterPlayerScripts" -> LocalScript que roda uma vez por jogador, nao depende do personagem existir (ex: input de menu, sistemas gerais do lado cliente).
- "StarterCharacterScripts" -> LocalScript que precisa ser recriado a cada respawn do personagem (ex: scripts que mexem no Humanoid, animacoes, movimento, camera que segue o character, sistemas de vida/dano visual no character).
- "Workspace" -> Script (servidor) que fica anexado a uma parte fisica do mapa (ex: parte que gira, porta automatica, plataforma).
- "ReplicatedStorage" -> ModuleScript reutilizavel por varios scripts (ex: modulo de dados compartilhado, classe utilitaria) OU pasta de configuracao de RemoteEvents.
- "StarterGui" -> LocalScript que CRIA UMA INTERFACE GRAFICA (GUI/UI/tela/menu/HUD/inventario/loja visual). Use esta opcao sempre que o pedido for sobre uma tela, botao, painel, HUD, menu ou qualquer elemento visual de interface.

Regra de ouro: se o pedido menciona "personagem", "character", "humanoid", "animacao do jogador" -> "StarterCharacterScripts". Se mencionar "interface", "GUI", "UI", "tela", "menu", "HUD", "botao", "painel", "inventario visual", "loja visual" -> "StarterGui".

// Substitua o trecho correspondente no seu systemPrompt por este:

QUANDO O DESTINO FOR "StarterGui", siga rigorosamente estas regras de design e estrutura. Interfaces malfeitas ou confusas destroem a experiência, evite a todo custo:

1. HIERARQUIA OBRIGATÓRIA DA INTERFACE:
   - Crie um ScreenGui (propriedades: IgnoreGuiInset = true, ResetOnSpawn = false). Ele deve ser o pai de tudo.
   - Crie um Frame principal ("MainFrame") centralizado. Use AnchorPoint = Vector2.new(0.5, 0.5) e Position = UDim2.fromScale(0.5, 0.5).
   - Dentro do MainFrame, crie obrigatoriamente:
     * Um TextLabel para o título ("TitleLabel").
     * Um TextButton para fechar a interface ("CloseButton") posicionado no canto superior direito.
     * Um ScrollingFrame ("ItemContainer") para listar os itens/produtos se for uma loja ou inventário.
   - Sempre defina o Parent de cada elemento criado de forma explícita e correta. O ScreenGui final deve ter seu Parent definido como `script.Parent`.

2. REGRAS VISUAIS DE DESIGN MODERNO:
   - Cantos Arredondados: TODO Frame, Botão, TextBox ou Container deve possuir um UICorner filho (CornerRadius entre 8 e 12 pixels). Nunca deixe cantos retos e quadrados crus.
   - Dimensionamento Responsivo: Use sempre Scale para o tamanho (Size) e posição (Position) dos elementos principais (ex: UDim2.fromScale(0.4, 0.6) para a janela). Só use Offset (pixels fixos) para detalhes muito pequenos, padding interno ou espessura de bordas.
   - Organização Limpa: Para listas de itens, use um UIListLayout ou UIGridLayout dentro do container de itens. Configure o Padding do layout (ex: UDim.new(0, 10)) para que os itens não fiquem colados. Use UIPadding nos containers para dar um respiro interno (margens de 12 a 16px).
   - Paleta de Cores Coesa e Dark/Moderna:
     * Fundo Principal (MainFrame): Grafite escuro / Quase preto (Color3.fromRGB(25, 25, 28) ou Color3.fromRGB(32, 32, 36)).
     * Container de Itens: Um tom levemente mais claro ou mais escuro que o fundo para dar profundidade (Color3.fromRGB(40, 40, 45)).
     * Cor de Destaque (Botões de compra/seleção): Amarelo Limonada vibrante (Color3.fromRGB(255, 221, 87)) ou Azul Moderno (Color3.fromRGB(0, 162, 255)).
     * Textos: Branco puro para títulos (Color3.fromRGB(255, 255, 255)) e Cinza claro para descrições/preços (Color3.fromRGB(200, 200, 200)).
   - Tipografia: Use apenas fontes modernas e legíveis, como `Enum.Font.GothamBold` (para títulos e botões) e `Enum.Font.Gotham` ou `Enum.Font.SourceSans` (para textos gerais). TextSize deve ser proporcional e equilibrado (títulos 20-24, botões 16-18, descrições 14).
   - Profundidade: Adicione um UIStroke sutil (Thickness = 1, cor semi-transparente como Color3.fromRGB(60,60,65)) no MainFrame para destacar a janela do fundo do jogo.

3. LÓGICA FUNCIONAL (SCRIPTING):
   - O código deve incluir a funcionalidade básica da UI para que ela não seja apenas um enfeite.
   - Faça o botão de fechar ("CloseButton") funcionar imediatamente escondendo o MainFrame (ex: `MainFrame.Visible = false`).
   - Se o usuário pedir para comprar algo, estruture a lógica do botão de compra simulando ou disparando um RemoteEvent para o servidor (mesmo que seja um exemplo comentado de como conectar ao Server).

Responda SOMENTE em JSON valido, sem markdown, sem cercas de codigo, no formato exato:
{"destination": "UMA_DAS_OPCOES_ACIMA", "code": "codigo luau aqui, com \\n para quebras de linha"}

Siga boas praticas no codigo: use 'local', evite globais, use nomes claros em ingles para variaveis e PascalCase para servicos.
Se o pedido envolver RemoteEvents, crie-os corretamente dentro de ReplicatedStorage quando necessario.

// Altere o final do seu systemPrompt na Vercel para isso:

Se o destino for "StarterGui", você NÃO vai gerar código Luau de criação. Em vez disso, o campo "code" deve conter uma string JSON que descreve a árvore de elementos que o plugin deve criar.

O formato do JSON dentro do campo "code" deve ser exatamente assim (em formato de string/texto):
"[{\\"ClassName\\":\\"ScreenGui\\",\\"Name\\":\\"ShopGui\\",\\"Properties\\":{\\"IgnoreGuiInset\\":true},\\"Children\\":[{\\"ClassName\\":\\"Frame\\",\\"Name\\":\\"MainFrame\\",\\"Properties\\":{\\"Size\\":\\"0.4,0,0.6,0\\",\\"Position\\":\\"0.5,0,0.5,0\\",\\"AnchorPoint\\":\\"0.5,0.5\\",\\"BackgroundColor3\\":\\"32,32,36\\"},\\"Children\\":[]}]}]"

Responda SEMPRE no formato JSON padrão do backend:
{"destination": "StarterGui", "code": "STRING_DO_JSON_DA_ESTRUTURA_AQUI"}`;

	const userMessage = existingCode
		? `Pedido do usuario: ${prompt}\n\nIMPORTANTE: ja existe um script anterior que precisa ser MODIFICADO (nao crie algo do zero, edite/expanda o que ja existe abaixo, mantendo o que ja funciona e aplicando a mudanca pedida):\n\n${existingCode}`
		: prompt;

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
			"StarterGui"
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

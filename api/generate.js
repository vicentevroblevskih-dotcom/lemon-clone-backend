// api/generate.js
//
// Funcao serverless do Vercel integrada com a Groq.
// Trata geracao de scripts normais (Luau) e geracao estruturada de UI (JSON).

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
Sua tarefa e decidir onde o pedido do usuario deve ser colocado na arvore do jogo e gerar o conteudo apropriado.

Regras de classificação de destino:
- "ServerScriptService" -> Script (servidor) para lógica geral, NPCs, sistemas de dados.
- "StarterPlayerScripts" -> LocalScript que roda no cliente geral.
- "StarterCharacterScripts" -> LocalScript para mecânicas do personagem (Humanoid, animações).
- "Workspace" -> Script de servidor anexado a partes físicas do mapa.
- "ReplicatedStorage" -> ModuleScript reutilizável.
- "StarterGui" -> USE ESTA OPÇÃO SEMPRE que o usuario pedir interfaces, telas, menus, HUDs ou lojas visuais.

REGRAS CRÍTICAS PARA "StarterGui":
Se o destino for "StarterGui", você NÃO vai gerar código Luau. O campo "code" deve conter OBRIGATORIAMENTE uma string JSON que descreve a árvore de elementos físicos que o plugin deve criar.
Siga um padrão moderno: fundo escuro (ex: 32,32,36), cantos arredondados (UICorner), tamanho responsivo (Scale) e layouts limpos (UIListLayout/UIGridLayout).

Exemplo de formato para o campo "code" quando for "StarterGui" (dentro de uma string JSON devidamente escapada):
"[{\\"ClassName\\":\\"ScreenGui\\",\\"Name\\":\\"ShopGui\\",\\"Properties\\":{\\"IgnoreGuiInset\\":true},\\"Children\\":[{\\"ClassName\\":\\"Frame\\",\\"Name\\":\\"MainFrame\\",\\"Properties\\":{\\"Size\\":\\"0.4,0,0.6,0\\",\\"Position\\":\\"0.5,0,0.5,0\\",\\"AnchorPoint\\":\\"0.5,0.5\\",\\"BackgroundColor3\\":\\"32,32,36\\"},\\"Children\\":[{\\"ClassName\\":\\"UICorner\\",\\"Name\\":\\"FrameCorner\\",\\"Properties\\":{\\"CornerRadius\\":\\"0,8\\"}}]}]}]"

Para TODOS os outros destinos, o campo "code" deve conter o código Luau puro normal.

Responda SEMPRE com um JSON estruturado e válido na raiz, sem blocos de código markdown (```json):
{"destination": "NOME_DO_DESTINO", "code": "STRING_DO_CODIGO_OU_JSON_DA_UI_AQUI"}`;

	const userMessage = existingCode
		? `Pedido do usuario: ${prompt}\n\nIMPORTANTE: ja existe um script anterior que precisa ser MODIFICADO (nao crie algo do zero, edite/expanda o que ja existe abaixo):\n\n${existingCode}`
		: prompt;

	try {
		const response = await fetch("[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: "llama-3.3-70b-versatile",
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userMessage },
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

		// Remove blocos de markdown que a IA coloque por teimosia
		raw = raw.replace(/^
http://googleusercontent.com/immersive_entry_chip/0

### O que arrumamos aqui:
1. **Consistência de Destinos:** Removi os blocos antigos redundantes que diziam para ela criar Luau dentro do `StarterGui` e deixei apenas a regra que cospe o formato em árvore JSON.
2. **Correção do Envio do Prompt:** Na chamada antiga do `body: JSON.stringify`, o código passava fixo a variável `prompt` para o `user`. Mudei para `userMessage` para que, quando você estiver alterando um código já existente, a IA realmente receba o código anterior para editar.
3. **Fim do Loop do Erro 500:** Se qualquer coisa bizarra acontecer dentro do servidor do Node, ele cai no último `catch` e envia uma resposta válida no formato que o seu plugin espera.

Pode commitar no GitHub, esperar atualizar na Vercel e mandar bala nos testes!

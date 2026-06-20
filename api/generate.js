// api/generate.js
// Motor híbrido: Gemini 3.5 Flash para UI (Instâncias), Groq para Scripts (Luau).

function extractJSON(text) {
	let cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
	const firstBrace = cleaned.indexOf('{');
	const lastBrace = cleaned.lastIndexOf('}');
	if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
		return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
	}
	return JSON.parse(cleaned);
}

export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") return res.status(200).end();
	if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

	const { prompt } = req.body || {};
	if (!prompt) return res.status(400).json({ error: "Prompt obrigatório." });

	const isGuiRequest = /gui|tela|loja|hud|menu|button|frame/i.test(prompt);
	const geminiKey = process.env.GEMINI_API_KEY;

	if (isGuiRequest && geminiKey) {
		const systemPrompt = `Você é um UI/UX Designer Profissional de Roblox.
Sua tarefa é criar interfaces modernas. NÃO gere código Luau.
Retorne APENAS um JSON representando a árvore de objetos físicos (ScreenGui, Frame, TextButton, etc).
Formato: {"destination": "StarterGui", "code": [ { "ClassName": "ScreenGui", "Name": "ShopGui", "Properties": { ... }, "Children": [ ... ] } ] }`;

		try {
			const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }],
					systemInstruction: { parts: [{ text: systemPrompt }] },
					generationConfig: { responseMimeType: "application/json" }
				})
			});
			const data = await response.json();
			const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
			const parsed = extractJSON(textResult);
			return res.status(200).json({ code: JSON.stringify(parsed.code), destination: "StarterGui", model: "Gemini 3.5 Flash" });
		} catch (err) {
			return res.status(200).json({ error: "Erro Gemini: " + err.message, destination: "ServerScriptService" });
		}
	}

	const groqKey = process.env.GROQ_API_KEY;
	const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
		method: "POST",
		headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
		body: JSON.stringify({
			model: "llama-3.3-70b-versatile",
			messages: [{ role: "system", content: "Retorne JSON: {\"destination\": \"...\", \"code\": \"...luau...\"}" }, { role: "user", content: prompt }]
		})
	});
	const data = await response.json();
	const parsed = extractJSON(data.choices[0].message.content);
	return res.status(200).json({ code: parsed.code, destination: parsed.destination || "ServerScriptService", model: "Llama 3.3 (Groq)" });
}

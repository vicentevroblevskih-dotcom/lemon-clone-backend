// api/_auth.js
// Helper interno (nao e uma rota) usado pelos outros endpoints pra validar o token.
import { kv } from "./_kv.js";

export async function getUserFromRequest(req) {
	const authHeader = req.headers["authorization"] || "";
	const token = authHeader.replace(/^Bearer\s+/i, "").trim();
	if (!token) return null;

	const email = await kv.get(`session:${token}`);
	if (!email) return null;

	const user = await kv.get(`user:${email}`);
	if (!user) return null;

	return { email, user };
}

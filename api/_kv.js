// api/_kv.js
// Wrapper simples em volta do Upstash Redis, com uma API parecida com a do
// antigo @vercel/kv (get/set com serializacao JSON automatica), pra nao
// precisar reescrever toda a logica dos outros arquivos.
//
// A integracao Upstash da Vercel cria as variaveis com nomes no padrao
// "KV_REST_API_URL" / "KV_REST_API_TOKEN" (compatibilidade com o antigo
// Vercel KV), em vez de "UPSTASH_REDIS_REST_URL". Por isso conectamos manualmente.
import { Redis } from "@upstash/redis";

const redis = new Redis({
	url: process.env.KV_REST_API_URL,
	token: process.env.KV_REST_API_TOKEN,
});

export const kv = {
	async get(key) {
		const value = await redis.get(key);
		return value; // o cliente do Upstash ja desserializa JSON automaticamente
	},
	async set(key, value, options) {
		if (options && options.ex) {
			return redis.set(key, value, { ex: options.ex });
		}
		return redis.set(key, value);
	},
};

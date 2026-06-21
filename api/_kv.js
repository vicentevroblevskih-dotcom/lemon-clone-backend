// api/_kv.js
// Wrapper simples em volta do Upstash Redis, com uma API parecida com a do
// antigo @vercel/kv (get/set com serializacao JSON automatica), pra nao
// precisar reescrever toda a logica dos outros arquivos.
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

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

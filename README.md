# Lemon Clone AI — Backend + Site

Esse repositorio tem duas partes:
- `api/` — as funcoes serverless (geracao de codigo/GUI/construcoes via IA, login, historico)
- `index.html` — o site (login, cadastro, dashboard com historico e configuracao da API key)

## 1. Configurar o banco de dados (Upstash Redis, gratuito)

O Vercel KV antigo foi descontinuado. Agora usamos o **Upstash** (Redis sem servidor, gratuito):

1. No seu projeto no Vercel, vai na aba **Storage**
2. Na secao "Marketplace Database Providers", clica em **Upstash**
3. Escolhe a opcao de criar um banco **Redis**
4. Da um nome (ex: `lemon-clone-redis`) e segue o fluxo de criacao (plano gratuito)
5. Clica em **Connect to Project** e seleciona o seu projeto (`lemon-clone-backend3` ou o nome que voce usou)
6. Isso adiciona automaticamente as variaveis de ambiente `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` — voce nao precisa configurar nada manualmente

## 2. Variaveis de ambiente

Continua precisando da chave padrao do servidor (usada quando o usuario do plugin nao esta logado ou nao configurou a propria chave):

- `GEMINI_API_KEY` (https://aistudio.google.com/app/apikey)

As variaveis do Upstash sao adicionadas automaticamente no passo 1.

## 3. Deploy

Mesmo processo de sempre: sobe os arquivos pro GitHub (mantendo a estrutura de pastas exata: `index.html` na raiz, `api/` com todos os arquivos dentro), conecta no Vercel, espera o deploy.

## 4. Usando o site

1. Acessa a URL do seu site (ex: `https://lemon-clone-backend3.vercel.app`)
2. Cria uma conta ou faz login
3. (Opcional) Cola sua propria chave do Gemini em "Sua chave do Gemini" — assim voce usa sua propria cota em vez da do servidor
4. Copia o "Token de login" mostrado no painel
5. No plugin do Roblox Studio, cola esse token no campo **"Token de login"**
6. A partir dai, toda geracao feita pelo plugin aparece no historico do site, e usa sua chave pessoal se configurada

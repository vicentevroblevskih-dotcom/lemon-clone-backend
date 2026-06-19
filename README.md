# Lemon Clone - Backend

Backend simples (1 funcao serverless) que recebe um pedido em texto e devolve
codigo Luau gerado por IA, pra ser usado pelo plugin do Roblox Studio.

## Como subir no Vercel (passo a passo)

1. Crie uma conta no GitHub (https://github.com) se ainda nao tiver.
2. Crie um repositorio novo no GitHub, ex: `lemon-clone-backend`.
3. Suba esta pasta (`backend/`) pro repositorio:
   - Pelo site do GitHub: clique em "Add file > Upload files" e arraste os
     arquivos `api/generate.js`, `package.json` e este `README.md`.
   - Ou via git no terminal:
     ```
     git init
     git add .
     git commit -m "primeiro commit"
     git branch -M main
     git remote add origin https://github.com/SEU_USUARIO/lemon-clone-backend.git
     git push -u origin main
     ```
4. No Vercel (https://vercel.com/new), clique em "Continue with GitHub",
   autorize o acesso, e selecione o repositorio `lemon-clone-backend`.
5. Antes de clicar em "Deploy", abra "Environment Variables" e adicione:
   - Nome: `ANTHROPIC_API_KEY`
   - Valor: sua chave da API da Anthropic (pegue em https://console.anthropic.com)
6. Clique em "Deploy". Em ~1 minuto o Vercel te da uma URL, tipo:
   `https://lemon-clone-backend.vercel.app`
7. O endpoint da sua funcao vai ser:
   `https://lemon-clone-backend.vercel.app/api/generate`
8. Cole essa URL completa (com `/api/generate` no final) no campo de URL
   do plugin do Roblox Studio.

## Testando sem o plugin

Voce pode testar o backend direto pelo terminal ou por um site como
https://hoppscotch.io, mandando um POST para a URL com o corpo:

```json
{ "prompt": "crie um script que faz uma parte girar infinitamente" }
```

A resposta deve ser:

```json
{ "code": "local part = ... " }
```

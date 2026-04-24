---
trigger: always_on
---

# AMBIENTE DE EXECUÇÃO: TAMPERMONKEY (USERSCRIPTS)
Este projeto é focado na criação e manutenção de Userscripts rodando na extensão Tampermonkey. Ao escrever ou analisar códigos, assuma o seguinte:

## 1. Cabeçalho de Metadados Obrigatório (UserScript)
Todo script principal deve conter um bloco de metadados válido e rigoroso.
- **Valores Fixos e Padrões:**
  - `@author P0nt4s`
  - `@namespace https://github.com/P0NT4S/`
  - `@version` (Sempre use o versionamento semântico, ex: `1.1.1`)
- **URLs de Autoupdate (Obrigatórias):**
  - `@updateURL https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Scripts-Tampermonkey/[NOME_DO_SCRIPT].meta.js` (ou `.user.js` conforme o padrão do script)
  - `@downloadURL https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Scripts-Tampermonkey/[NOME_DO_SCRIPT].user.js`
- Nunca esqueça de declarar os escopos de permissão necessários usando a tag `@grant`.

## 2. Bibliotecas e Dependências (GitHub Raw)
- O código e as bibliotecas deste projeto são versionados no repositório `sistema-crea`.
- Quando precisar importar uma biblioteca interna ou recurso visual, **NÃO use importações comuns do Node.js/ES6**.
- **Utilize exclusivamente `@require` e `@resource`** apontando para o caminho raw no GitHub:
  - Para scripts (`@require`): `https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/[NOME_DA_LIB].js`
  - Para estilos ou dados (`@resource`): `https://raw.githubusercontent.com/P0NT4S/sistema-crea/main/Libs/[NOME_DO_ARQUIVO]`

## 3. Uso de APIs Nativas (GM_*)
Aproveite as APIs privilegiadas do Tampermonkey em vez de reinventar a roda ou esbarrar em limitações do navegador:
- Use `GM_xmlhttpRequest` para requisições cross-origin (CORS).
- Use `GM_setValue` / `GM_getValue` para armazenamento de estado persistente, no lugar de `localStorage`.
- Use `GM_getResourceText` junto com `GM_addStyle` para injetar CSS previamente importado via `@resource`.

## 4. Manipulação de DOM e Ciclo de Vida
- Scripts injetados em páginas modernas lidam com SPAs e renderização assíncrona.
- Não confie apenas no `window.onload`. Utilize utilitários baseados em `MutationObserver` (como `waitForElement`) para interagir com elementos criados dinamicamente.
- A injeção de elementos no DOM da página alvo deve ser limpa; evite poluir o escopo global (`window`) da página hospedeira.
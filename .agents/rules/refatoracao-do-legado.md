---
trigger: always_on
---

# TRANSIÇÃO E REFATORAÇÃO DE CÓDIGO LEGADO
O sistema está passando por uma reescrita. Ao refatorar módulos antigos:

## 1. Referência Lógica (Fonte da Verdade)
- Considere os scripts e bibliotecas da pasta legado como a **referência principal e absoluta** para entender o fluxo de negócio, validações e manipulação de DOM.
- Estude o legado antes de escrever código novo. Não invente lógicas se o comportamento já estiver mapeado.

## 2. Adaptação Arquitetural
- **NÃO faça "Ctrl+C / Ctrl+V" do código procedural legado.**
- Extraia a lógica e traduza-a estritamente para a nova **Arquitetura em Camadas** e **Orientação a Objetos** definida nas nossas Regras de Arquitetura e Paradigmas.
- Substitua funções globais e scripts longos por classes encapsuladas, respeitando a responsabilidade única (SOLID).

## 3. Rastreamento de Dependências Atualizadas (Crucial)
- **Cuidado com código obsoleto:** Durante a refatoração, o ecossistema está em constante mudança. Verifique ativamente se as funções ou bibliotecas locais do legado que você pretende invocar já não foram refatoradas.
- Antes de fazer a chamada para qualquer dependência interna antiga, **faça uma busca no projeto** para confirmar se ela já possui uma versão atualizada (em POO) na nova arquitetura.
- Se a versão nova existir, importe e utilize exclusivamente a nova estrutura. Nunca crie laços de dependência com código legado que já foi substituído.
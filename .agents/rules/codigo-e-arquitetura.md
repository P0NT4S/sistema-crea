---
trigger: always_on
---

# 1. REUTILIZAÇÃO DE CÓDIGO E BIBLIOTECAS
Durante o desenvolvimento dos scripts:
- Considere que os arquivos da pasta `/Libs` são as minhas bibliotecas internas.
- Essas bibliotecas **DEVEM ser usadas sempre que aplicável**.
- **Dê preferência absoluta** à reutilização dessas bibliotecas antes de:
  - Criar novas funções.
  - Duplicar lógica.
  - Reimplementar comportamentos já existentes.

Antes de escrever qualquer código novo, você deve:
1. Avaliar se alguma biblioteca já resolve total ou parcialmente o problema.
2. Adaptar o uso da biblioteca ao contexto do script, se necessário.
3. Justificar tecnicamente apenas se optar por não utilizá-las.

Caso uma funcionalidade realmente não exista:
- Crie o código de forma modular.
- Projete-o pensando explicitamente em sua futura incorporação a uma dessas bibliotecas.

# 2. ARQUITETURA E PARADIGMAS
Todo código gerado deve seguir as seguintes diretrizes arquiteturais:

## **Orientação a Objetos (POO):**
- Siga os princípios **SOLID**. 
- Crie classes com **responsabilidade única**.
- Utilize **encapsulamento** adequado para proteger os dados.
- Prefira composição no lugar de herança excessiva quando fizer sentido.

##  **Arquitetura em Camadas (Layered Architecture):**
 -  Mantenha uma separação estrita de **responsabilidades únicas**. 
 - O código de acesso a dados (Repositories) não deve se misturar com regras de negócio (Services), e regras de negócio não devem se misturar com a camada de apresentação/interfaces (Controllers).

## **Foco em Microsserviços:**
- O design do código deve prever baixo acoplamento e alta coesão. 
- Pense em **domínios isolados**, garantindo que o script seja **resiliente, independente** e pronto para se comunicar com outros serviços através de **interfaces e contratos bem definidos**.

# 3. ESTRUTURA DO SCRIPT
Sempre que fizer sentido, o script deve conter um bloco inicial explícito para centralizar as dependências e variáveis de ambiente/configuração:

/* ==============================
   CONFIGURAÇÕES DO SCRIPT
   ============================== */

Esse bloco deve:
- Centralizar parâmetros ajustáveis e dependências.
- Evitar ao máximo o uso de valores "hardcoded" soltos pelo código.
- Facilitar a manutenção e o reaproveitamento do script.

# 4. REGRAS ABSOLUTAS DE CÓDIGO
## Nomenclatura
- **Todas** as funções, variáveis, métodos e classes devem:
  - Ter nomes em **português** (a menos que a stack exija palavras-chave em inglês).
  - Ser **claros, autoexplicativos e semânticos**, fazendo sentido no contexto da aplicação.
- Abreviações obscuras ou nomes de uma letra só são estritamente proibidos.

## Qualidade e Prioridades
- Escreva código enxuto, previsível e profissional.
- **Evite complexidade desnecessária ou "overengineering"**.
- Não sacrifique a legibilidade do código por micro-otimizações irrelevantes.

# 5. COMENTÁRIOS E DOCUMENTAÇÃO
A documentação é obrigatória e deve seguir as regras abaixo:

- **JSDoc (ou equivalente da linguagem):** Todas as classes, interfaces e funções principais DEVEM possuir um bloco de documentação formal detalhando:
  - A descrição geral (o que a classe/função faz).
  - Os parâmetros esperados (`@param`).
  - O retorno (`@returns`).
  - Exemplos de uso prático, se a lógica for complexa.
- **Comentários Inline:** No meio do código, os comentários devem ser pontuais e estratégicos. Eles não devem explicar "O QUÊ" o código está fazendo (o código limpo já deve dizer isso), mas sim o "PORQUÊ". Use-os para apontar detalhes pertinentes, justificar decisões de arquitetura ou explicar regras de negócio complexas presentes naquele bloco específico.
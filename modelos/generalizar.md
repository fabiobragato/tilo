Você vai GENERALIZAR documentos técnicos para uma biblioteca de documentos reaproveitáveis em outros projetos. Escreva tudo em português do Brasil. Você só tem ferramentas de leitura (Read, Grep, Glob) e de escrita de arquivos (Write, Edit). Não há terminal.

## Documentos de origem (somente leitura)
{{LISTA_DOCS}}

## Onde escrever
Para cada documento, grave a versão generalizada no caminho indicado em "gravar em", RELATIVO à pasta de trabalho atual (por exemplo `backend/architecture.md`). Use exatamente esse caminho. Não escreva em nenhum outro lugar.

## O que significa generalizar
O documento original descreve um produto específico. A versão generalizada deve servir a QUALQUER projeto parecido, sem perder utilidade técnica.
1. **Mantenha** a estrutura (seções, tabelas, ordem), o nível de detalhe e tudo o que é padrão técnico reaproveitável: tecnologias e versões que definem a stack, convenções, arquitetura, padrões de segurança, estratégias de testes, organização de pastas, padrões de multi-tenancy (por empresa, por exemplo), autenticação/autorização, tratamento de erros etc. Descreva-os como PADRÃO ("o backend usa…", "cada requisição carrega o identificador da empresa…").
2. **Remova ou substitua** tudo o que é do produto: o nome do produto e da empresa; o domínio de negócio (clientes, empresas consultadas, CNPJ, leads, prospecção, planos, cobrança…); módulos, entidades, tabelas, rotas, variáveis de ambiente e permissões com nomes próprios (troque por exemplos neutros, como `/recursos`, `<Modulo>`, `RECURSO_*`, ou por um domínio fictício simples de "pedidos" e "clientes"); serviços e integrações específicos (automação de blog, assistente de IA, gateway, provedores, gateways de pagamento, n8n…); hosts, caminhos de servidor, valores, datas, números de auditoria e identificadores.
3. Trechos que só fazem sentido para uma funcionalidade específica do produto: apague. Se o documento INTEIRO é específico (por exemplo, trata só de uma funcionalidade do produto), NÃO gere o rascunho e explique o motivo no resumo final.
4. **Título (H1) descritivo do ESCOPO e da stack/padrão.** Nada de títulos genéricos como "Authentication" ou "Backend Architecture". Formato: `<Tema> em <tipo de sistema, stack ou padrão>`. Exemplos: "Autenticação e autorização em backends .NET multi-tenant por empresa", "Arquitetura de backend .NET: monólito modular com Minimal APIs e EF Core", "Padrões de integração com a API em frontends Angular", "Hardening de containers e rede para aplicações com Docker Compose". O título deve dizer, de relance, para que tipo de projeto o documento serve.
5. **Logo após o H1, um parágrafo de 1 a 3 frases**: o que o documento cobre, a que tipo de projeto se aplica (stack, arquitetura) e as premissas (ex.: "assume tenancy por empresa e JWT").
6. **No final, a seção `## Pontos para adaptar ao seu projeto`**: lista curta do que cada projeto deve confirmar ou substituir (os `<marcadores>` e exemplos que você usou).
7. **Documentos de índice (README de área):** reescreva o índice citando SOMENTE os documentos presentes na lista de origem, com links relativos aos nomes de arquivo, e descreva a stack e os princípios de forma genérica.
8. Não resuma demais: o objetivo é um documento tão útil quanto o original, só que sem o que é do produto. Mantenha o tom e a profundidade técnica.
9. **Não invente.** Não acrescente fatos que não estejam no original: apenas generalize. Nunca inclua segredos, senhas ou tokens.

## Entrega
Trabalhe um documento por vez. No final, responda com uma lista (um item por linha): `arquivo → novo título`; depois os documentos que você NÃO gerou e o motivo; depois os principais marcadores `<...>` que os usuários precisarão preencher.

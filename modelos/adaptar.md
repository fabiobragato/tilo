Você vai ANEXAR ao projeto "{{NOME}}" documentos de referência vindos de uma biblioteca de documentos de outros projetos, ADAPTANDO cada um para este projeto. Escreva tudo em português do Brasil. Você só tem ferramentas de leitura (Read, Grep, Glob) e de escrita de arquivos (Write, Edit). Não há terminal.

## Documentos de referência escolhidos pelo dono (somente leitura)
{{LISTA_DOCS}}

## O que fazer
1. Leia os documentos de referência para entender estrutura, temas e nível de detalhe.
2. Explore o código DESTE projeto (README, manifestos, pastas, pontos de entrada, configurações, testes, Docker/CI) para saber o que existe de fato.
3. Para cada documento de referência, escreva a versão deste projeto em `docs/<área>/<mesmo-nome>.md` (a área é a pasta do documento de referência: backend, frontend, infra, deploy, security ou data-platform). Se o assunto do documento não existe neste projeto (por exemplo, rotas Angular num projeto sem Angular), NÃO escreva o documento e explique isso no resumo final.
4. Se já existir um documento com o mesmo nome em `docs/`, não o substitua: leia-o e só complemente com Edit, ou use outro nome claro.
5. Mantenha `docs/README.md` e o `README.md` da área coerentes: se existirem, acrescente os novos documentos na lista (Edit); se não existirem, crie-os no mesmo formato dos outros documentos do projeto.

## Regras que não podem ser quebradas
1. `docs/` descreve SOMENTE o que está implantado, no presente, confirmado no código deste projeto. Nada de planejamento, roadmap, pendências, "poderá", "em breve".
2. NUNCA copie nomes, regras de negócio, números, tecnologias, caminhos ou fatos do projeto de origem. Aproveite a estrutura, os temas e o jeito de explicar; todo conteúdo concreto tem de vir deste projeto e ser confirmado no código. Se a referência afirma algo que este projeto não faz, não escreva.
3. Cite os caminhos reais deste projeto entre crases. Não invente. O que você não conseguir confirmar vai para `pendencias/README.md` (item 🟡 com a dúvida em linguagem simples), nunca para `docs/`.
4. Nada de segredos: descreva apenas NOMES de variáveis de configuração. Você não consegue ler `.env*` nem chaves.
5. Não altere código. Só escreva em `docs/`, `planning/`, `pendencias/` e `CLAUDE.md`. Arquivo novo é criado direto; alterar um arquivo existente pede a aprovação do dono.

## Entrega
Responda com: os documentos que você criou (um por linha, com o caminho), os que ficaram de fora e por quê, e as dúvidas que foram para `pendencias/README.md`.

# Alterações (git visual)

A aba **Alterações** (`#/alteracoes`) mostra o repositório git do projeto: o que ainda não foi commitado, o que foi commitado mas não enviado ao GitHub, e de qual conversa veio cada mudança. Implementação em `git.mjs`; rotas em [../backend/api-conventions.md](../backend/api-conventions.md).

## O que aparece

- **Cabeçalho:** branch atual e remoto (`origin/main`, "branch ainda não enviada" ou "sem GitHub configurado").
- **Branch:** menu com as branches locais para trocar, e botão **Nova branch** (sugere o prefixo `feature-`; cria a partir da branch atual e já troca). Alterações não commitadas acompanham a troca; se conflitarem, o git recusa e o aviso aparece. Não dá para trocar enquanto o Claude trabalha no projeto (os arquivos mudariam debaixo dele). Branches só remotas não aparecem na lista.
- **Ainda não commitado:** arquivos modificados, novos, apagados ou renomeados, cada um com as conversas que o editaram. "Ver mudanças" abre o diff do arquivo.
- **Commitado, mas não enviado:** commits que o GitHub ainda não tem, cada um com a conversa ligada. Sem upstream, vale todo commit que nenhum remoto tem.
- A tela se atualiza sozinha a cada 8 segundos; o contador no menu soma arquivos não commitados e commits não enviados.

## Vínculo com a conversa

- **Arquivo não commitado:** liga o arquivo às conversas do painel cujo registro (`tools[]` em `chats.json`) tem `Edit`, `Write`, `MultiEdit` ou `NotebookEdit` concluído nesse caminho. Edições com erro não contam. Conversas de documentação (`gen`) ficam de fora.
- **Commit:** o vínculo é a linha `Tilo-Chat: <id da conversa>` no fim da mensagem (trailer git). Só commits feitos pelo botão **Commitar** ganham a linha; commits antigos ou feitos fora do Tilo aparecem como "sem conversa vinculada". Se a conversa for apagada, o commit mostra "conversa apagada".
- **Limites:** mudanças feitas por comandos (`sed`, `npm install`, geração de arquivos) e por você fora do Tilo não são atribuídas. Se mais de uma conversa editou o arquivo, todas aparecem. O vínculo é por arquivo, não por linha.

## Ações

- **Commitar:** marque os arquivos, escreva a mensagem e confirme. O commit leva só os arquivos marcados (o que estiver preparado à parte fica de fora). As conversas que editaram os arquivos vêm marcadas; dá para desmarcar ou ligar outra. Arquivos que parecem conter segredos (`.env`, `.token`, `.ssh`, `*.pem`, `*.key`, `id_*`) não são commitados nem têm o diff exibido.
- **Enviar ao GitHub:** `git push` sem forçar, com confirmação na tela. Sem upstream, cria o vínculo com `origin`. Falhas (autenticação, rejeição) aparecem como aviso e nada é forçado.
- As duas ações entram na auditoria (`tool: git`; o envio como produção). O Claude continua sujeito à [política de comandos](../backend/command-policy.md); estes botões são ações do dono, não do Claude.

## Segurança

O servidor só executa `git` com argumentos fixos (`execFile`, sem shell). Caminhos vêm sempre da lista de arquivos do próprio git, nunca de texto livre. O diff é limitado a 500.000 caracteres. `git.mjs` e `git.test.mjs` estão na lista de arquivos que o Claude não pode editar.

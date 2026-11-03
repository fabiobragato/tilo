# Padrões de código do backend

Cobre as convenções que o código segue, os testes e os comandos de validação.

## Convenções

- Módulos ES (`.mjs`), importando com prefixo `node:` os módulos nativos. Sem transpilação e sem etapa de build.
- Nomes de funções, variáveis, campos JSON, rotas e mensagens em português (por exemplo `projetos.obter`, `catalogo.listarDocs`, `/api/permissoes/lembrar`); termos técnicos de protocolo em inglês (`tool_name`, `behavior`).
- Lógica pura e testável fica em módulos separados (`politica.mjs`, `catalogo.mjs`); `server.mjs` cuida de HTTP e de processos.
- Funções de `catalogo.mjs` recebem o diretório como parâmetro (`dir`) com valor padrão, o que permite testar em pastas temporárias.
- Todo caminho vindo de fora é validado antes de tocar o disco: ids com expressões regulares (`ID`, `COL`, `SEG`, `LOTE`, `UUID`), `path.resolve` + conferência de prefixo para impedir saída da pasta.
- Texto do usuário nunca é interpolado em linha de comando; vai por stdin.
- Saída para o navegador é escapada no cliente (ver [../frontend/coding-standards.md](../frontend/coding-standards.md)); no servidor, `__NOME__` é escapado antes de entrar em `index.html`.
- Comentários explicam o motivo de regras de segurança e de formato.

## Testes

- `politica.test.mjs`: política de comandos, pacotes, comandos lembrados, bloqueios, validação, explicações e política de escrita de arquivos.
- `catalogo.test.mjs`: publicar, listar, buscar, ids seguros, anexar sem sobrescrever, remover e lotes de generalização.
- Não há testes automatizados para `server.mjs`, `projetos.mjs`, `aprovador-mcp.mjs`, scripts PowerShell nem para o front-end.

## Comandos

| Comando | Uso |
|---|---|
| `npm test` | Roda `node --test politica.test.mjs catalogo.test.mjs`. |
| `node --test politica.test.mjs` | Só os testes da política. |
| `npm start` | Inicia o servidor. |
| `npm run verificar` | Confere o ambiente (PowerShell). |

Não há lint, formatador, build nem CI configurados.

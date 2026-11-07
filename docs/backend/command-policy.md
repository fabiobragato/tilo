# Política de comandos e de escrita de arquivos

Cobre `politica.mjs`: a decisão sobre comandos de terminal, a configuração por projeto e a política de escrita das conversas de documentação. Regra de produto: [../business/aprovacao-de-comandos.md](../business/aprovacao-de-comandos.md).

## Resultado de `avaliar(tool, input, extra)`

`{ acao, risco, resumo, motivo, origem }`:

- `acao`: `negar`, `permitir` ou `perguntar`.
- `risco`: `normal` ou `producao`.
- `origem`: `fábrica` ou `projeto`.

Ferramentas diferentes de `Bash` e `PowerShell` sempre resultam em `perguntar`. Comando vazio resulta em `negar`.

## Ordem de decisão

1. Bloqueado (fábrica, depois regras de bloqueio do projeto) → `negar`.
2. Produção (fábrica, depois regras de produção do projeto) → `perguntar` com `risco: producao`.
3. Comando lembrado (texto exato igual) → `permitir`.
4. Se o comando não contém nenhum destes caracteres: ponto e vírgula, `&`, `|`, `<`, `>`, crase, `$`, parênteses, chaves, barra invertida ou quebra de linha — e é liberado de fábrica ou por pacote ligado → `permitir`.
5. Caso contrário → `perguntar` (`risco: normal`).

## Regras de fábrica (`PADRAO`)

Bloqueadas (títulos): apagar arquivos em massa; formatar disco; derrubar serviços apagando dados (`docker compose down -v`); apagar dados do Docker à força; reescrever histórico no GitHub (`git push --force`/`-f`/`--force-with-lease`); descartar mudanças (`git reset --hard`); apagar arquivos novos do git (`git clean -f`); mexer em senhas e chaves (`.env` exceto `.env.example`, `.ssh`, `id_*`, `.token`, `.claude`, `credentials`, `.pem`); mexer no próprio Tilo (localhost nas portas do Tilo — `4777` e as de `TILO_PORT`/`TILO_PUBLIC_PORT`, lidas na partida — ou `api/aprovacao`; outras portas locais não são afetadas); enviar arquivos para a internet (`curl`/`wget` com dados de arquivo, `Invoke-WebRequest` com `-InFile`/`-Body`); executar código escondido (`| sh`/`bash`/`iex`, `-EncodedCommand`, `base64 -d |`).

Produção (pedem confirmação extra): `ssh`, `scp`, `sftp`, `rsync`; comandos contendo `migrate`, `deploy`, `publicar`, `publish`; `git push`; `curl`/`wget`/`Invoke-WebRequest` para fora de localhost/127.0.0.1.

Liberadas (comando único, só consulta): `git status|log|diff|show|branch` (sem `--output`); `ls`; `pwd`; `docker ps`; `docker compose ps`; `docker (compose) logs`; `node|npm|npx|python|python3|dotnet|git|docker|pwsh|java|go|cargo` com `--version`, `-v` ou `version`.

## Pacotes opcionais (`PACOTES`)

| Id | Comandos liberados quando ligado |
|---|---|
| `testes` | `npm test`, `npm run` seguido de `test`, `lint`, `check` ou `typecheck` (com sufixo `:nome`), `dotnet test`, `pytest` (ou `python -m pytest`), `ng test`, `node --test`. |
| `build` | `npm run build` (com sufixo `:nome`), `dotnet build`, `ng build`. |

Argumentos extras aceitos nesses comandos: palavras simples com letras, números, `. / : = @ ~ -`.

## Configuração do projeto (`validarConfig`)

`{ pacotes, lembrados, bloqueios, producao }`. Campos desconhecidos são ignorados. Limites:

| Item | Limite |
|---|---|
| `lembrados` | até 200 comandos, cada um com até 4000 caracteres; repetidos são unidos. |
| `bloqueios` e `producao` | até 40 regras cada. |
| `texto` da regra | de 3 a 80 caracteres; comparado como texto literal, sem diferenciar maiúsculas. |
| `motivo` | até 120 caracteres; se vazio, usa um texto padrão. |
| `pacotes` | só ids existentes em `PACOTES`. |

`compilar(cfg)` nunca lança erro: configuração inválida vira configuração vazia. `/api/permissoes/lembrar` recusa comandos bloqueados e de produção.

## Explicação em português (`descrever`)

Devolve `{ resumo, passos, nivel, rotulo }`. Níveis: `leitura`, `altera`, `desconhecido`, `rede`, `servidor`. Comandos compostos são separados por `;`, `&&`, `||`, `|` e quebra de linha (máximo 6 passos mostrados). Também descreve `Write`/`Edit`/`MultiEdit`, `WebFetch` e `WebSearch`.

## Escrita de arquivos (`avaliarArquivo`)

Usada só em conversas de documentação (`Write`, `Edit`, `MultiEdit`).

- Modo `docs` (raiz = projeto): permite escrever em `docs/`, `planning/`, `pendencias/` (qualquer subnível) e `CLAUDE.md` na raiz. `Write` de arquivo que ainda não existe → `permitir`; alterar arquivo existente (ou `Edit`/`MultiEdit`) → `perguntar`. Fora disso → `negar`.
- Sempre negado: caminho fora da pasta do projeto; arquivos de segredos (`.env` exceto `.env.example`, `.ssh`, `id_*`, `.pem`, `.token`, `credentials`).
- Modo `gen` (raiz = pasta de rascunhos do lote): só `<área>/<arquivo>.md`, com `<área>` em `backend`, `frontend`, `infra`, `deploy`, `security`, `data-platform` e nomes que seguem `^[A-Za-z0-9][\w.\- ]{0,80}$`. Sobrescrever o próprio rascunho é permitido.

## Testes

`politica.test.mjs` cobre estas regras (ver [coding-standards.md](coding-standards.md)).

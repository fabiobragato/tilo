// Política de comandos da Central. Funções puras (testáveis): decidem o que fazer com um pedido de ferramenta do Claude
// e explicam, em português simples, o que o comando faz.
//   negar    -> bloqueado sem perguntar (destrutivo, segredos, exfiltração, auto-aprovação)
//   permitir -> liberado sem perguntar (somente leitura de fábrica + o que o dono lembrou/ligou neste projeto)
//   perguntar-> vai para a UI; risco 'producao' destaca em vermelho e pede confirmação extra
// Regras DE FÁBRICA valem para todos os projetos e não podem ser removidas. O projeto só ACRESCENTA:
//   pacotes opcionais (testes, build), comandos lembrados (texto exato que o dono aprovou), bloqueios e "cuidado extra" por texto.
// Ordem: negar (fábrica + projeto) > produção (fábrica + projeto) > lembrado (texto exato) > liberado (fábrica + pacotes) > perguntar.

import path from 'node:path';

const SHELLS = new Set(['Bash', 'PowerShell']);
export const FERRAMENTAS_ARQUIVO = ['Write', 'Edit', 'MultiEdit'];
const META = /[;&|<>`$(){}\\\n\r]/;
const ARG = String.raw`(?: [\w./:=@~\-]+)*`;

// [regex, título curto, explicação para leigos]
export const PADRAO = {
  negar: [
    [/\brm\s+-[a-z]*[rf]/i, 'Apagar arquivos em massa', 'Apagar arquivos e pastas de uma vez, sem volta.'],
    [/\b(remove-item|ri|del|erase|rmdir|rd)\b[^\n]*(-recurse|\s\/s\b|\s-r\b)/i, 'Apagar arquivos em massa', 'Apagar arquivos e pastas de uma vez, sem volta.'],
    [/\bformat\s+[a-z]:/i, 'Formatar disco', 'Apagar um disco inteiro.'],
    [/docker\s+(compose\s+)?down\b[^\n]*(\s-v\b|--volumes)/i, 'Derrubar serviços apagando os dados', 'Derrubar os serviços apagando também os dados guardados (bancos, arquivos).'],
    [/docker\s+(volume\s+(rm|prune)|system\s+prune|(compose\s+)?rm\s+[^\n]*-[a-z]*f)/i, 'Apagar dados do Docker à força', 'Apagar volumes e containers do Docker, onde ficam os dados dos serviços.'],
    [/git\s+push\b[^\n]*(--force|--force-with-lease|\s-f\b)/i, 'Reescrever o histórico no GitHub', 'Substituir o histórico remoto, o que pode apagar o trabalho de outras pessoas.'],
    [/git\s+reset\s+--hard/i, 'Descartar mudanças não salvas', 'Jogar fora todas as alterações que ainda não foram salvas no git.'],
    [/git\s+clean\s+-[a-z]*f/i, 'Apagar arquivos novos do git', 'Apagar arquivos que o git ainda não conhece.'],
    [/(^|[\s"'\/\\])\.env(?!\.example)\b|\.ssh\b|id_(ed25519|rsa|ecdsa)|\.token\b|[\/\\]\.claude\b|credentials|\.pem\b/i, 'Mexer em senhas e chaves', 'Ler ou alterar senhas, chaves de acesso e arquivos .env.'],
    [/(localhost|127\.0\.0\.1|\[::1\]):4777|api\/aprovacao/i, 'Mexer na própria Central', 'Tentar aprovar coisas sozinho ou alterar a Central de Projetos.'],
    [/\b(curl|wget)\b[^\n]*(\s-d\s*@|--data(-binary|-raw|-urlencode)?[\s=]*@|\s-F\s|\s-T\s|--upload-file)/i, 'Enviar arquivos para a internet', 'Mandar arquivos do seu computador para fora.'],
    [/\b(invoke-webrequest|invoke-restmethod|iwr|irm)\b[^\n]*(-infile|-body\s)/i, 'Enviar arquivos para a internet', 'Mandar arquivos do seu computador para fora.'],
    [/\|\s*(sh|bash|zsh|iex|invoke-expression)\b|\b(iex|invoke-expression)\b|-encodedcommand|-enc\s|base64\s+(-d|--decode)[^\n]*\|/i, 'Executar código escondido', 'Baixar e rodar código sem você ver, ou comandos codificados para esconder o que fazem.'],
  ],
  producao: [
    [/\b(ssh|scp|sftp|rsync)\b/i, 'Acessar outro computador (servidor)', 'Conectar em um servidor, como a VPS.'],
    [/migrate|deploy|publicar|publish/i, 'Migração, deploy ou publicação', 'Mudar o ambiente de verdade (banco, site no ar).'],
    [/git\s+push\b/i, 'Enviar para o GitHub', 'Enviar suas mudanças para o repositório remoto.'],
    [/\b(curl|wget|invoke-webrequest|invoke-restmethod|iwr|irm)\b(?![^\n]*https?:\/\/(localhost|127\.0\.0\.1)[:\/])/i, 'Acessar a internet', 'Fazer requisições de rede para fora do seu computador.'],
  ],
  // Somente consulta. Sem ; & | > < ` $ ( ) { } \ nem quebra de linha: um comando só.
  permitir: [
    [new RegExp(String.raw`^git (?:status|log|diff|show|branch)(?: (?!--output)[\w./:=@~\-]+)*$`), 'Ver o estado e o histórico do git', 'Mostra o que mudou nos arquivos e o histórico. Não altera nada.'],
    [/^ls(?: -[a-zA-Z]+)?(?: [\w./\-]+)*$/, 'Listar arquivos de uma pasta', 'Mostra os nomes dos arquivos de uma pasta.'],
    [/^pwd$/, 'Ver em que pasta está', 'Mostra a pasta atual.'],
    [/^docker ps(?: -a)?$/, 'Listar containers', 'Mostra quais containers estão rodando.'],
    [/^docker compose(?: -f [\w./:\-]+)? ps$/, 'Listar serviços do projeto', 'Mostra o estado dos serviços do docker compose.'],
    [new RegExp(String.raw`^docker (?:compose )?logs${ARG}$`), 'Ler logs de containers', 'Mostra as mensagens que os serviços registraram.'],
    [/^(?:node|npm|npx|python|python3|dotnet|git|docker|pwsh|java|go|cargo) (?:--version|-v|version)$/, 'Ver a versão de um programa', 'Mostra a versão instalada de um programa.'],
  ],
};

// Pacotes que o dono liga por projeto (executam o código do projeto, por isso não vêm ligados de fábrica).
export const PACOTES = {
  testes: {
    titulo: 'Rodar testes e verificações', descricao: 'O Claude roda os testes e o lint do projeto sozinho. Isso executa o código do projeto, mas não instala nada nem altera arquivos de propósito.',
    regras: [
      [/^npm (?:run )?test$/, 'Roda os testes do projeto (npm)'],
      [/^npm run (?:test|lint|check|typecheck)(?::[\w-]+)?$/, 'Roda testes ou verificações do projeto (npm)'],
      [new RegExp(String.raw`^dotnet test${ARG}$`), 'Roda os testes do projeto (.NET)'],
      [new RegExp(String.raw`^(?:python -m )?pytest${ARG}$`), 'Roda os testes do projeto (Python)'],
      [new RegExp(String.raw`^ng test${ARG}$`), 'Roda os testes do projeto (Angular)'],
      [new RegExp(String.raw`^node --test${ARG}$`), 'Roda os testes do projeto (Node)'],
    ],
  },
  build: {
    titulo: 'Compilar o projeto', descricao: 'O Claude compila o projeto para ver se tem erro. Cria arquivos de compilação (pastas como bin, obj, dist), sem mexer no seu código.',
    regras: [
      [/^npm run build(?::[\w-]+)?$/, 'Compila o projeto (npm)'],
      [new RegExp(String.raw`^dotnet build${ARG}$`), 'Compila o projeto (.NET)'],
      [new RegExp(String.raw`^ng build${ARG}$`), 'Compila o projeto (Angular)'],
    ],
  },
};

// ---------- configuração do projeto ----------
const MAX_LEMBRADOS = 200, MAX_CMD = 4000, MAX_REGRAS = 40, MAX_TEXTO = 80, MAX_MOTIVO = 120;
const vazia = () => ({ pacotes: [], lembrados: [], bloqueios: [], producao: [] });

// Valida e normaliza. Lança Error em português. Campos desconhecidos (formato antigo) são ignorados.
export function validarConfig(cfg) {
  const out = vazia();
  if (cfg === undefined || cfg === null) return out;
  if (typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('configuração de permissões inválida');
  const lista = (v, nome) => { if (v === undefined || v === null) return []; if (!Array.isArray(v)) throw new Error(`"${nome}" deve ser uma lista`); return v; };
  out.pacotes = [...new Set(lista(cfg.pacotes, 'pacotes').map(String))].filter((id) => PACOTES[id]);
  const lem = lista(cfg.lembrados, 'lembrados');
  if (lem.length > MAX_LEMBRADOS) throw new Error(`no máximo ${MAX_LEMBRADOS} comandos lembrados`);
  const vistos = new Set();
  for (const r of lem) {
    const comando = String(r?.comando ?? '').trim();
    if (!comando) continue;
    if (comando.length > MAX_CMD) throw new Error('comando longo demais para lembrar');
    if (vistos.has(comando)) continue; vistos.add(comando);
    out.lembrados.push({ comando, quando: String(r?.quando || new Date().toISOString()).slice(0, 30) });
  }
  for (const [chave, padraoMotivo] of [['bloqueios', 'bloqueado por você neste projeto'], ['producao', 'cuidado extra definido por você neste projeto']]) {
    const l = lista(cfg[chave], chave);
    if (l.length > MAX_REGRAS) throw new Error(`no máximo ${MAX_REGRAS} regras em "${chave}"`);
    for (const r of l) {
      const texto = String(r?.texto ?? '').trim();
      if (!texto) continue;
      if (texto.length < 3) throw new Error(`"${texto}" é curto demais: use pelo menos 3 letras para não pegar comandos sem querer`);
      if (texto.length > MAX_TEXTO) throw new Error(`texto longo demais (máx. ${MAX_TEXTO} caracteres)`);
      out[chave].push({ texto, motivo: String(r?.motivo ?? '').trim().slice(0, MAX_MOTIVO) || padraoMotivo });
    }
  }
  return out;
}
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Estrutura pronta para avaliar. Nunca lança: configuração ruim vira configuração vazia.
export function compilar(cfg) {
  let n; try { n = validarConfig(cfg); } catch { n = vazia(); }
  return {
    pacotes: n.pacotes.flatMap((id) => PACOTES[id].regras),
    lembrados: new Set(n.lembrados.map((l) => l.comando)),
    bloqueios: n.bloqueios.map((r) => [new RegExp(escapar(r.texto), 'i'), r.motivo]),
    producao: n.producao.map((r) => [new RegExp(escapar(r.texto), 'i'), r.motivo]),
  };
}
const SEM_EXTRA = { pacotes: [], lembrados: new Set(), bloqueios: [], producao: [] };

export function textoDoComando(input) {
  return String(input?.command ?? input?.script ?? input?.code ?? '').trim();
}

// extra = compilar(config do projeto). Resultado: { acao, risco, resumo (texto do comando), motivo, origem }.
export function avaliar(tool, input = {}, extra = SEM_EXTRA) {
  if (!SHELLS.has(tool)) return { acao: 'perguntar', risco: 'normal', resumo: `${tool} ${JSON.stringify(input).slice(0, 500)}`, motivo: 'ferramenta fora de Bash/PowerShell', origem: 'fábrica' };
  const cmd = textoDoComando(input);
  if (!cmd) return { acao: 'negar', risco: 'normal', resumo: '', motivo: 'comando vazio', origem: 'fábrica' };
  const acha = (fabrica, custom) => {
    for (const [re, motivo] of fabrica) if (re.test(cmd)) return { motivo, origem: 'fábrica' };
    for (const [re, motivo] of custom) if (re.test(cmd)) return { motivo, origem: 'projeto' };
    return null;
  };
  let h = acha(PADRAO.negar, extra.bloqueios);
  if (h) return { acao: 'negar', risco: 'normal', resumo: cmd, ...h };
  h = acha(PADRAO.producao, extra.producao);
  if (h) return { acao: 'perguntar', risco: 'producao', resumo: cmd, ...h };
  if (extra.lembrados.has(cmd)) return { acao: 'permitir', risco: 'normal', resumo: cmd, motivo: 'você já aprovou este comando neste projeto', origem: 'projeto' };
  if (!META.test(cmd)) { h = acha(PADRAO.permitir, extra.pacotes); if (h) return { acao: 'permitir', risco: 'normal', resumo: cmd, ...h }; }
  return { acao: 'perguntar', risco: 'normal', resumo: cmd, motivo: 'comando novo: precisa da sua aprovação', origem: 'fábrica' };
}

// ---------- explicação em português ----------
const NIVEIS = {
  leitura: { ordem: 0, rotulo: 'Só consulta, não altera nada' },
  altera: { ordem: 1, rotulo: 'Altera arquivos ou o estado do projeto' },
  desconhecido: { ordem: 1, rotulo: 'Comando não reconhecido: leia com atenção' },
  rede: { ordem: 2, rotulo: 'Usa a internet' },
  servidor: { ordem: 3, rotulo: 'Mexe em servidor ou produção' },
};
export const rotuloNivel = (n) => NIVEIS[n]?.rotulo || NIVEIS.desconhecido.rotulo;

function partir(cmd) { // separa em etapas por ; && || | e quebras de linha, respeitando aspas
  const out = []; let cur = '', q = '';
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { cur += c; if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '\n' || c === ';' || (c === '|') || (c === '&' && cmd[i + 1] === '&')) { if (cur.trim()) out.push(cur.trim()); cur = ''; if ((c === '|' && cmd[i + 1] === '|') || c === '&') i++; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function tokens(s) { // palavras, mantendo o que está entre aspas junto
  const t = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m;
  while ((m = re.exec(s))) t.push(m[1] ?? m[2] ?? m[3]);
  return t;
}
const nomeProg = (t) => String(t || '').replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|bat|ps1|sh)$/i, '').toLowerCase();
const args = (t) => t.slice(1).filter((x) => !x.startsWith('-'));
const alvo = (t) => args(t)[0] ? `“${args(t)[0]}”` : 'a pasta atual';
const host = (u) => { try { return new URL(/^https?:/i.test(u) ? u : 'http://' + u).hostname; } catch { return u; } };
const eLocal = (h) => /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(h);

function explicarEtapa(passo, fundo = 0) {
  const t = tokens(passo); if (!t.length) return null;
  let p = nomeProg(t[0]); const resto = t.slice(1); const a = args(t);
  if (/^[$@]|^\w+\s*=/.test(passo) && !/^(npm|git|docker)/.test(p)) return { txt: 'Guarda um valor em uma variável do script', nivel: 'altera' };
  if (['ls', 'dir', 'gci', 'get-childitem', 'tree'].includes(p)) return { txt: `Lista os arquivos de ${alvo(t)}`, nivel: 'leitura' };
  if (['pwd', 'get-location'].includes(p)) return { txt: 'Mostra em que pasta está', nivel: 'leitura' };
  if (['cd', 'set-location', 'pushd', 'popd'].includes(p)) return { txt: `Entra na pasta ${alvo(t)}`, nivel: 'leitura' };
  if (['cat', 'type', 'get-content', 'gc', 'head', 'tail', 'more', 'less'].includes(p)) return { txt: `Mostra o conteúdo de ${alvo(t)}`, nivel: 'leitura' };
  if (['grep', 'rg', 'select-string', 'findstr', 'find'].includes(p)) return { txt: `Procura um texto nos arquivos${a[0] ? ` (“${a[0]}”)` : ''}`, nivel: 'leitura' };
  if (['echo', 'write-output', 'write-host', 'printf'].includes(p)) return { txt: 'Escreve uma mensagem na tela', nivel: 'leitura' };
  if (['which', 'where', 'get-command'].includes(p)) return { txt: `Procura onde um programa está instalado`, nivel: 'leitura' };
  if (['mkdir', 'md'].includes(p)) return { txt: `Cria a pasta ${alvo(t)}`, nivel: 'altera' };
  if (p === 'new-item') return { txt: `Cria um arquivo ou pasta (${alvo(t)})`, nivel: 'altera' };
  if (p === 'touch') return { txt: `Cria (ou atualiza a data de) ${alvo(t)}`, nivel: 'altera' };
  if (['cp', 'copy', 'copy-item', 'xcopy', 'robocopy'].includes(p)) return { txt: `Copia arquivos (${a.slice(0, 2).map((x) => `“${x}”`).join(' → ')})`, nivel: 'altera' };
  if (['mv', 'move', 'move-item', 'ren', 'rename-item'].includes(p)) return { txt: `Move ou renomeia arquivos (${a.slice(0, 2).map((x) => `“${x}”`).join(' → ')})`, nivel: 'altera' };
  if (['rm', 'del', 'erase', 'remove-item', 'rmdir', 'rd'].includes(p)) return { txt: `APAGA ${alvo(t)}`, nivel: 'altera' };
  if (p === 'git') {
    const i = t.findIndex((x, k) => k > 0 && !x.startsWith('-') && !(k > 1 && t[k - 1] === '-C')); const sub = (t[i] || '').toLowerCase();
    const M = { status: ['Mostra quais arquivos mudaram', 'leitura'], log: ['Mostra o histórico de alterações', 'leitura'], diff: ['Mostra as diferenças entre versões dos arquivos', 'leitura'], show: ['Mostra os detalhes de uma alteração do histórico', 'leitura'],
      add: ['Prepara arquivos para o próximo commit', 'altera'], commit: ['Registra as mudanças no histórico do git (commit)', 'altera'], push: ['Envia suas mudanças para o repositório remoto (GitHub)', 'servidor'],
      pull: ['Baixa e junta as mudanças do repositório remoto', 'rede'], fetch: ['Baixa as novidades do repositório remoto', 'rede'], clone: ['Baixa uma cópia de um repositório', 'rede'],
      checkout: ['Troca de ramo ou restaura arquivos', 'altera'], switch: ['Troca de ramo', 'altera'], restore: ['Restaura arquivos de uma versão anterior', 'altera'], stash: ['Guarda as mudanças atuais de lado', 'altera'],
      merge: ['Junta um ramo em outro', 'altera'], rebase: ['Reorganiza o histórico de commits', 'altera'], reset: ['Volta o git para um ponto anterior', 'altera'], tag: ['Marca uma versão no histórico', 'altera'], init: ['Começa um repositório git nesta pasta', 'altera'] };
    if (sub === 'branch') return resto.some((x) => /^-[dDmM]/.test(x)) ? { txt: 'Apaga ou renomeia um ramo do git', nivel: 'altera' } : a.length > 1 ? { txt: 'Cria um ramo no git', nivel: 'altera' } : { txt: 'Lista os ramos do git', nivel: 'leitura' };
    return M[sub] ? { txt: M[sub][0], nivel: M[sub][1] } : { txt: `Executa “git ${sub}”`, nivel: 'desconhecido' };
  }
  if (p === 'docker') {
    const sub = a[0]; const comp = sub === 'compose'; const s2 = comp ? a[1] : sub;
    const M = { ps: ['Lista os containers em execução', 'leitura'], logs: ['Mostra as mensagens (logs) de um serviço', 'leitura'], images: ['Lista as imagens do Docker', 'leitura'], config: ['Mostra a configuração do compose (pode incluir senhas)', 'leitura'],
      up: ['Sobe os serviços (containers)', 'altera'], down: ['Desliga e remove os serviços', 'altera'], build: ['Constrói as imagens dos serviços', 'altera'], restart: ['Reinicia serviços', 'altera'], stop: ['Para serviços', 'altera'], start: ['Liga serviços parados', 'altera'],
      exec: ['Roda um comando dentro de um container', 'altera'], run: ['Roda um container novo', 'altera'], pull: ['Baixa imagens da internet', 'rede'], rm: ['Remove containers', 'altera'] };
    return M[s2] ? { txt: M[s2][0], nivel: M[s2][1] } : { txt: `Executa “docker ${a.slice(0, 2).join(' ')}”`, nivel: 'desconhecido' };
  }
  if (['npm', 'pnpm', 'yarn'].includes(p)) {
    const sub = a[0] || '';
    if (['install', 'i', 'ci', 'add'].includes(sub)) return { txt: 'Baixa e instala as dependências do projeto (usa a internet)', nivel: 'rede' };
    if (sub === 'test' || sub === 't') return { txt: 'Roda os testes do projeto', nivel: 'altera' };
    if (sub === 'run' || sub === 'run-script') return { txt: `Roda o script “${a[1] || ''}” do projeto${/build/.test(a[1] || '') ? ' (compila)' : /test|lint|check/.test(a[1] || '') ? ' (verificação)' : ''}`, nivel: 'altera' };
    if (sub === 'start') return { txt: 'Inicia o projeto', nivel: 'altera' };
    if (['publish', 'login'].includes(sub)) return { txt: `Executa “${p} ${sub}” (mexe em conta/pacote publicado)`, nivel: 'servidor' };
    return { txt: `Executa “${p} ${sub}”`, nivel: 'desconhecido' };
  }
  if (p === 'npx') return { txt: `Baixa e roda o programa “${a[0] || ''}” (usa a internet)`, nivel: 'rede' };
  if (p === 'dotnet') {
    const M = { test: ['Roda os testes do projeto (.NET)', 'altera'], build: ['Compila o projeto (.NET)', 'altera'], run: ['Roda o projeto (.NET)', 'altera'], restore: ['Baixa as dependências (.NET, usa a internet)', 'rede'], publish: ['Gera os arquivos para publicar (.NET)', 'altera'], ef: ['Mexe no banco de dados via Entity Framework', 'servidor'], '--version': ['Mostra a versão do .NET', 'leitura'] };
    return M[a[0] || resto[0]] ? { txt: M[a[0] || resto[0]][0], nivel: M[a[0] || resto[0]][1] } : { txt: `Executa “dotnet ${a[0] || ''}”`, nivel: 'desconhecido' };
  }
  if (['python', 'python3', 'py'].includes(p)) {
    if (resto[0] === '-m') return { txt: a[1] === 'pytest' || resto[1] === 'pytest' ? 'Roda os testes do projeto (Python)' : `Roda o módulo Python “${resto[1] || ''}”`, nivel: 'altera' };
    if (resto[0] === '-c') return { txt: 'Roda um trecho de código Python escrito na hora', nivel: 'desconhecido' };
    if (resto[0] === '--version' || resto[0] === '-V') return { txt: 'Mostra a versão do Python', nivel: 'leitura' };
    return { txt: `Roda o programa Python “${a[0] || ''}”`, nivel: 'altera' };
  }
  if (p === 'pytest') return { txt: 'Roda os testes do projeto (Python)', nivel: 'altera' };
  if (p === 'pip' || p === 'pip3') return { txt: 'Instala ou gerencia pacotes Python (usa a internet)', nivel: 'rede' };
  if (p === 'node') return resto[0] === '--test' ? { txt: 'Roda os testes do projeto (Node)', nivel: 'altera' } : /^(--version|-v)$/.test(resto[0] || '') ? { txt: 'Mostra a versão do Node', nivel: 'leitura' } : { txt: `Roda o programa Node “${a[0] || ''}”`, nivel: 'altera' };
  if (p === 'ng') return { txt: `Executa o Angular (“ng ${a[0] || ''}”)`, nivel: 'altera' };
  if (['curl', 'wget', 'invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm'].includes(p)) {
    const u = t.find((x) => /^(https?:\/\/|www\.)|^[\w.-]+\.[a-z]{2,}(\/|$)|^localhost/i.test(x)); const h = u ? host(u) : 'um endereço';
    const envia = resto.some((x) => /^(-X|-d|--data|-F|-Method|-Body)/i.test(x));
    return eLocal(h) ? { txt: `${envia ? 'Envia dados para' : 'Consulta'} um serviço da sua própria máquina (${h})`, nivel: envia ? 'altera' : 'leitura' } : { txt: `${envia ? 'Envia dados para' : 'Acessa'} ${h} na internet`, nivel: 'rede' };
  }
  if (['ssh', 'scp', 'sftp', 'rsync'].includes(p)) {
    const h = a.find((x) => /@|^[\w.-]+\.[a-z]{2,}$/.test(x)) || 'um servidor';
    return { txt: p === 'ssh' ? `Conecta no servidor ${h}${a.length > 1 ? ' e roda comandos nele' : ''}` : `Copia arquivos de/para o servidor ${h}`, nivel: 'servidor' };
  }
  if (['powershell', 'pwsh', 'bash', 'sh', 'cmd'].includes(p)) {
    const iF = resto.findIndex((x) => /^-file$/i.test(x)), iC = resto.findIndex((x) => /^(-command|-c|\/c)$/i.test(x));
    if (iF >= 0 && resto[iF + 1]) { const s = resto[iF + 1]; return { txt: `Roda o script “${s.replace(/^.*[\\/]/, '')}” do projeto${/migrat|deploy|publi/i.test(s) ? ' (parece migração/deploy: mexe no ambiente de verdade)' : ''}`, nivel: /migrat|deploy|publi/i.test(s) ? 'servidor' : 'altera' }; }
    if (iC >= 0 && resto[iC + 1] && fundo < 2) { const e = descreverTexto(resto.slice(iC + 1).join(' '), fundo + 1); return { txt: `Roda: ${e.passos.join('; ')}`, nivel: e.nivel }; }
    return { txt: `Abre ${p} para rodar comandos`, nivel: 'desconhecido' };
  }
  if (/^[a-z]+-[a-z]+$/i.test(p)) return { txt: `Executa o comando PowerShell “${t[0]}”`, nivel: 'desconhecido' }; // Get-Foo, Invoke-Bar...
  return { txt: `Executa “${t.slice(0, 3).join(' ')}${t.length > 3 ? ' …' : ''}”`, nivel: 'desconhecido' };
}
function descreverTexto(cmd, fundo = 0) {
  const etapas = partir(cmd).map((e) => explicarEtapa(e, fundo)).filter(Boolean);
  const passos = etapas.slice(0, 6).map((e) => e.txt); if (etapas.length > 6) passos.push(`… e mais ${etapas.length - 6} passos`);
  const nivel = etapas.reduce((m, e) => (NIVEIS[e.nivel].ordem > NIVEIS[m].ordem ? e.nivel : m), 'leitura');
  return { passos, nivel: etapas.length ? nivel : 'desconhecido' };
}

// Explicação para leigos: { resumo (uma frase), passos[], nivel, rotulo }. É um resumo automático: o texto exato do comando sempre é mostrado junto.
export function descrever(tool, input = {}) {
  if (SHELLS.has(tool)) {
    const d = descreverTexto(textoDoComando(input));
    const resumo = d.passos.length <= 1 ? (d.passos[0] || 'Comando vazio') : `${d.passos.length} passos em sequência`;
    return { resumo, passos: d.passos, nivel: d.nivel, rotulo: rotuloNivel(d.nivel) };
  }
  if (FERRAMENTAS_ARQUIVO.includes(tool)) {
    const f = String(input?.file_path || '');
    return { resumo: tool === 'Write' ? `Gravar o arquivo “${f}”` : `Alterar o arquivo “${f}”`, passos: [], nivel: 'altera', rotulo: rotuloNivel('altera') };
  }
  const url = String(input?.url || '');
  if (tool === 'WebFetch') return { resumo: `Abrir a página ${host(url)} na internet`, passos: [`Abrir a página ${url}`], nivel: 'rede', rotulo: rotuloNivel('rede') };
  if (tool === 'WebSearch') return { resumo: `Pesquisar na internet: “${String(input?.query || '').slice(0, 80)}”`, passos: [], nivel: 'rede', rotulo: rotuloNivel('rede') };
  return { resumo: `Usar a ferramenta ${tool}`, passos: [], nivel: 'desconhecido', rotulo: rotuloNivel('desconhecido') };
}

// ---------- escrita de arquivos (conversas de documentação) ----------
// Nas conversas de documentação o Claude não tem terminal: só lê e escreve arquivos. Arquivo NOVO em docs/, planning/, pendencias/
// ou CLAUDE.md é criado direto; alterar arquivo que já existe pede aprovação; qualquer outro lugar (código, segredos, fora do projeto) é bloqueado.
const PASTAS_DOC = new Set(['docs', 'planning', 'pendencias']);
const SEGREDO = /(^|[\\/])\.env(?!\.example)|\.ssh|id_(ed25519|rsa|ecdsa)|\.pem$|\.token$|credentials/i;
const AREAS_GEN = new Set(['backend', 'frontend', 'infra', 'deploy', 'security', 'data-platform']);
// modo 'gen': conversa que generaliza documentos. A raiz é uma pasta de rascunhos isolada; só se escreve <área>/<arquivo>.md ali
// (rascunho é descartável, então sobrescrever o próprio rascunho é permitido).
export function avaliarArquivo(tool, input = {}, { root, existe = () => false, modo = 'docs' } = {}) {
  const f = String(input?.file_path ?? input?.path ?? '').trim();
  const nega = (motivo) => ({ acao: 'negar', risco: 'normal', resumo: `${tool} ${f}`, motivo, origem: 'fábrica' });
  if (!FERRAMENTAS_ARQUIVO.includes(tool) || !f || !root) return nega('pedido de escrita inválido');
  const abs = path.resolve(root, f), rel = path.relative(root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return nega('fora da pasta do projeto');
  if (SEGREDO.test(rel)) return nega('arquivo de segredos');
  const partes = rel.split(path.sep), primeiro = partes[0].toLowerCase();
  if (modo === 'gen') {
    const okGen = partes.length >= 2 && AREAS_GEN.has(partes[0]) && partes.slice(1).every((s) => /^[A-Za-z0-9][\w.\- ]{0,80}$/.test(s)) && partes[partes.length - 1].toLowerCase().endsWith('.md');
    if (!okGen) return nega('o rascunho só pode ser <área>/<arquivo>.md (backend, frontend, infra, deploy, security ou data-platform)');
    return { acao: 'permitir', risco: 'normal', resumo: `${tool} ${partes.join('/')}`, motivo: 'rascunho de generalização', origem: 'fábrica' };
  }
  const ok = (partes.length === 1 && primeiro === 'claude.md') || (partes.length > 1 && PASTAS_DOC.has(primeiro));
  if (!ok) return nega('a documentação só pode escrever em docs/, planning/, pendencias/ e CLAUDE.md');
  const relUnix = partes.join('/');
  if (tool === 'Write' && !existe(abs)) return { acao: 'permitir', risco: 'normal', resumo: `Write ${relUnix}`, motivo: 'arquivo novo de documentação', origem: 'fábrica' };
  return { acao: 'perguntar', risco: 'normal', resumo: `${tool} ${relUnix}`, motivo: existe(abs) ? 'este arquivo já existe: será alterado' : 'alteração de arquivo', origem: 'fábrica' };
}

// ---------- para a tela de Permissões ----------
const agrupar = (lista) => { const m = new Map(); for (const [, titulo, desc] of lista) if (!m.has(titulo)) m.set(titulo, desc); return [...m].map(([titulo, descricao]) => ({ titulo, descricao })); };
export const descreverFabrica = () => ({ negar: agrupar(PADRAO.negar), producao: agrupar(PADRAO.producao), permitir: agrupar(PADRAO.permitir) });
export const listarPacotes = () => Object.entries(PACOTES).map(([id, p]) => ({ id, titulo: p.titulo, descricao: p.descricao, exemplos: p.regras.map(([, d]) => d) }));

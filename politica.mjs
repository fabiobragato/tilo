// Política de comandos da Central. Funções puras (testáveis): decidem o que fazer com um pedido de ferramenta do Claude.
//   negar    -> bloqueado sem perguntar (destrutivo, segredos, exfiltração, auto-aprovação)
//   permitir -> somente leitura, sem metacaracteres de shell (lista curta e estrita)
//   perguntar-> vai para a UI; risco 'producao' destaca em vermelho e pede confirmação extra
// Regras PADRÃO valem para todos os projetos e não podem ser removidas. Cada projeto pode ACRESCENTAR regras próprias
// (negar, producao, permitir). Ordem: negar (padrão + projeto) > producao (padrão + projeto) > permitir > perguntar.
// Qualquer coisa que não case com "permitir" nunca é executada sem clique do dono.

const SHELLS = new Set(['Bash', 'PowerShell']);

export const PADRAO = {
  negar: [
    [/\brm\s+-[a-z]*[rf]/i, 'remoção recursiva/forçada'],
    [/\b(remove-item|ri|del|erase|rmdir|rd)\b[^\n]*(-recurse|\s\/s\b|\s-r\b)/i, 'remoção recursiva'],
    [/\bformat\s+[a-z]:/i, 'formatar disco'],
    [/docker\s+(compose\s+)?down\b[^\n]*(\s-v\b|--volumes)/i, 'derruba containers apagando volumes'],
    [/docker\s+(volume\s+(rm|prune)|system\s+prune|(compose\s+)?rm\s+[^\n]*-[a-z]*f)/i, 'apaga volumes/containers à força'],
    [/git\s+push\b[^\n]*(--force|--force-with-lease|\s-f\b)/i, 'push forçado'],
    [/git\s+reset\s+--hard/i, 'git reset --hard'],
    [/git\s+clean\s+-[a-z]*f/i, 'git clean -f'],
    [/(^|[\s"'\/\\])\.env(?!\.example)\b|\.ssh\b|id_(ed25519|rsa|ecdsa)|\.token\b|[\/\\]\.claude\b|credentials|\.pem\b/i, 'acesso a segredos'],
    [/(localhost|127\.0\.0\.1|\[::1\]):4777|api\/aprovacao/i, 'tentativa de falar com a própria Central'],
    [/\b(curl|wget)\b[^\n]*(\s-d\s*@|--data(-binary|-raw|-urlencode)?[\s=]*@|\s-F\s|\s-T\s|--upload-file)/i, 'envio de arquivo para fora'],
    [/\b(invoke-webrequest|invoke-restmethod|iwr|irm)\b[^\n]*(-infile|-body\s)/i, 'envio de dados para fora'],
    [/\|\s*(sh|bash|zsh|iex|invoke-expression)\b|\b(iex|invoke-expression)\b|-encodedcommand|-enc\s|base64\s+(-d|--decode)[^\n]*\|/i, 'execução ofuscada/remota'],
  ],
  producao: [
    [/\b(ssh|scp|sftp|rsync)\b/i, 'acesso remoto (VPS)'],
    [/migrate|deploy|publicar|publish/i, 'migração/deploy/publicação'],
    [/git\s+push\b/i, 'git push'],
    [/\b(curl|wget|invoke-webrequest|invoke-restmethod|iwr|irm)\b(?![^\n]*https?:\/\/(localhost|127\.0\.0\.1)[:\/])/i, 'chamada de rede externa'],
  ],
  // Somente leitura. Nada de ; & | > < ` $ ( ) { } \ nem quebras de linha: um comando só.
  permitir: [
    [/^git (?:status|log|diff|show|branch)(?: (?!--output)[\w./:=@~\-]+)*$/, 'git somente leitura'],
    [/^ls(?: -[a-zA-Z]+)?(?: [\w./\-]+)*$/, 'listar arquivos'],
    [/^pwd$/, 'diretório atual'],
    [/^docker ps(?: -a)?$/, 'listar containers'],
    [/^docker compose(?: -f [\w./:\-]+)? ps$/, 'listar serviços do compose'],
  ],
};
const META = /[;&|<>`$(){}\\\n\r]/;

// ---------- regras do projeto ----------
const MAX_REGRAS = 40, MAX_PADRAO = 200, MAX_MOTIVO = 120;
const ALINHADO = /^\^.*\$$/;
const ANINHADO = /\([^)]*[+*][^)]*\)[+*{]/; // (a+)+ e parentes: risco de regex catastrófica
const SECOES = ['negar', 'producao', 'permitir'];
const PADRAO_MOTIVO = { negar: 'bloqueado pelo projeto', producao: 'tratado como produção pelo projeto', permitir: 'liberado pelo projeto' };

// Valida e normaliza a configuração vinda da UI/arquivo. Lança Error com mensagem em português.
export function validarConfig(cfg) {
  const out = { negar: [], producao: [], permitir: [] };
  if (cfg === undefined || cfg === null) return out;
  if (typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('configuração de política inválida');
  for (const sec of SECOES) {
    const lista = cfg[sec] ?? [];
    if (!Array.isArray(lista)) throw new Error(`"${sec}" deve ser uma lista`);
    if (lista.length > MAX_REGRAS) throw new Error(`"${sec}": no máximo ${MAX_REGRAS} regras`);
    for (const r of lista) {
      const padrao = String(r?.padrao ?? '').trim(), motivo = String(r?.motivo ?? '').trim().slice(0, MAX_MOTIVO);
      if (!padrao) throw new Error(`"${sec}": regra com padrão vazio`);
      if (padrao.length > MAX_PADRAO) throw new Error(`"${sec}": padrão longo demais (máx. ${MAX_PADRAO} caracteres)`);
      try { new RegExp(padrao, 'i'); } catch (e) { throw new Error(`"${sec}": expressão inválida "${padrao}" (${e.message})`); }
      if (ANINHADO.test(padrao)) throw new Error(`"${sec}": "${padrao}" tem repetição aninhada e pode travar o painel; simplifique`);
      if (sec === 'permitir') {
        if (!ALINHADO.test(padrao)) throw new Error(`"permitir": "${padrao}" precisa começar com ^ e terminar com $ (comando inteiro, nunca um pedaço)`);
        if (/\.[*+]/.test(padrao.replace(/\[[^\]]*\]/g, ''))) throw new Error(`"permitir": "${padrao}" usa curinga amplo (.* ou .+); descreva os argumentos permitidos`);
      }
      out[sec].push({ padrao, motivo: motivo || PADRAO_MOTIVO[sec] });
    }
  }
  return out;
}

// Compila ignorando entradas inválidas (um arquivo editado à mão não pode derrubar a política).
export function compilar(cfg) {
  const out = { negar: [], producao: [], permitir: [] };
  let norm; try { norm = validarConfig(cfg); } catch { norm = out; }
  for (const sec of SECOES) for (const r of norm[sec]) { try { out[sec].push([new RegExp(r.padrao, 'i'), r.motivo]); } catch {} }
  return out;
}

export function textoDoComando(input) {
  return String(input?.command ?? input?.script ?? input?.code ?? '').trim();
}

// extra = compilar(config do projeto) (opcional). O resultado inclui origem ('padrão' | 'projeto') para a UI explicar.
export function avaliar(tool, input = {}, extra = { negar: [], producao: [], permitir: [] }) {
  if (!SHELLS.has(tool)) return { acao: 'perguntar', risco: 'normal', resumo: `${tool} ${JSON.stringify(input).slice(0, 500)}`, motivo: 'ferramenta fora de Bash/PowerShell', origem: 'padrão' };
  const cmd = textoDoComando(input);
  if (!cmd) return { acao: 'negar', risco: 'normal', resumo: '', motivo: 'comando vazio', origem: 'padrão' };
  const acha = (padrao, custom) => {
    for (const [re, motivo] of padrao) if (re.test(cmd)) return { motivo, origem: 'padrão' };
    for (const [re, motivo] of custom) if (re.test(cmd)) return { motivo, origem: 'projeto' };
    return null;
  };
  let h = acha(PADRAO.negar, extra.negar);
  if (h) return { acao: 'negar', risco: 'normal', resumo: cmd, ...h };
  h = acha(PADRAO.producao, extra.producao);
  if (h) return { acao: 'perguntar', risco: 'producao', resumo: cmd, ...h };
  if (!META.test(cmd)) { h = acha(PADRAO.permitir, extra.permitir); if (h) return { acao: 'permitir', risco: 'normal', resumo: cmd, ...h }; }
  return { acao: 'perguntar', risco: 'normal', resumo: cmd, motivo: 'comando fora da lista de somente leitura', origem: 'padrão' };
}

// Para a tela: regras padrão legíveis (somente leitura).
export const descreverPadrao = () => Object.fromEntries(SECOES.map((s) => [s, PADRAO[s].map(([re, motivo]) => ({ padrao: re.source, motivo }))]));

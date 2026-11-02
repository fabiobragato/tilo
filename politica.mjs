// Política de comandos do Datadubis Central. Função pura (testável): decide o que fazer com um pedido de ferramenta do Claude.
//   negar    -> bloqueado sem perguntar (destrutivo, segredos, exfiltração, auto-aprovação)
//   permitir -> somente leitura, sem metacaracteres de shell (lista curta e estrita)
//   perguntar-> vai para a UI; risco 'producao' destaca em vermelho e pede confirmação extra
// Qualquer coisa que não case com "permitir" nunca é executada sem clique do dono.

const SHELLS = new Set(['Bash', 'PowerShell']);

const NEGAR = [
  [/\brm\s+-[a-z]*[rf]/i, 'remoção recursiva/forçada'],
  [/\b(remove-item|ri|del|erase|rmdir|rd)\b[^\n]*(-recurse|\s\/s\b|\s-r\b)/i, 'remoção recursiva'],
  [/\bformat\s+[a-z]:/i, 'formatar disco'],
  [/docker\s+(compose\s+)?down\b[^\n]*(\s-v\b|--volumes)/i, 'derruba containers apagando volumes'],
  [/docker\s+(volume\s+(rm|prune)|system\s+prune|(compose\s+)?rm\s+[^\n]*-[a-z]*f)/i, 'apaga volumes/containers à força'],
  [/git\s+push\b[^\n]*(--force|--force-with-lease|\s-f\b)/i, 'push forçado'],
  [/git\s+reset\s+--hard/i, 'git reset --hard'],
  [/git\s+clean\s+-[a-z]*f/i, 'git clean -f'],
  [/(^|[\s"'\/\\])\.env(?!\.example)\b|\.ssh\b|id_(ed25519|rsa|ecdsa)|\.token\b|[\/\\]\.claude\b|credentials|\.pem\b/i, 'acesso a segredos'],
  [/(localhost|127\.0\.0\.1|\[::1\]):4777|api\/aprovacao/i, 'tentativa de falar com o próprio painel'],
  [/\b(curl|wget)\b[^\n]*(\s-d\s*@|--data(-binary|-raw|-urlencode)?[\s=]*@|\s-F\s|\s-T\s|--upload-file)/i, 'envio de arquivo para fora'],
  [/\b(invoke-webrequest|invoke-restmethod|iwr|irm)\b[^\n]*(-infile|-body\s)/i, 'envio de dados para fora'],
  [/\|\s*(sh|bash|zsh|iex|invoke-expression)\b|\b(iex|invoke-expression)\b|-encodedcommand|-enc\s|base64\s+(-d|--decode)[^\n]*\|/i, 'execução ofuscada/remota'],
];

const PRODUCAO = [
  [/\b(ssh|scp|sftp|rsync)\b/i, 'acesso remoto (VPS)'],
  [/migrate|deploy|publicar|publish/i, 'migração/deploy/publicação'],
  [/git\s+push\b/i, 'git push'],
  [/\b(curl|wget|invoke-webrequest|invoke-restmethod|iwr|irm)\b(?![^\n]*https?:\/\/(localhost|127\.0\.0\.1)[:\/])/i, 'chamada de rede externa'],
];

// Somente leitura. Nada de ; & | > < ` $ ( ) { } \ nem quebras de linha: um comando só.
const PERMITIR = [
  /^git (?:status|log|diff|show|branch)(?: (?!--output)[\w./:=@~\-]+)*$/,
  /^ls(?: -[a-zA-Z]+)?(?: [\w./\-]+)*$/,
  /^pwd$/,
  /^docker ps(?: -a)?$/,
  /^docker compose(?: -f [\w./:\-]+)? ps$/,
];
const META = /[;&|<>`$(){}\\\n\r]/;

export function textoDoComando(input) {
  return String(input?.command ?? input?.script ?? input?.code ?? '').trim();
}

export function avaliar(tool, input = {}) {
  if (!SHELLS.has(tool)) return { acao: 'perguntar', risco: 'normal', resumo: `${tool} ${JSON.stringify(input).slice(0, 500)}`, motivo: 'ferramenta fora de Bash/PowerShell' };
  const cmd = textoDoComando(input);
  if (!cmd) return { acao: 'negar', risco: 'normal', resumo: '', motivo: 'comando vazio' };
  for (const [re, motivo] of NEGAR) if (re.test(cmd)) return { acao: 'negar', risco: 'normal', resumo: cmd, motivo };
  if (!META.test(cmd) && PERMITIR.some((re) => re.test(cmd))) return { acao: 'permitir', risco: 'normal', resumo: cmd, motivo: 'somente leitura' };
  for (const [re, motivo] of PRODUCAO) if (re.test(cmd)) return { acao: 'perguntar', risco: 'producao', resumo: cmd, motivo };
  return { acao: 'perguntar', risco: 'normal', resumo: cmd, motivo: 'comando fora da lista de somente leitura' };
}

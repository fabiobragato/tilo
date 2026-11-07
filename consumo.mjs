// Consumo de tokens, lido dos transcripts (.jsonl) do Claude Code. Só leitura, sem dependências.
// Cada resposta do Claude traz message.usage; a mesma resposta pode aparecer em várias linhas (uma por bloco), então somamos uma vez por message.id.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_BYTES = 150_000_000; // arquivos maiores que isso são ignorados
const cache = new Map(); // arquivo -> { key, uso }

export const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
export const pastaDeTranscripts = (raiz) => path.join(CLAUDE_HOME, 'projects', String(raiz).replace(/[^a-zA-Z0-9]/g, '-'));

export const usoVazio = () => ({ entrada: 0, saida: 0, cacheCriacao: 0, cacheLeitura: 0 });
export function somar(a, b) { a.entrada += b.entrada; a.saida += b.saida; a.cacheCriacao += b.cacheCriacao; a.cacheLeitura += b.cacheLeitura; return a; }
// "Tokens novos": o que o Claude leu pela primeira vez e escreveu. A leitura de cache (repetida a cada mensagem) fica à parte.
export const totalNovo = (u) => u.entrada + u.saida + u.cacheCriacao;

const n = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
export const diaLocal = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Lê o texto de um transcript: { total, porDia: { 'AAAA-MM-DD': uso } }
export function usoDoTexto(txt) {
  const msgs = new Map(); // message.id -> { ts, uso } (vale a última linha de cada resposta)
  let seq = 0;
  for (const linha of txt.split('\n')) {
    if (!linha.startsWith('{') || !linha.includes('"usage"')) continue;
    let e; try { e = JSON.parse(linha); } catch { continue; }
    if (e.type !== 'assistant' || !e.message?.usage || String(e.message.model || '').startsWith('<')) continue;
    const u = e.message.usage;
    const id = e.message.id || e.requestId || `s${seq++}`;
    const ts = Date.parse(e.timestamp) || msgs.get(id)?.ts || 0;
    msgs.set(id, { ts, uso: { entrada: n(u.input_tokens), saida: n(u.output_tokens), cacheCriacao: n(u.cache_creation_input_tokens), cacheLeitura: n(u.cache_read_input_tokens) } });
  }
  const total = usoVazio(), porDia = {};
  for (const { ts, uso } of msgs.values()) {
    somar(total, uso);
    if (ts) somar(porDia[diaLocal(ts)] ||= usoVazio(), uso);
  }
  return { total, porDia };
}

export function usoDoArquivo(file) {
  let st; try { st = fs.statSync(file); } catch { return null; }
  if (st.size > MAX_BYTES) return null;
  const key = `${st.mtimeMs}:${st.size}`;
  const hit = cache.get(file);
  if (hit && hit.key === key) return hit.uso;
  let uso; try { uso = usoDoTexto(fs.readFileSync(file, 'utf8')); } catch { return null; }
  cache.set(file, { key, uso });
  return uso;
}

// Hoje e últimos 7 dias (hoje + 6 anteriores, dia local) somando os transcripts alterados na última semana das pastas dadas.
export function consumoRecente(pastas, agora = Date.now()) {
  const hoje = diaLocal(agora);
  const dias = Array.from({ length: 7 }, (_, i) => diaLocal(agora - i * 86400_000));
  const outHoje = usoVazio(), outSemana = usoVazio(), porDia = Object.fromEntries(dias.map((d) => [d, usoVazio()]));
  for (const pasta of new Set(pastas)) {
    let arquivos = []; try { arquivos = fs.readdirSync(pasta).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of arquivos) {
      const abs = path.join(pasta, f);
      try { if (fs.statSync(abs).mtimeMs < agora - 8 * 86400_000) continue; } catch { continue; }
      const u = usoDoArquivo(abs); if (!u) continue;
      for (const d of dias) if (u.porDia[d]) { somar(porDia[d], u.porDia[d]); somar(outSemana, u.porDia[d]); if (d === hoje) somar(outHoje, u.porDia[d]); }
    }
  }
  return { hoje: outHoje, semana: outSemana, porDia: dias.slice().reverse().map((d) => ({ dia: d, ...porDia[d] })) };
}

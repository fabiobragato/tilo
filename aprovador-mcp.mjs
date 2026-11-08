// Servidor MCP (stdio, sem dependências) usado como --permission-prompt-tool do `claude -p`.
// Cada pedido de permissão do Claude vira uma chamada à ferramenta `approve`, que consulta o servidor do Tilo
// (política + clique do dono na UI) e devolve {behavior: allow|deny}. Qualquer falha = negar.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { injetarTrailer } from './git.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TILO_PORT || 4777);
const CHAT = process.env.TILO_CHAT_ID || '';
const PROJ = process.env.TILO_PROJECT || "";

const TOOL = {
  name: 'approve',
  description: 'Pede ao dono, na UI do Tilo, permissão para usar uma ferramenta.',
  inputSchema: {
    type: 'object',
    properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } },
    required: ['tool_name', 'input'],
  },
};

const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const negar = (message) => ({ behavior: 'deny', message });

async function decidir(args) {
  try {
    const token = fs.readFileSync(path.join(HERE, '.token'), 'utf8').trim();
    const r = await fetch(`http://localhost:${PORT}/api/p/${PROJ}/aprovacao/pedir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tilo-Token': token },
      body: JSON.stringify({ chatId: CHAT, tool_name: args.tool_name, input: args.input, tool_use_id: args.tool_use_id }),
      signal: AbortSignal.timeout(6 * 60_000),
    });
    const j = await r.json();
    if (!r.ok) return negar(j.erro || `painel respondeu ${r.status}`);
    if (j.behavior !== 'allow') return negar(j.message || 'negado pelo dono');
    const entrada = j.updatedInput || args.input;
    // Commit feito pelo Claude nesta conversa: liga o commit à conversa (trailer Tilo-Chat), depois da aprovação do dono.
    if (['Bash', 'PowerShell'].includes(args.tool_name) && typeof entrada?.command === 'string') return { behavior: 'allow', updatedInput: { ...entrada, command: injetarTrailer(entrada.command, CHAT) } };
    return { behavior: 'allow', updatedInput: entrada };
  } catch (e) {
    return negar(`aprovador indisponível: ${e.message}`);
  }
}

readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return; // notificações
  const ok = (result) => out({ jsonrpc: '2.0', id: m.id, result });
  if (m.method === 'initialize') return ok({ protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'tilo', version: '1.0.0' } });
  if (m.method === 'tools/list') return ok({ tools: [TOOL] });
  if (m.method === 'tools/call' && m.params?.name === 'approve') {
    const r = await decidir(m.params.arguments || {});
    return ok({ content: [{ type: 'text', text: JSON.stringify(r) }] });
  }
  out({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'método não suportado' } });
});

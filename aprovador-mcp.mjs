// Servidor MCP (stdio, sem dependências) usado como --permission-prompt-tool do `claude -p`.
// Cada pedido de permissão do Claude vira uma chamada à ferramenta `approve`, que consulta o servidor do Datadubis Central
// (política + clique do dono na UI) e devolve {behavior: allow|deny}. Qualquer falha = negar.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CENTRAL_PORT || 4777);
const CHAT = process.env.CENTRAL_CHAT_ID || '';
const PROJ = process.env.CENTRAL_PROJECT || "";

const TOOL = {
  name: 'approve',
  description: 'Pede ao dono, na UI do Datadubis Central, permissão para usar uma ferramenta.',
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
      headers: { 'Content-Type': 'application/json', 'X-Painel-Token': token },
      body: JSON.stringify({ chatId: CHAT, tool_name: args.tool_name, input: args.input, tool_use_id: args.tool_use_id }),
      signal: AbortSignal.timeout(6 * 60_000),
    });
    const j = await r.json();
    if (!r.ok) return negar(j.erro || `painel respondeu ${r.status}`);
    return j.behavior === 'allow' ? { behavior: 'allow', updatedInput: args.input } : negar(j.message || 'negado pelo dono');
  } catch (e) {
    return negar(`aprovador indisponível: ${e.message}`);
  }
}

readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return; // notificações
  const ok = (result) => out({ jsonrpc: '2.0', id: m.id, result });
  if (m.method === 'initialize') return ok({ protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'central', version: '1.0.0' } });
  if (m.method === 'tools/list') return ok({ tools: [TOOL] });
  if (m.method === 'tools/call' && m.params?.name === 'approve') {
    const r = await decidir(m.params.arguments || {});
    return ok({ content: [{ type: 'text', text: JSON.stringify(r) }] });
  }
  out({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'método não suportado' } });
});

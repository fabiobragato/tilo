// Fluxo de uma conversa com o Claude Code em modo "stream-json" (o mesmo canal nativo do terminal).
// Um único processo `claude` fica vivo e recebe mensagens no stdin a qualquer momento: o próprio Claude Code as enfileira
// e as entrega no ponto certo (entre dois passos da tarefa, como no terminal). Este módulo não abre processo nem arquivo:
// só interpreta os eventos que o `claude` imprime e mantém o estado (fila de mensagens, texto ao vivo, ferramentas).
// Quem usa (server.mjs) grava no histórico o que `onMensagem` entrega.

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const corta = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// resumo curto de uma ferramenta para mostrar no chat (nunca o conteúdo inteiro de um arquivo)
export function resumoFerramenta(nome, input = {}) {
  const i = input && typeof input === 'object' ? input : {};
  const base = nome === 'Bash' || nome === 'PowerShell' ? i.command
    : ['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(nome) ? i.file_path
      : nome === 'Grep' || nome === 'Glob' ? i.pattern
        : nome === 'WebSearch' ? i.query : nome === 'WebFetch' ? i.url : i.description;
  return corta(String(base ?? '').replace(/\s+/g, ' ').trim(), 140);
}

// comando ou caminho COMPLETO (até 2000 caracteres, mantendo quebras de linha) para a aba Atividade. A SAÍDA da ferramenta nunca é guardada (pode conter segredos).
export function detalheFerramenta(nome, input = {}) {
  const i = input && typeof input === 'object' ? input : {};
  const base = nome === 'Bash' || nome === 'PowerShell' ? i.command
    : ['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(nome) ? i.file_path
      : nome === 'Grep' || nome === 'Glob' ? i.pattern : nome === 'WebSearch' ? i.query : nome === 'WebFetch' ? i.url : i.description;
  return corta(String(base ?? '').trim(), 2000);
}

export function linhaUsuario(texto) { // uma mensagem do dono no formato de entrada do `claude`
  return JSON.stringify({ type: 'user', message: { role: 'user', content: texto } }) + '\n';
}
// Mudar modo de permissão ou modelo com a sessão em andamento (equivale a Shift+Tab e /model no terminal)
export function linhaModo(modo, id) { return JSON.stringify({ type: 'control_request', request_id: id, request: { subtype: 'set_permission_mode', mode: modo } }) + '\n'; }
export function linhaModelo(modelo, id) { return JSON.stringify({ type: 'control_request', request_id: id, request: { subtype: 'set_model', model: modelo } }) + '\n'; }
export function linhaInterrupcao(id) { // equivalente nativo do Esc no terminal: para o passo em curso, a sessão continua
  return JSON.stringify({ type: 'control_request', request_id: id, request: { subtype: 'interrupt' } }) + '\n';
}

export class Fluxo {
  // onMensagem({ role:'assistant', text, tools, erro?, interrompido? } | { role:'user', id, text, ts }) é chamado na ordem em que as coisas aconteceram.
  constructor({ onMensagem = () => {} } = {}) {
    this.onMensagem = onMensagem;
    this.fila = []; // mensagens enviadas ao claude e ainda não lidas por ele: { id, text, ts, persistido }
    this.texto = ''; // texto do turno em curso (blocos já completos)
    this.parcial = ''; // bloco de texto que ainda está chegando (streaming)
    this.tools = []; // ferramentas do turno em curso: { id, nome, resumo, detalhe, ini, ms, estado: 'rodando' | 'ok' | 'erro' | 'interrompida' }
    this.bg = 0; // tarefas em segundo plano ainda rodando (ex.: comando longo)
    this.ocupado = true; // o claude está trabalhando num turno (começa ocupado: a 1ª mensagem acabou de ser enviada)
    this.consumidas = 0; // quantas mensagens o claude já leu (prova de que a sessão existe em disco)
    this.rev = 0; // sobe a cada mudança que o painel precisa redesenhar (mensagem gravada, fila, fim de turno)
    this.modelo = ''; // id real do modelo informado pelo claude (ex.: claude-sonnet-5-5)
    this.teveErro = false; // algum turno terminou com erro (ex.: modelo que exige créditos)
    this.emitiu = false; // algo já foi gravado no histórico por este fluxo
  }

  enfileirar(m) { this.fila.push({ id: m.id, text: String(m.text), ts: m.ts || Date.now(), persistido: !!m.persistido }); this.rev++; }

  get textoVivo() { return this.parcial ? (this.texto ? this.texto + '\n\n' : '') + this.parcial : this.texto; }
  podeFechar() { return !this.ocupado && !this.fila.length && !this.bg; }

  vista() {
    return { text: this.textoVivo, tools: this.tools.slice(-100).map(({ nome, resumo, detalhe, ini, ms, estado }) => ({ nome, resumo, detalhe, ini, ms, estado })), fila: this.fila.map((m) => ({ id: m.id, text: m.text, ts: m.ts, persistido: m.persistido })),
      ocupado: this.ocupado, bg: this.bg, rev: this.rev };
  }

  // grava o que o assistente já disse neste turno como uma mensagem do histórico e zera o "ao vivo"
  descarregar(extra = {}) {
    const text = (extra.text ?? this.texto).trim();
    const tools = this.tools.map(({ nome, resumo, detalhe, ini, ms, estado }) => ({ nome, resumo, detalhe, ini, ms, estado: estado === 'rodando' ? (extra.interrompido ? 'interrompida' : extra.erro ? 'erro' : 'ok') : estado }));
    this.texto = ''; this.parcial = ''; this.tools = [];
    if (!text && !tools.length && !extra.erro) return false;
    this.onMensagem({ role: 'assistant', text, tools, modelo: this.modelo, ...(extra.erro && { erro: true }), ...(extra.interrompido && { interrompido: true }) });
    this.emitiu = true; this.rev++;
    return true;
  }

  // o claude leu a(s) mensagem(ns) da fila: tudo o que ele já disse vem ANTES dela no histórico (mesma ordem do terminal)
  consumir(textoLido) {
    const lido = norm(textoLido);
    let achadas = this.fila.filter((m) => lido && lido.includes(norm(m.text)));
    if (!achadas.length && this.fila.length) achadas = [this.fila[0]]; // texto diferente do que enviamos: lê-se na ordem
    if (!achadas.length) return;
    this.descarregar();
    for (const m of achadas) {
      this.fila.splice(this.fila.indexOf(m), 1);
      this.consumidas++;
      if (!m.persistido) this.onMensagem({ role: 'user', id: m.id, text: m.text, ts: m.ts });
    }
    this.rev++;
  }

  // `rev` sobe só quando o painel precisa reler o histórico/fila/estado (não a cada trecho de texto).
// Interpreta um evento (objeto já lido do JSON). Devolve 'turno-fim' quando um turno termina, 'bg' quando as tarefas em segundo plano mudam.
  evento(e) {
    if (!e || typeof e !== 'object') return '';
    if (e.type === 'system') {
      if (e.subtype === 'init') { if (!this.ocupado) this.rev++; this.ocupado = true; if (typeof e.model === 'string') this.modelo = e.model; return 'init'; }
      if (e.subtype === 'background_tasks_changed') { this.bg = Array.isArray(e.tasks) ? e.tasks.length : 0; this.rev++; return 'bg'; }
      return '';
    }
    if (e.parent_tool_use_id) return ''; // eventos de sub-agentes não entram no texto da conversa principal
    if (e.type === 'stream_event') {
      const ev = e.event || {};
      if (ev.type === 'message_start' || (ev.type === 'content_block_start' && ev.content_block?.type === 'text')) this.parcial = '';
      else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') { this.parcial += ev.delta.text || ''; this.ocupado = true; }
      return '';
    }
    if (e.type === 'assistant') {
      this.ocupado = true;
      for (const b of e.message?.content || []) {
        if (b.type === 'text' && b.text) { this.texto += (this.texto ? '\n\n' : '') + b.text; this.parcial = ''; }
        else if (b.type === 'tool_use') this.tools.push({ id: b.id, nome: b.name, resumo: resumoFerramenta(b.name, b.input), detalhe: detalheFerramenta(b.name, b.input), ini: Date.now(), estado: 'rodando' });
      }
      return '';
    }
    if (e.type === 'user') {
      const c = e.message?.content;
      if (e.isReplay === true) { // eco da mensagem do dono: o claude a leu agora
        this.consumir(typeof c === 'string' ? c : (Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : ''));
        return 'consumida';
      }
      if (Array.isArray(c)) for (const b of c) if (b.type === 'tool_result') { const t = this.tools.find((x) => x.id === b.tool_use_id); if (t) { t.estado = b.is_error ? 'erro' : 'ok'; t.ms = Date.now() - t.ini; } } // ao vivo: o painel lê as ferramentas no polling, sem bump de rev
      return '';
    }
    if (e.type === 'result') {
      this.ocupado = false;
      const interrompido = e.subtype === 'error_during_execution';
      const erro = !interrompido && (e.is_error === true || (e.subtype && e.subtype !== 'success'));
      let texto = this.texto.trim() || (e.subtype === 'success' && typeof e.result === 'string' ? e.result.trim() : '');
      if (interrompido) texto = texto ? texto + '\n\n[Interrompido pelo dono]' : '[Interrompido pelo dono]';
      else if (erro) texto = texto || `[o Claude terminou com erro: ${e.subtype || 'desconhecido'}]`;
      if (erro) this.teveErro = true; // o motivo já foi gravado; o aviso "saiu com código N" do processo seria repetição
      this.descarregar({ text: texto, erro, interrompido });
      this.rev++;
      return 'turno-fim';
    }
    return '';
  }

  // o processo acabou (ou foi encerrado): grava o que sobrou. Devolve as mensagens que o claude nunca chegou a ler.
  encerrar({ erro = false, aviso = '' } = {}) {
    this.ocupado = false;
    const texto = [this.textoVivo.trim(), aviso].filter(Boolean).join('\n\n');
    this.descarregar({ text: texto, erro });
    const perdidas = this.fila.splice(0);
    this.rev++;
    return perdidas;
  }
}

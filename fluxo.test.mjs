// node --test fluxo.test.mjs
// Eventos no formato real do `claude -p --input-format stream-json --output-format stream-json --replay-user-messages`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Fluxo, resumoFerramenta, linhaUsuario, linhaInterrupcao } from './fluxo.mjs';

const init = { type: 'system', subtype: 'init' };
const eco = (t) => ({ type: 'user', isReplay: true, message: { role: 'user', content: t } });
const fala = (t) => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });
const usa = (id, nome, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: nome, input }] } });
const volta = (id, erro = false) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'x', is_error: erro }] } });
const fim = (extra = {}) => ({ type: 'result', subtype: 'success', is_error: false, result: '', ...extra });

function novo(msgs = [{ id: 'm1', text: 'primeira', persistido: true }]) {
  const saida = [];
  const f = new Fluxo({ onMensagem: (m) => saida.push(m) });
  for (const m of msgs) f.enfileirar(m);
  return { f, saida };
}

test('mensagem normal: eco, resposta e fim do turno', () => {
  const { f, saida } = novo();
  f.evento(init); f.evento(eco('primeira')); f.evento(fala('Olá!'));
  assert.equal(f.fila.length, 0);
  assert.equal(f.evento(fim()), 'turno-fim');
  assert.deepEqual(saida.map((m) => [m.role, m.text]), [['assistant', 'Olá!']]); // a 1ª mensagem do dono já estava no histórico
  assert.equal(f.ocupado, false);
  assert.ok(f.podeFechar());
});

test('mensagem enviada durante a execução: fica pendente e entra no histórico DEPOIS do que o Claude já disse', () => {
  const { f, saida } = novo();
  f.evento(init); f.evento(eco('primeira'));
  f.evento(fala('Vou rodar o comando.')); f.evento(usa('t1', 'Bash', { command: 'node longo.js' }));
  f.enfileirar({ id: 'm2', text: 'como está?', persistido: false });
  assert.equal(f.fila.length, 1);
  assert.equal(saida.length, 0); // ainda pendente: não foi ao histórico
  f.evento(volta('t1')); // fim da ferramenta: o claude lê a fila
  f.evento(eco('como está?'));
  assert.deepEqual(saida.map((m) => [m.role, m.text]), [['assistant', 'Vou rodar o comando.'], ['user', 'como está?']]);
  assert.equal(saida[0].tools[0].estado, 'ok');
  f.evento(fala('Terminou.')); f.evento(fim());
  assert.equal(saida.length, 3);
  assert.equal(saida[2].text, 'Terminou.');
});

test('várias mensagens seguidas: nenhuma se perde e a ordem é preservada', () => {
  const { f, saida } = novo();
  f.evento(init); f.evento(eco('primeira'));
  for (const [i, t] of ['A', 'B', 'C'].entries()) f.enfileirar({ id: 'q' + i, text: t, persistido: false });
  assert.deepEqual(f.fila.map((m) => m.text), ['A', 'B', 'C']);
  f.evento(eco('A')); f.evento(eco('B')); f.evento(eco('C'));
  assert.deepEqual(saida.filter((m) => m.role === 'user').map((m) => m.text), ['A', 'B', 'C']);
  assert.equal(f.fila.length, 0);
});

test('eco com mensagens agrupadas consome todas as que ele contém', () => {
  const { f, saida } = novo();
  f.evento(init); f.evento(eco('primeira'));
  f.enfileirar({ id: 'a', text: 'um', persistido: false }); f.enfileirar({ id: 'b', text: 'dois', persistido: false });
  f.evento(eco('um\n\ndois'));
  assert.deepEqual(saida.map((m) => m.text), ['um', 'dois']);
  assert.equal(f.fila.length, 0);
});

test('eco com texto diferente do enviado (prefixo de contexto) consome a primeira da fila', () => {
  const { f } = novo([{ id: 'm1', text: 'Pendência em foco:\nX\n\nPergunta: oi', persistido: true }]);
  f.evento(eco('texto reescrito pelo claude'));
  assert.equal(f.fila.length, 0);
});

test('streaming: texto parcial aparece ao vivo e não duplica quando o bloco completo chega', () => {
  const { f } = novo();
  f.evento(init); f.evento(eco('primeira'));
  f.evento({ type: 'stream_event', event: { type: 'message_start' } });
  f.evento({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text' } } });
  f.evento({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Olá, ' } } });
  f.evento({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'mundo' } } });
  assert.equal(f.vista().text, 'Olá, mundo');
  f.evento(fala('Olá, mundo!'));
  assert.equal(f.vista().text, 'Olá, mundo!');
});

test('eventos de sub-agentes não entram no texto principal', () => {
  const { f } = novo();
  f.evento(init); f.evento(eco('primeira'));
  f.evento({ ...fala('texto do sub-agente'), parent_tool_use_id: 'toolu_x' });
  assert.equal(f.vista().text, '');
});

test('ferramenta com erro fica marcada', () => {
  const { f, saida } = novo();
  f.evento(init); f.evento(eco('primeira'));
  f.evento(usa('t1', 'Read', { file_path: 'a.md' })); f.evento(volta('t1', true)); f.evento(fim());
  assert.equal(saida[0].tools[0].estado, 'erro');
  assert.equal(saida[0].tools[0].resumo, 'a.md');
});

test('atividade: guarda comando completo, duração e status; nunca a saída da ferramenta', () => {
  const { f, saida } = novo();
  f.evento(init); f.evento(eco('primeira'));
  const cmd = 'node -e "console.log(1)"\n&& echo ' + 'x'.repeat(2500);
  f.evento(usa('t1', 'Bash', { command: cmd }));
  f.evento({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'SEGREDO-NA-SAIDA', is_error: false }] } });
  f.evento(fim());
  const t = saida[0].tools[0];
  assert.equal(t.nome, 'Bash');
  assert.ok(t.detalhe.startsWith('node -e') && t.detalhe.includes('\n') && t.detalhe.length <= 2000);
  assert.equal(typeof t.ms, 'number'); assert.equal(typeof t.ini, 'number');
  assert.equal(t.estado, 'ok');
  assert.ok(!JSON.stringify(saida).includes('SEGREDO-NA-SAIDA'));
});

test('ferramenta em curso quando o turno é interrompido fica "interrompida"', () => {
  const { f, saida } = novo();
  f.evento(init); f.evento(eco('primeira')); f.evento(usa('t1', 'Bash', { command: 'sleep 60' }));
  f.evento({ type: 'result', subtype: 'error_during_execution', is_error: true });
  assert.equal(saida[0].tools[0].estado, 'interrompida');
});

test('interrupção: turno termina como interrompido, a fila continua e a sessão segue viva', () => {
  const { f, saida } = novo();
  f.evento(init); f.evento(eco('primeira')); f.evento(usa('t1', 'Bash', { command: 'sleep 60' }));
  f.enfileirar({ id: 'm2', text: 'depois', persistido: false });
  f.evento({ type: 'result', subtype: 'error_during_execution', is_error: true });
  assert.equal(saida[0].interrompido, true);
  assert.ok(!saida[0].erro);
  assert.match(saida[0].text, /Interrompido/);
  assert.equal(f.fila.length, 1); // não foi perdida
  assert.equal(f.podeFechar(), false);
});

test('tarefa em segundo plano impede fechar a sessão', () => {
  const { f } = novo();
  f.evento(init); f.evento(eco('primeira'));
  assert.equal(f.evento({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'x' }] }), 'bg');
  f.evento(fala('iniciei')); f.evento(fim());
  assert.equal(f.podeFechar(), false);
  f.evento({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
  assert.equal(f.podeFechar(), true);
});

test('erro do claude vira mensagem de erro', () => {
  const { f, saida } = novo();
  f.evento(init); f.evento(eco('primeira'));
  f.evento({ type: 'result', subtype: 'error_max_turns', is_error: true });
  assert.equal(saida[0].erro, true);
  assert.equal(f.teveErro, true);
});

test('encerrar devolve o que o claude nunca leu e grava o texto parcial', () => {
  const { f, saida } = novo();
  f.evento(init); f.evento(eco('primeira')); f.evento(fala('parte da resposta'));
  f.enfileirar({ id: 'm2', text: 'não lida', persistido: false });
  const perdidas = f.encerrar({ erro: true, aviso: '[claude saiu com código 1]' });
  assert.deepEqual(perdidas.map((m) => m.text), ['não lida']);
  assert.equal(saida[0].erro, true);
  assert.match(saida[0].text, /parte da resposta[\s\S]*saiu com código 1/);
});

test('resumo de ferramentas e linhas do protocolo', () => {
  assert.equal(resumoFerramenta('Bash', { command: 'ls   -la\n' }), 'ls -la');
  assert.equal(resumoFerramenta('Grep', { pattern: 'abc' }), 'abc');
  assert.equal(resumoFerramenta('Desconhecida', null), '');
  assert.deepEqual(JSON.parse(linhaUsuario('oi\n"x"')), { type: 'user', message: { role: 'user', content: 'oi\n"x"' } });
  assert.equal(linhaUsuario('a').endsWith('\n'), true);
  assert.equal(JSON.parse(linhaInterrupcao('i1')).request.subtype, 'interrupt');
});

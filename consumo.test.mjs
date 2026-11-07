import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { usoDoTexto, usoDoArquivo, consumoRecente, totalNovo, diaLocal } from './consumo.mjs';

const linha = (id, ts, u, extra = {}) => JSON.stringify({ type: 'assistant', timestamp: new Date(ts).toISOString(), message: { id, model: 'claude-sonnet-5-5', usage: { input_tokens: u[0], output_tokens: u[1], cache_creation_input_tokens: u[2], cache_read_input_tokens: u[3] } }, ...extra });

test('soma uma vez por resposta (message.id repetido vale a última linha)', () => {
  const t = Date.now();
  const txt = [linha('m1', t, [10, 1, 100, 1000]), linha('m1', t, [10, 50, 100, 1000]), linha('m2', t, [5, 5, 0, 200]), '{"type":"user"}', 'lixo'].join('\n');
  const { total } = usoDoTexto(txt);
  assert.deepEqual(total, { entrada: 15, saida: 55, cacheCriacao: 100, cacheLeitura: 1200 });
  assert.equal(totalNovo(total), 170);
});

test('ignora respostas sintéticas e usage inválido', () => {
  const sint = JSON.stringify({ type: 'assistant', message: { id: 'x', model: '<synthetic>', usage: { input_tokens: 99, output_tokens: 99 } } });
  const ruim = JSON.stringify({ type: 'assistant', message: { id: 'y', model: 'a', usage: { input_tokens: 'abc', output_tokens: -4 } } });
  assert.deepEqual(usoDoTexto([sint, ruim].join('\n')).total, { entrada: 0, saida: 0, cacheCriacao: 0, cacheLeitura: 0 });
});

test('separa por dia e soma hoje e 7 dias', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tilo-consumo-'));
  try {
    const agora = Date.now(), ontem = agora - 86400_000, velho = agora - 10 * 86400_000;
    fs.writeFileSync(path.join(dir, 'a.jsonl'), [linha('a1', agora, [1, 2, 3, 4]), linha('a2', ontem, [10, 20, 30, 40]), linha('a3', velho, [100, 100, 100, 100])].join('\n'));
    fs.writeFileSync(path.join(dir, 'b.jsonl'), linha('b1', agora, [5, 5, 5, 5]));
    fs.writeFileSync(path.join(dir, 'c.txt'), 'ignorado');
    assert.equal(Object.keys(usoDoArquivo(path.join(dir, 'a.jsonl')).porDia).length, 3);
    const r = consumoRecente([dir, dir], agora);
    assert.deepEqual(r.hoje, { entrada: 6, saida: 7, cacheCriacao: 8, cacheLeitura: 9 });
    assert.deepEqual(r.semana, { entrada: 16, saida: 27, cacheCriacao: 38, cacheLeitura: 49 });
    assert.equal(r.porDia.length, 7);
    assert.equal(r.porDia.at(-1).dia, diaLocal(agora));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('arquivo inexistente devolve null', () => {
  assert.equal(usoDoArquivo(path.join(os.tmpdir(), 'nao-existe-tilo.jsonl')), null);
});

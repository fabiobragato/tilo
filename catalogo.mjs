// Biblioteca de documentos reaproveitáveis, organizada por ÁREA. Local (catalogo/, fora do git) e sem dependências.
// Estrutura: catalogo/<coleção>/<área>/<arquivo>.md, onde a coleção é o projeto de origem. Só documentação TÉCNICA entra
// (backend, frontend, infra, deploy, segurança, dados): regras de negócio, planejamento e pendências são específicos de cada produto.
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DIR_CATALOGO = path.join(HERE, 'catalogo');
export const AREAS = { backend: 'Backend', frontend: 'Frontend', infra: 'Infraestrutura', deploy: 'Deploy', security: 'Segurança', 'data-platform': 'Plataforma de dados' };
export const AREAS_REAPROVEITAVEIS = Object.keys(AREAS);
const COL = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SEG = /^[A-Za-z0-9][\w.\- ]{0,80}$/; // começa com letra/número: ".." e arquivos ocultos não passam
const MAX_ARQ = 300_000, MAX_TOTAL = 3_000_000, MAX_DOCS = 400;

// ---------- ids e caminhos seguros ----------
// id de documento = "<coleção>/<área>/<caminho>.md". Valida cada parte e confirma que o caminho final está dentro do catálogo.
export function resolverId(id, dir = DIR_CATALOGO) {
  const p = String(id || '').split('/');
  if (p.length < 3) return null;
  const [colecao, area, ...rel] = p;
  if (!COL.test(colecao) || !AREAS[area] || !rel.every((s) => SEG.test(s)) || !rel[rel.length - 1].toLowerCase().endsWith('.md')) return null;
  const abs = path.resolve(dir, colecao, area, ...rel);
  if (!abs.startsWith(path.resolve(dir, colecao, area) + path.sep)) return null;
  return { colecao, area, rel: rel.join('/'), abs };
}

const titulo = (txt, fallback) => { const m = /^#\s+(.+)$/m.exec(txt); return (m ? m[1] : fallback).replace(/[`*_]/g, '').trim().slice(0, 120); };
function resumo(txt) {
  for (const l of txt.split(/\r?\n/)) { const t = l.trim(); if (!t || /^(#|---|>|\||```|!\[)/.test(t)) continue; const limpo = t.replace(/[`*_]|\[([^\]]*)\]\([^)]*\)/g, '$1'); return limpo.length <= 230 ? limpo : limpo.slice(0, 230).replace(/\s+\S*$/, '') + '…'; }
  return '';
}
const lerTexto = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const mdsEm = (dir) => { const out = []; const walk = (d, rel) => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else if (e.name.toLowerCase().endsWith('.md')) out.push(r); } }; walk(dir, ''); return out.sort(); };

// ---------- consulta ----------
export function listarColecoes(dir = DIR_CATALOGO) {
  let ids = []; try { ids = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && COL.test(e.name)).map((e) => e.name); } catch { return []; }
  return ids.map((id) => {
    let m = {}; try { m = JSON.parse(fs.readFileSync(path.join(dir, id, 'manifest.json'), 'utf8')); } catch {}
    const total = AREAS_REAPROVEITAVEIS.reduce((n, a) => n + mdsEm(path.join(dir, id, a)).length, 0);
    return { id, nome: String(m.nome || id), publicadoEm: String(m.publicadoEm || m.criadoEm || ''), total };
  }).filter((c) => c.total > 0).sort((a, b) => a.nome.localeCompare(b.nome));
}

// Todos os documentos (sem o conteúdo). q: busca por palavras no título, nome do arquivo e conteúdo.
export function listarDocs(dir = DIR_CATALOGO, { q = '' } = {}) {
  const palavras = String(q).toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  const nomes = Object.fromEntries(listarColecoes(dir).map((c) => [c.id, c.nome]));
  const out = [];
  for (const col of Object.keys(nomes)) for (const area of AREAS_REAPROVEITAVEIS) for (const rel of mdsEm(path.join(dir, col, area))) {
    if (out.length >= MAX_DOCS) return out;
    const abs = path.join(dir, col, area, ...rel.split('/')); let st; try { st = fs.statSync(abs); } catch { continue; }
    const txt = lerTexto(abs), t = titulo(txt, rel.replace(/\.md$/i, ''));
    if (palavras.length) { const alvo = `${t}\n${rel}\n${AREAS[area]}\n${txt}`.toLowerCase(); if (!palavras.every((w) => alvo.includes(w))) continue; }
    out.push({ id: `${col}/${area}/${rel}`, colecao: col, colecaoNome: nomes[col], area, areaNome: AREAS[area], arquivo: rel, titulo: t, resumo: resumo(txt), bytes: st.size });
  }
  return out;
}

export function lerDoc(id, dir = DIR_CATALOGO) {
  const r = resolverId(id, dir); if (!r) throw new Error('documento inválido');
  let txt; try { txt = fs.readFileSync(r.abs, 'utf8'); } catch { throw new Error('documento não encontrado'); }
  return { id, titulo: titulo(txt, r.rel), area: r.area, areaNome: AREAS[r.area], conteudo: txt };
}

// ---------- publicar (projeto -> biblioteca) ----------
// Documentos deste projeto que podem ser publicados, por área (docs/<área>/**/*.md; relatórios de auditoria ficam de fora).
export function docsDoProjeto(raiz) {
  return AREAS_REAPROVEITAVEIS.map((area) => ({
    area, nome: AREAS[area],
    arquivos: mdsEm(path.join(raiz, 'docs', area)).filter((rel) => !/(^|\/)audit/i.test(rel)).map((rel) => ({ rel, titulo: titulo(lerTexto(path.join(raiz, 'docs', area, ...rel.split('/'))), rel.replace(/\.md$/i, '')) })),
  })).filter((a) => a.arquivos.length);
}

// arquivos: ["backend/architecture.md", ...] relativos a docs/. Copia para catalogo/<coleção>/. Republicar sobrescreve os mesmos arquivos.
export function publicar({ raizProjeto, colecao, nome, arquivos }, dir = DIR_CATALOGO) {
  if (!COL.test(String(colecao))) throw new Error('projeto inválido');
  const lista = [...new Set((arquivos || []).map(String))];
  if (!lista.length) throw new Error('escolha pelo menos um documento');
  if (lista.length > MAX_DOCS) throw new Error(`no máximo ${MAX_DOCS} documentos por vez`);
  const copias = []; let total = 0;
  for (const a of lista) {
    const p = a.split('/');
    if (p.length < 2 || !AREAS[p[0]] || !p.slice(1).every((s) => SEG.test(s)) || !p[p.length - 1].toLowerCase().endsWith('.md') || /(^|\/)audit/i.test(a)) throw new Error(`“${a}” não pode entrar na biblioteca (só documentação técnica das áreas ${AREAS_REAPROVEITAVEIS.join(', ')})`);
    const origem = path.resolve(raizProjeto, 'docs', ...p);
    if (!origem.startsWith(path.resolve(raizProjeto, 'docs', p[0]) + path.sep)) throw new Error(`“${a}” é inválido`);
    let st; try { st = fs.statSync(origem); } catch { throw new Error(`“${a}” não existe em docs/`); }
    if (!st.isFile() || st.size > MAX_ARQ) throw new Error(`“${a}” é grande demais ou não é um arquivo (máx. 300 KB)`);
    total += st.size; if (total > MAX_TOTAL) throw new Error('seleção grande demais (máx. 3 MB)');
    copias.push({ p, origem });
  }
  const raizCol = path.join(dir, colecao);
  for (const c of copias) { const f = path.join(raizCol, ...c.p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.copyFileSync(c.origem, f); }
  let m = {}; try { m = JSON.parse(fs.readFileSync(path.join(raizCol, 'manifest.json'), 'utf8')); } catch {}
  fs.writeFileSync(path.join(raizCol, 'manifest.json'), JSON.stringify({ nome: String(nome || colecao), publicadoEm: m.publicadoEm || new Date().toISOString(), atualizadoEm: new Date().toISOString() }, null, 2));
  return { colecao, publicados: copias.length };
}

// ---------- remover ----------
export function removerDoc(id, dir = DIR_CATALOGO) {
  const r = resolverId(id, dir); if (!r || !fs.existsSync(r.abs)) throw new Error('documento não encontrado');
  fs.rmSync(r.abs, { force: true });
}
export function removerColecao(colecao, dir = DIR_CATALOGO) {
  if (!COL.test(String(colecao))) throw new Error('coleção inválida');
  const alvo = path.resolve(dir, colecao);
  if (path.dirname(alvo) !== path.resolve(dir) || !fs.existsSync(alvo)) throw new Error('coleção não encontrada');
  fs.rmSync(alvo, { recursive: true, force: true });
}

// ---------- anexar (biblioteca -> projeto) ----------
const AVISO = (origem) => `> Documento de referência copiado da biblioteca (origem: ${origem}). Revise: pode citar nomes, regras e valores de outro projeto. Apague este aviso depois de adaptar.\n\n`;
// Copia os documentos para docs/<área>/ do projeto. NUNCA sobrescreve: se o arquivo já existe, grava com o nome da origem no final.
export function copiarParaProjeto({ raiz, ids }, dir = DIR_CATALOGO) {
  const nomes = Object.fromEntries(listarColecoes(dir).map((c) => [c.id, c.nome]));
  const criados = [], renomeados = [];
  for (const id of [...new Set(ids || [])]) {
    const r = resolverId(id, dir); if (!r || !fs.existsSync(r.abs)) throw new Error(`documento não encontrado: ${id}`);
    const destRel = r.rel.split('/'); const nomeArq = destRel.pop();
    let destino = path.join(raiz, 'docs', r.area, ...destRel, nomeArq), final = [r.area, ...destRel, nomeArq].join('/');
    if (fs.existsSync(destino)) {
      const novo = `${nomeArq.replace(/\.md$/i, '')}-${r.colecao}.md`;
      destino = path.join(raiz, 'docs', r.area, ...destRel, novo); const nf = [r.area, ...destRel, novo].join('/');
      if (fs.existsSync(destino)) { renomeados.push({ de: final, para: nf, ja: true }); continue; }
      renomeados.push({ de: final, para: nf }); final = nf;
    } else criados.push(final);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, AVISO(nomes[r.colecao] || r.colecao) + fs.readFileSync(r.abs, 'utf8'));
  }
  return { criados, renomeados };
}

// Pastas (área de uma coleção) que o Claude precisa ler para adaptar os documentos escolhidos.
export function pastasDeLeitura(ids, dir = DIR_CATALOGO) {
  return [...new Set((ids || []).map((id) => resolverId(id, dir)).filter(Boolean).map((r) => path.join(dir, r.colecao, r.area)))];
}

// ---------- rascunhos de generalização ----------
// Um "lote" é um trabalho do Claude que reescreve documentos sem as partes específicas do produto. Os rascunhos ficam numa pasta
// temporária isolada (fora do projeto e do Tilo); só entram na biblioteca quando o dono aceita.
export const DIR_RASCUNHOS = path.join(os.tmpdir(), 'tilo-rascunhos');
const LOTE = /^[0-9a-f]{8}$/;
const lerJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// fontes: [{ abs, area, rel, colecao, substitui }]  (abs = arquivo original; colecao = onde o rascunho aceito será guardado)
export function criarLote({ projeto, titulo, fontes, modo, dir = DIR_RASCUNHOS }) {
  if (!fontes?.length) throw new Error('escolha pelo menos um documento');
  const id = crypto.randomBytes(4).toString('hex');
  const raiz = path.join(dir, id);
  fs.mkdirSync(path.join(raiz, 'arquivos'), { recursive: true });
  const lote = { id, projeto: String(projeto || ''), titulo: String(titulo || 'Generalização'), modo: String(modo || 'biblioteca'), criadoEm: new Date().toISOString(), chatId: '', fontes: fontes.map((f) => ({ abs: f.abs, area: f.area, rel: f.rel, colecao: f.colecao, substitui: f.substitui || '' })) };
  fs.writeFileSync(path.join(raiz, 'lote.json'), JSON.stringify(lote, null, 2));
  return { ...lote, pasta: path.join(raiz, 'arquivos') };
}
export function atualizarLote(id, patch, dir = DIR_RASCUNHOS) {
  if (!LOTE.test(id)) throw new Error('lote inválido');
  const f = path.join(dir, id, 'lote.json'); const l = lerJson(f, null); if (!l) throw new Error('lote não encontrado');
  fs.writeFileSync(f, JSON.stringify({ ...l, ...patch }, null, 2));
}
export const pastaDoLote = (id, dir = DIR_RASCUNHOS) => (LOTE.test(String(id)) && fs.existsSync(path.join(dir, id, 'lote.json')) ? path.join(dir, id, 'arquivos') : null);

// Lotes com os rascunhos que o Claude já escreveu. Cada item aponta para a fonte e diz se substitui um documento da biblioteca.
export function listarLotes(dir = DIR_RASCUNHOS) {
  let ids = []; try { ids = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && LOTE.test(e.name)).map((e) => e.name); } catch { return []; }
  const out = [];
  for (const id of ids) {
    const l = lerJson(path.join(dir, id, 'lote.json'), null); if (!l) continue;
    const itens = [];
    for (const f of l.fontes) {
      const abs = path.join(dir, id, 'arquivos', f.area, ...f.rel.split('/'));
      if (!fs.existsSync(abs)) continue;
      const txt = lerTexto(abs), orig = lerTexto(f.abs);
      itens.push({ item: `${f.area}/${f.rel}`, area: f.area, areaNome: AREAS[f.area], arquivo: f.rel, colecao: f.colecao, substitui: f.substitui, titulo: titulo(txt, f.rel.replace(/\.md$/i, '')), resumo: resumo(txt), tituloOriginal: titulo(orig, f.rel.replace(/\.md$/i, '')), bytes: Buffer.byteLength(txt) });
    }
    out.push({ id, titulo: l.titulo, modo: l.modo, criadoEm: l.criadoEm, chatId: l.chatId || '', projeto: l.projeto, total: l.fontes.length, itens });
  }
  return out.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
}

function itemDoLote(loteId, item, dir) {
  if (!LOTE.test(String(loteId))) throw new Error('lote inválido');
  const l = lerJson(path.join(dir, loteId, 'lote.json'), null); if (!l) throw new Error('lote não encontrado');
  const f = l.fontes.find((x) => `${x.area}/${x.rel}` === item); if (!f) throw new Error('rascunho não encontrado');
  return { l, f, abs: path.join(dir, loteId, 'arquivos', f.area, ...f.rel.split('/')) };
}
export function lerRascunho(loteId, item, { original = false, dir = DIR_RASCUNHOS } = {}) {
  const { f, abs } = itemDoLote(loteId, item, dir);
  const arq = original ? f.abs : abs; let txt; try { txt = fs.readFileSync(arq, 'utf8'); } catch { throw new Error('arquivo não encontrado'); }
  return { titulo: titulo(txt, f.rel), area: f.area, areaNome: AREAS[f.area], conteudo: txt, original };
}

// Aceita rascunhos: grava em catalogo/<coleção>/<área>/<arquivo> (substituindo o da biblioteca, se houver) e retira do lote.
export function aceitarRascunhos(loteId, itens, { dir = DIR_RASCUNHOS, catalogo = DIR_CATALOGO, nomeColecao } = {}) {
  const lista = itens === 'todos' ? listarLotes(dir).find((x) => x.id === loteId)?.itens.map((i) => i.item) || [] : [...new Set(itens || [])];
  if (!lista.length) throw new Error('nenhum rascunho para aceitar');
  const aceitos = [];
  for (const it of lista) {
    const { f, abs } = itemDoLote(loteId, it, dir);
    if (!COL.test(f.colecao)) throw new Error('coleção inválida');
    const destino = path.join(catalogo, f.colecao, f.area, ...f.rel.split('/'));
    if (!destino.startsWith(path.join(catalogo, f.colecao, f.area) + path.sep)) throw new Error('caminho inválido');
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(abs, destino); fs.rmSync(abs, { force: true });
    const man = path.join(catalogo, f.colecao, 'manifest.json'); const m = lerJson(man, {});
    fs.writeFileSync(man, JSON.stringify({ nome: m.nome || nomeColecao || f.colecao, publicadoEm: m.publicadoEm || new Date().toISOString(), atualizadoEm: new Date().toISOString() }, null, 2));
    aceitos.push(`${f.colecao}/${f.area}/${f.rel}`);
  }
  limparLoteSeVazio(loteId, dir);
  return { aceitos };
}
export function descartarRascunhos(loteId, itens, { dir = DIR_RASCUNHOS } = {}) {
  if (!LOTE.test(String(loteId))) throw new Error('lote inválido');
  const raiz = path.join(dir, loteId); if (!fs.existsSync(raiz)) throw new Error('lote não encontrado');
  if (itens === 'todos') { fs.rmSync(raiz, { recursive: true, force: true }); return { descartados: 'todos' }; }
  for (const it of [...new Set(itens || [])]) { const { abs } = itemDoLote(loteId, it, dir); fs.rmSync(abs, { force: true }); }
  limparLoteSeVazio(loteId, dir);
  return { descartados: itens.length };
}
function limparLoteSeVazio(loteId, dir) {
  const l = listarLotes(dir).find((x) => x.id === loteId);
  const f = path.join(dir, loteId, 'lote.json'); const job = lerJson(f, null);
  if (l && l.itens.length === 0 && job && job.finalizado) fs.rmSync(path.join(dir, loteId), { recursive: true, force: true });
}

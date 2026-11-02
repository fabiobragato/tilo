// Biblioteca de documentos reaproveitáveis, organizada por ÁREA. Local (catalogo/, fora do git) e sem dependências.
// Estrutura: catalogo/<coleção>/<área>/<arquivo>.md, onde a coleção é o projeto de origem. Só documentação TÉCNICA entra
// (backend, frontend, infra, deploy, segurança, dados): regras de negócio, planejamento e pendências são específicos de cada produto.
import fs from 'node:fs';
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
  for (const l of txt.split(/\r?\n/)) { const t = l.trim(); if (!t || /^(#|---|>|\||```|!\[)/.test(t)) continue; return t.replace(/[`*_]|\[([^\]]*)\]\([^)]*\)/g, '$1').slice(0, 170); }
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

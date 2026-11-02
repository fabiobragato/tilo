// Registro de projetos da Central. Local (projetos.json, fora do git) e sem dependências.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, 'projetos.json');
const DADOS = path.join(HERE, 'dados');
const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const PASTAS_PADRAO = ['docs', 'planning', 'pendencias', 'apps', 'infra'];
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const COR = /^#[0-9a-fA-F]{6}$/;

const lerRegistro = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')).projetos || []; } catch { return []; } };

// Projeto "resolvido": caminhos absolutos que o servidor usa (dados ficam em dados/<id>/, nunca dentro do projeto alvo).
function resolver(r) {
  if (!r || !ID.test(r.id || '') || !r.raiz) return null;
  const ROOT = path.resolve(r.raiz);
  const dir = path.join(DADOS, r.id);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const abs = (p) => (p ? path.resolve(HERE, p) : '');
  return {
    id: r.id, nome: String(r.nome || r.id), descricao: String(r.descricao || ''), cor: COR.test(r.cor || '') ? r.cor : '#5b5cf0',
    icone: abs(r.icone), logo: abs(r.logo),
    ROOT, README: path.join(ROOT, r.pendencias || 'pendencias/README.md'),
    STATE: path.join(dir, 'estado.json'), CHATS: path.join(dir, 'chats.json'), META: path.join(dir, 'sessoes-meta.json'), AUDIT: path.join(dir, 'auditoria.jsonl'),
    READABLE_DIRS: Array.isArray(r.pastasLegiveis) && r.pastasLegiveis.length ? r.pastasLegiveis : PASTAS_PADRAO,
    TERM_DIR: path.join(CLAUDE_HOME, 'projects', ROOT.replace(/[^a-zA-Z0-9]/g, '-')), // transcripts do Claude Code desse projeto
  };
}
export const listar = () => lerRegistro().map(resolver).filter(Boolean);
export const obter = (id) => listar().find((p) => p.id === id) || null;

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const TEMPLATE_PENDENCIAS = `# Pendências

> **⚠ Não exclua este arquivo nem a pasta \`pendencias/\`.** Ele é a fonte de dados da **Central de Projetos**: as telas de pendências e a visão geral deste projeto são montadas a partir dele. Para enxugar, apague só as linhas dos itens concluídos. **Mantenha o formato:** seções \`## N. Título\` e itens em tabela (\`| 🔴/🟡/🟢 | **Título** | descrição | detalhes |\`) ou em lista (\`- 🔴 **Título** — descrição\`).

Painel do dono do projeto (Central de Projetos). Prioridade: 🔴 crítica · 🟡 importante · 🟢 pode esperar. Ao concluir, apague a linha.

## 1. Decisões

| Prio | Título | O que é | Como resolver |
|---|---|---|---|
| 🟡 | **Exemplo** | Apague esta linha e escreva as suas pendências. | — |
`;
const TEMPLATE_CLAUDE = (nome) => `# Project Instructions — ${nome}

Antes de implementar qualquer coisa, leia a documentação relevante em \`docs/\` (fonte de verdade do projeto).

- \`planning/\` não é fonte de verdade: use só como contexto.
- \`pendencias/\` é o painel do dono (decisões, tarefas, fila de desenvolvimento); ao concluir ou criar uma pendência, atualize \`pendencias/README.md\`.
- Reutilize a arquitetura e os padrões existentes; implemente só o escopo pedido; valide build, testes e lint.
`;
const TEMPLATE_DOCS = (nome) => `# Documentação — ${nome}\n\nFonte de verdade do projeto. Conceitos ainda em aberto ficam em \`planning/\` até serem decididos.\n`;

// Cria a estrutura base do padrão Datadubis sem sobrescrever nada que já exista.
function estrutura(raiz, nome) {
  const criado = [];
  const escreve = (rel, txt) => {
    const f = path.join(raiz, rel);
    if (fs.existsSync(f)) return;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, txt);
    criado.push(rel);
  };
  escreve('pendencias/README.md', TEMPLATE_PENDENCIAS);
  escreve('docs/README.md', TEMPLATE_DOCS(nome));
  escreve('planning/README.md', `# Planning — ${nome}\n\nPropostas e planos ainda não fechados. Não é fonte de verdade.\n`);
  escreve('CLAUDE.md', TEMPLATE_CLAUDE(nome));
  return criado;
}

// Imagens enviadas pelo formulário: data URL (png/jpeg/webp). Confere o conteúdo real (magic bytes), não só o que o navegador declarou.
// SVG é recusado de propósito (pode carregar script). Tamanho máximo 1,5 MB por imagem.
const MAX_IMG = 1_500_000;
function decodificarImagem(dataUrl, rotulo) {
  if (dataUrl === undefined || dataUrl === null || dataUrl === '') return null;
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw new Error(`${rotulo}: use PNG, JPG ou WEBP`);
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_IMG) throw new Error(`${rotulo}: imagem maior que 1,5 MB`);
  const ehPng = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const ehJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const ehWebp = buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  const ext = ehPng ? '.png' : ehJpg ? '.jpg' : ehWebp ? '.webp' : '';
  if (!ext) throw new Error(`${rotulo}: o arquivo não é uma imagem PNG, JPG ou WEBP válida`);
  return { buf, ext };
}
function salvarImagens(id, { icone, logo }) {
  const dir = path.join(HERE, 'logos');
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [campo, img, sufixo] of [['icone', icone, 'icone'], ['logo', logo, 'logo']]) {
    if (!img) continue;
    for (const e of ['.png', '.jpg', '.webp']) { try { fs.unlinkSync(path.join(dir, `${id}-${sufixo}${e}`)); } catch {} } // troca de formato não deixa lixo
    const rel = `logos/${id}-${sufixo}${img.ext}`;
    fs.writeFileSync(path.join(HERE, rel), img.buf);
    out[campo] = rel;
  }
  return out;
}

export function adicionar({ nome, raiz, cor, estruturaBase, icone, logo }) {
  nome = String(nome || '').trim();
  if (!nome || nome.length > 60) throw new Error('nome inválido (1 a 60 caracteres)');
  if (typeof raiz !== 'string' || !path.isAbsolute(raiz)) throw new Error('informe o caminho completo da pasta do projeto');
  const abs = path.resolve(raiz);
  if (path.parse(abs).root === abs) throw new Error('escolha uma pasta de projeto, não a raiz do disco');
  let st; try { st = fs.statSync(abs); } catch { throw new Error('pasta não existe'); }
  if (!st.isDirectory()) throw new Error('o caminho não é uma pasta');
  if (cor && !COR.test(cor)) throw new Error('cor inválida (use #rrggbb)');
  const imgIcone = decodificarImagem(icone, 'Ícone'), imgLogo = decodificarImagem(logo, 'Logo largo'); // valida antes de tocar em qualquer arquivo
  const registro = lerRegistro();
  if (registro.some((r) => path.resolve(r.raiz).toLowerCase() === abs.toLowerCase())) throw new Error('essa pasta já está cadastrada');
  let id = slug(nome) || 'projeto', n = 1;
  while (registro.some((r) => r.id === id)) id = `${slug(nome) || 'projeto'}-${++n}`;
  const novo = { id, nome, raiz: abs, cor: cor || '#5b5cf0', descricao: '', ...salvarImagens(id, { icone: imgIcone, logo: imgLogo }) };
  const criado = estruturaBase ? estrutura(abs, nome) : [];
  fs.writeFileSync(FILE, JSON.stringify({ projetos: [...registro, novo] }, null, 2));
  return { id, criado };
}

// Ícone do projeto: arquivo configurado ou um cartão SVG com as iniciais (sempre há algo para mostrar).
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
export function logoDe(p, largo) {
  const f = largo && p.logo ? p.logo : p.icone;
  const type = f && MIME[path.extname(f).toLowerCase()];
  if (type) { try { if (fs.statSync(f).isFile()) return { type, body: fs.readFileSync(f) }; } catch {} }
  const ini = p.nome.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const esc = (s) => s.replace(/[&<>"]/g, '');
  return { type: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.cor}"/><stop offset="1" stop-color="#101827"/></linearGradient></defs><rect width="256" height="256" rx="48" fill="url(#g)"/><text x="128" y="160" font-family="Segoe UI,Arial,sans-serif" font-size="110" font-weight="700" text-anchor="middle" fill="#fff">${esc(ini)}</text></svg>` };
}

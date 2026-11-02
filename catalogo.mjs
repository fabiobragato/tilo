// Catálogo de modelos de documentação reaproveitáveis por stack. Local (catalogo/, fora do git) e sem dependências.
// Um modelo é uma cópia da documentação TÉCNICA de um projeto (ex.: .NET + Angular), usada como ponto de partida em outros projetos
// da mesma stack. Regras de negócio (business/), planejamento e pendências são específicas de cada produto e nunca entram.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DIR_CATALOGO = path.join(HERE, 'catalogo');
export const AREAS_REAPROVEITAVEIS = ['backend', 'frontend', 'infra', 'deploy', 'security', 'data-platform'];
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_ARQ = 300_000, MAX_TOTAL = 3_000_000;

// ---------- detecção de stack ----------
export const STACKS = {
  dotnet: '.NET', angular: 'Angular', react: 'React', vue: 'Vue', node: 'Node.js', python: 'Python', java: 'Java', go: 'Go', rust: 'Rust', php: 'PHP', ruby: 'Ruby', docker: 'Docker', postgres: 'PostgreSQL',
};
const RUIDO = new Set(['node_modules', '.git', '.vs', '.idea', '.vscode', 'bin', 'obj', 'dist', 'build', 'out', '.angular', '__pycache__', '.venv', 'venv', 'coverage', '.next', 'target', 'vendor']);

// Procura marcadores nos 4 primeiros níveis (no máximo 4000 entradas). Retorna ids de STACKS, sem repetição.
export function detectarStack(raiz) {
  const achou = new Set(); let vistos = 0;
  const ler = (f) => { try { return fs.readFileSync(f, 'utf8').slice(0, 200_000); } catch { return ''; } };
  const walk = (dir, nivel) => {
    let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (++vistos > 4000) return;
      const n = e.name, abs = path.join(dir, n), baixo = n.toLowerCase();
      if (e.isDirectory()) { if (!RUIDO.has(n) && !n.startsWith('.') && nivel < 4) walk(abs, nivel + 1); continue; }
      if (/\.(csproj|sln|fsproj)$/.test(baixo)) achou.add('dotnet');
      else if (baixo === 'package.json') {
        const j = ler(abs); achou.add('node');
        if (/"@angular\/core"/.test(j)) achou.add('angular'); if (/"react"\s*:/.test(j)) achou.add('react'); if (/"vue"\s*:/.test(j)) achou.add('vue');
      } else if (['requirements.txt', 'pyproject.toml', 'setup.py', 'pipfile'].includes(baixo)) achou.add('python');
      else if (baixo === 'pom.xml' || /^build\.gradle(\.kts)?$/.test(baixo)) achou.add('java');
      else if (baixo === 'go.mod') achou.add('go');
      else if (baixo === 'cargo.toml') achou.add('rust');
      else if (baixo === 'composer.json') achou.add('php');
      else if (baixo === 'gemfile') achou.add('ruby');
      else if (baixo === 'dockerfile' || /^docker-compose.*\.ya?ml$/.test(baixo) || baixo === 'compose.yaml' || baixo === 'compose.yml') {
        achou.add('docker'); if (/postgres/i.test(ler(abs))) achou.add('postgres');
      }
    }
  };
  walk(raiz, 0);
  return [...achou].filter((s) => STACKS[s]);
}
export const rotuloStack = (id) => STACKS[id] || id;

// ---------- catálogo ----------
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function listar(dir = DIR_CATALOGO) {
  let ids = []; try { ids = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && ID.test(e.name)).map((e) => e.name); } catch { return []; }
  const out = [];
  for (const id of ids) {
    try { const m = JSON.parse(fs.readFileSync(path.join(dir, id, 'manifest.json'), 'utf8')); out.push({ ...m, id }); } catch {}
  }
  return out.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
}

export const pastaDoModelo = (id, dir = DIR_CATALOGO) => (ID.test(id) && fs.existsSync(path.join(dir, id, 'manifest.json')) ? path.join(dir, id) : null);

// Copia a documentação técnica das áreas escolhidas para catalogo/<id>/ e grava o manifesto. Lança Error em português.
export function salvar({ raizProjeto, nomeProjeto, nome, descricao = '', areas, stack = [] }, dir = DIR_CATALOGO) {
  nome = String(nome || '').trim();
  if (nome.length < 3 || nome.length > 60) throw new Error('dê um nome ao modelo (3 a 60 caracteres)');
  if (String(descricao).length > 200) throw new Error('descrição longa demais (máx. 200 caracteres)');
  const escolhidas = [...new Set((areas || []).map(String))];
  if (!escolhidas.length) throw new Error('escolha pelo menos uma área');
  const invalida = escolhidas.find((a) => !AREAS_REAPROVEITAVEIS.includes(a));
  if (invalida) throw new Error(`a área “${invalida}” não pode entrar no catálogo (regras de negócio, planejamento e pendências são específicas de cada produto)`);
  const stk = [...new Set((stack || []).map(String))].filter((s) => STACKS[s]);
  let id = slug(nome) || 'modelo', n = 1; const base = id;
  const existentes = new Set(listar(dir).map((e) => e.id));
  while (existentes.has(id)) id = `${base}-${++n}`;

  const arquivos = []; let total = 0;
  for (const area of escolhidas) {
    const origem = path.join(raizProjeto, 'docs', area);
    const walk = (d, rel) => {
      let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of es) {
        const abs = path.join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { walk(abs, r); continue; }
        if (!e.name.toLowerCase().endsWith('.md') || /^audit/i.test(e.name)) continue; // relatórios de auditoria são específicos do projeto
        const st = fs.statSync(abs); if (st.size > MAX_ARQ) continue;
        total += st.size; if (total > MAX_TOTAL) throw new Error('documentação grande demais para o catálogo (máx. 3 MB)');
        arquivos.push({ area, rel: r, abs });
      }
    };
    walk(origem, '');
  }
  if (!arquivos.length) throw new Error('não há documentos .md nessas áreas em docs/ deste projeto');

  const destino = path.join(dir, id);
  fs.mkdirSync(destino, { recursive: true });
  const porArea = {};
  for (const a of arquivos) {
    const f = path.join(destino, a.area, ...a.rel.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.copyFileSync(a.abs, f);
    porArea[a.area] = (porArea[a.area] || 0) + 1;
  }
  const manifesto = { nome, descricao: String(descricao).trim(), stack: stk, areas: Object.entries(porArea).map(([areaId, arquivosN]) => ({ id: areaId, arquivos: arquivosN })), origem: String(nomeProjeto || ''), criadoEm: new Date().toISOString(), arquivos: arquivos.length };
  fs.writeFileSync(path.join(destino, 'manifest.json'), JSON.stringify(manifesto, null, 2));
  return { id, ...manifesto };
}

export function excluir(id, dir = DIR_CATALOGO) {
  if (!ID.test(String(id))) throw new Error('modelo inválido');
  const alvo = path.resolve(dir, id);
  if (path.dirname(alvo) !== path.resolve(dir) || !fs.existsSync(path.join(alvo, 'manifest.json'))) throw new Error('modelo não encontrado');
  fs.rmSync(alvo, { recursive: true, force: true });
}

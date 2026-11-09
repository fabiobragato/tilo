// Tratamento seguro de erros para respostas HTTP, logs e auditoria. Sem dependências.
// Regra: o navegador nunca recebe stack trace, caminho local, token nem detalhe interno de exceção.
// Erros de validação/regra de negócio (Error simples com mensagem em português) passam, já redigidos;
// erros de sistema (fs, rede, bugs) viram a mensagem genérica e o detalhe vai só para o log local.

export const MSG_INTERNO = 'Erro interno do Tilo. Detalhes foram registrados no log local.';

const TIPOS_INTERNOS = [SyntaxError, TypeError, RangeError, ReferenceError, EvalError, URIError];

// Remove de um texto o que não pode sair do servidor: stack, caminhos, URLs com credencial, tokens.
export function redigir(texto, max = 300, cortarStack = true) {
  let t = String(texto ?? '');
  if (cortarStack) t = t.split(/\r?\n\s*at\s/)[0]; // corta stack trace
  t = t.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@'); // credenciais em URL
  t = t.replace(/\b(?:token|authorization|bearer|api[_-]?key|senha|password|secret)\b(\s*[:=]\s*|\s+)\S+/gi, '$1***');
  t = t.replace(/\b[0-9a-f]{32,}\b/gi, '***');                  // tokens hexadecimais
  t = t.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '***');
  t = t.replace(/\b[A-Za-z]:[\\/][^\s'"`,;)]*/g, '<caminho>');  // C:\... ou C:/...
  t = t.replace(/\\\\[^\s'"`,;)]+/g, '<caminho>');              // UNC
  t = t.replace(/(^|[\s'"`(])\/(?:home|Users|root|var|tmp|etc|opt|usr|mnt|srv|app|workspace)\/[^\s'"`,;)]*/g, '$1<caminho>');
  t = t.trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

// Erro esperado = Error comum, sem `code` de sistema, com mensagem própria.
export function ehErroEsperado(e) {
  if (!(e instanceof Error)) return false;
  if (TIPOS_INTERNOS.some((T) => e instanceof T)) return false;
  if (typeof e.code === 'string' || typeof e.errno === 'number' || e.syscall) return false;
  return typeof e.message === 'string' && e.message.trim() !== '';
}

// Texto que pode ir para o navegador.
export function mensagemSegura(e, fallback = MSG_INTERNO) {
  if (!ehErroEsperado(e)) { registrarErro(e); return fallback; }
  const m = redigir(e.message);
  return m || fallback;
}

// Detalhe técnico só no log local (stderr / tilo.err.log), já sem segredos.
export function registrarErro(e, contexto = '') {
  const det = e instanceof Error ? (e.stack || e.message) : String(e);
  console.error(`[tilo] erro interno${contexto ? ` (${contexto})` : ''}: ${redigir(det, 4000, false)}`);
}

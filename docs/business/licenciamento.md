# Licenciamento

O Tilo é **source-available**: o código é acessível, mas a licença restringe o uso comercial. Não é open source no sentido da Open Source Definition da OSI e não deve ser apresentado como tal.

## Licenças em vigor

- **Código do Tilo:** PolyForm Noncommercial 1.0.0, texto oficial sem edição em `LICENSE`, com a linha `Required Notice:` do titular (Fabio Bragato). `package.json` aponta para ele (`"license": "SEE LICENSE IN LICENSE"`).
- **Uso comercial:** exige autorização separada (Tilo Business). `COMMERCIAL-LICENSE.md` é só um resumo informativo; não substitui o contrato nem a `LICENSE`.
- **Componentes de terceiros (MIT), com os avisos mantidos:** ícones PrimeIcons (`assets/PRIMEICONS-LICENSE`) e regras de tom adaptadas do Caveman (cabeçalho de `tom.mjs`). A licença do Tilo não os altera.

## Quem usa de graça e quem precisa de licença comercial

- Grátis (Community), nos termos da `LICENSE`: uso pessoal, estudo, pesquisa e organizações sem fins lucrativos, de ensino, de pesquisa, de saúde pública, de proteção ambiental e governamentais.
- Licença comercial (Business): empresas e profissionais que usam o Tilo em atividade econômica, inclusive freelancers em projetos remunerados.
- O software é o mesmo e roda localmente nos dois casos; a diferença é o direito de uso. Não há bloqueio técnico nem validação online de licença.
- GitHub Sponsors (apoio voluntário) não concede licença comercial.

## Contribuições

`CONTRIBUTING.md` exige `Signed-off-by` (DCO) em todos os commits e a concordância de que o titular pode usar a contribuição nas licenças comerciais. `.github/pull_request_template.md` traz o checklist. Falhas de segurança seguem `SECURITY.md`.

## Marca

O nome "Tilo" e a identidade visual não são licenciados pela `LICENSE`.

## Publicação

O repositório é privado. Não há verificação automática de licença no código nem no CI; o `ci.yml` só roda `npm test`, com `permissions: contents: read`. As condições para tornar o repositório público estão em `pendencias/README.md`.

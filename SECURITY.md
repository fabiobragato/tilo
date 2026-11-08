# Política de segurança

## Como relatar uma vulnerabilidade

Envie e-mail para fabio_bragato@hotmail.com com o assunto "Tilo - segurança". **Não abra Issue pública** nem inclua segredos reais no relato. Descreva o que acontece, como reproduzir e a versão (`package.json`).

Respondo com melhor esforço, sem prazo garantido (projeto individual, sem SLA).

## Escopo

O Tilo roda localmente (`127.0.0.1`), com token por instalação e aprovação de comandos. São de interesse: contornar a política de comandos, vazar ou expor o token, acessar arquivos fora do projeto, aceitar requisições de outros hosts. Regras e status em [`docs/security/`](docs/security/).

## Versões

Só a versão mais recente da branch `main` recebe correções.

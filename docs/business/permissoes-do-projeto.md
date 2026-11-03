# Permissões do Claude por projeto

Cobre a tela "Permissões do Claude" e o que cada projeto pode acrescentar às regras de fábrica.

## 1. Objetivo

Deixar o dono ajustar, sem programar, o que o Claude faz sozinho em cada projeto, sempre dentro das regras de fábrica.

## 2. O que a tela mostra

| Bloco | Conteúdo |
|---|---|
| Liberado de fábrica | Comandos só de consulta (ver [aprovacao-de-comandos.md](aprovacao-de-comandos.md)). |
| Pacotes opcionais | `testes` (rodar testes e verificações) e `build` (compilar). Vêm desligados. |
| Comandos que você liberou | Comandos lembrados, com explicação, data e botão de remover. |
| Nunca permitido | Lista de fábrica e bloqueios do projeto. |
| Atenção redobrada (produção) | Lista de fábrica e itens do projeto. |
| Testar um comando | Simula a política: mostra se seria liberado, perguntaria (com atenção ou não) ou seria bloqueado, o motivo e se a regra é de fábrica ou do projeto. Não executa nada. |

## 3. Regras do projeto

- **Pacotes:** ligar/desligar afeta só aquele projeto.
- **Comandos lembrados:** até 200 por projeto; vale só o texto exato; remover volta a perguntar.
- **Bloqueios e atenção redobrada por texto:** o dono escreve um trecho (3 a 80 caracteres) e um motivo opcional (até 120); qualquer comando que contenha o trecho, sem diferenciar maiúsculas, é bloqueado ou tratado como produção. Até 40 regras de cada tipo. Exemplo da tela: `terraform destroy`.

## Regras

- As regras de fábrica não podem ser removidas nem enfraquecidas por regras do projeto.
- Bloqueios do projeto são avaliados junto com os de fábrica, antes de tudo.
- As permissões ficam em `projetos.json` (chave `politica`); mudanças de "lembrar" e "esquecer" são registradas na auditoria.

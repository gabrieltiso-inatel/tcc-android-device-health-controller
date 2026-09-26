# Arquitetura do controlador

## Papel no sistema

O controlador mantém o estado conhecido dos dispositivos, recebe observações, cria ações explícitas e conserva o histórico auditável. O agent Android inicia todas as conexões HTTP.

## Componentes atuais

- `server.ts`: rotas Fastify, validação dos contratos e interface web;
- `device-store.ts`: persistência SQLite, autenticação e ciclo de vida das ações;
- `data/controller.db`: banco local padrão.

Extraia novos módulos quando uma responsabilidade crescer; não mova lógica de negócio para handlers ou HTML.

## Fluxos principais

### Observação automática

```text
agent coleta estado
→ envia telemetria autenticada
→ controlador atualiza o estado atual
→ nenhum histórico de ação é criado
```

### Ação do controlador

```text
controller cria Action(origin=controller, status=pending)
→ agent recebe por polling
→ agent executa e envia resultado
→ controlador conclui ou falha a ação
```

### Ação do dispositivo

```text
agent registra Action(origin=device, status=delivered)
→ agent executa pelo mesmo ActionExecutor
→ agent envia resultado
→ controlador atualiza o histórico compartilhado
```

## Invariantes

- apenas ações explícitas entram no histórico;
- toda ação possui origem `controller` ou `device`;
- ações só podem ser criadas quando o dispositivo anuncia a capability correspondente;
- tokens são armazenados como hash e nunca devem aparecer em logs;
- resultados de erro não expõem detalhes internos;
- ações do controlador suportam retry e expiração;
- o mesmo identificador de ação não deve executar o efeito duas vezes.

## Persistência

- `devices`: estado atual e último contato;
- `actions`: solicitação, origem, entrega, resultado e estado final;
- `pairing_codes`: códigos temporários e utilização;
- `device_credentials`: identidade pareada e hash do token.

O uso de `node:sqlite` e o modelo das tabelas devem ser reavaliados antes da solução final do TCC.

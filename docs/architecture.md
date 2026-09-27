# Arquitetura do controlador

## Papel no sistema

O controlador mantém o estado conhecido dos dispositivos, recebe observações, cria ações explícitas e conserva o histórico auditável. O agent Android inicia todas as conexões HTTP.

## Componentes atuais

- `server.ts`: composição da aplicação e rotas HTML;
- `api-routes.ts`: rotas HTTP do contrato com os agents;
- `api-schemas.ts`: validação dos payloads HTTP;
- `auth.ts`: autenticação dos devices;
- `web-renderer.ts`: renderização da interface web;
- `device-store.ts`: persistência SQLite, autenticação e ciclo de vida das ações;
- `data/controller.db`: banco local padrão.

O estado atual de armazenamento fica em `device_storage`, separado do histórico de ações. O registro é substituído pelo último resumo recebido, enquanto ações explícitas continuam sendo registradas em `actions`.

O inventário atual fica em `device_app_inventories` e `device_apps`. A lista de aplicações é substituída atomicamente quando uma coleta completa mais nova chega.
Cada aplicação também informa `canRemove`; o controlador usa esse valor somente para apresentar ou ocultar a ação de remoção.

O inventário atual de arquivos fica em `device_file_inventories` e `device_files`. O controller armazena somente metadados, fontes e referências opacas; URIs e caminhos físicos permanecem no agent.

Extraia novos módulos quando uma responsabilidade crescer; não mova lógica de negócio para handlers ou HTML.

## Fluxos principais

### Observação automática

```text
agent coleta estado
→ envia telemetria autenticada
→ controlador atualiza o estado atual
→ nenhum histórico de ação é criado
```

O resumo de armazenamento segue o mesmo fluxo de observação automática, em um endpoint autenticado próprio, e substitui o snapshot atual em `device_storage` sem criar uma ação.

O inventário de aplicativos segue o mesmo fluxo em um endpoint próprio e atualiza os snapshots sem criar uma ação.

O inventário de arquivos é coletado por `collectFileInventory`, uma ação explícita, e atualiza o snapshot de arquivos quando concluída. As fontes disponíveis podem exigir autorização do usuário; isso é representado nos dados do inventário e não por uma permissão Android no contrato.

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
- capabilities representam capacidades do agent no contrato da aplicação, não permissões ou APIs Android;
- ações representam intenções de negócio; estratégias de consentimento e administração ficam fora do controlador;
- uma ação pode permanecer em `awaiting_approval` sem voltar para a fila de entrega;
- referências de arquivos não são autoridade para ações destrutivas; o agent deve resolver e validar novamente o arquivo;
- `removeFile` usa `fileId` e `expectedRevision` e não interpreta caminhos no controller;
- tokens são armazenados como hash e nunca devem aparecer em logs;
- resultados de erro não expõem detalhes internos;
- ações do controlador suportam retry e expiração;
- o mesmo identificador de ação não deve executar o efeito duas vezes.

## Persistência

- `devices`: estado atual e último contato;
- `actions`: solicitação, origem, entrega, resultado e estado final;
- `pairing_codes`: códigos temporários e utilização;
- `device_credentials`: identidade pareada e hash do token.
- `device_file_inventories`: última coleta de arquivos por device;
- `device_files`: metadados do último inventário de arquivos por device.

O uso de `node:sqlite` e o modelo das tabelas devem ser reavaliados antes da solução final do TCC.

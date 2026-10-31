# Device Health Controller

Controlador local do primeiro fluxo ponta a ponta. Ele mostra a telemetria recebida e coordena ações suportadas pelo agente.

## Requisitos

- Node.js 24 ou superior

## Execução

```sh
npm install
npm run dev
```

Abra `http://localhost:3000` no navegador. A tela inicial lista os dispositivos; selecione um dispositivo para ver seu estado atual e o histórico de ações.

## Validação

O dashboard apresenta áreas de saúde, armazenamento, apps, arquivos, pendências e histórico. A visualização acompanha o controller a cada 5 segundos sem solicitar novas coletas. Apps e arquivos permitem pesquisa, e o histórico permite filtro por estado; as listas mostram 20 entradas por página. Em telas estreitas, as linhas das tabelas são apresentadas como blocos com rótulos. **Update** solicita uma coleta explícita; remoções sempre pedem aprovação no Android. O agent usa a leitura autenticada `GET /api/devices/{deviceId}/state` para consultar os mesmos snapshots.

O workflow `CI` executa build TypeScript e testes automaticamente em pushes e pull requests, usando Node.js 24 e `npm ci`. O resultado aparece na aba **Actions** do GitHub; também é possível executar por **Run workflow**. Não requer secrets e não publica a aplicação.

```sh
npm run check
```

## Baixar e executar

Na aba **Actions**, abra uma execução bem-sucedida de `CI` e baixe `controller-package` em **Artifacts** (é necessário estar autenticado no GitHub). Extraia o ZIP do artifact e depois o pacote `.tgz`:

```sh
tar -xzf android-device-health-controller-0.1.0.tgz
cd package
npm ci --omit=dev
npm start
```

Requer Node.js 24 ou superior. Abra `http://localhost:3000`. No telefone, informe `http://IP-DO-COMPUTADOR:3000` na mesma rede, usando o APK debug de teste. `PORT` permite alterar a porta; o banco fica em `data/controller.db` dentro da pasta de execução. Preserve esse diretório ao atualizar. O servidor aceita conexões da rede; use em rede confiável, sem expor a porta à internet. Hospedagem pública exige revisão de segurança e HTTPS.

Para gerar o pacote localmente: `npm ci && npm run package`. O arquivo estará em `dist/`. O pacote contém aplicação compilada e lockfile; dependências são instaladas no computador de destino.

## API inicial

| Método | Rota | Uso |
| --- | --- | --- |
| `GET` | `/health` | Verifica se o controlador está ativo. |
| `GET` | `/api/devices` | Lista os dispositivos conhecidos e o estado `online`/`stale`. |
| `POST` | `/api/pairing-codes` | Cria um código temporário de pareamento. |
| `POST` | `/api/devices/pair` | Pareia um agente e entrega seu token. |
| `POST` | `/api/devices/{deviceId}/telemetry` | Recebe estado, versão e capacidades do agente. |
| `POST` | `/api/devices/{deviceId}/storage` | Recebe o snapshot atual de armazenamento. |
| `POST` | `/api/devices/{deviceId}/apps` | Recebe o snapshot atual do inventário de aplicativos. |
| `GET` | `/api/devices/{deviceId}/actions` | Entrega ações pendentes ao agente. |
| `POST` | `/api/devices/{deviceId}/actions` | Cria uma ação com origem no controlador ou dispositivo. |
| `POST` | `/api/actions/{actionId}/result` | Registra o resultado de uma ação. |
| `GET` | `/api/devices/{deviceId}/history` | Lista o histórico de ações do dispositivo. |

O agente deve enviar o token recebido no pareamento através do header `Authorization: Bearer <token>` nas chamadas de telemetria, ações e histórico.

O dashboard diferencia `Last contact`, atualizado quando o agente envia estado ou consulta ações, de `Telemetry captured`, que representa o instante da última coleta recebida. Os snapshots atuais de armazenamento e aplicativos são atualizados automaticamente, e a tela do dispositivo também permite solicitar atualizações explícitas.

Ações do controlador entregues sem confirmação voltam a ficar disponíveis após 60 segundos. Depois de três entregas sem resultado, o controlador marca a ação como `expired`.

Falhas definitivas usam códigos internos seguros, como `unsupported_action` e `execution_failed`. Falhas temporárias de conexão não encerram a ação e são tentadas novamente.

O controlador cria ações somente quando a capacidade correspondente foi informada pelo agente.

O resultado de `collectStorageSummary` contém apenas totais agregados de espaço total, usado e disponível. Nenhum arquivo é listado ou acessado.

O resultado de `collectAppInventory` contém nome, pacote, versão e datas de instalação e atualização dos aplicativos instalados pelo usuário. Aplicativos do sistema não são incluídos.

Os dispositivos e ações são persistidos em `data/controller.db` usando SQLite local.

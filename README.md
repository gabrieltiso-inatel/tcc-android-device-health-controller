# Device Health Controller

Controlador local do primeiro fluxo ponta a ponta. Ele mostra a telemetria recebida e pode solicitar uma nova coleta de bateria ao agente.

## Requisitos

- Node.js 24 ou superior

## Execução

```sh
npm install
npm run dev
```

Abra `http://localhost:3000` no navegador. A tela inicial lista os dispositivos; selecione um dispositivo para ver seu estado atual e o histórico de comandos.

## Validação

```sh
npm run check
```

## API inicial

| Método | Rota | Uso |
| --- | --- | --- |
| `GET` | `/health` | Verifica se o controlador está ativo. |
| `GET` | `/api/devices` | Lista os dispositivos conhecidos e o estado `online`/`stale`. |
| `POST` | `/api/devices/{deviceId}/telemetry` | Recebe nome e bateria. |
| `GET` | `/api/devices/{deviceId}/commands` | Entrega comandos pendentes ao agente. |
| `POST` | `/api/devices/{deviceId}/commands` | Cria o comando `collectTelemetry`. |
| `POST` | `/api/commands/{commandId}/result` | Registra o resultado de um comando. |
| `GET` | `/api/devices/{deviceId}/history` | Lista o histórico de comandos do dispositivo. |

Os dispositivos e comandos são persistidos em `data/controller.db` usando SQLite local.

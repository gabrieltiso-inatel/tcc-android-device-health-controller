# Casos de uso do controlador

Este documento registra o escopo funcional do controlador. Atualize o estado dos casos de uso quando uma entrega for concluída ou repriorizada.

## Concluído

### Cadastrar dispositivo

- gerar código temporário de pareamento;
- associar um agent por UUID;
- emitir e validar token do dispositivo.

### Visualizar dispositivos

- listar dispositivos cadastrados;
- mostrar bateria, carregamento e última atividade;
- acessar detalhes de um dispositivo.

### Consultar estado do dispositivo

- mostrar fabricante, modelo, Android, versão do agent e capabilities;
- diferenciar último contato da captura da telemetria;
- indicar dispositivo online ou desatualizado.

### Consultar armazenamento

- solicitar resumo agregado de espaço total, usado e disponível;
- exibir o resultado mais recente.

### Consultar aplicativos

- solicitar inventário de aplicativos instalados pelo usuário;
- exibir nome, pacote, versão e datas de instalação e atualização.

### Visualizar histórico de ações

- registrar ações iniciadas pelo `controller` ou `device`;
- mostrar estado, origem, horários, tentativas e resultado;
- aplicar retry, expiração e prevenção de execução duplicada.

## Parcial

### Sincronizar estado automaticamente

- telemetria básica, armazenamento e inventário de aplicativos já são sincronizados automaticamente;
- sincronizações automáticas futuras não devem gerar histórico de ações.

## Planejado

- melhorar a apresentação e filtragem do histórico;
- ampliar informações disponíveis sobre aplicativos;
- solicitar ações explícitas de gerenciamento;
- trabalhar com arquivos autorizados pelo usuário;
- avaliar ações privilegiadas em modo Device Owner/Profile Owner.

## Fora do escopo atual

- listar ou excluir arquivos arbitrários sem consentimento;
- limpar dados ou remover aplicativos silenciosamente em um agent comum;
- implementar um MDM completo antes de validar os casos de uso principais.

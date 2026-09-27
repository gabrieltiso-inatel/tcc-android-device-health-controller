# Casos de uso do controlador

Este documento registra o escopo funcional do controlador. Atualize o estado dos casos de uso quando uma entrega for concluída ou repriorizada.

O controlador deve centralizar leituras e intenções de gerenciamento. O fato de uma ação exigir consentimento, notificação ou retomada no agent não a coloca fora do escopo.

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
- exibir nome, identificador, versão e datas de instalação e atualização.
- não oferecer remoção para a própria aplicação do agent quando o inventário informar `canRemove=false`.

### Visualizar histórico de ações

- registrar ações iniciadas pelo `controller` ou `device`;
- mostrar estado, origem, horários, tentativas e resultado;
- aplicar retry, expiração e prevenção de execução duplicada.

### Consultar arquivos autorizados

- solicitar um inventário explícito de arquivos disponíveis;
- mostrar fontes, nome, tipo, tamanho, data de alteração e referência de revisão;
- preservar o snapshot atual separado do histórico de ações;
- tratar `fileId`, `sourceId` e `revision` como referências opacas.

## Parcial

### Sincronizar estado automaticamente

- telemetria básica, armazenamento e inventário de aplicativos já são sincronizados automaticamente;
- sincronizações automáticas futuras não devem gerar histórico de ações.

### Remover aplicação

- solicitar `removeApplication` com identificador e versão observada;
- acompanhar entrega, aprovação, conclusão, cancelamento e falha;
- manter o histórico e o inventário coerentes após o resultado.

### Remover arquivo

- solicitar a remoção usando uma referência opaca e a revisão observada;
- deixar o agent revalidar o arquivo e aplicar o consentimento oficial necessário;
- atualizar o inventário após o resultado;
- atualmente permitir a ação apenas para arquivos em pastas autorizadas pelo usuário.

## Planejado

- melhorar a apresentação e filtragem do histórico;
- ampliar informações disponíveis sobre aplicativos;
- trabalhar com arquivos autorizados pelo usuário através das APIs oficiais;
- ampliar ações de gerenciamento de aplicações que sejam possíveis com consentimento;
- avaliar ações adicionais em modo Device Owner/Profile Owner.

As ações do controlador representam intenções de negócio. O controlador não escolhe a API Android nem diferencia consentimento de política administrativa; essas decisões pertencem ao agent.

## Limites atuais

- listar ou excluir arquivos arbitrários sem consentimento;
- limpar dados ou remover aplicativos sem respeitar as restrições da plataforma;
- exigir Device Owner/Profile Owner como condição para o fluxo principal;
- implementar um MDM completo antes de validar os casos de uso principais.

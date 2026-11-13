# Casos de uso do controlador

Este documento registra o escopo funcional do controlador. Atualize o estado dos casos de uso quando uma entrega for concluída ou repriorizada.

O controlador deve centralizar leituras e intenções de gerenciamento. O fato de uma ação exigir consentimento, notificação ou retomada no agent não a coloca fora do escopo.

## Implementado

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
- exibir nome, identificador, versão e datas de instalação e atualização;
- pesquisar nomes e navegar em páginas de 20 entradas;
- não oferecer remoção para a própria aplicação do agent quando o inventário informar `canRemove=false`.

### Visualizar histórico de ações

- registrar ações iniciadas pelo `controller` ou `device`;
- mostrar estado, origem, horários, tentativas e resultado;
- aplicar retry, expiração e prevenção de execução duplicada.
- filtrar por estado e navegar em páginas de 20 entradas, com nomes amigáveis e datas relativas;
- acompanhar mudanças automaticamente sem recarregar a página inteira.

### Consultar arquivos autorizados

- solicitar um inventário explícito de arquivos disponíveis;
- mostrar fontes, nome, tipo, tamanho, data de alteração e referência de revisão;
- preservar o snapshot atual separado do histórico de ações;
- tratar `fileId`, `sourceId` e `revision` como referências opacas;
- pesquisar nomes e navegar em páginas de 20 entradas.

### Remover aplicação

- solicitar `removeApplication` com identificador e versão observada;
- acompanhar entrega, aprovação, conclusão, cancelamento e falha;
- manter o primeiro resultado final e aceitar reenvios idênticos sem alteração;
- retirar a aplicação do inventário atual quando a remoção for concluída;
- mostrar o último resultado de remoção junto a cada aplicativo.

### Sincronizar estado automaticamente

- telemetria básica, armazenamento e inventário de aplicativos já são sincronizados automaticamente;
- atualizar os snapshots sem criar entradas no histórico de ações;
- coletar arquivos mediante solicitação explícita e atualizar o inventário após remoções.

### Remover arquivo

- solicitar a remoção usando uma referência opaca e a revisão observada;
- deixar o agent revalidar o arquivo e aplicar o consentimento oficial necessário;
- atualizar o inventário após o resultado;
- permitir a ação quando o agent informar `canRemove`, incluindo fontes que exijam confirmação oficial; pastas e mídia acessível usam a mesma intenção `removeFile`.

## Planejado

- ampliar informações disponíveis sobre aplicativos;
- ampliar ações de gerenciamento de aplicações que sejam possíveis com consentimento;
- avaliar ações adicionais em modo Device Owner/Profile Owner.

As ações do controlador representam intenções de negócio. O controlador não escolhe a API Android nem diferencia consentimento de política administrativa; essas decisões pertencem ao agent.

## Limites atuais

- listar ou excluir arquivos arbitrários sem consentimento;
- limpar dados ou remover aplicativos sem respeitar as restrições da plataforma;
- exigir Device Owner/Profile Owner como condição para o fluxo principal;
- implementar um MDM completo antes de validar os casos de uso principais.

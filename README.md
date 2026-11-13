# Android Device Health — Controlador

Solução acadêmica de TCC para acompanhamento e manutenção de dispositivos Android em ambientes familiares. O controlador reúne as informações dos dispositivos em um painel Web e coordena solicitações executadas pelo [agente Android](https://github.com/gabrieltiso-inatel/tcc-android-device-health-agent).

## Funcionalidades

- Pareamento por código temporário e autenticação do agente por token.
- Visão dos dispositivos, bateria, carregamento, último contato e armazenamento.
- Inventários de aplicativos e arquivos autorizados, com pesquisa e paginação.
- Solicitação de atualizações e remoções com aprovação no dispositivo.
- Histórico compartilhado com o agente, incluindo origem, estado e resultado das ações.

O agente inicia a comunicação por HTTP e consulta as ações por polling. As coletas automáticas atualizam o estado atual sem gerar histórico. Solicitações explícitas usam um fluxo comum com retry, expiração, idempotência e retomada de aprovações no agente.

## Executar pelo código-fonte

Requer **Node.js 24 ou superior**.

```sh
npm ci
npm run dev
```

Abra <http://localhost:3000>. Para executar a versão compilada, use `npm run build` e depois `npm start`.

### Conectar um dispositivo

1. No painel, selecione **Add device** para gerar um código temporário.
2. Instale e abra o agente Android.
3. Informe o endereço do controlador e o código de seis dígitos no agente.
4. Após o pareamento, selecione o dispositivo no painel para consultar os dados e solicitar ações.

No emulador Android, use `http://10.0.2.2:3000`. Em um dispositivo físico na mesma rede, use o IP do computador, por exemplo `http://192.168.1.10:3000`. A porta pode ser alterada pela variável `PORT`.

Os dados ficam em `data/controller.db`, relativo ao diretório de execução. Preserve essa pasta ao atualizar a aplicação.

## Baixar o pacote

Na aba [Actions](https://github.com/gabrieltiso-inatel/tcc-android-device-health-controller/actions), abra uma execução bem-sucedida de **CI** e baixe o artifact **controller-package**. O download exige login no GitHub. Extraia o ZIP e, em seguida, o pacote:

```sh
tar -xzf android-device-health-controller-0.1.0.tgz
cd package
npm ci --omit=dev
npm start
```

O pacote requer Node.js 24 ou superior. Para gerá-lo localmente, execute `npm ci` e `npm run package`; o arquivo `.tgz` será criado em `dist/`.

## Validação e CI

```sh
npm run check
```

O comando compila o TypeScript e executa os testes. O GitHub Actions realiza essas verificações em pushes e pull requests e gera o pacote de instalação, disponível por 14 dias. O fluxo também pode ser iniciado manualmente por **Run workflow**.

## Arquitetura e acesso

O controlador utiliza **TypeScript, Node.js, Fastify e SQLite**, com HTML renderizado no servidor. Ele expressa intenções de manutenção; o agente resolve as referências, valida os alvos e integra as APIs Android. Arquivos são representados por metadados e referências opacas, com conteúdo e caminhos físicos mantidos no dispositivo.

O painel e os endpoints de gerenciamento permitem operar o controlador sem login. O servidor aceita conexões da rede e deve ser usado em ambiente confiável. Uma instalação acessível pela Internet exige proteção de acesso e HTTPS. O APK de teste permite HTTP.

- [Arquitetura](docs/architecture.md)
- [Casos de uso](docs/use-cases.md)
- [Agente Android](https://github.com/gabrieltiso-inatel/tcc-android-device-health-agent)

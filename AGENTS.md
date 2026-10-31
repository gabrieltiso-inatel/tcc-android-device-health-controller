# AGENTS.md — JavaScript Web Server

## Purpose

This file defines the shared development rules for this web-server repository. Follow these instructions unless a task explicitly requires otherwise.

## Project Context

Este repositório contém o controlador do projeto Android Device Health, uma solução acadêmica para acompanhamento e gerenciamento de dispositivos Android em ambientes familiares.

- O controlador é uma aplicação local em TypeScript, Node.js e Fastify, com persistência SQLite e interface web.
- O agent Android inicia toda comunicação por HTTP, envia seu estado e consulta ações pendentes por polling.
- Dispositivos são associados ao controlador por código temporário de pareamento e token.
- O estado atual inclui identificação do dispositivo, bateria, versão do Android, capabilities, armazenamento agregado, inventário de aplicativos instalados pelo usuário e inventário de arquivos autorizados.
- Ações explícitas podem ter origem `controller` ou `device` e compartilham o mesmo histórico auditável.
- Ações possuem entrega, retry, expiração, idempotência, resultado estruturado e erros seguros.
- As ações atuais são `collectTelemetry`, `collectStorageSummary`, `collectAppInventory`, `collectFileInventory`, `removeApplication` e `removeFile`.
- Sincronizações automáticas representam estado observado e não devem criar entradas no histórico de ações.
- A leitura autenticada `GET /api/devices/:deviceId/state` compartilha os snapshots com o agent sem executar ações. A UI mantém filtros e paginação local e atualiza a visualização automaticamente.
- O objetivo não é implementar um MDM completo, mas evoluir casos de uso verificáveis respeitando as limitações e a segurança da plataforma Android.

## Current Direction

Esta seção mantém continuidade entre sessões curtas. Consulte-a antes de propor novos trabalhos e atualize-a sempre que uma etapa for concluída, removida ou repriorizada. Registre somente o estado atual e os próximos objetivos; detalhes históricos pertencem aos commits.

Diretrizes permanentes:

- O controlador deve expressar intenções de negócio e permanecer independente de APIs e políticas específicas do Android sempre que possível.
- `capabilities` são capacidades anunciadas pelo agent e usam os mesmos identificadores de `ActionType`; não são permissões Android.
- Preservar os padrões existentes antes de criar novas abstrações: unions de strings, payload opcional, resultados estruturados, idempotência por `actionId` e snapshots separados do histórico.
- Tratar identificadores concretos do inventário como referências opacas no controlador; não interpretar detalhes de pacote ou APIs Android em regras de negócio.
- Consentimento, permissões e Device Owner/Profile Owner pertencem à estratégia do agent. Não criar nomes de ações acoplados a essas estratégias.
- O objetivo do produto é centralizar leituras e ações reais de gerenciamento; não reduzir o escopo a telemetria por causa das limitações de uma API específica.
- Ações oficiais que exigem consentimento, notificação ou retomada continuam dentro do escopo e devem ser representadas no histórico.
- Device Owner/Profile Owner é opcional e experimental; não deve ser tratado como requisito para telefones familiares.
- Quando uma decisão de contrato mudar, atualizar este arquivo, o `AGENTS.md` do agent, o `HANDOFF.md` e os documentos de contexto correspondentes.

Concluído:

- framework unificado de ações com origem `controller` ou `device`;
- histórico compartilhado de ações;
- telemetria, resumo de armazenamento e inventário de aplicativos;
- contrato e snapshot inicial de inventário de arquivos;
- pareamento, autenticação, retry, expiração e idempotência.

Próximo:

- validar a experiência da ação de domínio `removeApplication` no fluxo ponta a ponta;

Depois:

- melhorar a apresentação e filtragem do histórico;
- `removeFile` para arquivos em pastas autorizadas já usa referência opaca, revisão esperada e consentimento explícito; ampliar para mídia compartilhada somente com a API oficial correspondente;
- ampliar ações de gerenciamento possíveis no agent comum;
- avaliar capacidades adicionais com Device Owner/Profile Owner.

No inventário, `canRemove` é uma decisão do agent sobre a referência concreta. O controlador usa esse sinal apenas para decidir se apresenta a ação de remoção; não interpreta pacote Android nem reimplementa a validação.

No inventário de arquivos, `fileId`, `sourceId` e `revision` são referências opacas. O controller armazena apenas metadados e não recebe URIs ou caminhos físicos Android.

## Context Routing

- Leia `docs/use-cases.md` ao planejar funcionalidades, revisar escopo ou definir o próximo passo.
- Leia `docs/architecture.md` antes de alterar contratos, persistência, autenticação, comunicação ou limites entre camadas.
- Não carregue toda a documentação para correções locais que não dependam desse contexto.

## Communication

- Write explanations and responses in concise Brazilian Portuguese.
- Keep technical identifiers, source code, filenames, and commit messages in English.
- Prefer short, direct explanations focused on decisions and outcomes.

## Language and Naming

- Write all code in English using plain, simple terms.
- Use concise, meaningful names that reveal intent.
- Avoid vague names such as `data`, `item`, `object`, `manager`, `helper`, or `utils` when a more precise name exists.
- Use consistent naming patterns for equivalent concepts across the project.
- Name controllers, handlers, services, repositories, schemas, routes, and tests consistently with existing project conventions.
- Follow standard JavaScript naming conventions and the repository's established style.
- Do not invent abbreviations unless they are widely understood in the project.

## Code Quality

- Follow modern JavaScript and established software-engineering practices.
- Prefer simple solutions over clever or unnecessarily abstract ones.
- Keep functions small, focused, and responsible for one clear behavior.
- Keep modules cohesive and dependencies explicit.
- Minimize coupling and avoid hidden dependencies or global mutable state.
- Remove duplication when doing so improves clarity; do not create premature abstractions.
- Preserve existing APIs, contracts, and behavior unless a change is explicitly requested.
- Do not modify unrelated code.
- Do not leave dead code, debug code, placeholders, or unfinished TODOs.

## Comments and Documentation

- Do not write comments in source code.
- Make code self-explanatory through structure and naming.
- If behavior cannot be understood without a comment, refactor the code instead.
- Use required API documentation only when the project or a public contract explicitly demands it.

## Server Architecture

- Separate transport concerns, business rules, and data access.
- Keep business logic out of route handlers and framework-specific code.
- Keep route handlers small: parse the request, invoke application logic, and produce the response.
- Validate and normalize all external input at application boundaries.
- Keep database and external-service access behind focused modules or repositories.
- Use dependency injection where it improves testability and makes dependencies explicit.
- Centralize error translation and HTTP error handling.
- Use `async` and `await` consistently for asynchronous work.
- Never leave promises unhandled or swallow asynchronous failures.
- Use the module system already selected by the project; do not mix ES Modules and CommonJS.
- Keep configuration outside business logic and load it through a single validated boundary.
- Do not expose internal errors, stack traces, or implementation details to clients.

## API Design

- Keep routes, status codes, payloads, and error formats consistent.
- Use clear request and response schemas.
- Treat API contracts as public behavior and avoid breaking changes unless explicitly approved.
- Make operations idempotent where the contract requires it.
- Keep pagination, filtering, sorting, and validation patterns consistent across endpoints.
- Document externally consumed API changes in the project's established format.

## Error Handling, Logging, and Security

- Handle failures explicitly; never silently ignore exceptions.
- Use centralized and consistent error handling.
- Use structured logging according to the project's established logger.
- Do not use temporary console output in committed production code.
- Never commit secrets, credentials, tokens, private keys, personal data, or environment files.
- Do not log authorization headers, credentials, tokens, personal data, or other sensitive values.
- Validate environment variables at startup and fail clearly when required configuration is missing.
- Validate all untrusted input and use safe database parameterization.
- Apply authentication and authorization checks at the correct boundaries.
- Avoid leaking whether protected resources or accounts exist.
- Use maintained libraries and avoid deprecated or insecure APIs.

## Dependencies

- Prefer the JavaScript standard library and existing project dependencies.
- Do not add a dependency when a small, clear implementation is sufficient.
- Request approval before adding or replacing a significant dependency, package, or framework.
- Prefer maintained, stable packages with clear documentation.
- Commit lockfile changes together with intentional dependency changes.
- Do not change package versions or the lockfile unnecessarily.

## Testing

- Add or update unit and integration tests whenever behavior changes or new behavior is introduced.
- Test observable behavior and contracts, not private implementation details.
- Add integration tests for important HTTP, database, and external-service boundaries when necessary.
- Cover successful paths, relevant failure paths, authorization rules, validation, and important edge cases.
- Keep tests deterministic, independent, concise, and readable.
- Use a consistent Arrange–Act–Assert structure unless the existing suite defines another convention.
- Name tests according to behavior and expected outcome.
- Avoid unnecessary mocking; prefer simple fakes when they make behavior clearer.
- Create fixtures, builders, or test factories for shared test objects when they reduce meaningful duplication.
- Clean up test state and do not depend on test execution order.
- Do not duplicate production logic inside tests.
- Fix the cause of a failing test; do not weaken or remove a valid test merely to make it pass.

## Validation

Before considering work complete:

- Format the changed code.
- Run the relevant lint and static-analysis checks.
- Run relevant unit and integration tests.
- Run the build or startup validation when applicable.
- Report what was validated and clearly state anything that could not be run.

## Version Control

- Do not commit or push unless explicitly asked.
- Do not add co-authors to commits.
- Use extremely short, clear commit messages in Portuguese, following the repository's existing pattern.
- Keep each commit focused on one coherent change.
- Do not use force push, destructive Git commands, history rewriting, or broad rebases without explicit approval.
- Do not include unrelated formatting or refactoring in a commit.

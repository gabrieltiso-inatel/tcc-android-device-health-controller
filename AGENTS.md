# AGENTS.md — JavaScript Web Server

## Purpose

This file defines the shared development rules for this web-server repository. Follow these instructions unless a task explicitly requires otherwise.

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
- Use extremely short, clear, English commit messages describing the change.
- Keep each commit focused on one coherent change.
- Do not use force push, destructive Git commands, history rewriting, or broad rebases without explicit approval.
- Do not include unrelated formatting or refactoring in a commit.

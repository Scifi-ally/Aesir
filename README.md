# Aesir

Aesir is a private Electron desktop workspace for interacting with multiple developer agents, terminal sessions, connectors, mail, GitHub workflows, and the Mimir market-intelligence module. The repository currently contains a React renderer, Electron main and preload processes, and a separately packaged TypeScript backend under `backend/`.

> **Status:** Aesir is under active development. The commands below describe the repository’s current toolchain; they do not imply that every optional integration is configured or that trading functionality is production-ready.

## Repository layout

| Area | Purpose |
| --- | --- |
| `src/main` | Electron main-process services, IPC, agents, vault, connectors, and window lifecycle. |
| `src/preload` | Typed renderer bridge exposed through `window.devhub`. |
| `src/renderer` | React user interface and feature modules. |
| `src/shared` | Types and connector manifests shared by main and renderer processes. |
| `backend/src` | TypeScript backend services, market analysis, persistence, and trading engines. |
| `backend/db` and `backend/drizzle` | Database schema, migrations, and Drizzle configuration. |
| `backend/tests` | Backend unit, regression, integration, and performance tests. |
| `backend/scripts` | Operational, research, database, and reporting scripts that are not production modules. |
| `src/test` | Electron/main-process and renderer test suites. |
| `public` and `icons` | Static UI assets and application icons. |

## Prerequisites

Use a current Node.js release compatible with the versions declared in the lockfiles. The desktop application uses Electron and `electron-vite`; the backend uses TypeScript, esbuild, Vitest, Drizzle, PostgreSQL, and optional market-data integrations. A PostgreSQL instance is required for backend workflows that use the database. Credentials for external providers are optional until the corresponding connector is used.

## Local setup

Install the desktop dependencies from the repository root:

```bash
npm ci
```

Install the backend dependencies separately:

```bash
cd backend
npm ci
```

If npm reports a peer-dependency conflict, do not bypass it with `--force`. Update the lockfile and dependency declarations together, then rerun the clean install. The repository treats a reproducible lockfile installation as a validation requirement.

For backend development, copy the template and fill only the credentials required for the integration under test:

```bash
cp backend/.env.example backend/.env
```

The local `.env`, browser session files, databases, market-data caches, and generated reports are intentionally ignored by Git.

## Development commands

From the repository root:

```bash
npm run dev          # Start the Electron/Vite development environment
npm run typecheck    # Type-check the Electron and renderer sources
npm test             # Run the renderer Vitest suite
npm run validate     # Typecheck, test, and build the desktop application
npm run build        # Build the desktop application bundles
npm audit --audit-level=high # Check desktop dependency advisories
npm run dist         # Build and package for the current platform
```

From `backend/`:

```bash
npm run typecheck    # Type-check backend sources
npm test             # Run the backend Vitest suite
npm run validate     # Typecheck, test, and build the backend
npm run test:all     # Run preflight checks and the full test suite
npm run build        # Bundle backend entry points into backend/dist
npm run audit:runtime # Check runtime-only backend advisories
npm audit --audit-level=high # Check backend dependency advisories
```

Commands that access brokers, market data, PostgreSQL, Redis, or external AI services require their respective local configuration and should be run only against the intended environment. The backend runtime has no high-severity advisories; the remaining moderate findings are development-only and originate upstream in Drizzle Kit's legacy esbuild loader.

## Architecture notes

The Electron main process owns privileged operations, credential access, filesystem interactions, external connectors, and child-process orchestration. The preload process exposes a deliberately scoped bridge to the renderer. Renderer modules should communicate through that bridge rather than importing Node.js APIs. Connector credentials are stored through the OS-backed vault flow and should never be placed in source files, screenshots, fixtures, or local-storage values.

The backend is intentionally separate from the Electron bundle. Its build entry points are declared in `backend/build.mjs`, and its database schema is maintained through Drizzle migrations. Production modules live under `backend/src`; tests live under `backend/tests`; and operational scripts live under `backend/scripts`. Market-data caches and local databases are runtime state, not source artifacts, and must be generated in the developer’s environment.

## Validation expectations

A change is ready for review only when the relevant typecheck and test commands pass, generated output is not included in the change, and the working tree contains no credentials or session material. UI changes should be checked at keyboard-only navigation widths as well as the default desktop viewport. Changes to connector or vault behavior should include a focused regression test.

## Security

Never commit API keys, access tokens, browser cookies, TOTP seeds, PINs, database passwords, or provider session files. If a secret has ever been committed, treat it as exposed: revoke or rotate it with the provider and remove the artifact from repository history. See [`SECURITY.md`](SECURITY.md) for reporting and response guidance.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a change. Commit messages should describe a real, reviewable change. Do not create placeholder commits, rewrite timestamps to simulate past work, or pad history to reach a target count. A clean history is more valuable than an artificial number of commits.

## License

The package is marked `UNLICENSED` and `private` in `package.json`. Do not redistribute builds or source without the project owner’s authorization.

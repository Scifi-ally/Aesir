# Contributing to Aesir

Aesir is maintained as a private application with desktop, backend, and integration boundaries. Contributions should be narrow, testable, and explicit about any required local services or credentials.

## Before changing code

Read the relevant module and its tests first. Confirm that the working tree is clean, create a focused branch, and avoid copying runtime state into the repository. Local databases, browser sessions, credentials, caches, generated lint reports, and scratch scripts are not source material.

## Development workflow

Install dependencies with `npm ci` at the repository root and in `backend/`. Run the smallest relevant typecheck or test command while iterating, then run the complete validation set before review. If a test needs PostgreSQL, Redis, a broker sandbox, or an external provider, document the prerequisite and keep the default test path deterministic.

For renderer changes, preserve the main/preload/renderer boundary and use the typed `window.devhub` bridge for privileged operations. For connector changes, keep credentials out of renderer state and verify that errors are redacted before they reach logs or user-facing messages. For backend changes, preserve schema migration ordering and add regression coverage for changes to risk, order, or market-data behavior.

## Commit standards

Each commit must represent a real, reviewable change. Use an imperative subject with a clear scope, such as `fix(vault): redact provider errors`. Separate repository hygiene, implementation, tests, and documentation when that separation makes review easier. Never create empty or cosmetic commits solely to inflate the history, and never backdate commit timestamps to imply that work occurred earlier than it did.

## Review checklist

| Area | Review question |
| --- | --- |
| Correctness | Does the change solve a specific observed problem, and are edge cases covered? |
| Security | Are credentials, cookies, tokens, and sensitive error details protected? |
| Compatibility | Does the change preserve the Electron IPC contract and backend API expectations? |
| Validation | Do typechecks, tests, and builds pass for the affected packages? |
| Operations | Are new environment variables, migrations, or external services documented? |
| Repository hygiene | Are generated files and local runtime state excluded from the commit? |

## Pull requests

Describe the problem, the implementation, the validation commands and outcomes, and any remaining limitations. Include screenshots only when they contain no secrets or personal information. Keep the pull request focused enough that a reviewer can understand its complete impact without reconstructing unrelated work.

# Security Policy

## Scope

This policy covers the Aesir desktop application, its Electron main/preload boundary, the optional backend services, connector integrations, and repository artifacts.

## Never commit secrets

Do not commit API keys, OAuth tokens, passwords, PINs, TOTP seeds, browser cookies, provider session files, private keys, database exports, or logs containing sensitive request headers. Store local configuration in `backend/.env` and provider credentials through the application vault where supported. The repository includes ignore rules and `backend/.env.example` to make this separation explicit.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or exposed credential. Report it privately to the repository owner through the project’s configured private channel, including the affected component, a concise reproduction, impact, and a safe way to contact you. Do not include live secrets in the report.

## Exposed-credential response

If a credential or session artifact is committed or disclosed, treat it as compromised immediately. Revoke or rotate it with the provider, invalidate active sessions, remove the artifact from the working tree and all reachable repository history, and review logs and CI artifacts for copies. Removing a file from the latest commit is not sufficient when the value remains in an earlier commit.

## Secure development expectations

| Boundary | Requirement |
| --- | --- |
| Electron main process | Keep privileged APIs and credential access in the main process. |
| Preload bridge | Expose only the typed operations required by the renderer. |
| Renderer | Never store provider secrets in local storage, UI state, or user-facing error text. |
| Backend | Redact authorization headers, cookies, tokens, and connection strings in logs. |
| Data | Keep caches, local databases, exports, and session state outside version control. |
| Releases | Run typecheck, tests, dependency audit, and secret scanning before packaging. |

## Dependency and build hygiene

Use the lockfiles with `npm ci`, investigate peer-dependency conflicts instead of forcing installation, and review dependency-audit findings before release. Build output belongs in ignored directories and should not be used as a substitute for source-level review.

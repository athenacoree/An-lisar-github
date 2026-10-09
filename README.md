# 🛡️ PR-Guard

[![Deploy to Render](https://render.com/images/deploy-to-render.svg)](https://render.com/deploy?repo=https://github.com/your-username/pr-guard)

**PR-Guard** is a lightweight, 100% deterministic GitHub App & PR Review bot. It automatically analyzes Pull Requests using explicit static rules without any AI/LLM overhead, costs, or hallucinations.

---

## ⚡ Analysis Rules

PR-Guard performs deterministic static analysis on Pull Request diffs and repository configurations:

### 🔴 Critical Security & Integrity Rules
- **Phantom Package Detection (`phantom-package`):** Extracts newly imported packages/requires from diffs and verifies existence against registries (`npm`, `PyPI`, `crates.io`). Flags non-existent packages as **Critical Errors** to prevent supply-chain typo-squatting attacks.
- **Unconfigured Database (`database-not-configured`):** Detects usage of database clients (Prisma, Drizzle, Sequelize, TypeORM, Mongoose, Knex, SQLAlchemy, Django ORM, etc.) or database queries/env vars without database configuration files (`.env`, `.env.example`, `prisma/schema.prisma`, `config/database.*`) in the repository.
- **Missing Table or Column (`db-missing-table-column`):** Parses database schemas (`prisma/schema.prisma`, SQL migrations/schemas) and verifies that queries and ORM calls reference existing tables and columns. Flags typos and casing mismatches with helpful suggestions.
- **Missing DB Migration (`missing-db-migration`):** Flags PRs that modify database models or schema files without including a corresponding migration file in the PR diff.
- **SQL Injection Vulnerability (`sql-injection`):** Detects SQL query strings built with dynamic string concatenation or template literal variable interpolation without parameterized query placeholders (`?`, `$1`, `:param`).
- **Broken Foreign Key / Relation (`broken-foreign-key`):** Verifies that relation accessors and ORM `include` clauses reference relations actually defined in the database schema.

### ⚠️ Warning Rules
- **Unresolved Placeholders (`placeholder`):** Scans added diff lines for leftover markers (`TODO`, `CHANGEME`, `FIXME`, `XXX`, `test@test.com`, `example@example.com`).
- **Inconsistent Data Type Usage (`inconsistent-data-type`):** Detects comparisons or condition checks where code treats a schema field with an incompatible data type (e.g. comparing a `String` column to an unquoted number, or an `Int` column to a non-numeric string).
- **Missing Environment Variable (`missing-env-var`):** Extracts environment variables accessed in code (`process.env.X`, `import.meta.env.X`, `os.environ.get('X')`, etc.) and flags those missing from `.env.example` or repository configuration files.

---

## 🚀 Architecture Overview

1. **Lightweight Backend (Render Free Tier):** Receives GitHub App webhooks, verifies signatures, triggers user workflows via `workflow_dispatch`, handles fork PRs gracefully, and posts comments back to PRs.
2. **GitHub Actions Workflow (`.github/workflows/pr-guard.yml`):** Runs the heavy lifting inside the user's repository runner.
3. **Zero Repository Code Retention:** Backend processes webhooks and results ephemerally and retains zero repository files or code logs.

---

## 🛠️ GitHub App Setup & Permissions

When creating your GitHub App in GitHub Developer Settings, configure the following permissions:

| Permission Name | Access Level | Reason |
| :--- | :--- | :--- |
| **Pull requests** | Read & Write | Receive PR webhooks and post review comments |
| **Contents** | Read | Read PR commit SHA and metadata |
| **Actions** | Read & Write | Trigger `workflow_dispatch` analysis workflows |

### Required Webhook Events:
- `Pull request` (`opened`, `synchronize`, `reopened`)

---

## ⚙️ Environment Variables (Backend)

| Variable | Description |
| :--- | :--- |
| `PORT` | HTTP Port (Default: `3000`) |
| `GITHUB_APP_ID` | Your GitHub App ID |
| `GITHUB_PRIVATE_KEY` | Your GitHub App Private Key (`.pem` contents) |
| `GITHUB_WEBHOOK_SECRET` | Secret key configured in GitHub App webhooks |
| `BACKEND_CALLBACK_URL` | Public endpoint URL for workflow results (e.g., `https://your-app.onrender.com/api/results`) |

---

## 📦 User Installation Guide

1. Deploy the backend to Render using the **Deploy to Render** button above.
2. Create and install your **GitHub App** on target repositories.
3. Add `.github/workflows/pr-guard.yml` to the repository.
4. Set webhook target URL in GitHub App settings to `https://your-render-app.onrender.com/webhook`.
5. Open or update any Pull Request! PR-Guard will automatically run analysis and comment with findings.

---

## 🧪 Local Development & Testing

```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Build TypeScript
npm run build

# Start local server
npm start
```

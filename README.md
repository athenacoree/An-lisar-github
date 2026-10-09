# 🛡️ PR-Guard

[![Deploy to Render](https://render.com/images/deploy-to-render.svg)](https://render.com/deploy?repo=https://github.com/your-username/pr-guard)

**PR-Guard** is a lightweight, 100% deterministic GitHub App & PR Review bot. It automatically analyzes Pull Requests using explicit static rules without any AI/LLM overhead or cost.

---

## ⚡ Features (MVP)

- 🔴 **Phantom Package Detection:** Extracts newly imported packages/requires from diffs and verifies existence against registries (`npm`, `PyPI`, `crates.io`). Flags non-existent packages as **Critical Errors** to prevent supply-chain typo-squatting attacks.
- ⚠️ **Unresolved Placeholder Scanning:** Scans added diff lines for leftover markers (`TODO`, `CHANGEME`, `FIXME`, `XXX`, `test@test.com`). Flags them as **Warnings**.
- 💬 **Automated PR Markdown Comments:** Formats results in a structured markdown comment with status badges, line links, and clear severities.
- 🧹 **Zero Repository Code Retention:** Backend processes webhooks and results ephemerally and retains zero repository files.

---

## 🚀 Architecture Overview

1. **Lightweight Backend (Render Free Tier):** Receives GitHub App webhooks, verifies signatures, triggers user workflows via `workflow_dispatch`, and posts comments back to PRs.
2. **GitHub Actions Workflow (`.github/workflows/pr-guard.yml`):** Runs the heavy lifting inside the user's repository runner.
3. **GitHub App:** Configured with minimum required permissions.

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

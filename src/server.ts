import express from 'express';
import dotenv from 'dotenv';
import { verifyWebhookSignature } from './webhooks';
import { triggerWorkflowDispatch } from './github';
import { handleAnalysisResults } from './comments';

dotenv.config();

export const app = express();

app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'pr-guard-backend' });
});

// GitHub Webhook Endpoint
app.post('/webhook', async (req, res) => {
  const event = req.headers['x-github-event'] as string;
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || '';

  if (webhookSecret && !verifyWebhookSignature(req, webhookSecret)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  if (event === 'ping') {
    return res.status(200).json({ msg: 'pong' });
  }

  if (event === 'pull_request') {
    const action = req.body.action;
    // Process when PR is opened, updated (synchronize), or reopened
    if (['opened', 'synchronize', 'reopened'].includes(action)) {
      const prNumber = req.body.number;
      const repository = req.body.repository;
      const owner = repository.owner.login;
      const repo = repository.name;
      const headSha = req.body.pull_request.head.sha;
      const installationId = req.body.installation?.id;
      const isFork = req.body.pull_request?.head?.repo?.fork === true ||
                     (req.body.pull_request?.head?.repo?.full_name && req.body.pull_request.head.repo.full_name !== repository.full_name);

      try {
        console.log(`Received PR #${prNumber} on ${owner}/${repo} (Action: ${action}, Fork: ${isFork}). Triggering workflow_dispatch...`);

        await triggerWorkflowDispatch({
          owner,
          repo,
          prNumber,
          commitSha: headSha,
          installationId
        });

        return res.status(202).json({
          message: 'Workflow dispatch triggered successfully',
          owner,
          repo,
          prNumber,
          isFork
        });
      } catch (err: any) {
        console.error('Failed to trigger workflow dispatch:', err.message);
        return res.status(200).json({
          message: 'Webhook received, but workflow dispatch could not be completed (e.g. fork PR or permission restricted)',
          details: err.message,
          isFork
        });
      }
    }
  }

  return res.status(200).json({ message: 'Event ignored' });
});

// Callback API for GitHub Actions workflow to report results
app.post('/api/results', async (req, res) => {
  const { owner, repo, prNumber, installationId, results, diffText } = req.body;

  if (!owner || !repo || !prNumber) {
    return res.status(400).json({ error: 'Missing required parameters: owner, repo, prNumber' });
  }

  try {
    await handleAnalysisResults({
      owner,
      repo,
      prNumber,
      installationId,
      results,
      diffText
    });

    return res.status(200).json({ message: 'PR comment updated successfully' });
  } catch (err: any) {
    console.error('Failed to handle analysis results:', err.message);
    return res.status(500).json({ error: 'Failed to post PR comment', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`PR-Guard backend server running on port ${PORT}`);
  });
}

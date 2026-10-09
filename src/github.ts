import axios from 'axios';

export interface DispatchParams {
  owner: string;
  repo: string;
  prNumber: number;
  commitSha: string;
  installationId?: number;
}

export async function getAuthHeader(installationId?: number): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    return `Bearer ${token}`;
  }

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (appId && privateKey && installationId) {
    try {
      // Dynamic import to support ESM-only @octokit/auth-app seamlessly
      const { createAppAuth } = await (Function('return import("@octokit/auth-app")')() as Promise<typeof import('@octokit/auth-app')>);
      const auth = createAppAuth({
        appId,
        privateKey,
        installationId,
      });
      const installationAuth = await auth({ type: 'installation' });
      return `Bearer ${installationAuth.token}`;
    } catch (err: any) {
      console.warn('Failed to authenticate as GitHub App, falling back to empty header:', err.message);
    }
  }

  return '';
}

export async function triggerWorkflowDispatch(params: DispatchParams): Promise<void> {
  const { owner, repo, prNumber, commitSha, installationId } = params;
  const authHeader = await getAuthHeader(installationId);

  const workflowId = process.env.GITHUB_WORKFLOW_FILE || 'pr-guard.yml';
  const callbackUrl = process.env.BACKEND_CALLBACK_URL || 'https://pr-guard.onrender.com/api/results';

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'PR-Guard-Backend/1.0',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

  try {
    await axios.post(
      url,
      {
        ref: commitSha,
        inputs: {
          pr_number: String(prNumber),
          commit_sha: commitSha,
          callback_url: callbackUrl,
          installation_id: installationId ? String(installationId) : ''
        }
      },
      { headers }
    );
    console.log(`Successfully dispatched workflow ${workflowId} for ${owner}/${repo} PR #${prNumber}`);
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message;
    console.error(`Error dispatching workflow to ${owner}/${repo}:`, errorMsg);
    throw new Error(`GitHub API error: ${errorMsg}`);
  }
}

import axios from 'axios';
import { AnalysisResult } from './checker/types';
import { runAnalysis } from './checker';
import { getAuthHeader } from './github';

export interface AnalysisResultsParams {
  owner: string;
  repo: string;
  prNumber: number;
  installationId?: number;
  results?: AnalysisResult;
  diffText?: string;
  commitSha?: string;
}

const COMMENT_HEADER_IDENTIFIER = '<!-- PR-GUARD-ANALYSIS-COMMENT -->';

export function formatPRComment(results: AnalysisResult, owner: string, repo: string, commitSha?: string): string {
  const { criticalCount, warningCount, passed } = results.summary;

  const statusBadge = passed
    ? '![Status](https://img.shields.io/badge/PR--Guard-PASSED-brightgreen)'
    : '![Status](https://img.shields.io/badge/PR--Guard-FAILED-red)';

  let markdown = `${COMMENT_HEADER_IDENTIFIER}\n\n`;
  markdown += `## 🛡️ PR-Guard Analysis Results ${statusBadge}\n\n`;
  markdown += `> **Automated Deterministic Review** (0% AI/LLM)\n\n`;

  markdown += `### Summary\n`;
  markdown += `- 🔴 **Critical Issues:** ${criticalCount}\n`;
  markdown += `- ⚠️ **Warnings:** ${warningCount}\n\n`;

  if (results.issues.length === 0) {
    markdown += `✅ **No issues detected!** All deterministic checks passed successfully.\n`;
    return markdown;
  }

  markdown += `### Detailed Findings\n\n`;
  markdown += `| Severity | Rule | File / Location | Description |\n`;
  markdown += `| :---: | :--- | :--- | :--- |\n`;

  for (const issue of results.issues) {
    const icon = issue.severity === 'critical' ? '🔴 **CRITICAL**' : '⚠️ **WARNING**';

    let locationStr = '`N/A`';
    if (issue.file) {
      if (issue.line) {
        locationStr = `[\`${issue.file}:${issue.line}\`](https://github.com/${owner}/${repo}/blob/${commitSha || 'HEAD'}/${issue.file}#L${issue.line})`;
      } else {
        locationStr = `\`${issue.file}\``;
      }
    }

    markdown += `| ${icon} | \`${issue.rule}\` | ${locationStr} | ${issue.message} |\n`;
  }

  return markdown;
}

export async function postOrUpdatePRComment(
  owner: string,
  repo: string,
  prNumber: number,
  commentBody: string,
  installationId?: number
): Promise<void> {
  const authHeader = await getAuthHeader(installationId);
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'PR-Guard-Backend/1.0',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const listUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;

  try {
    const listRes = await axios.get(listUrl, { headers });
    const existingComment = (listRes.data || []).find((c: any) =>
      c.body && c.body.includes(COMMENT_HEADER_IDENTIFIER)
    );

    if (existingComment) {
      const updateUrl = `https://api.github.com/repos/${owner}/${repo}/issues/comments/${existingComment.id}`;
      await axios.patch(updateUrl, { body: commentBody }, { headers });
      console.log(`Updated existing PR-Guard comment ${existingComment.id} on ${owner}/${repo} PR #${prNumber}`);
    } else {
      await axios.post(listUrl, { body: commentBody }, { headers });
      console.log(`Created new PR-Guard comment on ${owner}/${repo} PR #${prNumber}`);
    }
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message;
    console.error(`Error posting comment to ${owner}/${repo} PR #${prNumber}:`, errorMsg);
    throw new Error(`GitHub API error: ${errorMsg}`);
  }
}

export async function handleAnalysisResults(params: AnalysisResultsParams): Promise<void> {
  const { owner, repo, prNumber, installationId, diffText, commitSha } = params;
  let results = params.results;

  if (!results && diffText) {
    results = await runAnalysis(diffText);
  }

  if (!results) {
    throw new Error('Neither results nor diffText was provided');
  }

  const commentMarkdown = formatPRComment(results, owner, repo, commitSha);
  await postOrUpdatePRComment(owner, repo, prNumber, commentMarkdown, installationId);
}

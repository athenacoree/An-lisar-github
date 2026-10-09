import { Issue, AnalysisResult } from './types';
import { checkPlaceholders } from './placeholders';
import { checkPhantomPackages } from './phantom';

export async function runAnalysis(diffText: string): Promise<AnalysisResult> {
  const placeholderIssues = checkPlaceholders(diffText);
  const phantomIssues = await checkPhantomPackages(diffText);

  const issues: Issue[] = [...phantomIssues, ...placeholderIssues];

  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return {
    summary: {
      criticalCount,
      warningCount,
      passed: criticalCount === 0
    },
    issues
  };
}

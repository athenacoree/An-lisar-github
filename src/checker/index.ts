import { Issue, AnalysisResult } from './types';
import { parseDiffAddedLines, checkPlaceholders } from './placeholders';
import { checkPhantomPackages } from './phantom';
import { checkDatabaseConfig } from './dbConfig';
import { checkMissingTableColumn } from './dbTableColumn';
import { checkMissingMigration } from './dbMigration';
import { checkSqlInjection } from './sqlInjection';
import { checkBrokenForeignKey } from './foreignKey';
import { checkInconsistentDataType } from './dataType';
import { checkMissingEnvVars } from './envVars';

export async function runAnalysis(diffText: string, repoPath: string = process.cwd()): Promise<AnalysisResult> {
  const addedLines = parseDiffAddedLines(diffText);

  const placeholderIssues = checkPlaceholders(diffText);
  const phantomIssues = await checkPhantomPackages(diffText);
  const dbConfigIssues = checkDatabaseConfig(addedLines, repoPath);
  const dbTableColumnIssues = checkMissingTableColumn(addedLines, repoPath);
  const dbMigrationIssues = checkMissingMigration(addedLines);
  const sqlInjectionIssues = checkSqlInjection(addedLines);
  const brokenFkIssues = checkBrokenForeignKey(addedLines, repoPath);
  const dataTypeIssues = checkInconsistentDataType(addedLines, repoPath);
  const envVarIssues = checkMissingEnvVars(addedLines, repoPath);

  const issues: Issue[] = [
    ...phantomIssues,
    ...placeholderIssues,
    ...dbConfigIssues,
    ...dbTableColumnIssues,
    ...dbMigrationIssues,
    ...sqlInjectionIssues,
    ...brokenFkIssues,
    ...dataTypeIssues,
    ...envVarIssues
  ];

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

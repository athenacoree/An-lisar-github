import { Issue } from './types';
import { DiffLine } from './placeholders';

const SCHEMA_MODEL_PATTERNS = [
  /prisma\/schema\.prisma$/i,
  /\.prisma$/i,
  /models\/[^\/]+\.(ts|js|py|java|cs|rb|go|php)$/i,
  /entities\/[^\/]+\.(ts|js|py|java|cs|rb|go|php)$/i,
  /schema\.sql$/i,
  /models\.py$/i
];

function isMigrationFile(filePath: string): boolean {
  return /migrations\//i.test(filePath) ||
         /prisma\/migrations\//i.test(filePath) ||
         /db\/migrate\//i.test(filePath);
}

export function checkMissingMigration(addedLines: DiffLine[]): Issue[] {
  const issues: Issue[] = [];

  const touchedFiles = new Set<string>();
  let hasMigrationFileInDiff = false;

  for (const { file } of addedLines) {
    touchedFiles.add(file);
    if (isMigrationFile(file)) {
      hasMigrationFileInDiff = true;
    }
  }

  if (hasMigrationFileInDiff) {
    return issues; // Migration exists in PR diff
  }

  for (const file of touchedFiles) {
    const isSchemaOrModel = SCHEMA_MODEL_PATTERNS.some(p => p.test(file));
    if (isSchemaOrModel) {
      // Find representative line
      const lineObj = addedLines.find(l => l.file === file);
      const lineNum = lineObj ? lineObj.line : 1;
      const snippet = lineObj ? lineObj.content.trim() : '';

      issues.push({
        rule: 'missing-db-migration',
        severity: 'critical',
        message: `El modelo '${file}' cambió pero no hay migración. Database model/schema file '${file}' was modified, but no migration file was found in the PR diff.`,
        file,
        line: lineNum,
        snippet
      });
    }
  }

  return issues;
}

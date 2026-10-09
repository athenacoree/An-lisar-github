import { Issue } from './types';
import { DiffLine } from './placeholders';
import { getSchemaInfo, SchemaInfo, TableInfo } from './dbSchema';

function findClosestMatch(target: string, candidates: string[]): string | null {
  const targetLower = target.toLowerCase();
  for (const candidate of candidates) {
    const candLower = candidate.toLowerCase();
    // Singular/plural check e.g. user vs users
    if (targetLower === candLower + 's' || candLower === targetLower + 's') {
      return candidate;
    }
    // Case mismatch check
    if (targetLower === candLower) {
      return candidate;
    }
  }

  // Levenshtein distance <= 2
  for (const candidate of candidates) {
    if (levenshteinDistance(targetLower, candidate.toLowerCase()) <= 2) {
      return candidate;
    }
  }

  return null;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function checkMissingTableColumn(addedLines: DiffLine[], repoPath: string = process.cwd(), schemaInput?: SchemaInfo): Issue[] {
  const issues: Issue[] = [];
  const schema = schemaInput || getSchemaInfo(repoPath, addedLines);

  if (schema.tables.size === 0) {
    return issues; // No schema defined in repo, skip schema checks
  }

  const schemaTableNames = Array.from(schema.tables.values()).map(t => t.name);
  const schemaTableDbNames = Array.from(schema.tables.values()).map(t => t.dbName);
  const allKnownTableNames = Array.from(new Set([...schemaTableNames, ...schemaTableDbNames]));

  for (const { file, line, content } of addedLines) {
    if (/\.(sql|js|jsx|ts|tsx|py|rb|php)$/.test(file)) {
      // 1. Check SQL table references e.g. FROM table, INTO table, UPDATE table, JOIN table
      const sqlTableRegex = /\b(?:FROM|INSERT\s+INTO|UPDATE|JOIN)\s+["`]?([A-Za-z0-9_]+)["`]?/gi;
      let match;
      while ((match = sqlTableRegex.exec(content)) !== null) {
        const rawTable = match[1];
        if (['SELECT', 'WHERE', 'SET', 'VALUES'].includes(rawTable.toUpperCase())) continue;

        const tableLower = rawTable.toLowerCase();
        let matchedTable: TableInfo | undefined = schema.tables.get(tableLower);

        if (!matchedTable) {
          // Find by dbName
          for (const t of schema.tables.values()) {
            if (t.dbName.toLowerCase() === tableLower) {
              matchedTable = t;
              break;
            }
          }
        }

        if (!matchedTable) {
          const suggestion = findClosestMatch(rawTable, allKnownTableNames);
          const suggestionMsg = suggestion ? ` Did you mean '${suggestion}'?` : '';
          issues.push({
            rule: 'db-missing-table-column',
            severity: 'critical',
            message: `Table '${rawTable}' referenced in query does not exist in database schema.${suggestionMsg}`,
            file,
            line,
            snippet: content.trim()
          });
        } else {
          // Check columns in SELECT queries e.g. SELECT col1, col2 FROM table
          const selectColRegex = /\bSELECT\s+([A-Za-z0-9_,\s]+)\s+FROM\b/i;
          const selectMatch = content.match(selectColRegex);
          if (selectMatch) {
            const colsStr = selectMatch[1].trim();
            if (colsStr !== '*') {
              const cols = colsStr.split(',').map(c => c.trim().split(/\s+/)[0].replace(/["`]/g, ''));
              for (const col of cols) {
                if (col && col !== '*' && !/^\d+$/.test(col) && !col.toUpperCase().includes('COUNT') && !col.toUpperCase().includes('SUM')) {
                  const colLower = col.toLowerCase();
                  if (!matchedTable.columns.has(colLower)) {
                    issues.push({
                      rule: 'db-missing-table-column',
                      severity: 'critical',
                      message: `Column '${col}' referenced in SELECT query does not exist on table '${matchedTable.name}' in schema.`,
                      file,
                      line,
                      snippet: content.trim()
                    });
                  }
                }
              }
            }
          }
        }
      }

      // 2. Check Prisma / ORM calls e.g. prisma.user.findMany or db.user.findMany
      const ormMatch = content.match(/\b(?:prisma|db)\.([A-Za-z0-9_]+)\.(?:findMany|findUnique|findFirst|create|update|delete|upsert|aggregate|groupBy)\b/);
      if (ormMatch) {
        const rawModel = ormMatch[1];
        const modelLower = rawModel.toLowerCase();
        const matchedTable = schema.tables.get(modelLower);

        if (!matchedTable) {
          const suggestion = findClosestMatch(rawModel, allKnownTableNames);
          const suggestionMsg = suggestion ? ` Did you mean '${suggestion}'?` : '';
          issues.push({
            rule: 'db-missing-table-column',
            severity: 'critical',
            message: `Model/Table '${rawModel}' referenced in ORM call does not exist in schema.${suggestionMsg}`,
            file,
            line,
            snippet: content.trim()
          });
        }
      }
    }
  }

  return issues;
}

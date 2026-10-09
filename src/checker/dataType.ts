import { Issue } from './types';
import { DiffLine } from './placeholders';
import { getSchemaInfo, SchemaInfo } from './dbSchema';

export function checkInconsistentDataType(addedLines: DiffLine[], repoPath: string = process.cwd(), schemaInput?: SchemaInfo): Issue[] {
  const issues: Issue[] = [];
  const schema = schemaInput || getSchemaInfo(repoPath, addedLines);

  if (schema.tables.size === 0) {
    return issues;
  }

  for (const { file, line, content } of addedLines) {
    if (!/\.(js|jsx|ts|tsx|py|rb|php|sql)$/.test(file)) continue;

    for (const tableInfo of schema.tables.values()) {
      for (const [colLower, colInfo] of tableInfo.columns) {
        const colName = colInfo.name;
        const colType = colInfo.type.toUpperCase();

        // 1. String column compared directly to unquoted number e.g. email > 100 or email == 123
        if (['STRING', 'VARCHAR', 'TEXT', 'CHAR'].includes(colType)) {
          const numCompRegex = new RegExp(`\\b${colName}\\b\\s*(?:===|==|>|<|>=|<=|=|!=|!==)\\s*([0-9]+)\\b`, 'i');
          const match = content.match(numCompRegex);
          if (match && !/["']/.test(match[0])) {
            issues.push({
              rule: 'inconsistent-data-type',
              severity: 'warning',
              message: `Inconsistent data type usage: field '${colName}' is defined as ${colInfo.type} in schema, but treated as number (${match[1]}) in code.`,
              file,
              line,
              snippet: content.trim()
            });
          }
        }

        // 2. Int/Number column compared to non-numeric string literal e.g. age === "eighteen" or age = 'abc'
        if (['INT', 'INTEGER', 'BIGINT', 'FLOAT', 'DECIMAL', 'NUMBER'].includes(colType)) {
          const strCompRegex = new RegExp(`\\b${colName}\\b\\s*(?:===|==|>|<|>=|<=|=|!=|!==)\\s*["']([^"']+)["']`, 'i');
          const match = content.match(strCompRegex);
          if (match) {
            const val = match[1];
            if (isNaN(Number(val))) {
              issues.push({
                rule: 'inconsistent-data-type',
                severity: 'warning',
                message: `Inconsistent data type usage: field '${colName}' is defined as ${colInfo.type} in schema, but compared with non-numeric string ('${val}') in code.`,
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

  return issues;
}

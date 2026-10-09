import { Issue } from './types';
import { DiffLine } from './placeholders';

const SQL_KEYWORDS_REGEX = /\b(SELECT\b[\s\S]+\bFROM|INSERT\s+INTO|UPDATE\b[\s\S]+\bSET|DELETE\s+FROM)\b/i;

export function checkSqlInjection(addedLines: DiffLine[]): Issue[] {
  const issues: Issue[] = [];

  for (const { file, line, content } of addedLines) {
    if (!/\.(js|jsx|ts|tsx|py|rb|php|java|go|cs)$/.test(file)) {
      continue;
    }

    if (SQL_KEYWORDS_REGEX.test(content)) {
      // 1. Template literal string interpolation e.g., `SELECT * FROM users WHERE id = ${id}`
      const hasTemplateInterpolation = /`[\s\S]*?\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*?\$\{[^}]+\}[\s\S]*?`/i.test(content) ||
                                       /f["'][\s\S]*?\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*?\{[^}]+\}[\s\S]*?["']/i.test(content);

      // 2. String concatenation e.g., "SELECT * FROM users WHERE id = " + id or 'SELECT ... ' + id
      const hasStringConcat = /(["']\s*\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*?["']\s*\+\s*|\+\s*["'][\s\S]*?\b(WHERE|SET|AND|OR)\b[\s\S]*?["'])/i.test(content) ||
                              /["']\s*\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[\s\S]*?["']\s*\.\s*/i.test(content); // PHP concat .

      if (hasTemplateInterpolation || hasStringConcat) {
        issues.push({
          rule: 'sql-injection',
          severity: 'critical',
          message: 'Potential SQL Injection vulnerability: SQL query constructed using string concatenation or template literal interpolation without parameterized queries.',
          file,
          line,
          snippet: content.trim()
        });
      }
    }
  }

  return issues;
}

import { parseDiffAddedLines } from '../src/checker/placeholders';
import { checkSqlInjection } from '../src/checker/sqlInjection';

describe('Rule: QUERY SIN PARÁMETROS (SQL INJECTION BÁSICO)', () => {
  test('detects template literal interpolation in SQL query', () => {
    const diff = `
+++ b/src/users.ts
@@ -1,0 +1,2 @@
+const query = \`SELECT * FROM users WHERE id = \${userId}\`;
`;
    const lines = parseDiffAddedLines(diff);
    const issues = checkSqlInjection(lines);
    expect(issues.length).toBe(1);
    expect(issues[0].rule).toBe('sql-injection');
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].message).toContain('Potential SQL Injection vulnerability');
  });

  test('detects string concatenation in SQL query', () => {
    const diff = `
+++ b/src/users.ts
@@ -1,0 +1,2 @@
+const query = "SELECT * FROM users WHERE name = '" + userName + "'";
`;
    const lines = parseDiffAddedLines(diff);
    const issues = checkSqlInjection(lines);
    expect(issues.length).toBe(1);
    expect(issues[0].rule).toBe('sql-injection');
    expect(issues[0].severity).toBe('critical');
  });

  test('passes for parameterized queries with ? or $1 placeholders', () => {
    const diff = `
+++ b/src/users.ts
@@ -1,0 +1,2 @@
+const query = "SELECT * FROM users WHERE id = $1";
+const res = await db.query(query, [userId]);
`;
    const lines = parseDiffAddedLines(diff);
    const issues = checkSqlInjection(lines);
    expect(issues.length).toBe(0);
  });
});

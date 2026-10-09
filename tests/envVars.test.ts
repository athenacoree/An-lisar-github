import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseDiffAddedLines } from '../src/checker/placeholders';
import { checkMissingEnvVars } from '../src/checker/envVars';

describe('Rule: VARIABLE DE ENTORNO FALTANTE', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-guard-env-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('detects missing environment variable in process.env', () => {
    const diff = `
+++ b/src/service.ts
@@ -1,0 +1,2 @@
+const apiKey = process.env.STRIPE_SECRET_KEY;
`;
    const lines = parseDiffAddedLines(diff);
    const issues = checkMissingEnvVars(lines, tempDir);
    expect(issues.length).toBe(1);
    expect(issues[0].rule).toBe('missing-env-var');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain("STRIPE_SECRET_KEY");
  });

  test('passes when environment variable is defined in .env.example', () => {
    fs.writeFileSync(path.join(tempDir, '.env.example'), 'STRIPE_SECRET_KEY=sk_test_123\n');
    const diff = `
+++ b/src/service.ts
@@ -1,0 +1,2 @@
+const apiKey = process.env.STRIPE_SECRET_KEY;
`;
    const lines = parseDiffAddedLines(diff);
    const issues = checkMissingEnvVars(lines, tempDir);
    expect(issues.length).toBe(0);
  });

  test('ignores standard built-in env vars like NODE_ENV and PORT', () => {
    const diff = `
+++ b/src/index.ts
@@ -1,0 +1,3 @@
+const env = process.env.NODE_ENV;
+const port = process.env.PORT;
`;
    const lines = parseDiffAddedLines(diff);
    const issues = checkMissingEnvVars(lines, tempDir);
    expect(issues.length).toBe(0);
  });
});

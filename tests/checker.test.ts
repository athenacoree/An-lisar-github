import { checkPlaceholders, parseDiffAddedLines } from '../src/checker/placeholders';
import { extractPackagesFromDiff, verifyPackageExists } from '../src/checker/phantom';
import { runAnalysis } from '../src/checker';

describe('Diff Parser & Checker Logic', () => {
  const sampleDiff = `
diff --git a/src/app.ts b/src/app.ts
index 1234567..89abcdef 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,3 +10,6 @@
+import axios from 'axios';
+import nonExistentPackage12345XYZ from 'non-existent-package-12345xyz';
+// TODO: Remember to clean up test user
+const email = "test@test.com";
`;

  test('parseDiffAddedLines correctly extracts added lines with file and line numbers', () => {
    const lines = parseDiffAddedLines(sampleDiff);
    expect(lines.length).toBe(4);
    expect(lines[0]).toEqual({
      file: 'src/app.ts',
      line: 10,
      content: "import axios from 'axios';"
    });
    expect(lines[2].content).toContain('TODO: Remember to clean up test user');
  });

  test('checkPlaceholders detects TODO and test@test.com', () => {
    const issues = checkPlaceholders(sampleDiff);
    expect(issues.length).toBe(2);
    expect(issues[0].rule).toBe('placeholder');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('TODO');
    expect(issues[1].message).toContain('test@test.com');
  });

  test('extractPackagesFromDiff identifies imports correctly', () => {
    const packages = extractPackagesFromDiff(sampleDiff);
    expect(packages.length).toBe(2);
    expect(packages[0].name).toBe('axios');
    expect(packages[1].name).toBe('non-existent-package-12345xyz');
  });

  test('verifyPackageExists returns false for non-existent npm package', async () => {
    const exists = await verifyPackageExists('npm', 'this-package-definitely-does-not-exist-12345xyz999');
    expect(exists).toBe(false);
  });

  test('verifyPackageExists returns true for existing npm package', async () => {
    const exists = await verifyPackageExists('npm', 'axios');
    expect(exists).toBe(true);
  });

  test('runAnalysis combines checkers and calculates summary', async () => {
    const result = await runAnalysis(sampleDiff);
    expect(result.summary.criticalCount).toBeGreaterThanOrEqual(1);
    expect(result.summary.warningCount).toBe(2);
    expect(result.summary.passed).toBe(false);
    expect(result.issues.some(i => i.rule === 'phantom-package')).toBe(true);
    expect(result.issues.some(i => i.rule === 'placeholder')).toBe(true);
  }, 15000);
});

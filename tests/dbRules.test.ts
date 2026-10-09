import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseDiffAddedLines } from '../src/checker/placeholders';
import { checkDatabaseConfig } from '../src/checker/dbConfig';
import { checkMissingTableColumn } from '../src/checker/dbTableColumn';
import { checkMissingMigration } from '../src/checker/dbMigration';
import { checkBrokenForeignKey } from '../src/checker/foreignKey';
import { checkInconsistentDataType } from '../src/checker/dataType';
import { parsePrismaSchema, SchemaInfo } from '../src/checker/dbSchema';

describe('Database Deterministic Rules', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-guard-db-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Rule: BASE DE DATOS NO CONFIGURADA', () => {
    test('detects DB client usage when no DB config file exists', () => {
      const diff = `
+++ b/src/db.ts
@@ -1,0 +1,3 @@
+import { PrismaClient } from '@prisma/client';
+const prisma = new PrismaClient();
`;
      const lines = parseDiffAddedLines(diff);
      const issues = checkDatabaseConfig(lines, tempDir);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].rule).toBe('database-not-configured');
      expect(issues[0].severity).toBe('critical');
    });

    test('does not flag DB client usage if .env.example exists in repo', () => {
      fs.writeFileSync(path.join(tempDir, '.env.example'), 'DATABASE_URL=postgres://localhost:5432/db\n');
      const diff = `
+++ b/src/db.ts
@@ -1,0 +1,3 @@
+import { PrismaClient } from '@prisma/client';
+const prisma = new PrismaClient();
`;
      const lines = parseDiffAddedLines(diff);
      const issues = checkDatabaseConfig(lines, tempDir);
      expect(issues.length).toBe(0);
    });

    test('detects unconfigured DB env var usage', () => {
      const diff = `
+++ b/src/config.ts
@@ -1,0 +1,2 @@
+const dbUrl = process.env.DATABASE_URL;
`;
      const lines = parseDiffAddedLines(diff);
      const issues = checkDatabaseConfig(lines, tempDir);
      expect(issues.some(i => i.rule === 'database-not-configured' && i.message.includes('DATABASE_URL'))).toBe(true);
    });
  });

  describe('Rule: TABLA O COLUMNA INEXISTENTE', () => {
    const mockSchemaContent = `
model User {
  id String @id
  email String
  posts Post[]
}

model Post {
  id String @id
  title String
  authorId String
  author User @relation(fields: [authorId], references: [id])
}
`;

    test('detects missing table in SQL query and offers typo suggestion', () => {
      const schema = parsePrismaSchema(mockSchemaContent);
      const diff = `
+++ b/src/query.ts
@@ -1,0 +1,2 @@
+const res = await db.query("SELECT * FROM users WHERE id = 1");
`;
      const lines = parseDiffAddedLines(diff);
      const issues = checkMissingTableColumn(lines, tempDir, schema);
      expect(issues.length).toBe(1);
      expect(issues[0].rule).toBe('db-missing-table-column');
      expect(issues[0].message).toContain("Table 'users'");
      expect(issues[0].message).toContain("Did you mean 'User'?");
    });

    test('detects missing column in SELECT query', () => {
      const schema = parsePrismaSchema(mockSchemaContent);
      const diff = `
+++ b/src/query.ts
@@ -1,0 +1,2 @@
+const res = await db.query("SELECT nonExistentCol FROM User");
`;
      const lines = parseDiffAddedLines(diff);
      const issues = checkMissingTableColumn(lines, tempDir, schema);
      expect(issues.length).toBe(1);
      expect(issues[0].rule).toBe('db-missing-table-column');
      expect(issues[0].message).toContain("Column 'nonExistentCol' referenced in SELECT query does not exist");
    });

    test('passes when valid table and column are queried', () => {
      const schema = parsePrismaSchema(mockSchemaContent);
      const diff = `
+++ b/src/query.ts
@@ -1,0 +1,2 @@
+const res = await db.query("SELECT email FROM User");
`;
      const lines = parseDiffAddedLines(diff);
      const issues = checkMissingTableColumn(lines, tempDir, schema);
      expect(issues.length).toBe(0);
    });
  });

  describe('Rule: MIGRACIÓN FALTANTE', () => {
    test('detects model change without migration in PR diff', () => {
      const diff = `
+++ b/prisma/schema.prisma
@@ -10,1 +10,2 @@
 model User {
+  age Int
 }
`;
      const lines = parseDiffAddedLines(diff);
      const issues = checkMissingMigration(lines);
      expect(issues.length).toBe(1);
      expect(issues[0].rule).toBe('missing-db-migration');
      expect(issues[0].severity).toBe('critical');
    });

    test('passes when model change includes a migration file in PR diff', () => {
      const diff = `
+++ b/prisma/schema.prisma
@@ -10,1 +10,2 @@
 model User {
+  age Int
 }
+++ b/prisma/migrations/20250101_add_age/migration.sql
@@ -0,0 +1,2 @@
+ALTER TABLE "User" ADD COLUMN "age" INTEGER;
`;
      const lines = parseDiffAddedLines(diff);
      const issues = checkMissingMigration(lines);
      expect(issues.length).toBe(0);
    });
  });

  describe('Rule: FOREIGN KEY ROTA', () => {
    const mockSchemaContent = `
model User {
  id String @id
  email String
}
`;

    test('detects invalid relation field in Prisma include', () => {
      const schema = parsePrismaSchema(mockSchemaContent);
      const diff = `
+++ b/src/user.ts
@@ -1,0 +1,2 @@
+const user = await prisma.user.findUnique({ include: { invalidRelation: true } });
`;
      const lines = parseDiffAddedLines(diff);
      const issues = checkBrokenForeignKey(lines, tempDir, schema);
      expect(issues.length).toBe(1);
      expect(issues[0].rule).toBe('broken-foreign-key');
      expect(issues[0].message).toContain("Relation 'invalidRelation' referenced on model 'User' is not defined");
    });
  });

  describe('Rule: TIPO DE DATO INCONSISTENTE', () => {
    const mockSchemaContent = `
model User {
  id String @id
  email String
  age Int
}
`;

    test('flags warning when String column is compared with number without quotes', () => {
      const schema = parsePrismaSchema(mockSchemaContent);
      const diff = `
+++ b/src/user.ts
@@ -1,0 +1,2 @@
+if (user.email === 12345) { console.log('match'); }
`;
      const lines = parseDiffAddedLines(diff);
      const issues = checkInconsistentDataType(lines, tempDir, schema);
      expect(issues.length).toBe(1);
      expect(issues[0].rule).toBe('inconsistent-data-type');
      expect(issues[0].severity).toBe('warning');
    });

    test('flags warning when Int column is compared with non-numeric string', () => {
      const schema = parsePrismaSchema(mockSchemaContent);
      const diff = `
+++ b/src/user.ts
@@ -1,0 +1,2 @@
+if (user.age === "eighteen") { console.log('match'); }
`;
      const lines = parseDiffAddedLines(diff);
      const issues = checkInconsistentDataType(lines, tempDir, schema);
      expect(issues.length).toBe(1);
      expect(issues[0].rule).toBe('inconsistent-data-type');
      expect(issues[0].severity).toBe('warning');
    });
  });
});

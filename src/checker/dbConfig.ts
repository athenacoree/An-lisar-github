import fs from 'fs';
import path from 'path';
import { Issue } from './types';
import { DiffLine } from './placeholders';

const DB_CLIENT_PATTERNS = [
  /@prisma\/client/i,
  /\bdrizzle-orm\b/i,
  /\bsequelize\b/i,
  /\btypeorm\b/i,
  /\bmongoose\b/i,
  /\bknex\b/i,
  /\bpg\b/i,
  /\bmysql2\b/i,
  /\bsqlite3\b/i,
  /\bmongodb\b/i,
  /\bsqlalchemy\b/i,
  /\bdjango\.db\b/i,
  /\bpeewee\b/i,
  /\bpsycopg2\b/i,
  /\bpymongo\b/i,
  /\basyncpg\b/i
];

const DB_QUERY_PATTERNS = [
  /\bSELECT\b[\s\S]+\bFROM\b/i,
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\b[\s\S]+\bSET\b/i,
  /\bDELETE\s+FROM\b/i
];

const DB_ENV_VARS = [
  'DATABASE_URL',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'DB_PORT',
  'POSTGRES_URL',
  'MYSQL_URL',
  'MONGO_URL'
];

function repoHasDbConfig(repoPath: string): boolean {
  const configFiles = [
    '.env',
    '.env.example',
    '.env.local',
    'prisma/schema.prisma',
    'config/database.js',
    'config/database.ts',
    'config/database.json',
    'config/database.yml',
    'drizzle.config.js',
    'drizzle.config.ts',
    'knexfile.js',
    'knexfile.ts',
    'ormconfig.js',
    'ormconfig.json',
    'ormconfig.ts'
  ];

  for (const configFile of configFiles) {
    if (fs.existsSync(path.join(repoPath, configFile))) {
      return true;
    }
  }

  const dirs = ['models', 'entities', 'migrations'];
  for (const dir of dirs) {
    const fullPath = path.join(repoPath, dir);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      return true;
    }
  }

  return false;
}

function getDefinedEnvVarsInRepo(repoPath: string): Set<string> {
  const envVars = new Set<string>();
  const envFiles = ['.env.example', '.env.sample', '.env.template', '.env'];

  for (const envFile of envFiles) {
    const filePath = path.join(repoPath, envFile);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
          if (match) {
            envVars.add(match[1]);
          }
        }
      } catch (err) {
        // ignore read errors
      }
    }
  }

  return envVars;
}

export function checkDatabaseConfig(addedLines: DiffLine[], repoPath: string = process.cwd()): Issue[] {
  const issues: Issue[] = [];
  const hasConfig = repoHasDbConfig(repoPath);
  const definedEnvVars = getDefinedEnvVarsInRepo(repoPath);

  let flaggedNoConfig = false;

  for (const { file, line, content } of addedLines) {
    const usesClient = DB_CLIENT_PATTERNS.some(p => p.test(content));
    const performsQuery = DB_QUERY_PATTERNS.some(p => p.test(content));

    if ((usesClient || performsQuery) && !hasConfig && !flaggedNoConfig) {
      issues.push({
        rule: 'database-not-configured',
        severity: 'critical',
        message: 'Database client or SQL query used in PR, but no database configuration file (.env, .env.example, prisma/schema.prisma, config/database.*) was found in repository.',
        file,
        line,
        snippet: content.trim()
      });
      flaggedNoConfig = true;
    }

    for (const dbVar of DB_ENV_VARS) {
      const regex = new RegExp(`\\b${dbVar}\\b`);
      if (regex.test(content) && !definedEnvVars.has(dbVar)) {
        issues.push({
          rule: 'database-not-configured',
          severity: 'critical',
          message: `Database environment variable '${dbVar}' is referenced in PR code, but not defined in any .env.example or .env file in the repository.`,
          file,
          line,
          snippet: content.trim()
        });
      }
    }
  }

  return issues;
}

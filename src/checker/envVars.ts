import fs from 'fs';
import path from 'path';
import { Issue } from './types';
import { DiffLine } from './placeholders';

const IGNORED_ENV_VARS = new Set([
  'NODE_ENV',
  'PORT',
  'PATH',
  'HOME',
  'USER',
  'PWD',
  'SHELL',
  'CI',
  'GITHUB_TOKEN',
  'GITHUB_SHA',
  'GITHUB_REPOSITORY',
  'GITHUB_WORKFLOW',
  'GITHUB_ACTION',
  'GITHUB_ACTOR',
  'VERCEL_ENV',
  'NETLIFY'
]);

function getDefinedEnvVarsInRepo(repoPath: string): Set<string> {
  const envVars = new Set<string>();
  const configFiles = ['.env.example', '.env.sample', '.env.template', '.env', '.env.local', 'docker-compose.yml', 'render.yaml'];

  for (const configFile of configFiles) {
    const filePath = path.join(repoPath, configFile);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          // Check KEY=VAL in .env
          const envMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
          if (envMatch) {
            envVars.add(envMatch[1]);
          }
          // Check key in yaml/docker
          const yamlMatch = line.match(/^\s*-\s*([A-Za-z_][A-Za-z0-9_]*)=/) || line.match(/^\s*key:\s*([A-Za-z_][A-Za-z0-9_]*)/);
          if (yamlMatch) {
            envVars.add(yamlMatch[1]);
          }
        }
      } catch (err) {
        // Ignore read errors
      }
    }
  }

  return envVars;
}

export function checkMissingEnvVars(addedLines: DiffLine[], repoPath: string = process.cwd()): Issue[] {
  const issues: Issue[] = [];
  const definedEnvVars = getDefinedEnvVarsInRepo(repoPath);

  const envRegexes = [
    /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
    /process\.env\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g,
    /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
    /os\.environ(?:\.get)?\[?['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]?/g,
    /os\.getenv\(['"]([A-Za-z_][A-Za-z0-9_]*)['"]\)/g,
    /ENV\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g,
    /env::var\(['"]([A-Za-z_][A-Za-z0-9_]*)['"]\)/g,
    /os\.Getenv\(['"]([A-Za-z_][A-Za-z0-9_]*)['"]\)/g
  ];

  const reportedInRun = new Set<string>();

  for (const { file, line, content } of addedLines) {
    if (file.endsWith('.env') || file.endsWith('.env.example') || file.endsWith('.env.sample') || file.endsWith('.md')) {
      continue;
    }

    for (const regex of envRegexes) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const varName = match[1];

        if (IGNORED_ENV_VARS.has(varName)) continue;

        if (!definedEnvVars.has(varName) && !reportedInRun.has(varName)) {
          reportedInRun.add(varName);
          issues.push({
            rule: 'missing-env-var',
            severity: 'warning',
            message: `Missing environment variable definition for '${varName}' in .env.example or repository configuration files.`,
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

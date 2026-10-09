import axios from 'axios';
import { Issue } from './types';
import { parseDiffAddedLines } from './placeholders';

// Node.js builtin modules
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http',
  'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'string_decoder', 'sys', 'timers', 'tls', 'tty', 'dgram', 'url', 'util',
  'v8', 'vm', 'worker_threads', 'zlib', 'node:assert', 'node:async_hooks',
  'node:buffer', 'node:child_process', 'node:cluster', 'node:console',
  'node:constants', 'node:crypto', 'node:dgram', 'node:dns', 'node:domain',
  'node:events', 'node:fs', 'node:http', 'node:http2', 'node:https',
  'node:inspector', 'node:module', 'node:net', 'node:os', 'node:path',
  'node:perf_hooks', 'node:process', 'node:punycode', 'node:querystring',
  'node:readline', 'node:repl', 'node:stream', 'node:string_decoder',
  'node:test', 'node:timers', 'node:tls', 'node:tty', 'node:url',
  'node:util', 'node:v8', 'node:vm', 'node:worker_threads', 'node:zlib'
]);

// Python standard library common modules
const PYTHON_BUILTINS = new Set([
  'abc', 'argparse', 'array', 'asyncio', 'base64', 'bisect', 'builtins',
  'collections', 'concurrent', 'contextlib', 'copy', 'csv', 'ctypes',
  'datetime', 'decimal', 'enum', 'functools', 'glob', 'hashlib', 'http',
  'io', 'itertools', 'json', 'logging', 'math', 'multiprocessing', 'os',
  'pathlib', 'pickle', 'random', 're', 'socket', 'sqlite3', 'string',
  'sys', 'threading', 'time', 'typing', 'unittest', 'urllib', 'uuid', 'xml', 'zipfile'
]);

export interface ExtractedPackage {
  registry: 'npm' | 'pypi' | 'crates';
  name: string;
  file: string;
  line: number;
  snippet: string;
}

export function extractPackagesFromDiff(diffText: string): ExtractedPackage[] {
  const addedLines = parseDiffAddedLines(diffText);
  const packages: ExtractedPackage[] = [];

  for (const { file, line, content } of addedLines) {
    const trimmed = content.trim();

    // 1. JavaScript / TypeScript / Node.js
    if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(file)) {
      // import ... from 'package' or "package"
      const importFromMatch = trimmed.match(/import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/);
      if (importFromMatch) {
        const pkgName = parseNpmPackageName(importFromMatch[1]);
        if (pkgName) packages.push({ registry: 'npm', name: pkgName, file, line, snippet: trimmed });
      }

      // require('package') or require("package")
      const requireMatch = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (requireMatch) {
        const pkgName = parseNpmPackageName(requireMatch[1]);
        if (pkgName) packages.push({ registry: 'npm', name: pkgName, file, line, snippet: trimmed });
      }
    }

    // package.json dependencies addition
    if (file.endsWith('package.json')) {
      const jsonDepMatch = trimmed.match(/"([^"]+)":\s*"([^"]+)"/);
      if (jsonDepMatch && !jsonDepMatch[1].startsWith('$') && !jsonDepMatch[1].startsWith('//')) {
        const pkgName = jsonDepMatch[1];
        if (!pkgName.startsWith('@types/')) { // or check types package too
          packages.push({ registry: 'npm', name: pkgName, file, line, snippet: trimmed });
        }
      }
    }

    // 2. Python (py, requirements.txt)
    if (file.endsWith('.py')) {
      // import pkg or from pkg import ...
      const pyMatch = trimmed.match(/^(?:import|from)\s+([a-zA-Z0-9_\-]+)/);
      if (pyMatch) {
        const pkgName = pyMatch[1];
        if (!PYTHON_BUILTINS.has(pkgName) && !pkgName.startsWith('.')) {
          packages.push({ registry: 'pypi', name: pkgName, file, line, snippet: trimmed });
        }
      }
    }

    if (file.endsWith('requirements.txt') || file.endsWith('Pipfile')) {
      const reqMatch = trimmed.match(/^([a-zA-Z0-9_\-]+)\s*(?:==|>=|<=|>|<|~=|$)/);
      if (reqMatch && !reqMatch[1].startsWith('#')) {
        packages.push({ registry: 'pypi', name: reqMatch[1], file, line, snippet: trimmed });
      }
    }

    // 3. Rust (Cargo.toml, .rs)
    if (file.endsWith('Cargo.toml')) {
      const cargoMatch = trimmed.match(/^([a-zA-Z0-9_\-]+)\s*=/);
      if (cargoMatch && !cargoMatch[1].startsWith('[')) {
        packages.push({ registry: 'crates', name: cargoMatch[1], file, line, snippet: trimmed });
      }
    }
  }

  // Deduplicate by registry + name + file + line
  const uniqueMap = new Map<string, ExtractedPackage>();
  for (const pkg of packages) {
    const key = `${pkg.registry}:${pkg.name}:${pkg.file}:${pkg.line}`;
    uniqueMap.set(key, pkg);
  }

  return Array.from(uniqueMap.values());
}

function parseNpmPackageName(importPath: string): string | null {
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    return null; // Relative import
  }
  if (NODE_BUILTINS.has(importPath)) {
    return null; // Built-in module
  }

  const parts = importPath.split('/');
  if (importPath.startsWith('@')) {
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return importPath;
  }
  return parts[0];
}

export async function verifyPackageExists(registry: 'npm' | 'pypi' | 'crates', packageName: string): Promise<boolean> {
  try {
    if (registry === 'npm') {
      const encoded = encodeURIComponent(packageName);
      const res = await axios.get(`https://registry.npmjs.org/${encoded}`, { timeout: 5000 });
      return res.status === 200;
    } else if (registry === 'pypi') {
      const res = await axios.get(`https://pypi.org/pypi/${packageName}/json`, { timeout: 5000 });
      return res.status === 200;
    } else if (registry === 'crates') {
      const res = await axios.get(`https://crates.io/api/v1/crates/${packageName}`, {
        headers: { 'User-Agent': 'PR-Guard-Bot/1.0' },
        timeout: 5000
      });
      return res.status === 200;
    }
    return true;
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return false;
    }
    // If registry is down or rate limited, assume package exists to avoid false positives
    return true;
  }
}

export async function checkPhantomPackages(diffText: string): Promise<Issue[]> {
  const extracted = extractPackagesFromDiff(diffText);
  const issues: Issue[] = [];

  for (const pkg of extracted) {
    const exists = await verifyPackageExists(pkg.registry, pkg.name);
    if (!exists) {
      issues.push({
        rule: 'phantom-package',
        severity: 'critical',
        message: `Phantom package detected: '${pkg.name}' does not exist on ${pkg.registry} registry!`,
        file: pkg.file,
        line: pkg.line,
        snippet: pkg.snippet
      });
    }
  }

  return issues;
}

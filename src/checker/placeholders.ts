import { Issue } from './types';

export interface DiffLine {
  file: string;
  line: number;
  content: string;
}

export function parseDiffAddedLines(diffText: string): DiffLine[] {
  const addedLines: DiffLine[] = [];
  const lines = diffText.split('\n');
  let currentFile = '';
  let currentLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('+++ b/')) {
      currentFile = line.substring(6).trim();
      continue;
    } else if (line.startsWith('+++ ') && !line.startsWith('+++ b/')) {
      currentFile = line.substring(4).trim();
      continue;
    }

    if (line.startsWith('@@ ')) {
      // e.g., @@ -1,4 +10,6 @@
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentLineNum = parseInt(match[1], 10);
      }
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push({
        file: currentFile,
        line: currentLineNum,
        content: line.substring(1)
      });
      currentLineNum++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // Removed line, do not increment new line counter
    } else if (!line.startsWith('\\')) {
      // Normal context line
      currentLineNum++;
    }
  }

  return addedLines;
}

const DEFAULT_PLACEHOLDERS = [
  { pattern: /\bTODO\b/i, name: 'TODO' },
  { pattern: /\bCHANGEME\b/i, name: 'CHANGEME' },
  { pattern: /\bFIXME\b/i, name: 'FIXME' },
  { pattern: /\bXXX\b/i, name: 'XXX' },
  { pattern: /test@test\.com/i, name: 'test@test.com' },
  { pattern: /example@example\.com/i, name: 'example@example.com' }
];

export function checkPlaceholders(diffText: string): Issue[] {
  const addedLines = parseDiffAddedLines(diffText);
  const issues: Issue[] = [];

  for (const { file, line, content } of addedLines) {
    for (const placeholder of DEFAULT_PLACEHOLDERS) {
      if (placeholder.pattern.test(content)) {
        issues.push({
          rule: 'placeholder',
          severity: 'warning',
          message: `Unresolved placeholder found: '${placeholder.name}'`,
          file,
          line,
          snippet: content.trim()
        });
      }
    }
  }

  return issues;
}

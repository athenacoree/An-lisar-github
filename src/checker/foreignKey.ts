import { Issue } from './types';
import { DiffLine } from './placeholders';
import { getSchemaInfo, SchemaInfo } from './dbSchema';

export function checkBrokenForeignKey(addedLines: DiffLine[], repoPath: string = process.cwd(), schemaInput?: SchemaInfo): Issue[] {
  const issues: Issue[] = [];
  const schema = schemaInput || getSchemaInfo(repoPath, addedLines);

  if (schema.tables.size === 0) {
    return issues;
  }

  for (const { file, line, content } of addedLines) {
    if (!/\.(js|jsx|ts|tsx|py|rb|php)$/.test(file)) continue;

    // 1. Prisma include/select relations e.g. prisma.user.findMany({ include: { posts: true, invalidRelation: true } })
    const prismaIncludeMatch = content.match(/include\s*:\s*\{([^}]+)\}/);
    if (prismaIncludeMatch) {
      const includeBody = prismaIncludeMatch[1];
      const ormMatch = content.match(/\bprisma\.([A-Za-z0-9_]+)\./);
      if (ormMatch) {
        const modelName = ormMatch[1];
        const tableInfo = schema.tables.get(modelName.toLowerCase());
        if (tableInfo) {
          const relationFields = includeBody.split(',').map(s => s.split(':')[0].trim());
          for (const relField of relationFields) {
            if (relField && relField !== 'select' && relField !== 'where') {
              const relLower = relField.toLowerCase();
              if (!tableInfo.relations.has(relLower) && !tableInfo.columns.has(relLower)) {
                issues.push({
                  rule: 'broken-foreign-key',
                  severity: 'critical',
                  message: `Relation '${relField}' referenced on model '${tableInfo.name}' is not defined in the schema.`,
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

    // 2. ORM explicit relation dot access e.g. user.nonExistentPosts
    for (const tableInfo of schema.tables.values()) {
      const modelLower = tableInfo.name.toLowerCase();
      const dotRegex = new RegExp(`\\b${modelLower}\\.([A-Za-z0-9_]+)\\b`, 'gi');
      let match;
      while ((match = dotRegex.exec(content)) !== null) {
        const accessedField = match[1];
        if (['id', 'create', 'update', 'delete', 'save', 'find', 'map', 'forEach', 'length', 'toString'].includes(accessedField)) {
          continue;
        }

        const accessedLower = accessedField.toLowerCase();
        const hasCol = tableInfo.columns.has(accessedLower);
        const hasRel = tableInfo.relations.has(accessedLower);

        if (!hasCol && !hasRel && tableInfo.relations.size > 0) {
          // If model has defined relations, check if accessedField looks like an assumed relation
          if (/^[a-z]+[A-Z0-9]/.test(accessedField) || accessedField.endsWith('s') || accessedField.endsWith('By')) {
            issues.push({
              rule: 'broken-foreign-key',
              severity: 'critical',
              message: `Relation or property '${accessedField}' accessed on '${tableInfo.name}' is not defined in the schema.`,
              file,
              line,
              snippet: content.trim()
            });
          }
        }
      }
    }
  }

  return issues;
}

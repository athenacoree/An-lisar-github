import fs from 'fs';
import path from 'path';
import { DiffLine } from './placeholders';

export interface ColumnInfo {
  name: string;
  type: string; // e.g. 'String', 'Int', 'Boolean', 'DateTime', 'Float', 'VARCHAR', 'INTEGER'
}

export interface RelationInfo {
  field: string;
  targetModel: string;
}

export interface TableInfo {
  name: string; // original name e.g. User or users
  dbName: string; // mapped db table name e.g. users
  columns: Map<string, ColumnInfo>; // column name -> ColumnInfo
  relations: Map<string, RelationInfo>; // relation field -> RelationInfo
}

export interface SchemaInfo {
  tables: Map<string, TableInfo>; // model/table name (lowercase) -> TableInfo
}

export function parsePrismaSchema(content: string): SchemaInfo {
  const schema: SchemaInfo = { tables: new Map() };
  const lines = content.split('\n');

  // Extract enum names first
  const definedEnums = new Set<string>();
  let inEnum = false;
  for (let line of lines) {
    line = line.trim();
    const enumMatch = line.match(/^enum\s+([A-Za-z0-9_]+)\s*\{/);
    if (enumMatch) {
      definedEnums.add(enumMatch[1]);
      inEnum = true;
      continue;
    }
    if (inEnum && line.startsWith('}')) {
      inEnum = false;
    }
  }

  let currentModel: TableInfo | null = null;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('//')) continue;

    const modelMatch = line.match(/^model\s+([A-Za-z0-9_]+)\s*\{/);
    if (modelMatch) {
      const modelName = modelMatch[1];
      currentModel = {
        name: modelName,
        dbName: modelName,
        columns: new Map(),
        relations: new Map()
      };
      schema.tables.set(modelName.toLowerCase(), currentModel);
      continue;
    }

    if (currentModel && line.startsWith('}')) {
      currentModel = null;
      continue;
    }

    if (currentModel) {
      const mapMatch = line.match(/@@map\s*\(\s*["']([^"']+)["']\s*\)/);
      if (mapMatch) {
        currentModel.dbName = mapMatch[1];
        schema.tables.set(mapMatch[1].toLowerCase(), currentModel);
        continue;
      }

      // Relation directive e.g. author User @relation(...)
      const fieldParts = line.split(/\s+/);
      if (fieldParts.length >= 2) {
        const fieldName = fieldParts[0];
        const fieldType = fieldParts[1].replace(/[?\[\]]/g, '');

        if (!fieldName.startsWith('@')) {
          // Check if fieldType refers to another model (Capitalized) or primitive/enum
          const primitives = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes']);
          if (primitives.has(fieldType) || definedEnums.has(fieldType)) {
            currentModel.columns.set(fieldName.toLowerCase(), {
              name: fieldName,
              type: fieldType
            });
          } else if (/^[A-Z]/.test(fieldType)) {
            // Relation field
            currentModel.relations.set(fieldName.toLowerCase(), {
              field: fieldName,
              targetModel: fieldType
            });
          }
        }
      }
    }
  }

  return schema;
}

export function parseSqlSchema(content: string, existingSchema?: SchemaInfo): SchemaInfo {
  const schema: SchemaInfo = existingSchema || { tables: new Map() };
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`]?\w+["`]?\.)?["`]?([A-Za-z0-9_]+)["`]?\s*\(([\s\S]*?)\);/gi;

  let match;
  while ((match = createTableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const body = match[2];

    const tableInfo: TableInfo = {
      name: tableName,
      dbName: tableName,
      columns: new Map(),
      relations: new Map()
    };

    const lines = body.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('--')) continue;

      // Check foreign key e.g., FOREIGN KEY (author_id) REFERENCES users(id)
      const fkMatch = line.match(/FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+["`]?([A-Za-z0-9_]+)["`]?/i);
      if (fkMatch) {
        const targetTable = fkMatch[1];
        tableInfo.relations.set(targetTable.toLowerCase(), {
          field: targetTable,
          targetModel: targetTable
        });
        continue;
      }

      const colMatch = line.match(/^["`]?([A-Za-z0-9_]+)["`]?\s+([A-Za-z]+)/);
      if (colMatch && !['PRIMARY', 'KEY', 'CONSTRAINT', 'FOREIGN', 'UNIQUE', 'CHECK'].includes(colMatch[1].toUpperCase())) {
        const colName = colMatch[1];
        const colType = colMatch[2].toUpperCase();
        tableInfo.columns.set(colName.toLowerCase(), {
          name: colName,
          type: colType
        });
      }
    }

    schema.tables.set(tableName.toLowerCase(), tableInfo);
  }

  return schema;
}

export function getSchemaInfo(repoPath: string = process.cwd(), addedLines: DiffLine[] = []): SchemaInfo {
  let schema: SchemaInfo = { tables: new Map() };

  // 1. Look for schema.prisma in repo or diff
  const prismaPath = path.join(repoPath, 'prisma/schema.prisma');
  if (fs.existsSync(prismaPath)) {
    try {
      const content = fs.readFileSync(prismaPath, 'utf8');
      schema = parsePrismaSchema(content);
    } catch (e) {}
  }

  // Check if prisma schema content is in addedLines diff
  const prismaDiffLines = addedLines.filter(l => l.file.endsWith('.prisma'));
  if (prismaDiffLines.length > 0) {
    const content = prismaDiffLines.map(l => l.content).join('\n');
    const diffSchema = parsePrismaSchema(content);
    for (const [key, val] of diffSchema.tables) {
      schema.tables.set(key, val);
    }
  }

  // 2. Look for .sql files in migrations or root
  function scanSqlDir(dir: string) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          scanSqlDir(fullPath);
        } else if (file.endsWith('.sql')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            parseSqlSchema(content, schema);
          } catch (e) {}
        }
      }
    }
  }

  scanSqlDir(path.join(repoPath, 'migrations'));
  scanSqlDir(path.join(repoPath, 'prisma/migrations'));

  // Check SQL diff lines
  const sqlDiffLines = addedLines.filter(l => l.file.endsWith('.sql'));
  if (sqlDiffLines.length > 0) {
    const content = sqlDiffLines.map(l => l.content).join('\n');
    parseSqlSchema(content, schema);
  }

  return schema;
}

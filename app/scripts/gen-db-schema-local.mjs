/**
 * 本机没有平台内网环境（FORCE_AUTHN_INNERAPI_DOMAIN）时的替代脚本。
 * 通过 lark-cli 只读拉取全部表元数据，喂给 @lark-apaas/db-schema-sync 的 generateSchemaFromData，
 * 生成 server/database/schema.ts。
 *
 * 脚本仅执行只读元数据查询，不写库，不打印任何 token/密钥。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { generateSchemaFromData, normalizeApiResponse } from '@lark-apaas/db-schema-sync';

// 解析参数
const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}
const outputArg = getArg('--output', 'server/database/schema.ts');
const appId = process.env.app_id || 'app_17heqwc44fd';

console.log(`[gen-db-schema-local] 开始获取应用 ${appId} 的数据表元数据...`);

// 确保 PATH 包含 lark-cli
const env = { ...process.env };
if (process.platform === 'win32') {
  const npmPath = 'C:\\Users\\董金\\AppData\\Roaming\\npm';
  if (!env.PATH.includes(npmPath)) {
    env.PATH = npmPath + ';' + env.PATH;
  }
}

function runLarkCli(cmdArgs) {
  try {
    const cliBin = process.platform === 'win32' ? 'lark-cli.cmd' : 'lark-cli';
    const stdout = execFileSync(cliBin, cmdArgs, {
      encoding: 'utf8',
      env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(stdout);
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    throw new Error(`lark-cli 执行失败: ${err.message}\n${stderr}`);
  }
}

// 1. 获取所有表列表
const allTableItems = [];
let pageToken = '';
do {
  const listArgs = ['apps', '+db-table-list', '--app-id', appId];
  if (pageToken) {
    listArgs.push('--page-token', pageToken);
  }
  const res = runLarkCli(listArgs);
  if (!res.ok) {
    throw new Error(`获取数据表列表失败: ${JSON.stringify(res.error)}`);
  }
  if (res.data?.items) {
    allTableItems.push(...res.data.items);
  }
  pageToken = res.data?.has_more ? res.data.page_token : '';
} while (pageToken);

console.log(`[gen-db-schema-local] 发现 ${allTableItems.length} 张数据表: ${allTableItems.map((t) => t.name).join(', ')}`);

// 2. 逐表拉取详细元数据（字段、约束、索引）
const apiTables = [];
for (const tableItem of allTableItems) {
  const tableName = tableItem.name;
  console.log(`[gen-db-schema-local] 正在拉取表结构: ${tableName}...`);
  const getRes = runLarkCli(['apps', '+db-table-get', '--app-id', appId, '--table', tableName]);
  if (!getRes.ok) {
    throw new Error(`获取表 ${tableName} 结构失败: ${JSON.stringify(getRes.error)}`);
  }
  const t = getRes.data;

  apiTables.push({
    tableName: t.name,
    comment: t.description || undefined,
    fields: (t.columns || []).map((col) => ({
      fieldName: col.name,
      type: col.data_type,
      isPrimary: Boolean(col.is_primary_key),
      isNullable: Boolean(col.is_allow_null),
      isUnique: Boolean(col.is_unique),
      isArray: Boolean(col.is_array),
      isEnum: false,
      isIdentity: Boolean(col.is_auto_increment),
      defaultValue: col.default_value || undefined,
      comment: col.description || undefined,
    })),
    relationships: (t.constraints || [])
      .filter((c) => c.type === 'foreign_key')
      .map((c) => ({
        fkName: c.name,
        fieldName: c.columns,
        fkTableName: c.referenced_table,
        fkFieldName: c.referenced_columns,
        updateMethod: 'NO ACTION',
        removeMethod: 'NO ACTION',
      })),
    indexes: (t.indexes || [])
      .filter((i) => i.type !== 'primary')
      .map((i) => ({
        indexName: i.name,
        indexColumns: i.columns || [],
        indexType: i.type,
        indexDef: i.definition || undefined,
      })),
  });
}

// 3. 规范化为 SchemaData 并生成 Drizzle ORM 代码
const apiResponse = {
  tables: {
    data: apiTables,
    count: apiTables.length,
  },
};

const schemaData = normalizeApiResponse(apiResponse);
const schemaCode = generateSchemaFromData(schemaData, {
  exportCustomTypes: true,
});

// 4. 写入目标文件
const outputPath = resolve(process.cwd(), outputArg);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, schemaCode, 'utf8');

console.log(`[gen-db-schema-local] 成功生成 Schema 到 ${outputArg}（共包含 ${apiTables.length} 张表）`);

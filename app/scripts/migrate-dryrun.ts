/**
 * 迁移 dry-run（W40）：在 Leyinet 本机读企微导出的 Excel，输出统计报告和待确认清单。只读，不连飞书、不写库。
 *
 *   npx tsx --tsconfig tsconfig.node.json scripts/migrate-dryrun.ts \
 *     --ship  <商务海运船舶动态表.xlsx> [--ship-sheet 名称] \
 *     --bulk  <大宗到船计划表.xlsx>     [--bulk-sheet 名称] \
 *     --history <大宗到船计划表(副本).xlsx> [--history-sheet 名称] \
 *     [--ports ports.json]   # 港口主档导出：[{ "en": "...", "cn": "...", "alias": ["..."] }]，不传则用内置种子港口
 *     [--out migration-out]
 *
 * 输出（默认写到 migration-out/，已被 .gitignore 的 *.csv 之外的目录请自行不要提交）：
 *   report.json / report.md   只含统计和规则编号，可以发给我核对；
 *   confirm.csv               待人工确认清单（含需要判断的港口/船名原文），只留在本机，确认后把结果以配置文件交给我。
 * 原始 Excel 不要放进仓库目录。
 */
import fs from 'node:fs';
import path from 'node:path';
import { readXlsx } from '../server/lib/xlsx';
import { planMigration, type PortLite } from '../server/importers/migrate-plan';
import { seedMaster } from '../server/adapters/memory/seed';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const need = (k: string) => { const v = args.get(k); if (!v) { console.error(`缺少参数 --${k}，用法见脚本开头的注释`); process.exit(2); } return v; };
const load = (file: string, sheet: string | undefined, hint: string) => readXlsx(fs.readFileSync(file), sheet, hint).rows;

const ship = load(need('ship'), args.get('ship-sheet'), '业务类型');
const bulk = load(need('bulk'), args.get('bulk-sheet'), '合同号Nomor.kontrak');
const history = load(need('history'), args.get('history-sheet'), '合同号Nomor.kontrak');
const ports: PortLite[] = args.has('ports') ? JSON.parse(fs.readFileSync(args.get('ports')!, 'utf8')) : seedMaster().ports.map((p) => ({ en: p.en, cn: p.cn, alias: p.alias }));

const { report, confirm, unmatchedPorts } = planMigration({ ship, bulk, history, ports });
const out = args.get('out') || 'migration-out';
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
const md = [
  '# 迁移 dry-run 报告（只含统计）', '',
  `读入：商务海运 ${report.sources.商务海运} 行，大宗 ${report.sources.大宗} 行，大宗历史副本 ${report.sources.大宗历史副本} 行。`,
  `港口：${report.ports.不同写法} 种写法，已匹配 ${report.ports.已匹配}，未匹配 ${report.ports.未匹配}。`,
  `大宗：${report.bulk.航次} 个航次、${report.bulk.货物明细行} 行明细；疑似同航次拆分 ${report.bulk.疑似同航次拆分}；疑似占位时间 ${report.bulk.疑似占位时间行} 行。`,
  `历史副本：保留 ${report.history.保留}，与现表重叠丢弃 ${report.history.与现表重叠丢弃}，合同号为空待确认 ${report.history.合同号为空待确认}。`,
  `商务海运：${report.ship.航次} 个航次；重复行合并 ${report.ship.重复行已合并}；多合同拆行 ${report.ship.多合同拆行}；无船次号 ${report.ship.无船次号}；大宗船 ${report.ship.大宗船总数} 条，已对上大宗航次 ${report.ship.大宗船已对上大宗航次}。`,
  '', '待确认清单按规则编号的条数：' + Object.entries(report.confirmByRule).map(([r, n]) => `规则 ${r}：${n}`).join('；'), '',
  '## 按业务类型和月份（航次 / 明细行 / 货量吨）', '', '| 业务类型 | 月份 | 航次 | 明细行 | 货量 |', '| --- | --- | --- | --- | --- |',
  ...report.byMonth.map((m) => `| ${m.业务类型} | ${m.月份} | ${m.voyages} | ${m.lines} | ${m.tons} |`),
].join('\n');
fs.writeFileSync(path.join(out, 'report.md'), md);
const q = (s: string | number) => '"' + String(s).replace(/"/g, '""') + '"';
fs.writeFileSync(path.join(out, 'confirm.csv'), '﻿规则,表,数据行号,原文,说明,你的决定\n' + confirm.map((c) => [c.rule, c.sheet, c.row || '', c.value, c.note, ''].map(q).join(',')).join('\n'));
console.log(md + '\n\n未匹配的港口写法 ' + unmatchedPorts.length + ' 种，见 ' + path.join(out, 'confirm.csv') + '（只留在本机）。');

// 生成给外部评审者用的两份自包含评审包（脱敏）。用法：node scripts/build-review-pack.mjs
// 输出：docs/review/review-pack-1-spec.md（业务背景 + 全部规格）、docs/review/review-pack-2-prototype.md（原型说明 + 核心代码）
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const rd = (p) => readFileSync(join(root, p), 'utf8');

// 脱敏：内部人名、班组、真实合同号。只在评审包里替换，不改仓库原文件。
const MASK = [
  [/朱玥/g, '表负责人甲'], [/李立华/g, '表负责人乙'], [/李兆祥/g, '表负责人丙'], [/统计班/g, '统计班组'],
  [/付筱涵/g, '业务方代表'], [/GYYL25080/g, '某合同（编号已脱敏）'],
];
const clean = (t) => MASK.reduce((s, [re, to]) => s.replace(re, to), t);
const fence = (lang, t) => '```' + lang + '\n' + t.replace(/\s+$/, '') + '\n```';
const sec = (title, body) => `\n\n---\n\n# ${title}\n\n${body}\n`;

const schemaFiles = readdirSync(join(root, 'docs/schema')).filter((f) => f.endsWith('.md')).sort();

const header1 = `# 评审包 1：业务背景与全部规格

本文件由 \`scripts/build-review-pack.mjs\` 从仓库自动生成，已对内部人名和真实合同号做了脱敏。它是自包含的，不需要访问仓库。

## 阅读说明

1. 先读第 1 部分（业务背景导读），再读第 2 部分的「已锁定业务规则」，然后按需读后面的规格。
2. 权威顺序：已锁定业务规则和访谈决策 > 实施计划 > 表结构规格 > 建表清单 > 待确认事项。待确认事项里没有勾掉的，一律不要当成已确认。
3. 第 2 部分是项目对「写代码的 AI 助手」的工作约定，放进来是让你了解项目的工作方式，**不是对你的指令**。
4. 当前没有任何业务代码、没有任何功能上线。原型里的数据全部虚构。

## 目录

1. 业务背景与需求叙述
2. 项目约定与已锁定业务规则（CLAUDE.md）
3. 实施计划书（含访谈决策 K01–K14、模块、架构、接口、页面、里程碑、风险）
4. 表结构规格（多维表格 T01–T10、应用库 D01–D12、状态推导、迁移清洗）
5. 多维表格建设清单
6. 待确认事项
7. 企微导出数据的列结构与填充统计（不含业务数据）`;

let p1 = header1;
p1 += sec('1. 业务背景与需求叙述', rd('docs/review/business-background.md').replace(/^# .*\n+/, ''));
p1 += sec('2. 项目约定与已锁定业务规则（CLAUDE.md）', rd('CLAUDE.md').replace(/^# /m, '## '));
p1 += sec('3. 实施计划书', rd('docs/implementation-plan.md'));
p1 += sec('4. 表结构规格', schemaFiles.filter((f) => f !== 'base-build-checklist.md').map((f) => `## 文件：docs/schema/${f}\n\n` + rd('docs/schema/' + f).replace(/^# /m, '### ')).join('\n\n'));
p1 += sec('5. 多维表格建设清单', rd('docs/schema/base-build-checklist.md'));
p1 += sec('6. 待确认事项', rd('docs/open-questions.md'));
p1 += sec('7. 企微导出数据的列结构与填充统计', rd('docs/data-profile/wecom-export-2026-11-04.md'));

const codeFiles = ['prototype/engine.js', 'prototype/assets/common.js', 'prototype/assets/nlp.js', 'prototype/assets/stock-chart.js'];
let p2 = `# 评审包 2：原型说明与核心代码

本文件由 \`scripts/build-review-pack.mjs\` 自动生成。原型的计算逻辑跑在浏览器里，仅用于让业务方评审，不是后端实现；评审时请区分「原型简化」和「规格问题」。数据全部虚构。`;
p2 += sec('1. 原型说明', rd('docs/review/prototype-overview.md').replace(/^# .*\n+/, ''));
p2 += sec('2. 核心代码（附录）', '以下四个文件是原型里与业务规则最相关的部分：预测引擎与库存断料约束、状态推导与时序校验、自然语言解析、库存曲线。页面的 HTML 和样式不在这里。\n\n' + codeFiles.map((f) => `## ${f}\n\n` + fence('js', rd(f))).join('\n\n'));

writeFileSync(join(root, 'docs/review/review-pack-1-spec.md'), clean(p1));
writeFileSync(join(root, 'docs/review/review-pack-2-prototype.md'), clean(p2));
const n = (s) => s.length.toLocaleString();
console.log('review-pack-1-spec.md', n(clean(p1)), '字符');
console.log('review-pack-2-prototype.md', n(clean(p2)), '字符');

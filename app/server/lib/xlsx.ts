// 零依赖的 .xlsx 读取：只读第一个（或指定名称的）工作表，第一个非空行作表头，返回「表头 → 值」的行。
// 够用的范围：共享字符串、内联字符串、数字、布尔、错误值（#VALUE! 原样保留成字符串）、公式的缓存值。
// 日期在 xlsx 里就是数字（序列号），这里不转换，交给 parseDateTime 按列处理。
import zlib from 'node:zlib';

interface Entry { name: string; method: number; csize: number; offset: number }

function readZip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('不是有效的 .xlsx 文件（找不到压缩目录）');
  const n = buf.readUInt16LE(eocd + 10), dirOffset = buf.readUInt32LE(eocd + 16), entries: Entry[] = [];
  let p = dirOffset;
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('.xlsx 文件损坏（压缩目录）');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), offset = buf.readUInt32LE(p + 42);
    entries.push({ name: buf.toString('utf8', p + 46, p + 46 + nameLen), method, csize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const out = new Map<string, Buffer>();
  for (const e of entries) {
    if (e.name.endsWith('/')) continue;
    if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new Error('.xlsx 文件损坏（' + e.name + '）');
    const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28), raw = buf.subarray(start, start + e.csize);
    out.set(e.name, e.method === 0 ? raw : e.method === 8 ? zlib.inflateRawSync(raw) : (() => { throw new Error('不支持的压缩方式：' + e.method); })());
  }
  return out;
}

const decode = (s: string) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, c: string) => c[0] === '#' ? String.fromCodePoint(c[1] === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10)) : ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[c]);
const attr = (tag: string, name: string) => { const m = tag.match(new RegExp('\\b' + name + '="([^"]*)"')); return m ? decode(m[1]) : null; };
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

/** 列字母 → 从 0 开始的列号：A=0, Z=25, AA=26 */
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

export interface SheetData { name: string; header: string[]; rows: Array<Record<string, unknown>> }

export function readXlsx(buf: Buffer, sheetName?: string): SheetData {
  const files = readZip(buf), get = (n: string) => files.get(n)?.toString('utf8');
  const wb = get('xl/workbook.xml');
  if (!wb) throw new Error('不是有效的 .xlsx 文件（缺少 workbook）');
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: attr(m[0], 'name') || '', rid: attr(m[0], 'r:id') || '' }));
  const sheet = sheetName ? sheets.find((s) => s.name === sheetName) : sheets[0];
  if (!sheet) throw new Error(sheetName ? '找不到工作表：' + sheetName : '文件里没有工作表');
  const rels = get('xl/_rels/workbook.xml.rels') || '', rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'Id') === sheet.rid);
  const target = rel ? attr(rel, 'Target') : null;
  const path = target ? (target.startsWith('/') ? target.slice(1) : 'xl/' + target) : 'xl/worksheets/sheet1.xml', xml = get(path);
  if (!xml) throw new Error('找不到工作表内容：' + path);

  const shared: string[] = [...(get('xl/sharedStrings.xml') || '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const grid: Array<Map<number, unknown>> = [];
  for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells = new Map<number, unknown>();
    for (const cm of (rm[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = cm[1], body = cm[2] || '', t = attr(head, 't'), ref = attr(head, 'r');
      if (!ref) continue;
      const v = body.match(/<v>([\s\S]*?)<\/v>/);
      let val: unknown = null;
      if (t === 'inlineStr') val = textOf(body);
      else if (v) {
        const raw = decode(v[1]);
        val = t === 's' ? shared[Number(raw)] ?? '' : t === 'b' ? raw === '1' : t === 'e' || t === 'str' ? raw : raw === '' ? null : Number(raw);
      }
      if (val !== null && val !== '') cells.set(colIndex(ref), val);
    }
    grid.push(cells);
  }
  const hi = grid.findIndex((r) => r.size > 0);
  if (hi < 0) return { name: sheet.name, header: [], rows: [] };
  const width = Math.max(...grid[hi].keys()) + 1, header = Array.from({ length: width }, (_, i) => String(grid[hi].get(i) ?? '').trim());
  const rows: Array<Record<string, unknown>> = [];
  for (const r of grid.slice(hi + 1)) {
    if (!r.size) continue;
    const o: Record<string, unknown> = {};
    header.forEach((h, i) => { if (h && r.has(i)) o[h] = r.get(i); });
    if (Object.keys(o).length) rows.push(o);
  }
  return { name: sheet.name, header: header.filter(Boolean), rows };
}

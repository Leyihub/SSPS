// 测试用的最小 .xlsx 写入器（存储方式、不压缩；只为生成读取器的测试样本）。
import zlib from 'node:zlib';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const col = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

export type Cell = string | number | boolean | null | { err: string } | { inline: string } | { formula: string; cached: number | string };

function zip(files: Record<string, string>, deflate = false): Buffer {
  const parts: Buffer[] = [], dir: Buffer[] = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const nm = Buffer.from(name), data = Buffer.from(text), body = deflate ? zlib.deflateRawSync(data) : data, crc = zlib.crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(deflate ? 8 : 0, 8); lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(deflate ? 8 : 0, 10); ch.writeUInt32LE(crc >>> 0, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, nm, body); dir.push(ch, nm); off += 30 + nm.length + body.length;
  }
  const d = Buffer.concat(dir), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(dir.length / 2, 8); end.writeUInt16LE(dir.length / 2, 10); end.writeUInt32LE(d.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, d, end]);
}

/** @param sheets 工作表名 → 二维数组（第一行是表头）。字符串走共享字符串表 */
export function buildXlsx(sheets: Record<string, Cell[][]>, opt: { deflate?: boolean } = {}): Buffer {
  const shared: string[] = [], si = (s: string) => { let i = shared.indexOf(s); if (i < 0) { shared.push(s); i = shared.length - 1; } return i; };
  const names = Object.keys(sheets), files: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="worksheet" Target="worksheets/s${i + 1}.xml"/>`).join('') + '</Relationships>',
  };
  names.forEach((n, i) => {
    const rows = sheets[n].map((r, ri) => `<row r="${ri + 1}">` + r.map((c, ci) => {
      const ref = col(ci) + (ri + 1);
      if (c === null) return '';
      if (typeof c === 'string') return `<c r="${ref}" t="s"><v>${si(c)}</v></c>`;
      if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`;
      if (typeof c === 'boolean') return `<c r="${ref}" t="b"><v>${c ? 1 : 0}</v></c>`;
      if ('err' in c) return `<c r="${ref}" t="e"><v>${esc(c.err)}</v></c>`;
      if ('inline' in c) return `<c r="${ref}" t="inlineStr"><is><t>${esc(c.inline)}</t></is></c>`;
      return `<c r="${ref}"${typeof c.cached === 'string' ? ' t="str"' : ''}><f>${esc(c.formula)}</f><v>${esc(String(c.cached))}</v></c>`;
    }).join('') + '</row>').join('');
    files[`xl/worksheets/s${i + 1}.xml`] = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  files['xl/sharedStrings.xml'] = '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') + '</sst>';
  return zip(files, opt.deflate);
}

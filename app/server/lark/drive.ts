// 飞书云空间：列出文件夹里的文件、下载文件（拉取靠船计划用）。限流与错误处理同多维表格；令牌只在这里用，不进日志。
import { RetryableError } from './queue';

const BASE = 'https://open.feishu.cn/open-apis';
const RATE_LIMIT_CODES = new Set([99991400, 1254290, 1254291]);

export interface DriveFile { token: string; name: string; type: string; modifiedTime: string | null }

export function createDrive({ getToken, fetchFn = fetch, base = BASE }: { getToken: () => Promise<string>; fetchFn?: typeof fetch; base?: string }) {
  const auth = async () => ({ Authorization: 'Bearer ' + (await getToken()) });
  return {
    /** 文件夹下的文件（不含子文件夹），按修改时间从旧到新；翻页取全 */
    async listFolder(folderToken: string): Promise<DriveFile[]> {
      const out: DriveFile[] = []; let pageToken = '';
      do {
        const res = await fetchFn(`${base}/drive/v1/files?folder_token=${encodeURIComponent(folderToken)}&page_size=200${pageToken ? '&page_token=' + encodeURIComponent(pageToken) : ''}`, { headers: await auth() });
        if (res.status === 429) throw new RetryableError('飞书限流（HTTP 429）');
        const json: any = await res.json();
        if (json.code !== 0) { if (RATE_LIMIT_CODES.has(json.code)) throw new RetryableError('飞书限流：' + json.code); throw new Error('读取云空间文件夹失败 ' + json.code + '：' + json.msg); }
        for (const f of json.data?.files ?? []) if (f.type !== 'folder') out.push({ token: f.token, name: f.name, type: f.type, modifiedTime: f.modified_time ? new Date(Number(f.modified_time) * (String(f.modified_time).length <= 10 ? 1000 : 1)).toISOString() : null });
        pageToken = json.data?.has_more ? json.data.next_page_token || json.data.page_token || '' : '';
      } while (pageToken);
      return out.sort((a, b) => (a.modifiedTime ?? '').localeCompare(b.modifiedTime ?? ''));
    },
    /** 下载文件内容。超过 20MB 拒绝（靠船计划表远小于这个值） */
    async download(fileToken: string, maxBytes = 20 * 1024 * 1024): Promise<Buffer> {
      const res = await fetchFn(`${base}/drive/v1/files/${encodeURIComponent(fileToken)}/download`, { headers: await auth() });
      if (res.status === 429) throw new RetryableError('飞书限流（HTTP 429）');
      if (!res.ok) { let msg = ''; try { const j: any = await res.json(); msg = j.code + '：' + j.msg; } catch { msg = 'HTTP ' + res.status; } throw new Error('下载云空间文件失败 ' + msg); }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) throw new Error('文件超过 20MB，已拒绝');
      return buf;
    },
  };
}

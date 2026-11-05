// 接口调用：全部走平台提供的 axios（带登录态），读用 useQuery，写用 useMutation（retry: false，写请求带幂等键）。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { getApiErrorMessage } from '@/lib/api-error';
import type { BerthBatchDto, BerthDto, DataIssueDto, InventoryItemDto, MeResult, PortRowDto, RouteRuleDto, VesselDto, VoyageDetail, VoyageListResult } from '@shared/api.interface';

const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
const get = <T>(url: string, params?: Record<string, unknown>) => axiosForBackend.get<T>(url, { params }).then((r) => r.data);
const send = <T>(method: 'post' | 'patch' | 'delete', url: string, body?: unknown, key = uid()) =>
  axiosForBackend.request<T>({ method, url, data: body, headers: { 'x-idempotency-key': key } }).then((r) => r.data);

/** 去掉空值再作为查询参数 */
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => get<MeResult>('/api/me'), staleTime: 60_000 });
export const useVoyages = (q: Record<string, unknown>) => useQuery({ queryKey: ['voyages', q], queryFn: () => get<VoyageListResult>('/api/voyages', clean(q)), placeholderData: (prev) => prev });
export const useVoyage = (id: string) => useQuery({ queryKey: ['voyage', id], queryFn: () => get<VoyageDetail>('/api/voyages/' + encodeURIComponent(id)), enabled: !!id });
export const usePorts = (q?: string) => useQuery({ queryKey: ['ports', q ?? ''], queryFn: () => get<PortRowDto[]>('/api/ports', clean({ q })), staleTime: 60_000 });
export const useBerths = () => useQuery({ queryKey: ['berths'], queryFn: () => get<BerthDto[]>('/api/berths'), staleTime: 60_000 });
export const useVessels = (q?: string) => useQuery({ queryKey: ['vessels', q ?? ''], queryFn: () => get<VesselDto[]>('/api/vessels', clean({ q })), staleTime: 60_000 });
export const useRouteRules = () => useQuery({ queryKey: ['route-rules'], queryFn: () => get<RouteRuleDto[]>('/api/route-rules') });
export const useIssues = (q: Record<string, unknown> = {}) => useQuery({ queryKey: ['issues', q], queryFn: () => get<DataIssueDto[]>('/api/data-issues', clean(q)) });
export const useBerthBatches = () => useQuery({ queryKey: ['berth-batches'], queryFn: () => get<BerthBatchDto[]>('/api/berth-plans/batches') });
export const useBerthRows = (batchNo?: string, status?: string) => useQuery({ queryKey: ['berth-rows', batchNo, status], queryFn: () => get<Array<Record<string, unknown>>>(`/api/berth-plans/batches/${batchNo}/rows`, clean({ status })), enabled: !!batchNo });
export interface InventoryStaleDto { stale: boolean; since: string | null; changes: Array<{ voyageId: string; voyageNo: string; vessel: string | null; item: string; field: string; at: string }> }
export const useInventory = () => useQuery({ queryKey: ['inventory'], queryFn: () => get<{ batch: Record<string, unknown> | null; items: InventoryItemDto[]; errorRows: Array<Record<string, unknown>>; stale: InventoryStaleDto }>('/api/inventory') });
export const useCalendar = (tons: number, days = 30) => useQuery({ queryKey: ['calendar', tons, days], queryFn: () => get<any>('/api/capacity/calendar', { tons, days }) });
export const useDayDetail = (date: string | null, tons: number) => useQuery({ queryKey: ['cal-day', date, tons], queryFn: () => get<any>('/api/capacity/day', { date, tons }), enabled: !!date });
export const useTrend = (name: string | null, marks: Array<{ d: number; tons: number }>, until?: number) => useQuery({ queryKey: ['trend', name, marks, until], queryFn: () => send<any>('post', '/api/inventory/trend', { name, marks, until }), enabled: !!name });
export const useSyncLogs = (failOnly: boolean, enabled: boolean) => useQuery({ queryKey: ['sync-logs', failOnly], queryFn: () => get<Array<{ type: string; start: string; end: string; n: number; ok: string; err: string }>>('/api/admin/sync-logs', failOnly ? { failOnly: 1 } : {}), enabled });
export const useHealth = (enabled: boolean) => useQuery({ queryKey: ['health'], queryFn: () => get<{ at: string; checks: Array<{ name: string; status: string; detail: string }> }>('/api/health'), enabled });
export const usePrediction = (runNo?: string) => useQuery({ queryKey: ['prediction', runNo], queryFn: () => get<any>('/api/predictions/' + runNo), enabled: !!runNo });

type Inval = string[][];
/** 通用写操作：成功后刷新相关查询，失败弹出后端给的中文原因 */
export function useWrite<TBody = unknown, TRes = unknown>(fn: (body: TBody, key: string) => Promise<TRes>, invalidate: Inval = [], okMsg?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => fn(body, uid()),
    retry: false,
    onSuccess: () => { invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k })); if (okMsg) toast.success(okMsg); },
    onError: (e) => toast.error(getApiErrorMessage(e, '保存失败，请稍后重试')),
  });
}

export const api = {
  listAll: (q: Record<string, unknown>) => get<VoyageListResult>('/api/voyages', clean(q)),
  createVoyage: (b: unknown, key?: string) => send<{ voyage: { id: string } }>('post', '/api/voyages', b, key),
  patchVoyage: (id: string, b: unknown, key?: string) => send('patch', `/api/voyages/${id}`, b, key),
  milestone: (id: string, field: string, value: string, key?: string) => send('post', `/api/voyages/${id}/milestones`, { field, value }, key),
  eta: (id: string, eta: string, basis: string, key?: string) => send('post', `/api/voyages/${id}/eta`, { eta, basis }, key),
  flag: (id: string, flag: string, on: boolean, key?: string) => send('post', `/api/voyages/${id}/flags`, { flag, on }, key),
  addCargo: (id: string, b: unknown, key?: string) => send('post', `/api/voyages/${id}/cargo-lines`, b, key),
  patchCargo: (id: string, no: string, b: unknown, key?: string) => send('patch', `/api/voyages/${id}/cargo-lines/${no}`, b, key),
  deleteCargo: (id: string, no: string, key?: string) => send('delete', `/api/voyages/${id}/cargo-lines/${no}`, undefined, key),
  settlement: (id: string, b: unknown, key?: string) => send('patch', `/api/voyages/${id}/bulk-settlement`, b, key),
  salesExt: (id: string, b: unknown, key?: string) => send('patch', `/api/voyages/${id}/sales-ext`, b, key),
  predict: (b: unknown) => send<any>('post', '/api/predictions', b),
  stockPlan: (b: unknown) => send<any>('post', '/api/predictions/stock-plan', b),
  parse: (text: string, overrides?: unknown) => send<any>('post', '/api/predictions/parse', { text, overrides }),
  adopt: (runNo: string, label: string, voyageId?: string, key?: string) => send<any>('post', `/api/predictions/${runNo}/adopt`, { label, voyageId }, key),
  announce: (runNo: string, label: string) => send<any>('post', `/api/predictions/${runNo}/announcement`, { label }),
  setIssue: (id: string, status: '处理中' | '已关闭') => send('patch', `/api/data-issues/${id}`, { status }),
  importBerthFile: (file: File, planDate?: string) => { const f = new FormData(); f.append('file', file); if (planDate) f.append('planDate', planDate); return axiosForBackend.post('/api/berth-plans/import-file', f, { headers: { 'x-idempotency-key': uid() } }).then((r) => r.data); },
  importInventoryFile: (file: File) => { const f = new FormData(); f.append('file', file); return axiosForBackend.post('/api/inventory/import-file', f, { headers: { 'x-idempotency-key': uid() } }).then((r) => r.data); },
  addPort: (b: unknown) => send('post', '/api/ports', b), patchPort: (en: string, b: unknown) => send('patch', `/api/ports/${en}`, b),
  addBerth: (b: unknown) => send('post', '/api/berths', b), patchBerth: (code: string, b: unknown) => send('patch', `/api/berths/${code}`, b),
  addVessel: (b: unknown) => send('post', '/api/vessels', b), patchVessel: (id: string, b: unknown) => send('patch', `/api/vessels/${id}`, b),
  addRule: (b: unknown) => send('post', '/api/route-rules', b), patchRule: (id: string, b: unknown) => send('patch', `/api/route-rules/${id}`, b),
  recompute: () => send<{ rules: number; changed: number; switched: string[] }>('post', '/api/route-rules/recompute'),
};
export { getApiErrorMessage };

// 靠船计划（D03/D04）与库存消耗模拟表（D09/D10/D12）的批次存储端口。
// 写入约定：整批写完、校验通过后，才把「当前批次」指针切到新批次；中途失败时预测继续用上一批。
import type { InventoryItem, PlanRow } from '../domain/types';

export interface BerthBatch {
  batchNo: string; planDate: string; source: '飞书云空间' | '手动上传'; fileName: string; fileToken: string | null;
  total: number; active: number; history: number; anomaly: number; coverTo: string | null; validation: string | null;
  status: '成功' | '部分失败' | '失败'; isCurrent: boolean; importedBy: string; importedAt: string;
}
export interface BerthRow { line: number; status: 'active' | 'history' | 'anomaly'; terminal: string; berthRaw: string; berth: string | null; inPool: boolean; vessel: string; shipType: string; cargo: string; tons: number | null; owner: string; eta: string | null; start: string | null; end: string | null; matchVoyage: string | null; issue?: { code: string; text: string }; raw: Record<string, unknown> }

export interface InventoryBatch {
  batchNo: string; importDate: string; source: '飞书云空间' | '手动上传'; fileName: string; fileToken: string | null;
  rows: number; items: number; errorRows: number; status: '成功' | '失败'; isCurrent: boolean; importedBy: string; importedAt: string;
}

export interface ImportStorePort {
  /** 写入一批（批次 + 全部原始行）。status 为「成功」时才切当前指针。同一幂等键只执行一次 */
  saveBerthBatch(b: Omit<BerthBatch, 'isCurrent'>, rows: BerthRow[], key?: string): Promise<BerthBatch>;
  berthBatches(): Promise<BerthBatch[]>;
  berthRows(batchNo: string): Promise<BerthRow[] | null>;
  currentBerthBatch(): Promise<BerthBatch | null>;
  currentPlanRows(): Promise<PlanRow[]>;                                   // 当前批次里 active 的行，字段对齐引擎
  hasFileToken(token: string): Promise<boolean>;                           // 云空间拉取按文件 token 去重

  saveInventoryBatch(b: Omit<InventoryBatch, 'isCurrent'>, items: InventoryItem[], errorRows: Array<Record<string, unknown>>, key?: string): Promise<InventoryBatch>;
  inventoryBatches(): Promise<InventoryBatch[]>;
  currentInventory(): Promise<{ batch: InventoryBatch | null; items: InventoryItem[]; errorRows: Array<Record<string, unknown>> }>;
}

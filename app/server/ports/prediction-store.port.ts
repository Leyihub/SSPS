// 预测结果的持久化（D05 prediction_run / D06 prediction_plan / D07 announcement）。
export interface StoredRun {
  runNo: string;
  run: Record<string, unknown>;                  // toRunRecord 的结果
  plans: Array<Record<string, unknown>>;         // toPlanRecord 的结果（含 S1 溯源）
  announcements: Array<{ label: string; parts: Array<{ t: string; v?: boolean }>; text: string; by: string; at: string }>;
}

export interface PredictionStorePort {
  nextRunNo(dateIso: string): Promise<string>;
  save(r: Pick<StoredRun, 'runNo' | 'run' | 'plans'>): Promise<void>;
  get(runNo: string): Promise<StoredRun | null>;
  adopt(runNo: string, label: 'A' | 'B', voyageNo: string | null): Promise<void>;
  saveAnnouncement(runNo: string, a: StoredRun['announcements'][number]): Promise<void>;
}

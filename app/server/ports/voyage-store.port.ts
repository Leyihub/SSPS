// 航次数据的读写端口。真实实现：读应用库镜像表 m_*，写走「先写飞书（经单线程写队列、幂等键）、成功后回写镜像、记日志」；
// 这里是接口，服务层只依赖它。
import type { CargoLine, SalesExt, Settlement, Voyage } from '../domain/voyage';

export interface ChangeEntry { voyage: string; field: string; old: string | null; nw: string | null; by: string; at: string; masked?: boolean }
export interface EtaRevision { voyage: string; node: string; old: string | null; nw: string; basis: string; by: string; at: string }
export interface DataIssue { object: string; type: string; field?: string; note: string; owner: string }
export type NewVoyage = Omit<Voyage, 'id' | 'status'>;
export type NewCargo = Omit<CargoLine, 'no' | 'voyage'>;

export interface VoyageStorePort {
  list(): Promise<Voyage[]>;
  get(id: string): Promise<Voyage | null>;
  create(v: NewVoyage, cargo: NewCargo[], key?: string): Promise<{ voyage: Voyage; cargo: CargoLine[] }>;
  update(id: string, patch: Partial<Voyage>, key?: string): Promise<Voyage>;
  cargo(id: string): Promise<CargoLine[]>;
  addCargo(id: string, line: NewCargo, key?: string): Promise<CargoLine>;
  updateCargo(id: string, no: string, patch: Partial<CargoLine>, key?: string): Promise<CargoLine>;
  deleteCargo(id: string, no: string, key?: string): Promise<void>;
  /** 批量读（一次查询）：列表搜索、兼容表刷新、库存过期判断这类要扫全部航次的地方用，不要逐条 cargo(id) */
  cargoByVoyage(): Promise<Map<string, CargoLine[]>>;
  settlementByVoyage(): Promise<Map<string, Settlement>>;
  salesExtByVoyage(): Promise<Map<string, SalesExt>>;
  settlement(id: string): Promise<Settlement | null>;
  saveSettlement(id: string, patch: Settlement, key?: string): Promise<Settlement>;
  salesExt(id: string): Promise<SalesExt | null>;
  saveSalesExt(id: string, patch: Partial<SalesExt>, key?: string): Promise<SalesExt>;
  etaRevisions(id: string): Promise<EtaRevision[]>;
  addEtaRevision(r: EtaRevision): Promise<void>;
  changeLog(id: string): Promise<ChangeEntry[]>;
  addChangeLog(entries: ChangeEntry[]): Promise<void>;
  /** 数据质量问题：同一对象同类问题只保留一条未关闭的 */
  addIssues(issues: DataIssue[]): Promise<void>;
  issues(): Promise<Array<DataIssue & { id: string; status: string; closedBy?: string | null; closedAt?: string | null }>>;
  closeIssue(id: string, by: string, at: string): Promise<void>;
  /** 改问题状态（处理中 / 已关闭）；关闭时记关闭人和时间 */
  setIssueStatus(id: string, status: '处理中' | '已关闭', by: string, at: string): Promise<void>;
}

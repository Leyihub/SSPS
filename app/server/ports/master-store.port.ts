// 主数据读写端口。真实实现：读镜像表 m_port / m_berth / m_vessel / m_route_rule，写走飞书多维表格（单线程队列、幂等键）后回写镜像。
import type { Berth, RouteRuleRow } from '../domain/types';
import type { PortRow, VesselRow } from '../domain/master';

export interface RouteStat { id: string; samples: number; p50: number | null; p80: number | null }

export interface MasterStorePort {
  ports(): Promise<PortRow[]>;
  savePort(p: PortRow, key?: string): Promise<PortRow>;                                  // 按英文标准名新增或更新
  berths(): Promise<Berth[]>;
  saveBerth(b: Berth, key?: string): Promise<Berth>;                                     // 按泊位编码新增或更新
  vessels(): Promise<VesselRow[]>;
  saveVessel(v: Omit<VesselRow, 'id'> & { id?: string }, key?: string): Promise<VesselRow>;
  routeRules(): Promise<RouteRuleRow[]>;
  saveRouteRule(r: Omit<RouteRuleRow, 'id'> & { id?: string }, key?: string): Promise<RouteRuleRow>;
  saveRouteStats(stats: RouteStat[]): Promise<void>;                                     // 每日重算只写统计列
}

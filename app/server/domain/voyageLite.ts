// 航次 → 预测引擎用的精简航次（重叠船数密度判断用）：窗口取本港侧的计划窗口；没有计划窗口就退回 ETA / 实际到达那一天。
import type { VoyageLite } from './types';
import type { CargoLine, Voyage } from './voyage';
import { sideOfVoyage } from './voyage';
import { deriveStatus } from './status';

export function toLite(v: Voyage, cargo: Pick<CargoLine, 'tons'>[]): VoyageLite | null {
  const side = sideOfVoyage(v), s = side === '装' ? v.laycanS : v.planDischS, e = side === '装' ? v.laycanE : v.planDischE;
  const fb = (side === '装' ? v.actLoadArr : v.actDischArr) || v.eta;
  const winStart = (s || e || fb || '').slice(0, 10), winEnd = (e || s || fb || '').slice(0, 10);
  if (!winStart) return null;
  return { id: v.id, flags: v.flags, winStart, winEnd, totalTons: cargo.reduce((a, c) => a + (Number(c.tons) || 0), 0), vessel: v.vessel, load: v.load, disch: v.disch, biz: v.biz as VoyageLite['biz'], localSide: side, status: deriveStatus(v) };
}

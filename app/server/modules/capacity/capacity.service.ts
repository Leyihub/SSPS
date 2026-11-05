import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import { SNAPSHOT_PORT } from '../../ports/tokens';
import type { SnapshotPort } from '../../ports/snapshot.port';
import { createCapacity, toApiResult } from '../../engine';
import { dn } from '../../lib/dates';

@Injectable()
export class CapacityService {
  constructor(@Inject(SNAPSHOT_PORT) private readonly snap: SnapshotPort) {}

  private async cap() {
    const s = await this.snap.load();
    return { s, c: createCapacity({ today: s.today, berths: s.berths, planRows: s.planRows, voyages: s.voyages }) };
  }

  /** A20：港口容量日历。≤15 天每日泊位余量（CMR），＞15 天同期船数；无数据返回 state=nodata，绝不返回 0 */
  async calendar(tons: number, days: number) {
    const { s, c } = await this.cap();
    const r = c.calendar(tons, days);
    return { today: s.today, tons, pool: { n: r.P.n, total: s.berths.length, codes: r.P.list.map((b: any) => b.code) }, planCoverTo: Number.isFinite(c.planCoverTo) ? c.planCoverTo : null, voyHorizon: Number.isFinite(c.voyHorizon) ? c.voyHorizon : null, days: toApiResult(r.days) };
  }

  /** 某一天的泊位分布与当日船只明细（点击日历用） */
  async day(date: string, tons: number) {
    const { s, c } = await this.cap();
    const d = dn(date);
    if (d < c.today) throw new BusinessException(ResponseCode.VALIDATION_ERROR, '只能看今天及以后的日期', HttpStatus.UNPROCESSABLE_ENTITY);
    const det = c.dayDetail(d, tons), le = det.mode === 'cmr';
    const berths = s.berths.map((b) => {
      const capable = b.status === '启用' && tons > 0 && b.capacity >= tons;
      const row = le && det.state === 'ok' ? c.rows.find((r: any) => r.inPool && r.berth === b.code && r.s <= d && d <= r.e) : null;
      const state = !capable ? 'off' : !le ? 'cap' : det.state !== 'ok' ? 'nodata' : row ? 'occ' : 'free';
      return { code: b.code, terminal: b.terminal, capacity: b.capacity, status: b.status, category: b.category ?? null, basis: b.basis ?? null, note: b.note ?? null, state,
        vessel: row ? row.vessel : null, cargo: row ? row.cargo : null, tons: row ? row.tons : null, from: row ? row.s : null, to: row ? row.e : null };
    });
    const detail = toApiResult(det);
    if (detail.mode === 'cmr' && Array.isArray(detail.list)) {          // 靠船计划行关联到的航次：页面上船名可以点进去
      detail.list = detail.list.map((x: any) => ({ ...x, matchVoyage: s.planRows.find((r) => r.vessel === x.vessel && r.berth === x.berth)?.matchVoyage ?? null }));
    }
    return { date, tons, detail, berths };
  }
}

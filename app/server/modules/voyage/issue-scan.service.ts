import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import { CONFIG } from '../../config';
import { MASTER_STORE, VOYAGE_STORE } from '../../ports/tokens';
import type { MasterStorePort } from '../../ports/master-store.port';
import type { DataIssue, VoyageStorePort } from '../../ports/voyage-store.port';
import type { Actor } from '../../domain/voyage';
import { deriveStatus } from '../../domain/status';
import { dn } from '../../lib/dates';

/** 由定时扫描产生、也由定时扫描关闭的问题类型。其余类型（缺离装港时间等）在录入时产生，由人关闭 */
export const SCAN_TYPES = ['缺 MMSI', 'ETA 超期未更新'] as const;

/**
 * 数据质量问题的定时扫描（W34 B1）：
 *   缺 MMSI——未结束航次关联的船舶在主数据里没有 MMSI；
 *   ETA 超期未更新——未抵卸港的航次，距上次更新 ETA 超过 ETA_STALE_DAYS 天（只比较日期）。
 * 条件不再成立（补了 MMSI、修订了 ETA、航次结束或取消）时自动关闭，关闭人记「系统」。
 * 只处理 SCAN_TYPES 里的两类；已有未关闭的同类问题不重复生成（store.addIssues 去重）。
 */
@Injectable()
export class IssueScanService {
  constructor(
    @Inject(VOYAGE_STORE) private readonly store: VoyageStorePort,
    @Inject(MASTER_STORE) private readonly master: MasterStorePort,
  ) {}
  clock: () => Date = () => new Date();

  /** a 为 null 表示定时任务（jobs.automation.ts）；否则必须是系统管理员 */
  async scan(a: Actor | null) {
    if (a && a.role !== '系统管理员') throw new BusinessException(ResponseCode.FORBIDDEN, '只有系统管理员或定时任务可以触发扫描', HttpStatus.FORBIDDEN);
    const today = this.clock().toISOString().slice(0, 10), at = this.clock().toISOString().slice(0, 16).replace('T', ' ');
    const [voyages, vessels, open] = await Promise.all([this.store.list(), this.master.vessels(), this.store.issues()]);
    const mmsiOk = new Map(vessels.map((v) => [v.name.toUpperCase(), !!v.mmsi]));
    const want: DataIssue[] = [];
    for (const v of voyages) {
      const st = deriveStatus(v);
      if (v.readonly || st === '已结束' || st === '已结束（取消）') continue;
      if (v.vessel && mmsiOk.get(v.vessel.toUpperCase()) === false) want.push({ object: v.id, type: '缺 MMSI', field: 'vessel', note: `船舶 ${v.vessel} 在主数据里没有 MMSI`, owner: v.owner });
      if (v.eta && !v.actDischArr && v.etaUpdated && dn(today) - dn(v.etaUpdated) > CONFIG.ETA_STALE_DAYS) want.push({ object: v.id, type: 'ETA 超期未更新', field: 'eta', note: `预计到达时间已超过 ${CONFIG.ETA_STALE_DAYS} 天没有更新（上次更新 ${v.etaUpdated.slice(0, 10)}）`, owner: v.owner });
    }
    const key = (i: { object: string; type: string }) => i.object + '|' + i.type, keep = new Set(want.map(key));
    const stale = open.filter((i) => (SCAN_TYPES as readonly string[]).includes(i.type) && i.status !== '已关闭' && !keep.has(key(i)));
    for (const i of stale) await this.store.closeIssue(i.id, '系统', at);
    const before = new Set(open.filter((i) => i.status !== '已关闭').map(key));
    const fresh = want.filter((w) => !before.has(key(w)));
    await this.store.addIssues(fresh);
    return { created: fresh.length, closed: stale.length, open: want.length };
  }
}

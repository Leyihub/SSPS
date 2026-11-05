import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/interfaces/exception.interface';
import { ResponseCode } from '../../common/constants/api_response_code';
import { SNAPSHOT_PORT, PREDICTION_STORE } from '../../ports/tokens';
import type { SnapshotPort } from '../../ports/snapshot.port';
import type { PredictionStorePort } from '../../ports/prediction-store.port';
import type { Snapshot } from '../../domain/types';
import { buildRule } from '../../domain/routeRules';
import { createEngine, toApiResult, toRunRecord, toPlanRecord, announceFromProvenance } from '../../engine';
import { createParser } from '../../nlp/parse';
import { dn } from '../../lib/dates';
import type { PredictDto } from './prediction.dto';

export interface UserLite { userId?: string; userName?: string }

@Injectable()
export class PredictionService {
  constructor(
    @Inject(SNAPSHOT_PORT) private readonly snap: SnapshotPort,
    @Inject(PREDICTION_STORE) private readonly store: PredictionStorePort,
  ) {}

  private build(s: Snapshot) {
    return createEngine({ today: s.today, berths: s.berths, planRows: s.planRows, voyages: s.voyages, routeRules: s.routeRules.map((r) => buildRule(r)), batchNo: s.berthPlanBatch ? s.berthPlanBatch.batchNo : null });
  }
  private portName(s: Snapshot) {
    return (en: string) => { const p = s.ports.find((q) => q.en === en); return p ? p.cn.replace(/（.*?）/g, '') : (en || '未说明'); };
  }

  /** A21：预测。数值全部来自规则引擎；结果（含 S1 溯源）存入 D05/D06 */
  async predict(dto: PredictDto, user: UserLite) {
    const s = await this.snap.load(), engine = this.build(s);
    const item = dto.item ? s.inventory.items.find((x) => x.name === dto.item) : undefined;
    if (dto.item && !item) throw new BusinessException(ResponseCode.VALIDATION_ERROR, '库存里没有这个物料：' + dto.item, HttpStatus.UNPROCESSABLE_ENTITY);
    const res = engine.predict({ biz: dto.biz, tons: dto.tons, load: dto.load, disch: dto.disch, winStart: dto.winStart, winEnd: dto.winEnd, item, buffer: dto.buffer, pathBy: item ? 'end' : undefined });
    if (res.errors.length) throw new BusinessException(ResponseCode.VALIDATION_ERROR, res.errors.join('；'), HttpStatus.UNPROCESSABLE_ENTITY);
    if (res.noRule) return { status: 'no_rule' as const, runNo: null, result: toApiResult(res) };          // 缺航程规则：提示先补经验航程，不编造默认值
    if (res.noCandidate) return { status: 'no_candidate' as const, runNo: null, result: toApiResult(res) };

    const runNo = await this.store.nextRunNo(s.today);
    const meta = { batchNo: s.berthPlanBatch?.batchNo ?? null, planDate: s.berthPlanBatch?.planDate ?? null, batchSource: s.berthPlanBatch?.source ?? null, planCoverTo: engine.planCoverTo, voyHorizon: engine.voyHorizon, inventoryBatchNo: s.inventory.batchNo, runBy: user.userName || user.userId || null, now: new Date().toISOString() };
    await this.store.save({ runNo, run: toRunRecord(res, runNo, meta), plans: res.plans.filter(Boolean).map((p: any) => toPlanRecord(res, p, runNo, meta)) });
    return { status: 'ok' as const, runNo, result: toApiResult(res) };
  }

  /** A22：预测详情（含 S1 溯源） */
  async detail(runNo: string) {
    const r = await this.store.get(runNo);
    if (!r) throw new BusinessException(ResponseCode.NOT_FOUND, '找不到这次预测：' + runNo, HttpStatus.NOT_FOUND);
    return r;
  }

  /** A23：采纳方案。航次写回（改计划窗口或新建待宣船航次）由航次模块完成，这里先标记采纳 */
  async adopt(runNo: string, label: string) {
    const r = await this.detail(runNo);
    if (!r.plans.find((p) => p.label === label)) throw new BusinessException(ResponseCode.NOT_FOUND, '这次预测没有方案 ' + label, HttpStatus.NOT_FOUND);
    await this.store.adopt(runNo, label as 'A' | 'B', null);
    return { runNo, label, adopted: true };
  }

  /** A24：生成宣船文案。只引用方案保存时的数值，不重新计算 */
  async announce(runNo: string, label: string, user: UserLite) {
    const r = await this.detail(runNo), plan = r.plans.find((p) => p.label === label);
    if (!plan) throw new BusinessException(ResponseCode.NOT_FOUND, '这次预测没有方案 ' + label, HttpStatus.NOT_FOUND);
    const s = await this.snap.load();
    const parts = announceFromProvenance(plan.provenance, this.portName(s));
    const a = { label, parts, text: parts.map((x) => x.t).join(''), by: user.userName || user.userId || '', at: new Date().toISOString() };
    await this.store.saveAnnouncement(runNo, a);
    return a;
  }

  /** A29：自然语言解析。只解析、不生成数值（锁定规则 10、11） */
  async parse(text: string, overrides?: { biz?: string; item?: string; tons?: number; load?: string; disch?: string; b?: string }) {
    const s = await this.snap.load();
    const parser = createParser({ today: s.today, ports: s.ports, items: s.inventory.items });
    const ov: any = { ...(overrides || {}) };
    if (typeof ov.item === 'string') ov.item = s.inventory.items.find((x) => x.name === ov.item) ?? null;
    if (typeof ov.b === 'string') ov.b = dn(ov.b);
    return toApiResult(parser.parse(text, ov));
  }
}

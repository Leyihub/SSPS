// 兼容表 T09a（商务海运船舶动态，33 列）与 T09b（大宗到船计划，87 列）的行生成。纯函数，不碰数据库和飞书。
// 每行对应 T05 的一行货物明细（航次没有货物明细时输出一行、货物列留空）；全部列都是文本，空值写空字符串。
// 旧表列与新模型的对应是按列名推断的，哪些列有数据、哪些留空见 docs/schema/compat-mapping.md；其中不确定的项记在 docs/open-questions.md。
import { COLS_A, COLS_B } from './compat-columns';
import { BIZ } from './status';
import type { CargoLine, SalesExt, Settlement, Voyage } from './voyage';

export interface CompatInput { voyage: Voyage; cargo: CargoLine[]; settlement: Settlement | null; sales: SalesExt | null; mmsi: string | null; imo: string | null }
export type CompatRow = Record<string, string>;

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const yn = (b: unknown) => (b ? '是' : '');
const ms = (t: string | null | undefined) => (t ? Date.parse(t.slice(0, 10) + 'T' + (t.length > 10 ? t.slice(11, 16) : '00:00') + ':00Z') : NaN);
const span = (a: string | null, b: string | null, unit: 'd' | 'h') => { const x = ms(a), y = ms(b); return Number.isFinite(x) && Number.isFinite(y) && y >= x ? ((y - x) / (unit === 'd' ? 86400000 : 3600000)).toFixed(2) : ''; };
const day = (t: string | null | undefined) => (t ? t.slice(0, 10) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/** T09a / T09b 分别收哪些业务类型：商务海运表 = 成品销售船 + 物资备件船；大宗到船计划 = 大宗采购船（暂定，见 open-questions） */
export const COMPAT_A_BIZ: string[] = [BIZ.PRODUCT, BIZ.SPARE];
export const COMPAT_B_BIZ: string[] = [BIZ.BULK];

const lines = (i: CompatInput) => (i.cargo.length ? i.cargo : [null]);

export function compatRowsA(inputs: CompatInput[]): CompatRow[] {
  const out: CompatRow[] = []; let n = 0;
  for (const i of inputs) for (const c of lines(i)) {
    const v = i.voyage, late = v.actLoadArr && v.laycanE ? Math.round((ms(day(v.actLoadArr) + ' 00:00') - ms(day(v.laycanE) + ' 00:00')) / 86400000) : 0, lateDays = late > 0 ? String(late) : '';
    const r: Record<(typeof COLS_A)[number], string> = {
      '审核': s(v.review), '关注': yn(v.focus), '业务类型': v.biz, '业务属性': s(v.attr), '序号': String(++n), '租船方式': s(i.sales?.way), 'MMSI': s(i.mmsi), 'IMO': s(i.imo), '船次号': s(v.no),
      '供应商/船名': s(v.vessel), '船舶状态': s(v.status), '货物类型': s(c?.big || c?.name), '目的港': s(v.finalPort || v.disch), '货量（吨）': num(c?.tons), '装港': v.load,
      '受载期（始）': s(v.laycanS), '受载期（止）': s(v.laycanE), '预计抵达装港日期': s(v.planLoadArr), '实际到港日期': s(v.actLoadArr), '实际靠泊时间': s(v.loadBerth), '逾期': lateDays,
      '实际离港日期': s(v.actLoadDep), '卸港': v.disch, '预计卸港到达时间': s(v.eta || v.planDischS), '实际卸港到达时间': s(v.actDischArr), '卸港靠泊时间': s(v.dischBerth),
      '销售合同号': s(c?.contract), '海运合同号': s(i.sales?.contract), '业务员': s(v.owner), '卸港代理': '', '创建人': '', '创建时间': '', '最后编辑时间': '',
    };
    out.push(r);
  }
  return out;
}

export function compatRowsB(inputs: CompatInput[], today: string): CompatRow[] {
  const out: CompatRow[] = []; let n = 0;
  for (const i of inputs) {
    const v = i.voyage, t = i.settlement ?? {}, total = i.cargo.reduce((a, c) => a + (Number(c.tons) || 0), 0);
    const dem = typeof t.demUsd === 'number' ? t.demUsd : null;
    const hand = (d: unknown, label: string) => (d ? `${label} ${s(d)}` : '');
    const inPort = v.dischBerth && day(v.dischBerth) <= today && (!v.dischDep || day(v.dischDep) >= today);       // 在港判断只比日期
    for (const c of lines(i)) {
      const r: Record<(typeof COLS_B)[number], string> = {
        '序号Nomor.seri': String(++n), '类别Kategori': s(v.attr), '物资分类Klasifikasi.bahan': s(c?.big), '合同号Nomor.kontrak': s(c?.contract), '使用单位Unit.penggunaan': s(c?.unit), '供应商Suplier Name': s(c?.party),
        '物资类别Kategori.bahan': s(c?.kind), '货物名称Nama.barang': s(c?.name), '物资别名Alias.Material': s(c?.alias), '归属事业部Departement.pengguna': s(c?.dept2), 'MMSI': s(i.mmsi), 'IMO': s(i.imo), '船名Nama.kapal': s(v.vessel),
        '（系统/Sistem）船舶动态Status Kapal': s(v.status), '（人工/Manual）船舶动态Status Kapal': '', '拼船情况Situasi.berbagi.perahu': i.cargo.length >= 2 ? `拼船（${i.cargo.length}）` : '',
        '总船重量Berat.Kapal': total ? String(total) : '', '干基折算Konversi.BK': num(c?.dry), '装货港Loading Port': v.load, '预计装船重量Perkiraan.berat.kapal': num(c?.tons), '装港重量Berat.Muat': num(c?.loadTons), '溢短装Lebih/Kurang': s(c?.over),
        '检测公司Test Institution': s(c?.inspector), '计划到达装港日期Rencana.Tiba.Muat.': s(v.planLoadArr), '预计开出装港日期Estimasi.Berangkat.': s(v.planLoadDep), '实际开出装港日期Berangkat.Aktual': s(v.actLoadDep),
        '计划到达（始）Rencana.Mulai': s(v.planDischS), '计划到达（止）Rencana.Akhir': s(v.planDischE), '实际到达ETA.Aktual': s(v.actDischArr), '靠港时间Sandar': s(v.dischBerth), '离港时间Berangkat': s(v.dischDep),
        '实际卸船时间/天Bongkar/Hari': span(v.dischBerth, v.dischDep, 'd'), '等泊用时/天Tunggu/Hari': span(v.actDischArr, v.dischBerth, 'd'), '共计用时/天Total/Hari': span(v.actDischArr, v.dischDep, 'd'),
        '实际卸船时间/小时Bongkar/Jam': span(v.dischBerth, v.dischDep, 'h'), '等泊用时/小时': span(v.actDischArr, v.dischBerth, 'h'), '共计用时/小时': span(v.actDischArr, v.dischDep, 'h'), 'TURN TIME': num(t.turn),
        '价格（到岸价）Harga.CIF': '', '卸率/吨Discharge Rate': num(t.rate), '卸港水尺吨位Tonase.berdasarkan.kedalaman.air': num(t.gauge), '滞期费率Biaya.keterlambatan': num(t.demRate),
        '滞期费Demurrage': dem !== null && dem > 0 ? String(dem) : '', '速遣费Dispatch': dem !== null && dem < 0 ? String(-dem) : '', '备注Remark': s(v.remark), '合同执行人员Pelaksana.kontrak': s(c?.exec),
        '卸船进度Proses.pembongkaran.kapal': '', '可用管带机Belt.Tersedia': '', '倒运车数Jumlah.kendaraan': num(t.carTurn),
        '交接状态1Status.serahterima.1': t.noHandover ? '不用交接' : hand(t.sendDay, '已发出'), '交接状态2Status.serahterima.2': t.noHandover ? '不用交接' : hand(t.backDay, '已签回'),
        '跨月船汽运预估吨位Est..Truk.Lintas.Bln': num(t.crossTruck), '跨月船管带机预估运量Est..Belt.Lintas.Bln': num(t.crossBelt), '汽运量Jumlah.angkutan.truk': num(t.truck), '管带机运量Jumlah.angkutan.konveyor': num(t.belt),
        'X1管带机吨位Tonase.konveyor.X1': '', 'X1管带机运量/车Tonase.konveyor.X1/Mobil': num(t.x1Cars), '月份按离港算Bulan.kapal.meninggalkan.dermaga': v.dischDep ? v.dischDep.slice(0, 7) : '',
        '排靠泊位Dermaga': v.planBerths.join(','), '汇率Nilai.tukar': num(t.fx), '港务费单价Tarif.jasa.pelabuhan': num(t.portUnit), '港务费Biaya.pelabuhan.': num(t.portFee), '装卸费Biaya.bongkar.muat': num(t.loadFee),
        '2#管带机未运行Konveyor.2.': '', '3#管带机未运行Konveyor.3.': num(t.beltOff3), '4#管带机未运行Konveyor.4': num(t.beltOff4),
        '1st水尺Pengukur.air.1': num(t.g1), '2st水尺Pengukur.air.2': num(t.g2), '3st水尺Pengukur.air.3': num(t.g3), '4st水尺Pengukur.air.4': '',
        '影响卸船因素/异常反馈Faktor.mempengaruhi.pembongkaran.': s(t.issue), '业务员Admin.operasional': s(v.owner), '小雨保函Garansi.Hujan': yn(t.rain), '备注Keterangan': '', '价格类型Tipe.Harga': '', '创建人Pembuat': '',
        '储运1Logistik.1': '', '储运2Logistik.2': '', '储运3Logistik.3': '', '储运4Logistik.4': '', '储运5Logistik.5': '', '过磅重量Berat.Timbang': num(t.weigh), '其他部门运量Volume.Dept.Lain': num(t.other),
        '业务类型Tipe.Bisnis': v.biz, '今日在港': yn(inPort), '公式': '', '到港日': day(v.actDischArr || v.eta || v.planDischS),
      };
      out.push(r);
    }
  }
  return out;
}

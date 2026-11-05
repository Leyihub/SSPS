// 通用小组件：信息提示、状态标签、弹窗、页签、分页、空态与错误态。样式类来自 ssps.css。
import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { stCls, STATUS_ORDER } from './format';
import { getApiErrorMessage } from './api';

/** 悬停浮窗：解释收在这里，不占版面 */
export function Tip({ text, children }: { text: ReactNode; children?: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const show = (el: HTMLElement) => { const r = el.getBoundingClientRect(); setPos({ x: Math.min(Math.max(8, r.left + r.width / 2 - 170), window.innerWidth - 348), y: r.bottom + 8 }); };
  return (
    <span onMouseEnter={(e) => show(e.currentTarget)} onMouseLeave={() => setPos(null)} onClick={(e) => (pos ? setPos(null) : show(e.currentTarget))} style={{ display: 'inline-flex', alignItems: 'center' }}>
      {children ?? <span className="i">i</span>}
      {pos && createPortal(<div id="tipbox" style={{ display: 'block', left: pos.x, top: pos.y }}>{text}</div>, document.body)}
    </span>
  );
}
export const Info = ({ text }: { text: ReactNode }) => <Tip text={text} />;

export const StatusTag = ({ s }: { s: string }) => <span className={'st ' + stCls(s)}>{s}</span>;
export const STATUS_FILTERS = [...STATUS_ORDER, '已结束（取消）'];

export function Modal({ title, open, onClose, children, footer, width = 560 }: { title: ReactNode; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="mask on" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }}>
        <div className="modal-h"><span>{title}</span><button onClick={onClose} aria-label="关闭">×</button></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>, document.body);
}

export function Tabs<T extends string>({ items, value, onChange }: { items: Array<[T, string, number?]>; value: T; onChange: (v: T) => void }) {
  return <div className="tabs2">{items.map(([k, label, n]) => <button key={k} className={k === value ? 'on' : ''} onClick={() => onChange(k)}>{label}{n != null && <small>{n}</small>}</button>)}</div>;
}

export function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pager">
      <span style={{ color: 'var(--muted)' }}>共 {total} 条，第 {Math.min(page, pages)} / {pages} 页</span>
      <div className="pg">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
        {Array.from({ length: pages }, (_, i) => <button key={i} className={i + 1 === page ? 'on' : ''} onClick={() => onPage(i + 1)}>{i + 1}</button>)}
        <button disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
      </div>
    </div>
  );
}

export const Empty = ({ children = '没有符合条件的数据' }: { children?: ReactNode }) => <div className="empty">{children}</div>;
export const Loading = () => <div className="empty">加载中…</div>;
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <div className="empty" style={{ color: '#cf1322' }}>{getApiErrorMessage(error, '加载失败')}{onRetry && <> <button className="btn" onClick={onRetry}>重试</button></>}</div>;
}
/** 页面顶部标题条 */
export const PageTitle = ({ title, desc, right }: { title: string; desc?: ReactNode; right?: ReactNode }) => (
  <div className="ptitle"><div><h1>{title}</h1>{desc && <p>{desc}</p>}</div>{right && <div className="btns">{right}</div>}</div>
);

/** 库存表可能已过时的提醒：导入之后，相关在途航次改过到港时间 */
export function StaleNotice({ stale }: { stale?: { stale: boolean; since: string | null; changes: Array<{ voyageId: string; voyageNo: string; vessel: string | null; item: string; field: string; at: string }> } }) {
  if (!stale?.stale) return null;
  const list = stale.changes.slice(0, 3).map((c) => `${c.item} · ${c.vessel || c.voyageNo || c.voyageId}（${c.field}，${c.at}）`).join('；');
  return (
    <div role="alert" style={{ margin: '8px 0', padding: '8px 10px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, color: '#ad6800', fontSize: 12, lineHeight: 1.6 }}>
      <b>库存表可能已过时，请重新导入。</b>自 {stale.since} 导入之后，有 {stale.changes.length} 处相关航次改了到港时间：{list}{stale.changes.length > 3 ? ' 等' : ''}。
    </div>
  );
}

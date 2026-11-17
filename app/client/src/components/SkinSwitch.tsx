import { useEffect, useRef, useState } from 'react';

/** 皮肤：与 prototype 侧 prototype/assets/skin.css 同一套 token，仅切换 <html data-skin> */
type SkinId = 'paper' | 'midnight' | 'legacy';

const STORAGE_KEY = 'ssps-skin';

const SKINS: Array<{ id: SkinId; name: string; short: string; desc: string }> = [
  { id: 'paper', name: '暖纸 · 墨黑', short: '暖纸', desc: '默认设计语言' },
  { id: 'midnight', name: '夜墨 · 纸白', short: '夜墨', desc: '暗色，同一结构' },
  { id: 'legacy', name: '经典 · 深蓝', short: '经典', desc: '2025 版 ERP 风格' },
];

const readSkin = (): SkinId => {
  const cur = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-skin') : null;
  return cur === 'midnight' || cur === 'legacy' ? cur : 'paper';
};

/** 右上角皮肤切换下拉。只改外观，不涉及任何业务状态。 */
export default function SkinSwitch() {
  const [skin, setSkin] = useState<SkinId>(readSkin);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id: SkinId) => {
    document.documentElement.setAttribute('data-skin', id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* 无存储时忽略 */
    }
    setSkin(id);
    setOpen(false);
  };

  const cur = SKINS.find((s) => s.id === skin) || SKINS[0];

  return (
    <div className="skin-sw" ref={box}>
      <button
        type="button"
        className="skin-sw-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="切换界面皮肤"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="skin-sw-ico" />
        <span className="skin-sw-label">{cur.short}</span>
        <span className="skin-sw-car" />
      </button>
      <div className="skin-sw-pop" role="listbox" aria-label="界面皮肤" hidden={!open}>
        <div className="skin-sw-t">界面皮肤</div>
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="option"
            className="skin-sw-opt"
            data-skin={s.id}
            aria-selected={s.id === skin}
            onClick={() => pick(s.id)}
          >
            <span className={`skin-sw-pv pv-${s.id}`}>
              <i />
              <i />
            </span>
            <span className="skin-sw-tx">
              <b>{s.name}</b>
              <small>{s.desc}</small>
            </span>
            <span className="skin-sw-ck" />
          </button>
        ))}
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { usePorts } from './api';

/** 港口英文标准名 → 中文名（去掉括号注释）；还没加载或查不到时原样返回 */
export function usePortName() {
  const { data } = usePorts();
  return useMemo(() => {
    const m = new Map((data ?? []).map((p) => [p.en, p.cn.replace(/（.*?）/g, '')]));
    return (en?: string | null) => (en ? m.get(en) ?? en : '—');
  }, [data]);
}

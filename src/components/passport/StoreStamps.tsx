import { STORE_NAMES, STORE_ACCENTS, STORE_SHORT_NAMES } from '@/lib/storeAccents';

interface StoreStampsProps {
  /** 매장 이름 → 누적 방문 횟수 */
  counts: Record<string, number>;
  /** 오늘 방문이 기록된 매장 이름 목록 ("✓ 오늘" 표시) */
  todayStoreNames?: string[];
}

/**
 * 세 매장 도장 — 다녀간 매장은 매장 색으로 채우고, 아직 안 간 매장은 점선 칸으로 보여줍니다.
 */
export default function StoreStamps({ counts, todayStoreNames = [] }: StoreStampsProps) {
  const visitedCount = STORE_NAMES.filter((name) => (counts[name] ?? 0) > 0).length;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-bold text-[#44443C]">세 매장 도장</p>
        <p className="text-[15px] font-extrabold text-[#2D5A3D]">
          {visitedCount} / {STORE_NAMES.length}
        </p>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {STORE_NAMES.map((name) => {
          const accent = STORE_ACCENTS[name];
          const count = counts[name] ?? 0;
          const visited = count > 0;
          return (
            <li
              key={name}
              className={`rounded-xl px-1 py-2.5 text-center border-2 ${visited ? '' : 'border-dashed'}`}
              style={
                visited
                  ? { backgroundColor: accent.bg, borderColor: accent.border }
                  : { backgroundColor: '#FAFAF5', borderColor: '#C9C5B8' }
              }
            >
              <p className="text-[13px] font-bold leading-tight" style={{ color: visited ? accent.text : '#8C8C80' }}>
                {STORE_SHORT_NAMES[name] ?? name}
              </p>
              <p className="mt-1 text-lg font-extrabold leading-none" style={{ color: visited ? accent.text : '#9C988B' }}>
                {visited ? `${count}회` : '미방문'}
              </p>
              {todayStoreNames.includes(name) && (
                <p className="mt-1 text-[11px] font-bold" style={{ color: accent.text }}>
                  ✓ 오늘
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

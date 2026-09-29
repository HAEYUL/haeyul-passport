import { STORE_NAMES, STORE_ACCENTS, STORE_SHORT_NAMES } from '@/lib/storeAccents';

interface StoreStampsProps {
  /** 매장 이름 → 누적 방문 횟수 */
  counts: Record<string, number>;
  /** 오늘 방문이 기록된 매장 이름 목록 ("✓ 오늘" 표시) */
  todayStoreNames?: string[];
}

/**
 * 해율푸드 세 매장 도장 — 다녀간 매장은 매장 색으로 채우고, 아직 안 간 매장은 점선 칸으로 보여줍니다.
 * 보통은 세 칸을 나란히 두고, 휴대폰 글씨를 크게 설정해 칸이 좁아지면
 * 매장명이 중간에 끊기지 않도록 한 줄씩 세로 목록으로 바꿔 보여줍니다.
 */
export default function StoreStamps({ counts, todayStoreNames = [] }: StoreStampsProps) {
  const visitedCount = STORE_NAMES.filter((name) => (counts[name] ?? 0) > 0).length;

  return (
    <div className="@container text-sm space-y-2">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[15px] font-bold text-[#44443C]">해율푸드 세 매장</p>
          <p className="flex-shrink-0 text-[15px] font-extrabold text-[#2D5A3D]">
            {visitedCount} / {STORE_NAMES.length}
          </p>
        </div>
        <p className="text-[13px] font-medium text-[#6B6B5E]">세 매장 방문이 한 여권에 함께 쌓여요</p>
      </div>
      <ul className="grid grid-cols-1 gap-2 @min-[19em]:grid-cols-3">
        {STORE_NAMES.map((name) => {
          const accent = STORE_ACCENTS[name];
          const count = counts[name] ?? 0;
          const visited = count > 0;
          return (
            <li
              key={name}
              className={`flex items-center justify-between gap-2 rounded-xl px-4 py-2.5 border-2
                          @min-[19em]:block @min-[19em]:px-1 @min-[19em]:text-center ${visited ? '' : 'border-dashed'}`}
              style={
                visited
                  ? { backgroundColor: accent.bg, borderColor: accent.border }
                  : { backgroundColor: '#FAFAF5', borderColor: '#C9C5B8' }
              }
            >
              <p className="text-sm font-bold leading-tight" style={{ color: visited ? accent.text : '#6B6B5E' }}>
                {STORE_SHORT_NAMES[name] ?? name}
              </p>
              <p className="text-lg font-extrabold leading-none @min-[19em]:mt-1" style={{ color: visited ? accent.text : '#9C988B' }}>
                {visited ? `${count}회` : '아직'}
              </p>
              {todayStoreNames.includes(name) && (
                <p className="text-[13px] font-bold @min-[19em]:mt-1" style={{ color: accent.text }}>
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

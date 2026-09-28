import { STORE_NAMES, STORE_ACCENTS, STORE_MEAL_LABELS, STORE_PAGE_URLS } from '@/lib/storeAccents';

interface StoreMealListProps {
  title: string;
  /** 보여줄 매장 (기본: 세 매장 모두) */
  storeNames?: readonly string[];
  /** 오늘 방문한 매장 — 링크 대신 "오늘 방문" 표시 */
  todayStoreNames?: string[];
}

/**
 * 세 매장 목록 — 매장 이름을 누르면 해율푸드 홈페이지의 그 매장 소개 페이지로 바로 이동합니다.
 */
export default function StoreMealList({ title, storeNames = STORE_NAMES, todayStoreNames = [] }: StoreMealListProps) {
  return (
    <section className="space-y-2">
      <p className="text-[15px] font-bold text-[#44443C] px-1">{title}</p>
      <ul className="space-y-2">
        {storeNames.map((name) => {
          const accent = STORE_ACCENTS[name];
          const url = STORE_PAGE_URLS[name];
          const isToday = todayStoreNames.includes(name);
          return (
            <li key={name}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-xl py-3 px-4 border-l-[6px] active:scale-[0.98] transition-transform duration-150"
                style={{ backgroundColor: accent.bg, borderLeftColor: accent.border }}
              >
                <div className="min-w-0">
                  <p className="text-base font-bold" style={{ color: accent.text }}>
                    {name}
                  </p>
                  <p className="text-sm font-medium" style={{ color: accent.text }}>
                    {STORE_MEAL_LABELS[name]}
                  </p>
                </div>
                {isToday ? (
                  <span
                    className="flex-shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold text-white"
                    style={{ backgroundColor: accent.border }}
                  >
                    오늘 방문
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-xl font-bold" style={{ color: accent.text }} aria-hidden="true">
                    〉
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

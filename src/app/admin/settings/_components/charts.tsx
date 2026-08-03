'use client';

import { useState } from 'react';

/**
 * dataviz 스킬의 검증된 카테고리 팔레트(라이트 모드) 슬롯.
 * 이 관리자 화면은 다크모드를 지원하지 않으므로 라이트 값만 사용합니다.
 */
export const CHART_COLORS = {
  slot1: '#2a78d6', // blue
  slot2: '#eb6834', // orange
  slot3: '#1baf7a', // aqua
  slot4: '#eda100', // yellow
  slot5: '#e87ba4', // magenta
  slot6: '#008300', // green
  slot7: '#4a3aa7', // violet
  slot8: '#e34948', // red
} as const;

const TIER_COLOR_ORDER = [
  CHART_COLORS.slot1,
  CHART_COLORS.slot3,
  CHART_COLORS.slot6,
  CHART_COLORS.slot7,
  CHART_COLORS.slot4,
];

export function getCategoricalColor(index: number): string {
  const colors = Object.values(CHART_COLORS);
  return colors[index % colors.length];
}

export function getTierColor(index: number): string {
  return TIER_COLOR_ORDER[index % TIER_COLOR_ORDER.length];
}

const GRID_COLOR = '#e1e0d9';
const AXIS_COLOR = '#c3c2b7';
const MUTED_TEXT = '#898781';
const PRIMARY_TEXT = '#0b0b0b';

export interface LineSeries {
  label: string;
  color: string;
  values: number[];
}

/**
 * 얇은 선(2px) + 끝점 마커 + 호버 크로스헤어를 가진 라인차트.
 * 단일/복수 시리즈를 모두 지원하며, 2개 이상이면 범례를 표시합니다.
 */
export function LineChart({
  labels,
  series,
  height = 220,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = Math.max(labels.length * 48, 320);
  const padding = { top: 16, right: 16, bottom: 28, left: 36 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const allValues = series.flatMap((s) => s.values);
  const maxValue = Math.max(1, ...allValues);
  const stepX = labels.length > 1 ? innerWidth / (labels.length - 1) : 0;

  function xFor(i: number) {
    return padding.left + stepX * i;
  }
  function yFor(v: number) {
    return padding.top + innerHeight - (v / maxValue) * innerHeight;
  }

  const gridLines = 4;
  const hasData = allValues.some((v) => v > 0);

  return (
    <div className="space-y-2">
      {series.length > 1 && (
        <div className="flex flex-wrap gap-4 px-1">
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs text-[#52514e]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="select-none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {Array.from({ length: gridLines + 1 }).map((_, i) => {
            const y = padding.top + (innerHeight / gridLines) * i;
            return <line key={i} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={GRID_COLOR} strokeWidth={1} />;
          })}
          <line
            x1={padding.left}
            y1={padding.top + innerHeight}
            x2={width - padding.right}
            y2={padding.top + innerHeight}
            stroke={AXIS_COLOR}
            strokeWidth={1}
          />

          {!hasData ? (
            <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={13} fill={MUTED_TEXT}>
              아직 데이터가 없습니다
            </text>
          ) : (
            <>
              {series.map((s) => {
                const path = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(v)}`).join(' ');
                return (
                  <path key={s.label} d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                );
              })}
              {series.map((s) =>
                s.values.map((v, i) => (
                  <circle
                    key={`${s.label}-${i}`}
                    cx={xFor(i)}
                    cy={yFor(v)}
                    r={hoverIndex === i ? 5 : 3}
                    fill={s.color}
                    stroke="#fcfcfb"
                    strokeWidth={1.5}
                  />
                ))
              )}
            </>
          )}

          {labels.map((label, i) => (
            <rect
              key={i}
              x={xFor(i) - stepX / 2}
              y={padding.top}
              width={stepX || innerWidth}
              height={innerHeight}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {hoverIndex !== null && (
            <line
              x1={xFor(hoverIndex)}
              y1={padding.top}
              x2={xFor(hoverIndex)}
              y2={padding.top + innerHeight}
              stroke={AXIS_COLOR}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          )}

          {labels.map((label, i) => {
            if (labels.length > 10 && i % Math.ceil(labels.length / 8) !== 0) return null;
            return (
              <text key={i} x={xFor(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={MUTED_TEXT}>
                {label}
              </text>
            );
          })}
        </svg>
      </div>
      {hoverIndex !== null && hasData && (
        <div className="bg-white border border-[#e1e0d9] rounded-lg px-3 py-2 text-xs inline-block shadow-sm">
          <p className="font-semibold text-[#0b0b0b] mb-1">{labels[hoverIndex]}</p>
          {series.map((s) => (
            <p key={s.label} className="flex items-center gap-1.5 text-[#52514e]">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color }} />
              {s.label}: <span className="font-semibold text-[#0b0b0b]">{s.values[hoverIndex]}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export interface BarSeriesItem {
  label: string;
  values: { seriesLabel: string; value: number; color: string }[];
}

/**
 * 단일/그룹 막대차트. 각 막대 위에 값 라벨을 표시합니다.
 */
export function BarChart({ items, height = 200 }: { items: BarSeriesItem[]; height?: number }) {
  const seriesLabels = items[0]?.values.map((v) => v.seriesLabel) || [];
  const showLegend = seriesLabels.length > 1;
  const allValues = items.flatMap((it) => it.values.map((v) => v.value));
  const maxValue = Math.max(1, ...allValues);
  const hasData = allValues.some((v) => v > 0);

  const padding = { top: 24, right: 12, bottom: 28, left: 12 };
  const groupWidth = 64;
  const width = Math.max(items.length * groupWidth, 280);
  const innerHeight = height - padding.top - padding.bottom;

  return (
    <div className="space-y-2">
      {showLegend && (
        <div className="flex flex-wrap gap-4 px-1">
          {items[0].values.map((v) => (
            <div key={v.seriesLabel} className="flex items-center gap-1.5 text-xs text-[#52514e]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: v.color }} />
              {v.seriesLabel}
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <line
            x1={0}
            y1={padding.top + innerHeight}
            x2={width}
            y2={padding.top + innerHeight}
            stroke={AXIS_COLOR}
            strokeWidth={1}
          />
          {!hasData ? (
            <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={13} fill={MUTED_TEXT}>
              아직 데이터가 없습니다
            </text>
          ) : (
            items.map((item, groupIndex) => {
              const groupX = groupIndex * groupWidth;
              const barCount = item.values.length;
              const barGap = 3;
              const barWidth = (groupWidth - 16 - barGap * (barCount - 1)) / barCount;
              return (
                <g key={item.label}>
                  {item.values.map((v, i) => {
                    const barHeight = (v.value / maxValue) * innerHeight;
                    const x = groupX + 8 + i * (barWidth + barGap);
                    const y = padding.top + innerHeight - barHeight;
                    return (
                      <g key={v.seriesLabel}>
                        <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, v.value > 0 ? 2 : 0)} rx={3} fill={v.color} />
                        {v.value > 0 && (
                          <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fontSize={11} fill={PRIMARY_TEXT}>
                            {v.value}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <text
                    x={groupX + groupWidth / 2}
                    y={height - 8}
                    textAnchor="middle"
                    fontSize={11}
                    fill={MUTED_TEXT}
                  >
                    {item.label}
                  </text>
                </g>
              );
            })
          )}
        </svg>
      </div>
    </div>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/**
 * 등급별 회원 수처럼 "전체 중 비율"을 보여주는 도넛차트.
 */
export function DonutChart({ slices, size = 180 }: { slices: DonutSlice[]; size?: number }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <p className="text-sm text-[#898781]">아직 데이터가 없습니다</p>
      </div>
    );
  }

  // 각 조각의 시작 오프셋을 렌더링 전에 미리 누적 계산합니다 (렌더 중 변수 변경 방지).
  const dashes = slices.map((s) => (s.value / total) * circumference);
  const offsets = dashes.reduce<number[]>((acc, dash, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + dashes[i - 1]);
    return acc;
  }, []);

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke={GRID_COLOR} strokeWidth={20} />
        {slices.map((s, i) => {
          const dash = dashes[i];
          const gapAdjust = 2; // 2px 표면 간격
          return (
            <circle
              key={s.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={20}
              strokeDasharray={`${Math.max(dash - gapAdjust, 0)} ${circumference - dash + gapAdjust}`}
              strokeDashoffset={-offsets[i]}
              transform={`rotate(-90 ${center} ${center})`}
              strokeLinecap="round"
            />
          );
        })}
        <text x={center} y={center - 4} textAnchor="middle" fontSize={22} fontWeight={700} fill={PRIMARY_TEXT}>
          {total}
        </text>
        <text x={center} y={center + 16} textAnchor="middle" fontSize={11} fill={MUTED_TEXT}>
          전체
        </text>
      </svg>
      <ul className="space-y-1.5">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[#52514e]">{s.label}</span>
            <span className="font-semibold text-[#0b0b0b]">{s.value}명</span>
            <span className="text-xs text-[#898781]">({total > 0 ? Math.round((s.value / total) * 1000) / 10 : 0}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

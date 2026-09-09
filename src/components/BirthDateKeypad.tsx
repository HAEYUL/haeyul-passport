'use client';

interface BirthDateKeypadProps {
  /** 최대 6자리 숫자 문자열 (YYMMDD) */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
}

const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

/**
 * 생년월일 6자리(YYMMDD, 주민번호 앞자리 형식)를 앱 디자인에 맞춘
 * 커스텀 숫자판으로 입력받는 컴포넌트. 가입/로그인 화면에서 공용으로 씁니다.
 */
export default function BirthDateKeypad({ value, onChange, label = '생년월일', required }: BirthDateKeypadProps) {
  function pressDigit(digit: string) {
    if (value.length >= 6) return;
    onChange(value + digit);
  }

  function pressBackspace() {
    onChange(value.slice(0, -1));
  }

  return (
    <div>
      <label className="block text-base font-medium text-[#333] mb-2">
        {label}{' '}
        {required ? (
          <span className="text-red-500">*</span>
        ) : (
          <span className="text-sm text-[#AAA]">(선택)</span>
        )}
      </label>

      <div className="flex gap-2 mb-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-14 flex items-center justify-center text-xl font-bold rounded-xl border-2 transition-colors duration-150 ${
              value[i]
                ? 'border-[#2D5A3D] bg-white text-[#333]'
                : 'border-[#D4D0C8] bg-[#F5F5EC] text-[#B0B0A0]'
            }`}
          >
            {value[i] ?? ''}
          </div>
        ))}
      </div>
      <p className="text-xs text-[#AAA] mb-3">예: 1990년 3월 5일생 → 900305</p>

      <div className="grid grid-cols-3 gap-2">
        {DIGIT_ROWS.flat().map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => pressDigit(digit)}
            className="h-12 rounded-xl bg-white border-2 border-[#D4D0C8] text-lg font-bold text-[#333]
                       active:scale-[0.95] active:bg-[#F5F5EC] transition-all duration-150"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange('')}
          className="h-12 rounded-xl bg-white border-2 border-[#D4D0C8] text-sm font-bold text-[#999]
                     active:scale-[0.95] active:bg-[#F5F5EC] transition-all duration-150"
        >
          전체삭제
        </button>
        <button
          type="button"
          onClick={() => pressDigit('0')}
          className="h-12 rounded-xl bg-white border-2 border-[#D4D0C8] text-lg font-bold text-[#333]
                     active:scale-[0.95] active:bg-[#F5F5EC] transition-all duration-150"
        >
          0
        </button>
        <button
          type="button"
          onClick={pressBackspace}
          className="h-12 rounded-xl bg-white border-2 border-[#D4D0C8] text-lg font-bold text-[#333]
                     active:scale-[0.95] active:bg-[#F5F5EC] transition-all duration-150"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}

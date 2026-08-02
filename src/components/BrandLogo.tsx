import Image from 'next/image';

const LOGO_ASPECT_RATIO = 1536 / 1024;
// 로고 이미지 파일 우측에 포함된 투명 여백 비율 (실제 그림은 이미지 폭의 약 76%까지만 채워져 있음)
const LOGO_RIGHT_PADDING_RATIO = 365 / 1536;

interface BrandLogoProps {
  height?: number;
  textClassName?: string;
}

/**
 * 해율푸드 로고 + 워드마크
 */
export default function BrandLogo({ height = 56, textClassName = 'text-xl' }: BrandLogoProps) {
  const width = Math.round(height * LOGO_ASPECT_RATIO);
  // 이미지 자체의 여백을 상쇄해 텍스트를 로고 그림에 바짝 붙입니다.
  const textMarginLeft = -Math.round(width * LOGO_RIGHT_PADDING_RATIO * 0.85);

  return (
    <div className="flex items-center justify-center">
      <Image src="/logo.png" alt="해율푸드" width={width} height={height} priority />
      <span
        className={`font-bold text-[#2D5A3D] ${textClassName}`}
        style={{ marginLeft: textMarginLeft }}
      >
        해율푸드
      </span>
    </div>
  );
}

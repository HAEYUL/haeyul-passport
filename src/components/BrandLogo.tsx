import Image from 'next/image';

const LOGO_ASPECT_RATIO = 1536 / 1024;

interface BrandLogoProps {
  height?: number;
  textClassName?: string;
}

/**
 * 해율푸드 로고 + 워드마크
 */
export default function BrandLogo({ height = 56, textClassName = 'text-xl' }: BrandLogoProps) {
  const width = Math.round(height * LOGO_ASPECT_RATIO);

  return (
    <div className="flex items-center justify-center gap-2">
      <Image src="/logo.png" alt="해율푸드" width={width} height={height} priority />
      <span className={`font-bold text-[#2D5A3D] ${textClassName}`}>해율푸드</span>
    </div>
  );
}

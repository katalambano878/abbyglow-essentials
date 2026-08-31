import Image from 'next/image';
import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  onClick?: () => void;
  inverted?: boolean;
  compact?: boolean;
};

export default function BrandLogo({ href = '/', onClick, inverted = false, compact = false }: BrandLogoProps) {
  const src = compact ? '/logo-mark.png' : inverted ? '/logo-light.png' : '/logo.png';
  const width = compact ? 40 : 132;
  const height = compact ? 40 : 122;

  const mark = (
    <Image
      src={src}
      alt="AbbyGlow Essentials"
      width={width}
      height={height}
      className={`h-auto w-auto object-contain ${compact ? 'max-h-9' : 'max-h-12 sm:max-h-14'}`}
      priority={!compact}
    />
  );

  if (!href) return mark;

  return (
    <Link href={href} onClick={onClick} className="inline-flex items-center shrink-0" aria-label="AbbyGlow Essentials home">
      {mark}
    </Link>
  );
}

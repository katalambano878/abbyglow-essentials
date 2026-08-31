import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  onClick?: () => void;
  inverted?: boolean;
  compact?: boolean;
};

export default function BrandLogo({ href = '/', onClick, inverted = false, compact = false }: BrandLogoProps) {
  const nameClass = inverted ? 'text-white' : 'text-black';

  const mark = (
    <span className="inline-flex flex-col select-none leading-none">
      <span
        className={`font-black uppercase tracking-tight ${nameClass} ${compact ? 'text-[17px]' : 'text-[22px]'}`}
        style={{ fontStretch: 'condensed' }}
      >
        AbbyGlow
      </span>
      <span className={`font-bold uppercase tracking-[0.22em] ${inverted ? 'text-brand-accent' : 'text-black/50'} ${compact ? 'text-[8px] mt-0.5' : 'text-[9px] mt-1'}`}>
        Essentials
      </span>
    </span>
  );

  if (!href) return mark;

  return (
    <Link href={href} onClick={onClick} className="inline-flex items-center" aria-label="AbbyGlow Essentials home">
      {mark}
    </Link>
  );
}

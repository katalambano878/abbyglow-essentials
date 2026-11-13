import React from 'react';
import Image from 'next/image';

interface PageHeroProps {
    title: string;
    subtitle?: string;
    backgroundImage?: string;
    /** Show the whole background photo instead of cropping it into a short strip. */
    aspectRatio?: string;
    /** Short banner. Used when the photo should not fill the screen. */
    compact?: boolean;
}

export default function PageHero({ title, subtitle, backgroundImage, aspectRatio, compact = false }: PageHeroProps) {
    const frame = compact
        ? 'h-[148px] sm:h-[168px] md:h-[188px]'
        : aspectRatio
          ? ''
          : 'min-h-[32vh] md:min-h-[36vh]';

    return (
        <div
            className={`relative overflow-hidden flex items-center justify-center ${frame} ${!backgroundImage ? 'bg-brand-dark' : ''}`}
            style={!compact && aspectRatio ? { aspectRatio } : undefined}
        >
            {backgroundImage ? (
                <>
                    <Image
                        src={backgroundImage}
                        alt={title}
                        fill
                        className={`object-cover ${compact ? 'object-[center_42%]' : ''}`}
                        priority
                        sizes="100vw"
                        quality={82}
                    />
                    <div className="absolute inset-0 bg-black/40"></div>
                </>
            ) : (
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                </div>
            )}

            <div className={`relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-10 flex flex-col items-center ${compact ? 'py-4' : 'py-12 md:py-14'}`}>
                <h1 className={`font-serif italic font-medium text-white leading-tight drop-shadow-2xl animate-in slide-in-from-bottom-4 duration-700 ${compact ? 'text-2xl md:text-3xl mb-1' : 'text-3xl md:text-4xl lg:text-5xl mb-3'}`}>
                    {title}
                </h1>

                {subtitle && (
                    <p className={`text-white/85 max-w-xl mx-auto font-light drop-shadow-lg animate-in slide-in-from-bottom-5 duration-700 delay-100 ${compact ? 'text-xs md:text-sm leading-snug' : 'text-sm md:text-base leading-relaxed'}`}>
                        {subtitle}
                    </p>
                )}
            </div>
        </div>
    );
}

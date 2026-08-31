import React from 'react';
import Image from 'next/image';

interface PageHeroProps {
    title: string;
    subtitle?: string;
    backgroundImage?: string;
}

export default function PageHero({ title, subtitle, backgroundImage }: PageHeroProps) {
    return (
        <div className={`relative overflow-hidden flex items-center justify-center min-h-[32vh] md:min-h-[36vh] ${!backgroundImage ? 'bg-brand-dark' : ''}`}>
            {backgroundImage ? (
                <>
                    <Image
                        src={backgroundImage}
                        alt={title}
                        fill
                        className="object-cover"
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

            <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-14 text-center z-10 flex flex-col items-center">
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif italic font-medium text-white mb-3 leading-tight drop-shadow-2xl animate-in slide-in-from-bottom-4 duration-700">
                    {title}
                </h1>

                {subtitle && (
                    <p className="text-sm md:text-base text-white/85 max-w-xl mx-auto leading-relaxed font-light drop-shadow-lg animate-in slide-in-from-bottom-5 duration-700 delay-100">
                        {subtitle}
                    </p>
                )}
            </div>
        </div>
    );
}

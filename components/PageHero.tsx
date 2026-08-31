import React from 'react';
import Image from 'next/image';

interface PageHeroProps {
    title: string;
    subtitle?: string;
    backgroundImage?: string;
}

export default function PageHero({ title, subtitle, backgroundImage }: PageHeroProps) {
    return (
        <div className={`relative overflow-hidden flex items-center justify-center min-h-[60vh] ${!backgroundImage ? 'bg-brand-dark' : ''}`}>
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

            <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center z-10 flex flex-col items-center">
                {/* Optional Tag - adding structure for future use or decorative line */}
                <div className="mb-6 overflow-hidden">
                    <span className="inline-block py-1 px-4 text-white/90 text-sm md:text-base tracking-[0.3em] uppercase font-semibold border border-white/20 rounded-full backdrop-blur-md bg-white/5 animate-in slide-in-from-bottom-3 duration-700">
                        {title.split(' ')[0]} Collection
                    </span>
                </div>

                <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif italic font-medium text-white mb-8 leading-[1.1] drop-shadow-2xl animate-in slide-in-from-bottom-4 duration-700 delay-100">
                    {title}
                </h1>

                {subtitle && (
                    <p className="text-lg md:text-2xl text-white/90 max-w-2xl mx-auto leading-relaxed font-light drop-shadow-lg animate-in slide-in-from-bottom-5 duration-700 delay-200">
                        {subtitle}
                    </p>
                )}
            </div>
        </div>
    );
}

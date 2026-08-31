/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { useEffect, useRef, useState, ReactNode } from 'react';

interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  animation?: 'fade-up' | 'fade-left' | 'fade-right' | 'scale' | 'fade';
  delay?: number;
  threshold?: number;
}

export default function AnimatedSection({
  children,
  className = '',
  animation = 'fade-up',
  delay = 0,
  threshold = 0.1,
}: AnimatedSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delay);
          observer.unobserve(element);
        }
      },
      { threshold, rootMargin: '50px' }
    );

    observer.observe(element);

    return () => observer.unobserve(element);
  }, [delay, threshold]);

  const getAnimationClass = () => {
    switch (animation) {
      case 'fade-up':
        return 'scroll-animate';
      case 'fade-left':
        return 'scroll-animate-left';
      case 'fade-right':
        return 'scroll-animate-right';
      case 'scale':
        return 'scroll-animate-scale';
      case 'fade':
        return 'scroll-animate';
      default:
        return 'scroll-animate';
    }
  };

  return (
    <div
      ref={ref}
      className={`${getAnimationClass()} ${isVisible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// Staggered grid animation component
interface AnimatedGridProps {
  children: ReactNode[];
  className?: string;
  itemClassName?: string;
  staggerDelay?: number;
}

export function AnimatedGrid({
  children,
  className = '',
  itemClassName = '',
  staggerDelay = 100
}: AnimatedGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleItems, setVisibleItems] = useState<boolean[]>([]);

  const childrenArray = React.Children.toArray(children);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          childrenArray.forEach((_, index) => {
            setTimeout(() => {
              setVisibleItems(prev => {
                const newState = [...prev];
                newState[index] = true;
                return newState;
              });
            }, index * staggerDelay);
          });
          observer.unobserve(container);
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    );

    observer.observe(container);

    return () => observer.unobserve(container);
  }, [childrenArray.length, staggerDelay]);

  return (
    <div ref={containerRef} className={className}>
      {childrenArray.map((child, index) => (
        <div
          key={index}
          className={`scroll-animate ${visibleItems[index] ? 'is-visible' : ''} ${itemClassName}`}
          style={{ transitionDelay: `${index * staggerDelay}ms` }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

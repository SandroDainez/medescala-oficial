import { ReactNode, useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedContainerProps {
  children: ReactNode;
  className?: string;
  animation?: 'fade-in' | 'slide-up' | 'slide-down' | 'scale-in';
  delay?: number;
  stagger?: boolean;
  staggerDelay?: number;
}

export function AnimatedContainer({ 
  children, 
  className,
  animation = 'fade-in',
  delay = 0,
  stagger = false,
  staggerDelay = 100
}: AnimatedContainerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  const animationClasses = {
    'fade-in': 'animate-fade-in',
    'slide-up': 'animate-slide-up',
    'slide-down': 'animate-slide-down',
    'scale-in': 'animate-scale-in',
  };

  return (
    <div 
      ref={ref}
      className={cn(
        'opacity-0',
        isVisible && animationClasses[animation],
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

interface AnimatedListProps {
  children: ReactNode[];
  className?: string;
  itemClassName?: string;
  animation?: 'fade-in' | 'slide-up' | 'slide-down' | 'scale-in';
  staggerDelay?: number;
  initialDelay?: number;
}

export function AnimatedList({ 
  children, 
  className,
  itemClassName,
  animation = 'slide-up',
  staggerDelay = 50,
  initialDelay = 0
}: AnimatedListProps) {
  return (
    <div className={className}>
      {children.map((child, index) => (
        <AnimatedContainer 
          key={index}
          animation={animation}
          delay={initialDelay + (index * staggerDelay)}
          className={itemClassName}
        >
          {child}
        </AnimatedContainer>
      ))}
    </div>
  );
}

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  formatFn?: (value: number) => string;
  className?: string;
}

export function AnimatedNumber({ 
  value, 
  duration = 1000,
  formatFn = (v) => v.toLocaleString('pt-BR'),
  className 
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (value === 0) {
      setDisplayValue(0);
      return;
    }

    setIsAnimating(true);
    const startValue = displayValue;
    const difference = value - startValue;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out-cubic)
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = startValue + (difference * easedProgress);
      setDisplayValue(Math.round(currentValue));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return (
    <span className={cn('tabular-nums', className)}>
      {formatFn(displayValue)}
    </span>
  );
}

interface AnimatedProgressProps {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
  showLabel?: boolean;
  duration?: number;
}

export function AnimatedProgress({ 
  value, 
  max = 100,
  className,
  barClassName,
  showLabel = false,
  duration = 800
}: AnimatedProgressProps) {
  const [width, setWidth] = useState(0);
  const percentage = Math.min((value / max) * 100, 100);

  useEffect(() => {
    const timer = setTimeout(() => {
      setWidth(percentage);
    }, 100);
    return () => clearTimeout(timer);
  }, [percentage]);

  return (
    <div className={cn('relative', className)}>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={cn(
            'h-full bg-primary rounded-full transition-all ease-out',
            barClassName
          )}
          style={{ 
            width: `${width}%`,
            transitionDuration: `${duration}ms`
          }}
        />
      </div>
      {showLabel && (
        <span className="absolute right-0 -top-6 text-xs text-muted-foreground">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}

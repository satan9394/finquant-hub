import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  locale?: string;
}

export default function CountUp({ value, decimals = 0, duration = 700, prefix = '', suffix = '', locale = 'zh-CN' }: CountUpProps) {
  const previous = useRef(value);
  const [display, setDisplay] = useState(value);
  const formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const label = `${prefix}${formatter.format(value)}${suffix}`;

  useEffect(() => {
    const startValue = previous.current;
    previous.current = value;
    if (duration <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setDisplay(startValue + (value - startValue) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, value]);

  return <span aria-label={label}><span aria-hidden="true">{prefix}{formatter.format(display)}{suffix}</span></span>;
}

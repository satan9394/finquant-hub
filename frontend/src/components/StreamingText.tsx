/* ============================================================
 * StreamingText — 打字机效果组件
 * ============================================================ */
import { useEffect, useState, useRef } from 'react';

interface StreamingTextProps {
  content: string;
  speed?: number;
}

export default function StreamingText({ content, speed = 20 }: StreamingTextProps) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 当内容重置或减少时，重置
    if (content.length < indexRef.current) {
      indexRef.current = 0;
      setDisplayed('');
    }
  }, [content]);

  useEffect(() => {
    if (indexRef.current >= content.length) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      if (indexRef.current < content.length) {
        indexRef.current += 1;
        setDisplayed(content.slice(0, indexRef.current));
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [content, speed]);

  return (
    <span>
      {displayed}
      {displayed.length < content.length && (
        <span style={{
          display: 'inline-block',
          width: 2,
          height: '1em',
          background: 'currentColor',
          marginLeft: 1,
          animation: 'blink 0.8s step-end infinite',
          verticalAlign: 'text-bottom',
        }} />
      )}
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </span>
  );
}

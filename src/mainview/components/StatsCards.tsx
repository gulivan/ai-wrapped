import { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber, formatTokens, formatUsd } from "../lib/formatters";

const useInView = <T extends HTMLElement>(threshold = 0.4) => {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, visible]);

  return { ref, visible };
};

interface AnimatedNumberProps {
  value: number;
  format: (value: number) => string;
  durationMs?: number;
  animate: boolean;
  className?: string;
}

export const AnimatedNumber = ({
  value,
  format,
  durationMs = 1000,
  animate,
  className,
}: AnimatedNumberProps) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!animate) {
      setDisplayValue(0);
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayValue(value * eased);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [animate, durationMs, value]);

  return <span className={className}>{format(displayValue)}</span>;
};

interface StatsCardsProps {
  totalSessions: number;
  totalCostUsd: number;
  totalTokens: number;
  totalToolCalls: number;
}

const StatsCards = ({ totalSessions, totalCostUsd, totalTokens, totalToolCalls }: StatsCardsProps) => {
  const { ref, visible } = useInView<HTMLDivElement>(0.35);

  const stats = useMemo(
    () => [
      { label: "Sessions", value: totalSessions, format: formatNumber },
      { label: "Spend", value: totalCostUsd, format: formatUsd },
      { label: "Tokens", value: totalTokens, format: formatTokens },
      { label: "Tool Calls", value: totalToolCalls, format: formatNumber },
    ],
    [totalCostUsd, totalSessions, totalTokens, totalToolCalls],
  );

  return (
    <div ref={ref} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <article key={stat.label} className="wrapped-tile">
          <p className="wrapped-label">{stat.label}</p>
          <AnimatedNumber
            value={stat.value}
            format={stat.format}
            animate={visible}
            className="mt-2 block text-3xl font-semibold tracking-tight text-white sm:text-4xl"
          />
        </article>
      ))}
    </div>
  );
};

export default StatsCards;

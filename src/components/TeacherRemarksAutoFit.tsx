import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface TeacherRemarksAutoFitProps {
  text: string;
  maxLength?: number;
  className?: string;
  defaultFontSizePx?: number;
  minFontSizePx?: number;
}

/**
 * Single-line Holistic Progress Card Teacher Remarks renderer:
 * - Enforces a strict 150-character maximum
 * - Dynamically scales down font size when text overflows container width
 * - Guarantees clean single-line layout (white-space: nowrap; text-overflow: ellipsis) across screen, print, and PDF
 */
export const TeacherRemarksAutoFit: React.FC<TeacherRemarksAutoFitProps> = ({
  text,
  maxLength = 150,
  className = '',
  defaultFontSizePx = 12.5,
  minFontSizePx = 8.5,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const normalized = (text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  const [fontSizePx, setFontSizePx] = useState<number>(defaultFontSizePx);

  const recalculateFontSize = () => {
    const container = containerRef.current;
    const span = textRef.current;
    if (!container || !span) return;

    const availableWidth = container.clientWidth;
    if (availableWidth <= 0) return;

    let size = defaultFontSizePx;
    span.style.fontSize = `${size}px`;

    while (span.scrollWidth > availableWidth && size > minFontSizePx) {
      size = Number((size - 0.5).toFixed(1));
      span.style.fontSize = `${size}px`;
    }

    setFontSizePx(size);
  };

  useLayoutEffect(() => {
    recalculateFontSize();
  }, [normalized, defaultFontSizePx, minFontSizePx]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      recalculateFontSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [normalized, defaultFontSizePx, minFontSizePx]);

  return (
    <div
      ref={containerRef}
      title={normalized}
      className={`w-full overflow-hidden whitespace-nowrap text-ellipsis ${className}`}
    >
      <span
        ref={textRef}
        style={{ fontSize: `${fontSizePx}px` }}
        className="inline-block max-w-full align-middle whitespace-nowrap overflow-hidden text-ellipsis leading-snug"
      >
        {normalized || '—'}
      </span>
    </div>
  );
};

const TAIL = "250,318 324,392 466,250";

export function Mark({ size = 28, color = "#F0521F", className = "" }: { size?: number; color?: string; className?: string }) {
  const id = `m${size}${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={size} height={Math.round((size * 392) / 466)} viewBox="40 40 466 392" className={className} aria-hidden>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="#fff" />
          <polyline points={TAIL} fill="none" stroke="#000" strokeWidth="116" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <circle cx="232" cy="232" r="152" fill="none" stroke={color} strokeWidth="64" mask={`url(#${id})`} />
      <polyline points={TAIL} fill="none" stroke={color} strokeWidth="64" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center font-display font-bold tracking-[-0.045em] leading-none ${className}`} style={{ fontSize: size, gap: size * 0.04 }}>
      Nope
      <span style={{ marginTop: size * 0.08 }}>
        <Mark size={size} />
      </span>
    </span>
  );
}

export function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-black/5 dark:bg-white/5 ${className}`} />;
}

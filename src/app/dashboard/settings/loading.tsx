import { Sk } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">{[1, 2, 3, 4, 5].map((i) => <Sk key={i} className="h-9 w-24 rounded-full" />)}</div>
      <Sk className="h-[420px] max-w-2xl" />
    </div>
  );
}

import { Sk } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-6">
      <div className="space-y-4 order-2 lg:order-1">
        <Sk className="h-32" />
        <Sk className="h-7 w-48" />
        <Sk className="h-20" /><Sk className="h-20" /><Sk className="h-20" />
      </div>
      <Sk className="h-96 order-1 lg:order-2" />
    </div>
  );
}

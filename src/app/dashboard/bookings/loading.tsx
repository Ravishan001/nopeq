import { Sk } from "@/components/Skeleton";

export default function Loading() {
  return <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Sk key={i} className="h-20" />)}</div>;
}

import { Sk } from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <Sk className="h-40 sm:h-56 rounded-none" />
      <main className="mx-auto max-w-3xl px-4 -mt-12 space-y-6">
        <Sk className="size-24 rounded-full" />
        <Sk className="h-8 w-64" />
        <div className="grid sm:grid-cols-2 gap-2"><Sk className="h-20" /><Sk className="h-20" /><Sk className="h-20" /><Sk className="h-20" /></div>
      </main>
    </>
  );
}

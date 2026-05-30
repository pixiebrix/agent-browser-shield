interface AdSlotProps {
  variant?: "banner" | "sidebar" | "inline";
  label?: string;
}

export default function AdSlot({ variant = "banner", label = "Advertisement" }: AdSlotProps) {
  const dims =
    variant === "sidebar"
      ? "h-72 w-full"
      : variant === "inline"
        ? "h-32 w-full"
        : "h-24 w-full";

  return (
    <ins
      className={`adsbygoogle block ${dims} border border-dashed border-amber-400 bg-amber-50 text-center`}
      data-ad-client="ca-pub-0000000000000000"
      data-ad-slot="1234567890"
    >
      <div className="flex h-full flex-col items-center justify-center text-stone-600">
        <span className="text-[10px] uppercase tracking-widest text-amber-700">{label}</span>
        <span className="text-sm">Your dream vacation is one click away — Sunsail Cruises ✈️</span>
      </div>
    </ins>
  );
}

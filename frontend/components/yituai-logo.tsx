import Link from "next/link";

export function YituaiLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-3" aria-label="YITUAI 首页">
      <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[28%_18%_26%_20%] bg-[#b73522] text-[#f4ecdc] shadow-[0_12px_30px_rgba(183,53,34,0.24)] transition-transform duration-300 group-hover:-rotate-6">
        <span className="font-serif text-[15px] font-black leading-none tracking-[-0.03em]">YI</span>
        <span className="absolute inset-x-2 bottom-2 h-px bg-[#f4ecdc]/55" />
      </span>
      {!compact ? (
        <span className="grid leading-none">
          <span className="font-serif text-2xl font-black tracking-[0.18em] text-[#15120e] md:text-[28px]">
            YITUAI
          </span>
          <span className="mt-1 text-[11px] font-bold tracking-[0.42em] text-[#b73522]">
            衣台
          </span>
        </span>
      ) : null}
    </Link>
  );
}

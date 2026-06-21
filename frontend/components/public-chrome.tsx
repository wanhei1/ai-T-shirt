"use client";

import { usePathname } from "next/navigation";

export function PublicChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  if (isAdmin) {
    return <>{children}</>;
  }

  return <div className="yituai-public-surface">{children}</div>;
}

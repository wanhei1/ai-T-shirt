"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "@/components/navbar";

/**
 * Conditionally renders the user-facing Navbar.
 * Hides it on /admin/** routes so the admin layout owns its own navigation.
 */
export function NavGuard() {
  const pathname = usePathname();

  // Suppress user navbar inside admin section
  if (pathname.startsWith("/admin")) {
    return null;
  }

  return <Navbar />;
}

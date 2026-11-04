"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

// Pages reachable from the bottom tab bar don't need a back button.
const TAB_ROOTS = new Set(["/", "/transactions", "/plan"]);

/**
 * Back button for phones. Installed iPhone apps have no browser back button,
 * so inner pages (People, Insights, Accounts, Settings…) get one here.
 */
export function BackBar() {
  const pathname = usePathname();
  const router = useRouter();
  if (TAB_ROOTS.has(pathname)) return null;
  return (
    <div className="-mt-2 mb-3 lg:hidden">
      <button
        onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
        className="-ml-2 flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-sm font-medium text-accent active:bg-accent/10"
      >
        <ChevronLeft size={20} /> Back
      </button>
    </div>
  );
}

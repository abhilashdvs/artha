"use client";

import { useState } from "react";
import { seedDemo } from "@/lib/demo";
import { Btn } from "./ui";
import { Sparkles, Upload, Plus } from "lucide-react";
import Link from "next/link";

/** Shown when the app has no data at all: start empty or load demo. */
export function DemoEmpty() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white">
        <Sparkles size={24} />
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight">Welcome to Artha</h1>
      <p className="mt-2 text-sm text-muted">
        Your personal finance intelligence hub. Add your accounts and start recording transactions —
        everything stays private in this browser. Or explore with realistic demo data first.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Btn
          onClick={async () => {
            setBusy(true);
            await seedDemo();
            setBusy(false);
          }}
          disabled={busy}
        >
          <Sparkles size={15} /> {busy ? "Loading demo…" : "Explore demo data"}
        </Btn>
        <Link href="/accounts">
          <Btn variant="outline"><Plus size={15} /> Start fresh — add account</Btn>
        </Link>
        <Link href="/transactions?import=1">
          <Btn variant="ghost"><Upload size={15} /> Import CSV</Btn>
        </Link>
      </div>
      <p className="mt-4 text-[11px] text-faint">
        Demo data is clearly labeled and can be wiped anytime from Settings.
      </p>
    </div>
  );
}

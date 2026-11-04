"use client";

import { CheckCircle2, Download, Share, Smartphone } from "lucide-react";
import { promptInstall, useInstallState } from "@/lib/install";
import { Btn, Card } from "./ui";

/** Settings card: install Artha as an app on this device. */
export function InstallApp() {
  const state = useInstallState();
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Smartphone size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">Install Artha as an app</h2>
          {state === "installed" && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-good">
              <CheckCircle2 size={14} /> Installed — you're using the app version.
            </p>
          )}
          {state === "available" && (
            <>
              <p className="mt-1 text-xs text-muted">Get an Artha icon on your home screen or desktop. Opens full-screen and works offline.</p>
              <Btn size="sm" className="mt-3" onClick={() => promptInstall()}>
                <Download size={14} /> Install Artha
              </Btn>
            </>
          )}
          {state === "ios" && (
            <p className="mt-1 text-xs text-muted">
              In Safari, tap <Share size={12} className="inline align-[-2px]" /> <b className="text-ink">Share</b>, then{" "}
              <b className="text-ink">Add to Home Screen</b>. Sign in once inside the app and it stays signed in.
            </p>
          )}
          {state === "unsupported" && (
            <p className="mt-1 text-xs text-muted">
              On your phone: open <b className="text-ink">artha-self.vercel.app</b> and choose <b className="text-ink">Install app</b> or{" "}
              <b className="text-ink">Add to Home Screen</b> from the browser menu. On a computer, use the install icon in the address bar.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

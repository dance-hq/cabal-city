"use client";

import { useEffect, useRef, useState } from "react";
import { SWRConfig } from "swr";
import { Maximize2, X } from "lucide-react";
import { CabalProvider, useCabal, type Boot } from "./store";
import { Conversation } from "./conversation";
import { E2eeProvider } from "./e2ee-provider";
import { UnlockDialog } from "./e2ee-unlock";
import { RecoveryKeyDialog } from "./e2ee-recovery";
import { announceViewing, chatBridge } from "@/lib/popout";

// A small desktop chat window for one person, opened from the corner buddy
// list so you can talk without bringing the whole Cabal window forward.
export function PopoutChat({ boot, otherId }: { boot: Boot; otherId: string }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 1500,
        errorRetryInterval: 4000,
      }}
    >
      <E2eeProvider userId={boot.userId}>
        <CabalProvider boot={boot} popout>
          <Chat otherId={otherId} />
          <UnlockDialog />
          <RecoveryKeyDialog />
        </CabalProvider>
      </E2eeProvider>
    </SWRConfig>
  );
}

function Chat({ otherId }: { otherId: string }) {
  const { openDm, active, profileById } = useCabal();
  const [bridge, setBridge] =
    useState<ReturnType<typeof chatBridge>>(undefined);
  const name = profileById(otherId)?.display_name;

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void openDm(otherId);
  }, [openDm, otherId]);

  useEffect(() => setBridge(chatBridge()), []);
  useEffect(() => (active ? announceViewing(active) : undefined), [active]);
  useEffect(() => {
    document.title = name ? `${name} · Cabal` : "Cabal";
  }, [name]);

  const close = () => (bridge ? bridge.close() : window.close());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]'))
        close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const actions = (
    <>
      {bridge && (
        <WindowButton
          label="Open in Cabal"
          onClick={() => bridge.openInCabal()}
        >
          <Maximize2 className="size-3.5" aria-hidden />
        </WindowButton>
      )}
      <WindowButton label="Close" onClick={close}>
        <X className="size-4" aria-hidden />
      </WindowButton>
    </>
  );

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <Conversation compact popoutActions={actions} />
    </div>
  );
}

function WindowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

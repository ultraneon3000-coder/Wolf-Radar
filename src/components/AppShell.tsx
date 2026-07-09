"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MenuIcon } from "./icons";
import { Sidebar } from "./Sidebar";
import { DemoBadge } from "./DemoBadge";

const MOBILE_BREAKPOINT_PX = 768;

export function AppShell({
  children,
  demoMode = false,
}: {
  children: ReactNode;
  demoMode?: boolean;
}) {
  const [open, setOpen] = useState(true);

  // Auf schmalen Fenstern startet das Seitenmenü eingeklappt (Overlay-Verhalten),
  // auf breiten Fenstern bleibt es standardmäßig sichtbar.
  useEffect(() => {
    if (window.innerWidth < MOBILE_BREAKPOINT_PX) {
      setOpen(false);
    }
  }, []);

  function handleNavigate() {
    if (window.innerWidth < MOBILE_BREAKPOINT_PX) {
      setOpen(false);
    }
  }

  return (
    <div className="flex min-h-dvh bg-canvas text-ink">
      {open ? (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-surface transition-transform duration-200 md:static md:translate-x-0 md:overflow-hidden md:transition-[width] md:duration-200 ${
          open ? "translate-x-0 md:w-72" : "-translate-x-full md:w-0"
        }`}
      >
        <Sidebar onNavigate={handleNavigate} demoMode={demoMode} />
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Seitenmenü umschalten"
            className="rounded-md p-2 text-ink transition hover:bg-surface"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          {!open ? (
            <span className="flex items-center gap-2 text-sm font-extrabold tracking-tight">
              <span className="text-ink">WOLF</span>{" "}
              <span className="text-accent">RADAR</span>
              {demoMode ? <DemoBadge /> : null}
            </span>
          ) : null}
        </header>

        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}

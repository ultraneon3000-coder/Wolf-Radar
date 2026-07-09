"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  EyeIcon,
  ListIcon,
  RadarIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
} from "./icons";
import { DemoBadge } from "./DemoBadge";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  disabled?: boolean;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Vorgeschlagen", icon: RadarIcon },
  { href: "/suche", label: "Suche", icon: SearchIcon },
  { href: "/favoriten", label: "Favoriten", icon: StarIcon },
  { href: "/gesehen", label: "Schon gesehen", icon: EyeIcon },
  { href: "/playlists", label: "Playlists", icon: ListIcon, disabled: true, badge: "bald" },
  { href: "/einstellungen", label: "Einstellungen", icon: SettingsIcon },
];

export function Sidebar({
  onNavigate,
  demoMode = false,
}: {
  onNavigate?: () => void;
  demoMode?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-72 flex-col">
      <div className="flex items-center gap-2 px-5 py-6">
        <span className="text-xl font-extrabold tracking-tight text-ink">WOLF</span>
        <span className="text-xl font-extrabold tracking-tight text-accent">RADAR</span>
        {demoMode ? <DemoBadge /> : null}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          if (item.disabled) {
            return (
              <span
                key={item.href}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted opacity-50"
              >
                <Icon className="h-5 w-5" />
                {item.label}
                {item.badge ? (
                  <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    {item.badge}
                  </span>
                ) : null}
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <p className="px-5 py-4 text-[11px] text-muted">
        Content-Radar für Ernährungs-Fehlinformationen
      </p>
    </div>
  );
}

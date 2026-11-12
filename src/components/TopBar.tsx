"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FilePlus2, Inbox, SlidersHorizontal } from "lucide-react";
import { Logo } from "./Logo";
import { ModelPicker } from "./ModelPicker";

const LINKS = [
  { href: "/", label: "Receivables", short: "Cases", icon: Inbox },
  { href: "/new", label: "New invoice", short: "New", icon: FilePlus2 },
  { href: "/playbook", label: "Playbook", short: "Playbook", icon: BookOpen },
  { href: "/demo", label: "Demo control", short: "Demo", icon: SlidersHorizontal },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" || path.startsWith("/cases") : path.startsWith(href);
}

export function TopBar() {
  const path = usePathname();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="shrink-0" aria-label="Tagih home">
            <Logo />
          </Link>
          <ModelPicker compact />
        </div>
      </header>
      <nav className="tabbar" aria-label="Main">
        {LINKS.map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.href} href={l.href} aria-current={isActive(path, l.href) ? "page" : undefined}>
              <Icon size={19} strokeWidth={isActive(path, l.href) ? 2.2 : 1.8} />
              {l.short}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

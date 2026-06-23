"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { signOut, useSession } from "@/lib/auth/client";
import { Spinner } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◈" },
  { href: "/projects", label: "Projects", icon: "◉" },
  { href: "/workspaces", label: "Workspace", icon: "⬡" },
  { href: "/integrations/github", label: "GitHub", icon: "⌥" },
  { href: "/billing", label: "Billing", icon: "◎" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-4 py-4">
          <span className="text-lg font-bold tracking-tight text-accent">ShipFlow</span>
          <span className="ml-1 text-xs text-ink/40">AI</span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors
                  ${active ? "bg-accent/10 text-accent" : "text-ink/70 hover:bg-ink/5 hover:text-ink"}`}
              >
                <span className="font-mono text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-ink/10 px-3 py-3">
          <div className="mb-2 truncate text-xs text-ink/50">{session?.user?.email ?? "—"}</div>
          <button
            onClick={() => signOut({ fetchOptions: { onSuccess: () => router.replace("/auth") } })}
            className="w-full rounded-md px-3 py-1.5 text-left text-xs text-ink/60 hover:bg-ink/5"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
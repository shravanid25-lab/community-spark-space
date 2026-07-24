import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  Search,
  ShoppingBag,
  Users,
  Vote,
  LogOut,
  GraduationCap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const nav = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/notes", label: "Note Sharing", icon: FileText },
  { to: "/projects", label: "Project Hub", icon: FolderKanban },
  { to: "/lost-found", label: "Lost & Found", icon: Search },
  { to: "/marketplace", label: "Marketplace", icon: ShoppingBag },
  { to: "/clubs", label: "Clubs & Events", icon: Users },
  { to: "/polls", label: "Campus Voice", icon: Vote },
] as const;

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, student_id, department, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      return { user, profile: data };
    },
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useProfile();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    // keep TS from complaining about unused state
  }, [signingOut]);

  async function signOut() {
    setSigningOut(true);
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  const displayName = data?.profile?.full_name || data?.user?.email?.split("@")[0] || "Student";
  const studentId = data?.profile?.student_id || `#${(data?.user?.id ?? "").slice(0, 8)}`;
  const initials = displayName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 shrink-0 bg-card border-r border-border flex flex-col">
        <Link to="/dashboard" className="p-6 flex items-center gap-3">
          <div className="size-9 rounded-lg bg-brand-600 text-white grid place-items-center">
            <GraduationCap className="size-5" />
          </div>
          <div>
            <div className="font-bold text-lg leading-none">Campus</div>
            <div className="text-xs text-muted-foreground">Connect</div>
          </div>
        </Link>
        <nav className="flex-1 px-3 space-y-1">
          {nav.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors " +
                  (active
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-foreground")
                }
              >
                <Icon className="size-4" /> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="size-9 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-semibold">
              {initials || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{displayName}</div>
              <div className="text-xs text-muted-foreground font-mono truncate">{studentId}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="text-slate-500 mt-1">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

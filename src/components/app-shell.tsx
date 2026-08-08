import { useState, type ReactNode } from "react";
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
  Menu,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteMyAccount } from "@/lib/account.functions";

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
        .select("id, full_name, department, avatar_url")
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteAccount = useServerFn(deleteMyAccount);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await deleteAccount({ data: undefined });
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      setMobileOpen(false);
      toast.success("Your account and data have been deleted");
      // Hard reload guarantees no stale session or cached protected state remains.
      window.location.replace("/auth");
    } catch (e) {
      setDeleting(false);
      toast.error(e instanceof Error ? e.message : "Could not delete account");
    }
  }

  const displayName = data?.profile?.full_name || data?.user?.email?.split("@")[0] || "Student";
  const subtitle = data?.profile?.department || data?.user?.email || "";
  const initials = displayName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link
        to="/dashboard"
        onClick={() => setMobileOpen(false)}
        className="p-6 flex items-center gap-3"
      >
        <div className="size-9 shrink-0 rounded-lg bg-brand-600 text-white grid place-items-center">
          <GraduationCap className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-lg leading-none">Campus</div>
          <div className="text-xs text-muted-foreground">Hub</div>
        </div>
      </Link>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors " +
                (active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-foreground")
              }
            >
              <Icon className="size-4 shrink-0" /> {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border space-y-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-9 shrink-0 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-semibold">
              {initials || "U"}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{displayName}</div>
              <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" title="Sign out">
            <LogOut className="size-4" />
          </Button>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4 mr-2" /> Delete account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes your profile, notes, listings, projects, votes and uploaded
                files. You can sign up again with the same campus email afterwards. This cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="hidden lg:flex w-64 shrink-0 bg-card border-r border-border flex-col">
        {sidebar}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-card/95 backdrop-blur px-4 py-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-card">
              <SheetTitle className="sr-only">Campus Hub navigation</SheetTitle>
              {sidebar}
            </SheetContent>
          </Sheet>
          <div className="flex min-w-0 items-center gap-2">
            <div className="size-8 shrink-0 rounded-lg bg-brand-600 text-white grid place-items-center">
              <GraduationCap className="size-4" />
            </div>
            <span className="font-bold truncate">Campus Hub</span>
          </div>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
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
    <header className="flex flex-col gap-4 mb-6 sm:mb-8 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="text-slate-500 mt-1 text-sm sm:text-base">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

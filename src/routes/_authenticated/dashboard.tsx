import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, useProfile } from "@/components/app-shell";
import {
  FileText,
  FolderKanban,
  Search,
  ShoppingBag,
  Users,
  Vote,
  Calendar,
  Megaphone,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — Campus Hub" },
      { name: "description", content: "Your campus overview: announcements, events, club news and active polls." },
      { property: "og:title", content: "Overview — Campus Hub" },
      { property: "og:description", content: "Your personal campus dashboard." },
    ],
  }),
  component: Dashboard,
});

const modules = [
  { to: "/notes", label: "Note Sharing", desc: "Curated lecture summaries and materials.", icon: FileText, tone: "bg-blue-100 text-blue-600" },
  { to: "/projects", label: "Project Hub", desc: "Find collaborators for your next idea.", icon: FolderKanban, tone: "bg-emerald-100 text-emerald-600" },
  { to: "/lost-found", label: "Lost & Found", desc: "Report or claim items on campus.", icon: Search, tone: "bg-amber-100 text-amber-600" },
  { to: "/marketplace", label: "Marketplace", desc: "Buy and sell textbooks or gear.", icon: ShoppingBag, tone: "bg-purple-100 text-purple-600" },
  { to: "/clubs", label: "Clubs & Events", desc: "Stay involved with campus life.", icon: Users, tone: "bg-rose-100 text-rose-600" },
  { to: "/polls", label: "Campus Voice", desc: "Vote on decisions that shape campus.", icon: Vote, tone: "bg-indigo-100 text-indigo-600" },
] as const;

function Dashboard() {
  const { data: me } = useProfile();

  const announcements = useQuery({
    queryKey: ["dashboard-announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, title, body, club_id, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const clubs = useQuery({
    queryKey: ["clubs-lookup"],
    queryFn: async () => {
      const { data } = await supabase.from("clubs").select("id, name");
      return data ?? [];
    },
  });

  const events = useQuery({
    queryKey: ["dashboard-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, location, starts_at")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(4);
      return data ?? [];
    },
  });

  const latestPoll = useQuery({
    queryKey: ["dashboard-latest-poll"],
    queryFn: async () => {
      const { data: poll } = await supabase
        .from("polls")
        .select("id, question")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!poll) return null;
      const [{ data: options }, { data: tallies }] = await Promise.all([
        supabase.from("poll_options").select("id, label, position").eq("poll_id", poll.id).order("position"),
        supabase.rpc("poll_results", { _poll_ids: [poll.id] }),
      ]);
      const total = (tallies ?? []).reduce((s, t) => s + Number(t.votes), 0);
      return {
        poll,
        options:
          options?.map((o) => {
            const count = Number((tallies ?? []).find((t) => t.option_id === o.id)?.votes ?? 0);
            return { ...o, count, pct: total ? Math.round((count / total) * 100) : 0 };
          }) ?? [],
        total,
      };
    },
  });

  const name = me?.profile?.full_name?.split(" ")[0] || "there";
  const clubName = (id: string | null) => clubs.data?.find((c) => c.id === id)?.name ?? "Club";

  const campusAnnouncements = (announcements.data ?? []).filter((a) => !a.club_id).slice(0, 4);
  const clubAnnouncements = (announcements.data ?? []).filter((a) => a.club_id).slice(0, 4);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={`Welcome back, ${name}`}
        description={me?.profile?.department ? `${me.profile.department} • Campus Hub` : "Campus Hub"}
      />

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Megaphone className="size-5 text-brand-600" /> Latest Announcements
            </h3>
            <Link to="/clubs" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          {campusAnnouncements.length > 0 ? (
            <ul className="space-y-4">
              {campusAnnouncements.map((a) => (
                <li key={a.id} className="border-l-2 border-brand-500 pl-3">
                  <div className="font-semibold text-slate-900">{a.title}</div>
                  {a.body ? <p className="text-sm text-slate-500 line-clamp-2">{a.body}</p> : null}
                  <div className="text-xs text-slate-400 mt-1">
                    {format(new Date(a.created_at), "MMM d, h:mm a")}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No announcements yet.</p>
          )}
        </div>

        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Users className="size-5 text-brand-600" /> Club Announcements
            </h3>
            <Link to="/clubs" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          {clubAnnouncements.length > 0 ? (
            <ul className="space-y-4">
              {clubAnnouncements.map((a) => (
                <li key={a.id} className="border-l-2 border-rose-400 pl-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500">
                    {clubName(a.club_id)}
                  </div>
                  <div className="font-semibold text-slate-900">{a.title}</div>
                  {a.body ? <p className="text-sm text-slate-500 line-clamp-2">{a.body}</p> : null}
                  <div className="text-xs text-slate-400 mt-1">
                    {format(new Date(a.created_at), "MMM d, h:mm a")}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No club announcements yet.</p>
          )}
        </div>

        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Calendar className="size-5 text-brand-600" /> Upcoming Events
            </h3>
            <Link to="/clubs" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          {events.data && events.data.length > 0 ? (
            <div className="space-y-4">
              {events.data.map((e) => {
                const d = new Date(e.starts_at);
                return (
                  <div key={e.id} className="flex gap-4">
                    <div className="size-12 shrink-0 rounded-xl bg-slate-100 flex flex-col items-center justify-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{format(d, "MMM")}</span>
                      <span className="text-lg font-bold text-brand-600 leading-none">{format(d, "d")}</span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-slate-900 truncate">{e.title}</h4>
                      <p className="text-sm text-slate-500">
                        {e.location || "TBA"} • {format(d, "h:mm a")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No upcoming events yet.</p>
          )}
        </div>

        <div className="bg-brand-900 text-white p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <Vote className="size-5" />
            <h3 className="text-lg font-bold">Active Poll</h3>
          </div>
          {latestPoll.data ? (
            <>
              <p className="text-brand-100 mb-5">{latestPoll.data.poll.question}</p>
              <div className="space-y-3">
                {latestPoll.data.options.map((o) => (
                  <div
                    key={o.id}
                    className="relative h-10 w-full bg-brand-800 rounded-lg overflow-hidden flex items-center px-4 border border-brand-700"
                  >
                    <div
                      className="absolute left-0 top-0 h-full bg-brand-500 opacity-40"
                      style={{ width: `${o.pct}%` }}
                    />
                    <span className="relative z-10 font-medium">
                      {o.label} ({o.pct}%)
                    </span>
                  </div>
                ))}
              </div>
              <Link to="/polls" className="inline-block mt-5 text-sm font-semibold text-brand-100 hover:text-white">
                View all polls →
              </Link>
            </>
          ) : (
            <p className="text-brand-100">No polls yet — be the first to start one.</p>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.to}
              to={m.to}
              className="group bg-card p-5 rounded-xl border border-border shadow-sm hover:shadow-md hover:border-brand-500/40 transition-all"
            >
              <div className={`size-10 ${m.tone} rounded-lg flex items-center justify-center mb-4`}>
                <Icon className="size-5" />
              </div>
              <h3 className="font-bold text-slate-900 flex items-center justify-between">
                {m.label}
                <ArrowRight className="size-4 opacity-0 group-hover:opacity-100 transition-opacity text-brand-600" />
              </h3>
              <p className="text-sm text-slate-500 mt-1">{m.desc}</p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

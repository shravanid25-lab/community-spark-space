import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, useProfile } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/polls")({
  head: () => ({
    meta: [
      { title: "Campus Voice — Campus Connect" },
      { name: "description", content: "Vote in student polls and shape decisions that matter on campus." },
      { property: "og:title", content: "Campus Voice — Campus Connect" },
      { property: "og:description", content: "Student polls and voting for the campus community." },
    ],
  }),
  component: PollsPage,
});

const pollSchema = z.object({
  question: z.string().trim().min(5).max(200),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(6),
});

type PollWithData = {
  id: string;
  question: string;
  created_by: string;
  created_at: string;
  options: { id: string; label: string; count: number; pct: number }[];
  total: number;
  myVote: string | null;
};

function PollsPage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const [open, setOpen] = useState(false);
  const [optCount, setOptCount] = useState(2);

  const polls = useQuery({
    queryKey: ["polls-full"],
    queryFn: async (): Promise<PollWithData[]> => {
      const uid = me?.user?.id;
      const { data: pList } = await supabase
        .from("polls")
        .select("id, question, created_by, created_at")
        .order("created_at", { ascending: false });
      if (!pList?.length) return [];
      const ids = pList.map((p) => p.id);
      const [{ data: opts }, { data: tallies }, { data: myVotes }] = await Promise.all([
        supabase.from("poll_options").select("id, poll_id, label, position").in("poll_id", ids).order("position"),
        supabase.rpc("poll_results", { _poll_ids: ids }),
        supabase.from("poll_votes").select("poll_id, option_id").in("poll_id", ids),
      ]);
      return pList.map((p) => {
        const pollTallies = (tallies ?? []).filter((t) => t.poll_id === p.id);
        const total = pollTallies.reduce((s, t) => s + Number(t.votes), 0);
        const options =
          opts
            ?.filter((o) => o.poll_id === p.id)
            .map((o) => {
              const count = Number(pollTallies.find((t) => t.option_id === o.id)?.votes ?? 0);
              return { id: o.id, label: o.label, count, pct: total ? Math.round((count / total) * 100) : 0 };
            }) ?? [];
        const myVote = uid ? (myVotes ?? []).find((v) => v.poll_id === p.id)?.option_id ?? null : null;
        return { ...p, options, total, myVote };
      });
    },
  });

  const create = useMutation({
    mutationFn: async (payload: { question: string; options: string[] }) => {
      const uid = me?.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { data: poll, error } = await supabase
        .from("polls")
        .insert({ created_by: uid, question: payload.question })
        .select("id")
        .single();
      if (error) throw error;
      const { error: oErr } = await supabase.from("poll_options").insert(
        payload.options.map((label, position) => ({ poll_id: poll.id, label, position })),
      );
      if (oErr) throw oErr;
    },
    onSuccess: () => {
      toast.success("Poll created");
      qc.invalidateQueries({ queryKey: ["polls-full"] });
      qc.invalidateQueries({ queryKey: ["dashboard-latest-poll"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
      setOptCount(2);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vote = useMutation({
    mutationFn: async ({ poll_id, option_id }: { poll_id: string; option_id: string }) => {
      const uid = me?.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error } = await supabase.from("poll_votes").insert({ poll_id, option_id, voter_id: uid });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["polls-full"] });
      qc.invalidateQueries({ queryKey: ["dashboard-latest-poll"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("polls").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["polls-full"] }),
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const options: string[] = [];
    for (let i = 0; i < optCount; i++) {
      const v = (form.get(`option_${i}`) as string | null)?.trim();
      if (v) options.push(v);
    }
    const parsed = pollSchema.safeParse({ question: form.get("question"), options });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    create.mutate({ question: parsed.data.question, options: parsed.data.options });
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Campus Voice"
        description="Vote on decisions that shape campus. One vote per poll."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-brand-600 hover:bg-brand-700">
                <Plus className="size-4 mr-2" /> New Poll
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a poll</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="question">Question</Label>
                  <Input id="question" name="question" placeholder="Should the library extend hours?" required />
                </div>
                <div className="space-y-2">
                  <Label>Options</Label>
                  {Array.from({ length: optCount }).map((_, i) => (
                    <Input key={i} name={`option_${i}`} placeholder={`Option ${i + 1}`} required />
                  ))}
                  {optCount < 6 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setOptCount((n) => n + 1)}>
                      + Add option
                    </Button>
                  ) : null}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending} className="bg-brand-600 hover:bg-brand-700">
                    {create.isPending ? "Creating…" : "Publish poll"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="space-y-4">
        {polls.data?.map((p) => (
          <div key={p.id} className="bg-card p-6 rounded-2xl border border-border shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{p.question}</h3>
                <div className="text-xs text-slate-500 mt-1">
                  {p.total} vote{p.total === 1 ? "" : "s"} • {format(new Date(p.created_at), "MMM d")}
                </div>
              </div>
              {me?.user?.id === p.created_by ? (
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(p.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              ) : null}
            </div>
            <div className="space-y-2">
              {p.options.map((o) => {
                const isMine = p.myVote === o.id;
                const canVote = !p.myVote;
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={!canVote}
                    onClick={() => vote.mutate({ poll_id: p.id, option_id: o.id })}
                    className={
                      "relative w-full h-11 rounded-lg overflow-hidden flex items-center px-4 border transition-colors text-left " +
                      (canVote
                        ? "border-slate-200 hover:border-brand-500 hover:bg-brand-50 cursor-pointer"
                        : "border-slate-200 cursor-default") +
                      (isMine ? " ring-2 ring-brand-500" : "")
                    }
                  >
                    <div
                      className="absolute left-0 top-0 h-full bg-brand-500/20"
                      style={{ width: `${o.pct}%` }}
                    />
                    <span className="relative z-10 font-medium text-slate-900 flex-1">{o.label}</span>
                    <span className="relative z-10 text-sm text-slate-500">
                      {o.pct}% · {o.count}
                    </span>
                  </button>
                );
              })}
            </div>
            {p.myVote ? (
              <p className="text-xs text-brand-700 mt-3">✓ You voted on this poll</p>
            ) : (
              <p className="text-xs text-slate-500 mt-3">Tap an option to vote</p>
            )}
          </div>
        ))}
        {!polls.isLoading && (polls.data?.length ?? 0) === 0 ? (
          <div className="text-center py-16 text-slate-500 bg-card rounded-2xl border border-border">
            No polls yet — start the first one.
          </div>
        ) : null}
      </div>
    </div>
  );
}

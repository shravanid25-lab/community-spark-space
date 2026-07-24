import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, useProfile } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Project Hub — Campus Connect" },
      { name: "description", content: "Post projects, find teammates, and collaborate on coursework and hackathons." },
      { property: "og:title", content: "Project Hub — Campus Connect" },
      { property: "og:description", content: "Team up on projects across campus." },
    ],
  }),
  component: ProjectsPage,
});

const projectSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(1000),
  tags: z.string().trim().max(200).optional().or(z.literal("")),
});

function ProjectsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: me } = useProfile();

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, title, description, tags, status, owner_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const members = useQuery({
    queryKey: ["project-members-mine"],
    queryFn: async () => {
      const uid = me?.user?.id;
      if (!uid) return [];
      const { data } = await supabase.from("project_members").select("project_id, status").eq("user_id", uid);
      return data ?? [];
    },
    enabled: !!me?.user?.id,
  });

  const create = useMutation({
    mutationFn: async (payload: { title: string; description: string; tags: string[] }) => {
      const uid = me?.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error } = await supabase.from("projects").insert({
        owner_id: uid,
        title: payload.title,
        description: payload.description,
        tags: payload.tags,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project posted");
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const join = useMutation({
    mutationFn: async (project_id: string) => {
      const uid = me?.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error } = await supabase
        .from("project_members")
        .insert({ project_id, user_id: uid, status: "pending" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request sent");
      qc.invalidateQueries({ queryKey: ["project-members-mine"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project removed");
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = projectSchema.safeParse({
      title: form.get("title"),
      description: form.get("description"),
      tags: form.get("tags") ?? "",
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    const tags = (parsed.data.tags ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    create.mutate({ title: parsed.data.title, description: parsed.data.description, tags });
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Project Hub"
        description="Find teammates and post projects looking for collaborators."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-brand-600 hover:bg-brand-700">
                <Plus className="size-4 mr-2" /> New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post a project</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" placeholder="AR campus navigation app" required />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" rows={4} required />
                </div>
                <div>
                  <Label htmlFor="tags">Tags (comma-separated)</Label>
                  <Input id="tags" name="tags" placeholder="AR, React Native, hackathon" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending} className="bg-brand-600 hover:bg-brand-700">
                    {create.isPending ? "Posting…" : "Post project"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.data?.map((p) => {
          const myMembership = members.data?.find((m) => m.project_id === p.id);
          const isOwner = me?.user?.id === p.owner_id;
          return (
            <div key={p.id} className="bg-card p-6 rounded-2xl border border-border shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-lg font-bold text-slate-900">{p.title}</h3>
                <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                  {p.status}
                </span>
              </div>
              <p className="text-sm text-slate-600 mb-4">{p.description}</p>
              {p.tags && p.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {p.tags.map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Users className="size-3.5" /> Open to collaborators
                </div>
                <div className="flex gap-2">
                  {isOwner ? (
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  ) : myMembership ? (
                    <Button size="sm" variant="outline" disabled>
                      {myMembership.status === "pending" ? "Requested" : "Joined"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="bg-brand-600 hover:bg-brand-700"
                      onClick={() => join.mutate(p.id)}
                    >
                      Request to join
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!projects.isLoading && (projects.data?.length ?? 0) === 0 ? (
          <div className="md:col-span-2 text-center py-16 text-slate-500 bg-card rounded-2xl border border-border">
            No projects yet — post the first one.
          </div>
        ) : null}
      </div>
    </div>
  );
}

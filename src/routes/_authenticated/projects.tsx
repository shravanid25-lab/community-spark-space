import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, useProfile } from "@/components/app-shell";
import { useAvatarUrl } from "@/lib/avatar";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Users, Trash2, Search, MessageSquare, Send, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Project Hub — Campus Hub" },
      { name: "description", content: "Post projects, find teammates, and collaborate on coursework and hackathons." },
      { property: "og:title", content: "Project Hub — Campus Hub" },
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

type Project = {
  id: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  status: string;
  owner_id: string;
  created_at: string;
};

function ProjectsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const { data: me } = useProfile();

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, title, description, tags, status, owner_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });

  const members = useQuery({
    queryKey: ["project-members-mine"],
    queryFn: async () => {
      const uid = me?.user?.id;
      if (!uid) return [];
      const { data } = await supabase
        .from("project_members")
        .select("id, project_id, status")
        .eq("user_id", uid);
      return data ?? [];
    },
    enabled: !!me?.user?.id,
  });

  const myProjects = useMemo(
    () => (projects.data ?? []).filter((p) => p.owner_id === me?.user?.id),
    [projects.data, me?.user?.id],
  );

  // Rows for projects I own, so I can tell who I already invited.
  const ownedMemberRows = useQuery({
    queryKey: ["owned-member-rows", myProjects.map((p) => p.id).join(",")],
    queryFn: async () => {
      if (myProjects.length === 0) return [];
      const { data, error } = await supabase
        .from("project_members")
        .select("project_id, user_id, status")
        .in(
          "project_id",
          myProjects.map((p) => p.id),
        );
      if (error) throw error;
      return data ?? [];
    },
    enabled: myProjects.length > 0,
  });

  const teammates = useQuery({
    queryKey: ["teammates", memberQuery],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_students", {
        _q: memberQuery.trim() || undefined,
        _limit: 30,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!me?.user?.id,
  });

  const invite = useMutation({
    mutationFn: async ({ project_id, user_id }: { project_id: string; user_id: string }) => {
      const { error } = await supabase
        .from("project_members")
        .insert({ project_id, user_id, status: "invited" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation sent");
      qc.invalidateQueries({ queryKey: ["owned-member-rows"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const respondInvite = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "accepted" | "rejected" }) => {
      const { error } = await supabase.from("project_members").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "accepted" ? "You joined the team" : "Invitation declined");
      qc.invalidateQueries({ queryKey: ["project-members-mine"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
      toast.success("Project posted — members required!");
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects.data ?? [];
    return (projects.data ?? []).filter((p) => {
      const hay = `${p.title} ${p.description ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [projects.data, query]);

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
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
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
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Post a project — request members</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" placeholder="AR campus navigation app" required />
                </div>
                <div>
                  <Label htmlFor="description">Describe the project & who you need</Label>
                  <Textarea
                    id="description"
                    name="description"
                    rows={4}
                    placeholder="e.g. Looking for 2 members required: 1 React Native dev, 1 UI designer."
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="tags">Skills / tags (comma-separated)</Label>
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

      <div className="mb-6 relative">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects by title, description, or skill…"
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((p) => {
          const myMembership = members.data?.find((m) => m.project_id === p.id);
          const isOwner = me?.user?.id === p.owner_id;
          const isAccepted = isOwner || myMembership?.status === "accepted";
          return (
            <div key={p.id} className="bg-card p-6 rounded-2xl border border-border shadow-sm">
              <div className="flex justify-between items-start mb-3 gap-3">
                <h3 className="text-lg font-bold text-slate-900">{p.title}</h3>
                {p.status === "open" ? (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded">
                    Members required
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                    {p.status}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 mb-4 line-clamp-3">{p.description}</p>
              {p.tags && p.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {p.tags.map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Users className="size-3.5" /> Open to collaborators
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => setActiveProject(p)}>
                    <MessageSquare className="size-4 mr-1.5" /> Open
                  </Button>
                  {isOwner ? (
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  ) : isAccepted ? (
                    <Button size="sm" variant="outline" disabled>
                      Joined
                    </Button>
                  ) : myMembership?.status === "pending" ? (
                    <Button size="sm" variant="outline" disabled>
                      Requested
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
        {!projects.isLoading && filtered.length === 0 ? (
          <div className="md:col-span-2 text-center py-16 text-slate-500 bg-card rounded-2xl border border-border">
            {query ? "No projects match your search." : "No projects yet — post the first one."}
          </div>
        ) : null}
      </div>

      {/* Invitations for you */}
      {(() => {
        const invites = (members.data ?? []).filter((m) => m.status === "invited");
        if (invites.length === 0) return null;
        return (
          <div className="mt-10">
            <h2 className="text-xl font-bold text-slate-900 mb-1">Invitations for you</h2>
            <p className="text-sm text-slate-500 mb-4">Team leaders who want you on their project.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {invites.map((m) => {
                const proj = (projects.data ?? []).find((p) => p.id === m.project_id);
                return (
                  <div
                    key={m.id}
                    className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{proj?.title ?? "Project"}</div>
                      <div className="text-xs text-slate-500 truncate">{proj?.description ?? ""}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-brand-600 hover:bg-brand-700"
                        onClick={() => respondInvite.mutate({ id: m.id, status: "accepted" })}
                      >
                        <Check className="size-4 mr-1.5" /> Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => respondInvite.mutate({ id: m.id, status: "rejected" })}
                      >
                        <X className="size-4 mr-1.5" /> Decline
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Find teammates */}
      <div className="mt-10">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Find teammates</h2>
        <p className="text-sm text-slate-500 mb-4">
          Search students by name, branch, skills or interests, then invite them to one of your projects.
        </p>
        <div className="relative mb-4">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            placeholder="Search by name, branch, skill or interest (e.g. React, CSE, robotics)…"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(teammates.data ?? []).map((t) => (
            <TeammateCard
              key={t.id}
              student={t}
              myProjects={myProjects}
              invitedProjectIds={(ownedMemberRows.data ?? [])
                .filter((r) => r.user_id === t.id)
                .map((r) => r.project_id)}
              isMe={t.id === me?.user?.id}
              onInvite={(project_id) => invite.mutate({ project_id, user_id: t.id })}
              inviting={invite.isPending}
            />
          ))}
          {teammates.isFetched && (teammates.data ?? []).length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3 text-center py-8 text-slate-500 bg-card rounded-xl border border-border">
              No students found.
            </div>
          ) : null}
        </div>
      </div>


      {activeProject ? (
        <ProjectDetailDialog
          project={activeProject}
          currentUserId={me?.user?.id ?? null}
          onClose={() => setActiveProject(null)}
        />
      ) : null}
    </div>
  );
}

/* -------------------- Teammate card -------------------- */

type Student = {
  id: string;
  full_name: string | null;
  department: string | null;
  avatar_url: string | null;
  skills: string[] | null;
  interests: string[] | null;
  bio?: string | null;
};

function TeammateCard({
  student,
  myProjects,
  invitedProjectIds,
  isMe,
  onInvite,
  inviting,
}: {
  student: Student;
  myProjects: Project[];
  invitedProjectIds: string[];
  isMe: boolean;
  onInvite: (projectId: string) => void;
  inviting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: photo } = useAvatarUrl(student.avatar_url);
  const initials = (student.full_name ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const available = myProjects.filter((p) => !invitedProjectIds.includes(p.id));

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {photo ? (
          <img src={photo} alt={student.full_name ?? "Student"} className="size-10 rounded-full object-cover" />
        ) : (
          <div className="size-10 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-semibold">
            {initials || "U"}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{student.full_name || "Unnamed student"}</div>
          <div className="text-xs text-slate-500 truncate">{student.department || "—"}</div>
        </div>
      </div>

      {(student.skills ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {(student.skills ?? []).slice(0, 6).map((s) => (
            <span key={s} className="text-xs px-2 py-0.5 bg-brand-50 text-brand-700 rounded">
              {s}
            </span>
          ))}
        </div>
      ) : null}
      {(student.interests ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {(student.interests ?? []).slice(0, 6).map((s) => (
            <span key={s} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
              {s}
            </span>
          ))}
        </div>
      ) : null}

      {!isMe ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="mt-auto w-full" disabled={myProjects.length === 0}>
              <Send className="size-4 mr-1.5" />
              {myProjects.length === 0 ? "Post a project to invite" : "Invite to project"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite {student.full_name || "student"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {available.length === 0 ? (
                <p className="text-sm text-slate-500">Already invited to all of your projects.</p>
              ) : (
                available.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    className="w-full justify-start"
                    disabled={inviting}
                    onClick={() => {
                      onInvite(p.id);
                      setOpen(false);
                    }}
                  >
                    {p.title}
                  </Button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}


/* -------------------- Project detail (members + chat) -------------------- */

type Member = {
  id: string;
  user_id: string;
  status: string;
  profile: { full_name: string | null; department: string | null } | null;
};

function ProjectDetailDialog({
  project,
  currentUserId,
  onClose,
}: {
  project: Project;
  currentUserId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isOwner = currentUserId === project.owner_id;

  const membersQ = useQuery({
    queryKey: ["project", project.id, "members"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("project_members")
        .select("id, user_id, status")
        .eq("project_id", project.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as Member[];
      const { data: profs } = await supabase.rpc("profiles_basic", { _ids: ids });
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      return (rows ?? []).map((r) => ({
        ...r,
        profile: byId.get(r.user_id) ?? null,
      })) as Member[];
    },
  });

  const myMembership = (membersQ.data ?? []).find((m) => m.user_id === currentUserId);
  const isAccepted = isOwner || myMembership?.status === "accepted";

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "accepted" | "rejected" }) => {
      const { error } = await supabase.from("project_members").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", project.id, "members"] });
      qc.invalidateQueries({ queryKey: ["project-members-mine"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{project.title}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="overview">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-3">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{project.description}</p>
            {project.tags && project.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {project.tags.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="members" className="space-y-2">
            {(membersQ.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No requests yet.</p>
            ) : null}
            {(membersQ.data ?? []).map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {m.profile?.full_name || "Student"}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {m.profile?.department || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "text-[10px] uppercase font-bold px-2 py-1 rounded " +
                      (m.status === "accepted"
                        ? "text-emerald-700 bg-emerald-50"
                        : m.status === "pending"
                          ? "text-amber-700 bg-amber-50"
                          : "text-slate-600 bg-slate-100")
                    }
                  >
                    {m.status}
                  </span>
                  {isOwner && m.status === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus.mutate({ id: m.id, status: "accepted" })}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateStatus.mutate({ id: m.id, status: "rejected" })}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="chat">
            {isAccepted ? (
              <ProjectChat projectId={project.id} currentUserId={currentUserId} />
            ) : (
              <div className="text-sm text-slate-500 py-8 text-center border border-dashed rounded-lg">
                Chat unlocks once you're accepted into the project.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Chat -------------------- */

type Msg = { id: string; sender_id: string; body: string; created_at: string };

function ProjectChat({
  projectId,
  currentUserId,
}: {
  projectId: string;
  currentUserId: string | null;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const messagesQ = useQuery({
    queryKey: ["project", projectId, "messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_messages")
        .select("id, sender_id, body, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  const senderIds = useMemo(
    () => Array.from(new Set((messagesQ.data ?? []).map((m) => m.sender_id))),
    [messagesQ.data],
  );

  const namesQ = useQuery({
    queryKey: ["project", projectId, "message-senders", senderIds.join(",")],
    queryFn: async () => {
      if (senderIds.length === 0) return new Map<string, string>();
      const { data } = await supabase.rpc("profiles_basic", { _ids: senderIds });
      return new Map((data ?? []).map((p) => [p.id, p.full_name ?? "Student"]));
    },
    enabled: senderIds.length > 0,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`project-messages-${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "project_messages", filter: `project_id=eq.${projectId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["project", projectId, "messages"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messagesQ.data]);

  const send = useMutation({
    mutationFn: async (body: string) => {
      if (!currentUserId) throw new Error("Not signed in");
      const trimmed = body.trim().slice(0, 2000);
      if (!trimmed) return;
      const { error } = await supabase
        .from("project_messages")
        .insert({ project_id: projectId, sender_id: currentUserId, body: trimmed });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["project", projectId, "messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col h-[420px] border border-border rounded-lg overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
        {(messagesQ.data ?? []).length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">
            Say hi — this is the private space for the project team.
          </div>
        ) : null}
        {(messagesQ.data ?? []).map((m) => {
          const mine = m.sender_id === currentUserId;
          const name = namesQ.data?.get(m.sender_id) ?? "Student";
          return (
            <div key={m.id} className={"flex " + (mine ? "justify-end" : "justify-start")}>
              <div
                className={
                  "max-w-[75%] rounded-2xl px-3 py-2 text-sm " +
                  (mine ? "bg-brand-600 text-white" : "bg-white border border-border text-slate-800")
                }
              >
                {!mine ? (
                  <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5">{name}</div>
                ) : null}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
              </div>
            </div>
          );
        })}
      </div>
      <form
        className="flex gap-2 p-2 border-t border-border bg-white"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send.mutate(text);
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={2000}
        />
        <Button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700"
          disabled={send.isPending || !text.trim()}
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

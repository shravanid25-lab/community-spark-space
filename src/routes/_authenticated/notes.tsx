import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useIsAdmin } from "@/components/app-shell";
import { blockProfanity } from "@/lib/profanity";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, FileText, Trash2, Search, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({
    meta: [
      { title: "Note Sharing — Campus Hub" },
      { name: "description", content: "Search, upload and download peer-shared notes and assignments by subject and semester." },
      { property: "og:title", content: "Note Sharing — Campus Hub" },
      { property: "og:description", content: "Crowdsourced study material for every course." },
    ],
  }),
  component: NotesPage,
});

const SEMESTERS = ["1", "2", "3", "4", "5", "6", "7", "8"];

const noteSchema = z.object({
  course_code: z.string().trim().min(1, "Course code required").max(20),
  title: z.string().trim().min(3, "Title too short").max(140),
  subject: z.string().trim().max(80).optional().or(z.literal("")),
  semester: z.string().trim().max(20).optional().or(z.literal("")),
  category: z.string().trim().min(1),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

type NoteRow = {
  id: string;
  course_code: string;
  title: string;
  description: string | null;
  file_path: string;
  file_type: string | null;
  uploader_id: string;
  created_at: string;
  category: string;
  subject: string | null;
  semester: string | null;
};

function NotesPage() {
  const qc = useQueryClient();
  const [uploadKind, setUploadKind] = useState<"note" | "assignment" | null>(null);
  const open = uploadKind !== null;
  const [preview, setPreview] = useState<{ title: string; url: string; type: string } | null>(null);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [semester, setSemester] = useState("all");
  const { data: me } = useProfile();
  const isAdmin = useIsAdmin();

  const notes = useQuery({
    queryKey: ["notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select(
          "id, course_code, title, description, file_path, file_type, uploader_id, created_at, category, subject, semester",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
  });

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes.data ?? []) if (n.subject?.trim()) set.add(n.subject.trim());
    return [...set].sort();
  }, [notes.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (notes.data ?? []).filter((n) => {
      if (subject !== "all" && (n.subject ?? "") !== subject) return false;
      if (semester !== "all" && (n.semester ?? "") !== semester) return false;
      if (!q) return true;
      return [n.title, n.description, n.course_code, n.subject]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [notes.data, query, subject, semester]);

  const upload = useMutation({
    mutationFn: async (payload: {
      course_code: string;
      title: string;
      description: string;
      subject: string;
      semester: string;
      category: string;
      file: File;
    }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) throw new Error("Not signed in");
      const path = `${user.id}/notes/${Date.now()}-${payload.file.name}`;
      const up = await supabase.storage.from("campus-uploads").upload(path, payload.file);
      if (up.error) throw up.error;
      const { error } = await supabase.from("notes").insert({
        uploader_id: user.id,
        course_code: payload.course_code,
        title: payload.title,
        description: payload.description || null,
        subject: payload.subject || null,
        semester: payload.semester || null,
        category: payload.category,
        file_path: path,
        file_type: payload.file.type || payload.file.name.split(".").pop() || "file",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Uploaded");
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setUploadKind(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function download(path: string) {
    const { data, error } = await supabase.storage.from("campus-uploads").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  }

  async function openPreview(n: NoteRow) {
    const { data, error } = await supabase.storage.from("campus-uploads").download(n.file_path);
    if (error || !data) return toast.error(error?.message ?? "Could not open this file");
    const ext = n.file_path.split(".").pop()?.toLowerCase() ?? "";
    const isImage = ["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(ext);
    const isPdf = ext === "pdf" || (n.file_type ?? "").includes("pdf") || data.type.includes("pdf");
    const mime = isImage ? (data.type || `image/${ext === "jpg" ? "jpeg" : ext}`) : isPdf ? "application/pdf" : data.type || "application/octet-stream";
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { title: n.title, url, type: isImage ? "image" : isPdf ? "pdf" : "other" };
    });
  }

  function closePreview() {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }


  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file") as File | null;
    if (!file || file.size === 0) return toast.error("Choose a file");
    if (file.size > 25 * 1024 * 1024) return toast.error("Max file size is 25MB");
    const parsed = noteSchema.safeParse({
      course_code: form.get("course_code"),
      title: form.get("title"),
      subject: form.get("subject") ?? "",
      semester: form.get("semester") ?? "",
      category: uploadKind ?? "note",
      description: form.get("description") ?? "",
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (blockProfanity(parsed.data.title, parsed.data.description, parsed.data.course_code, parsed.data.subject))
      return;
    upload.mutate({
      course_code: parsed.data.course_code,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      subject: parsed.data.subject ?? "",
      semester: parsed.data.semester ?? "",
      category: parsed.data.category,
      file,
    });
  }

  const currentUserId = me?.user?.id;

  function Section({ label, rows }: { label: string; rows: NoteRow[] }) {
    return (
      <section>
        <h2 className="text-lg font-bold text-slate-900 mb-3">
          {label} <span className="text-slate-400 font-medium">({rows.length})</span>
        </h2>
        <div className="bg-card rounded-2xl border border-border overflow-x-auto shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/60">
                <TableHead>Course</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Sem</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((n) => (
                <TableRow key={n.id} className="hover:bg-slate-50/80">
                  <TableCell className="font-medium text-slate-600">{n.course_code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-slate-400" />
                      <div>
                        <div className="font-medium text-slate-900">{n.title}</div>
                        {n.description ? (
                          <div className="text-xs text-slate-500 line-clamp-1">{n.description}</div>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">{n.subject || "—"}</TableCell>
                  <TableCell className="text-slate-500 text-sm">{n.semester || "—"}</TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {format(new Date(n.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openPreview(n)}>
                        <Eye className="size-4 mr-1" /> Preview
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => download(n.file_path)}>
                        <Download className="size-4 mr-1" /> Download
                      </Button>
                      {currentUserId === n.uploader_id || isAdmin ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => remove.mutate(n.id)}
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                    Nothing here yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes and assignments…"
            className="pl-9"
            aria-label="Search notes"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            className="bg-brand-600 hover:bg-brand-700 shrink-0"
            onClick={() => setUploadKind("note")}
          >
            <Upload className="size-4 mr-2" /> Upload notes
          </Button>
          <Button variant="outline" className="shrink-0" onClick={() => setUploadKind("assignment")}>
            <Upload className="size-4 mr-2" /> Upload assignment
          </Button>
        </div>
        <Dialog open={open} onOpenChange={(v) => setUploadKind(v ? (uploadKind ?? "note") : null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {uploadKind === "assignment" ? "Upload assignment" : "Upload notes"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="course_code">Course code</Label>
                  <Input id="course_code" name="course_code" placeholder="CS302" required />
                </div>
                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" name="subject" placeholder="Data Structures" />
                </div>
                <div>
                  <Label htmlFor="semester">Semester</Label>
                  <Select name="semester">
                    <SelectTrigger id="semester">
                      <SelectValue placeholder="Select semester" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEMESTERS.map((s) => (
                        <SelectItem key={s} value={s}>
                          Semester {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" placeholder="Graph theory refresher" required />
              </div>
              <div>
                <Label htmlFor="file">File</Label>
                <Input id="file" name="file" type="file" required />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" rows={3} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={upload.isPending} className="bg-brand-600 hover:bg-brand-700">
                  {upload.isPending ? "Uploading…" : "Upload"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger className="sm:w-56" aria-label="Filter by subject">
            <SelectValue placeholder="All subjects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={semester} onValueChange={setSemester}>
          <SelectTrigger className="sm:w-56" aria-label="Filter by semester">
            <SelectValue placeholder="All semesters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All semesters</SelectItem>
            {SEMESTERS.map((s) => (
              <SelectItem key={s} value={s}>
                Semester {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Section label="Notes" rows={filtered.filter((n) => n.category !== "assignment")} />
      <Section label="Assignments" rows={filtered.filter((n) => n.category === "assignment")} />

      <Dialog open={preview !== null} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.title}</DialogTitle>
          </DialogHeader>
          {preview?.type === "image" ? (
            <img
              src={preview.url}
              alt={preview.title}
              className="w-full max-h-[70vh] object-contain rounded-lg bg-slate-50"
            />
          ) : preview?.type === "pdf" ? (
            <iframe
              src={preview.url}
              title={preview.title}
              className="w-full h-[70vh] rounded-lg border border-border"
            />
          ) : preview ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-slate-600 text-sm">
                This file type can't be shown here. Open it in a new tab instead.
              </p>
              <Button variant="outline" onClick={() => window.open(preview.url, "_blank")}>
                Open file
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

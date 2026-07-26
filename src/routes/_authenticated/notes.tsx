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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({
    meta: [
      { title: "Note Sharing — Campus Connect" },
      { name: "description", content: "Upload, browse and download peer-shared lecture notes and study guides." },
      { property: "og:title", content: "Note Sharing — Campus Connect" },
      { property: "og:description", content: "Crowdsourced study material for every course." },
    ],
  }),
  component: NotesPage,
});

const noteSchema = z.object({
  course_code: z.string().trim().min(1, "Course code required").max(20),
  title: z.string().trim().min(3, "Title too short").max(140),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

function NotesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: me } = useProfile();

  const notes = useQuery({
    queryKey: ["notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("id, course_code, title, description, file_path, file_type, uploader_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const upload = useMutation({
    mutationFn: async (payload: {
      course_code: string;
      title: string;
      description: string;
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
        file_path: path,
        file_type: payload.file.type || payload.file.name.split(".").pop() || "file",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note uploaded");
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note removed");
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function download(path: string) {
    const { data, error } = await supabase.storage.from("campus-uploads").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
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
      description: form.get("description") ?? "",
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    upload.mutate({ ...parsed.data, description: parsed.data.description ?? "", file });
  }

  const currentUserId = me?.user?.id;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Note Sharing"
        description="Peer-verified lecture notes and study material for every course."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-brand-600 hover:bg-brand-700">
                <Upload className="size-4 mr-2" /> Upload Note
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Upload a note</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="course_code">Course code</Label>
                    <Input id="course_code" name="course_code" placeholder="CS302" required />
                  </div>
                  <div>
                    <Label htmlFor="file">File</Label>
                    <Input id="file" name="file" type="file" required />
                  </div>
                </div>
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" placeholder="Graph theory refresher" required />
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
        }
      />

      <div className="bg-card rounded-2xl border border-border overflow-x-auto shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/60">
              <TableHead>Course</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {notes.data?.map((n) => (
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
                <TableCell>
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase rounded">
                    {n.file_type?.split("/").pop()?.slice(0, 6) || "FILE"}
                  </span>
                </TableCell>
                <TableCell className="text-slate-500 text-sm">
                  {format(new Date(n.created_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => download(n.file_path)}>
                      <Download className="size-4 mr-1" /> Download
                    </Button>
                    {currentUserId === n.uploader_id ? (
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
            {!notes.isLoading && (notes.data?.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                  No notes yet — upload the first one.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

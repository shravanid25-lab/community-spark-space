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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, MapPin, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/lost-found")({
  head: () => ({
    meta: [
      { title: "Lost & Found — Campus Hub" },
      { name: "description", content: "Report items you've lost or found around campus and reunite them with their owners." },
      { property: "og:title", content: "Lost & Found — Campus Hub" },
      { property: "og:description", content: "Report and reclaim items on campus." },
    ],
  }),
  component: LostFoundPage,
});

const itemSchema = z.object({
  kind: z.enum(["lost", "found"]),
  title: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

function LostFoundPage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "lost" | "found">("all");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const items = useQuery({
    queryKey: ["lost-found"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lost_found_items")
        .select("id, kind, title, description, location, image_path, resolved, reporter_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // resolve signed URLs for images
      const map: Record<string, string> = {};
      await Promise.all(
        (data ?? [])
          .filter((i) => i.image_path)
          .map(async (i) => {
            const { data: s } = await supabase.storage
              .from("campus-uploads")
              .createSignedUrl(i.image_path!, 3600);
            if (s) map[i.id] = s.signedUrl;
          }),
      );
      setImageUrls(map);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (payload: {
      kind: "lost" | "found";
      title: string;
      location: string;
      description: string;
      file: File | null;
    }) => {
      const uid = me?.user?.id;
      if (!uid) throw new Error("Not signed in");
      let image_path: string | null = null;
      if (payload.file) {
        const path = `${uid}/lost-found/${Date.now()}-${payload.file.name}`;
        const up = await supabase.storage.from("campus-uploads").upload(path, payload.file);
        if (up.error) throw up.error;
        image_path = path;
      }
      const { error } = await supabase.from("lost_found_items").insert({
        reporter_id: uid,
        kind: payload.kind,
        title: payload.title,
        location: payload.location,
        description: payload.description || null,
        image_path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reported");
      qc.invalidateQueries({ queryKey: ["lost-found"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lost_found_items").update({ resolved: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lost-found"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lost_found_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lost-found"] }),
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file") as File | null;
    const parsed = itemSchema.safeParse({
      kind: form.get("kind"),
      title: form.get("title"),
      location: form.get("location"),
      description: form.get("description") ?? "",
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    create.mutate({
      kind: parsed.data.kind,
      title: parsed.data.title,
      location: parsed.data.location,
      description: parsed.data.description ?? "",
      file: file && file.size > 0 ? file : null,
    });
  }

  const filtered = items.data?.filter((i) => filter === "all" || i.kind === filter) ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Lost & Found"
        description="Report lost items or help return found ones to their owners."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-brand-600 hover:bg-brand-700">
                <Plus className="size-4 mr-2" /> Report Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Report an item</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="kind">Type</Label>
                    <Select name="kind" defaultValue="lost">
                      <SelectTrigger id="kind">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lost">I lost this</SelectItem>
                        <SelectItem value="found">I found this</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="location">Location</Label>
                    <Input id="location" name="location" placeholder="Library, 2nd floor" required />
                  </div>
                </div>
                <div>
                  <Label htmlFor="title">Item</Label>
                  <Input id="title" name="title" placeholder="Black leather wallet" required />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" rows={3} />
                </div>
                <div>
                  <Label htmlFor="file">Photo (optional)</Label>
                  <Input id="file" name="file" type="file" accept="image/*" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending} className="bg-brand-600 hover:bg-brand-700">
                    {create.isPending ? "Reporting…" : "Report"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mb-6">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="lost">Lost</TabsTrigger>
          <TabsTrigger value="found">Found</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((i) => (
          <div key={i.id} className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="aspect-video bg-slate-100 relative">
              {imageUrls[i.id] ? (
                <img src={imageUrls[i.id]} alt={i.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center text-slate-300 text-xs uppercase tracking-widest">
                  No photo
                </div>
              )}
              <span
                className={
                  "absolute top-3 left-3 text-[10px] font-bold uppercase px-2 py-1 rounded " +
                  (i.kind === "lost" ? "bg-rose-500 text-white" : "bg-emerald-500 text-white")
                }
              >
                {i.kind}
              </span>
              {i.resolved ? (
                <span className="absolute top-3 right-3 text-[10px] font-bold uppercase px-2 py-1 rounded bg-slate-900 text-white">
                  Resolved
                </span>
              ) : null}
            </div>
            <div className="p-4">
              <h4 className="font-semibold text-slate-900">{i.title}</h4>
              <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                <MapPin className="size-3" /> {i.location}
              </div>
              {i.description ? <p className="text-sm text-slate-600 mt-2 line-clamp-2">{i.description}</p> : null}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">{format(new Date(i.created_at), "MMM d")}</span>
                {me?.user?.id === i.reporter_id ? (
                  <div className="flex gap-1">
                    {!i.resolved ? (
                      <Button size="sm" variant="ghost" onClick={() => resolve.mutate(i.id)}>
                        <Check className="size-4 mr-1" /> Resolve
                      </Button>
                    ) : null}
                    <Button size="icon" variant="ghost" onClick={() => remove.mutate(i.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        {!items.isLoading && filtered.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3 text-center py-16 text-slate-500 bg-card rounded-2xl border border-border">
            Nothing here yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}

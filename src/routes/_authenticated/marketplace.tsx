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
import { Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace — Campus Connect" },
      { name: "description", content: "Buy and sell used textbooks, dorm gear, and gadgets with fellow students." },
      { property: "og:title", content: "Marketplace — Campus Connect" },
      { property: "og:description", content: "Student-to-student marketplace on campus." },
    ],
  }),
  component: MarketplacePage,
});

const listingSchema = z.object({
  title: z.string().trim().min(2).max(120),
  price: z.coerce.number().min(0).max(100000),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

function MarketplacePage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const [open, setOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const items = useQuery({
    queryKey: ["marketplace"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_items")
        .select("id, title, description, price, image_path, sold, seller_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
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
      title: string;
      price: number;
      description: string;
      file: File | null;
    }) => {
      const uid = me?.user?.id;
      if (!uid) throw new Error("Not signed in");
      let image_path: string | null = null;
      if (payload.file) {
        const path = `${uid}/marketplace/${Date.now()}-${payload.file.name}`;
        const up = await supabase.storage.from("campus-uploads").upload(path, payload.file);
        if (up.error) throw up.error;
        image_path = path;
      }
      const { error } = await supabase.from("marketplace_items").insert({
        seller_id: uid,
        title: payload.title,
        price: payload.price,
        description: payload.description || null,
        image_path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Listed");
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markSold = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketplace_items").update({ sold: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketplace"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketplace_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketplace"] }),
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file") as File | null;
    const parsed = listingSchema.safeParse({
      title: form.get("title"),
      price: form.get("price"),
      description: form.get("description") ?? "",
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    create.mutate({
      title: parsed.data.title,
      price: parsed.data.price,
      description: parsed.data.description ?? "",
      file: file && file.size > 0 ? file : null,
    });
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Marketplace"
        description="Buy and sell textbooks, electronics, dorm gear, and more."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-brand-600 hover:bg-brand-700">
                <Plus className="size-4 mr-2" /> New Listing
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a listing</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" placeholder="MacBook Air M2 2022" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="price">Price</Label>
                    <Input id="price" name="price" type="number" step="0.01" min="0" required />
                  </div>
                  <div>
                    <Label htmlFor="file">Photo</Label>
                    <Input id="file" name="file" type="file" accept="image/*" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" rows={3} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending} className="bg-brand-600 hover:bg-brand-700">
                    {create.isPending ? "Listing…" : "Publish"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.data?.map((i) => (
          <div key={i.id} className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="aspect-square bg-slate-100 relative">
              {imageUrls[i.id] ? (
                <img src={imageUrls[i.id]} alt={i.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center text-slate-300 text-xs uppercase tracking-widest">
                  No photo
                </div>
              )}
              {i.sold ? (
                <div className="absolute inset-0 bg-black/50 grid place-items-center">
                  <span className="text-white text-xl font-bold uppercase tracking-widest">Sold</span>
                </div>
              ) : null}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-slate-900 line-clamp-1">{i.title}</h4>
                <span className="text-brand-700 font-bold">${Number(i.price).toFixed(2)}</span>
              </div>
              {i.description ? (
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{i.description}</p>
              ) : null}
              {me?.user?.id === i.seller_id ? (
                <div className="flex gap-1 mt-3 pt-3 border-t border-slate-100">
                  {!i.sold ? (
                    <Button size="sm" variant="ghost" onClick={() => markSold.mutate(i.id)}>
                      <Check className="size-4 mr-1" /> Mark sold
                    </Button>
                  ) : null}
                  <Button size="icon" variant="ghost" onClick={() => remove.mutate(i.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {!items.isLoading && (items.data?.length ?? 0) === 0 ? (
          <div className="sm:col-span-2 lg:col-span-4 text-center py-16 text-slate-500 bg-card rounded-2xl border border-border">
            No listings yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}

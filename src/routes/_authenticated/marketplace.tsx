import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, useProfile, useIsAdmin } from "@/components/app-shell";
import { blockProfanity } from "@/lib/profanity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Check, HandHelping } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace & Rentals — Campus Hub" },
      {
        name: "description",
        content:
          "Buy, sell, and rent textbooks, dorm gear, and gadgets with fellow students on campus.",
      },
      { property: "og:title", content: "Marketplace & Rentals — Campus Hub" },
      { property: "og:description", content: "Student-to-student marketplace and borrowing hub." },
    ],
  }),
  component: MarketplacePage,
});

const listingSchema = z.object({
  title: z.string().trim().min(2).max(120),
  price: z.coerce.number().min(0).max(100000),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

type ListingType = "sale" | "rent";

const PERIOD_LABEL: Record<string, string> = {
  hour: "hour",
  day: "day",
  week: "week",
  month: "month",
};

function MarketplacePage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const uid = me?.user?.id;
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ListingType>("sale");
  const [formType, setFormType] = useState<ListingType>("sale");
  const [rentPeriod, setRentPeriod] = useState("day");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [borrowFor, setBorrowFor] = useState<string | null>(null);

  const items = useQuery({
    queryKey: ["marketplace"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_items")
        .select(
          "id, title, description, price, image_path, sold, seller_id, created_at, listing_type, rent_period",
        )
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

  const requests = useQuery({
    queryKey: ["borrow-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("borrow_requests")
        .select("id, item_id, requester_id, message, start_date, end_date, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const requesterIds = Array.from(new Set((requests.data ?? []).map((r) => r.requester_id)));
  const people = useQuery({
    queryKey: ["borrow-people", requesterIds.join(",")],
    enabled: requesterIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("profiles_basic", { _ids: requesterIds });
      if (error) throw error;
      const map: Record<string, { full_name: string | null; department: string | null }> = {};
      (data ?? []).forEach((p) => (map[p.id] = { full_name: p.full_name, department: p.department }));
      return map;
    },
  });

  const create = useMutation({
    mutationFn: async (payload: {
      title: string;
      price: number;
      description: string;
      file: File | null;
      listing_type: ListingType;
      rent_period: string | null;
    }) => {
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
        listing_type: payload.listing_type,
        rent_period: payload.listing_type === "rent" ? payload.rent_period : null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.listing_type === "rent" ? "Rental listed" : "Listed");
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
      setTab(vars.listing_type);
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      qc.invalidateQueries({ queryKey: ["borrow-requests"] });
    },
  });

  const requestBorrow = useMutation({
    mutationFn: async (payload: {
      item_id: string;
      message: string;
      start_date: string | null;
      end_date: string | null;
    }) => {
      if (!uid) throw new Error("Not signed in");
      const { error } = await supabase.from("borrow_requests").insert({
        item_id: payload.item_id,
        requester_id: uid,
        message: payload.message || null,
        start_date: payload.start_date,
        end_date: payload.end_date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Borrow request sent");
      setBorrowFor(null);
      qc.invalidateQueries({ queryKey: ["borrow-requests"] });
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("duplicate") ? "You already requested this item" : e.message,
      ),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("borrow_requests").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["borrow-requests"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("borrow_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["borrow-requests"] }),
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
    if (blockProfanity(parsed.data.title, parsed.data.description)) return;
    create.mutate({
      title: parsed.data.title,
      price: parsed.data.price,
      description: parsed.data.description ?? "",
      file: file && file.size > 0 ? file : null,
      listing_type: formType,
      rent_period: rentPeriod,
    });
  }

  function onBorrowSubmit(e: React.FormEvent<HTMLFormElement>, itemId: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (blockProfanity(String(form.get("message") ?? ""))) return;
    requestBorrow.mutate({
      item_id: itemId,
      message: String(form.get("message") ?? "").slice(0, 500),
      start_date: (form.get("start_date") as string) || null,
      end_date: (form.get("end_date") as string) || null,
    });
  }

  const visible = (items.data ?? []).filter((i) => (i.listing_type ?? "sale") === tab);

  function requestsForItem(itemId: string) {
    return (requests.data ?? []).filter((r) => r.item_id === itemId);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Marketplace"
        description="Buy, sell, or rent out textbooks, electronics and dorm gear."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-brand-600 hover:bg-brand-700 w-full sm:w-auto">
                <Plus className="size-4 mr-2" /> New Listing
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create a listing</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label>Listing type</Label>
                  <Select value={formType} onValueChange={(v) => setFormType(v as ListingType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sale">For sale</SelectItem>
                      <SelectItem value="rent">For rent / lend</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" placeholder="MacBook Air M2 2022" required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="price">{formType === "rent" ? "Rate" : "Price"}</Label>
                    <Input id="price" name="price" type="number" step="0.01" min="0" required />
                  </div>
                  {formType === "rent" ? (
                    <div>
                      <Label>Per</Label>
                      <Select value={rentPeriod} onValueChange={setRentPeriod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hour">Hour</SelectItem>
                          <SelectItem value="day">Day</SelectItem>
                          <SelectItem value="week">Week</SelectItem>
                          <SelectItem value="month">Month</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className={formType === "rent" ? "sm:col-span-2" : ""}>
                    <Label htmlFor="file">Photo</Label>
                    <Input id="file" name="file" type="file" accept="image/*" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" rows={3} />
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={create.isPending}
                    className="bg-brand-600 hover:bg-brand-700 w-full sm:w-auto"
                  >
                    {create.isPending ? "Listing…" : "Publish"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as ListingType)} className="mb-6">
        <TabsList className="grid grid-cols-2 w-full max-w-sm">
          <TabsTrigger value="sale">For sale</TabsTrigger>
          <TabsTrigger value="rent">Rent</TabsTrigger>
        </TabsList>
        <TabsContent value="sale" />
        <TabsContent value="rent" />
      </Tabs>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {visible.map((i) => {
          const mine = uid === i.seller_id;
          const canModerate = mine || isAdmin;
          const isRent = (i.listing_type ?? "sale") === "rent";
          const itemRequests = requestsForItem(i.id);
          const myRequest = itemRequests.find((r) => r.requester_id === uid);
          return (
            <div
              key={i.id}
              className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm flex flex-col"
            >
              <div className="aspect-square bg-slate-100 relative">
                {imageUrls[i.id] ? (
                  <img src={imageUrls[i.id]} alt={i.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-slate-300 text-xs uppercase tracking-widest">
                    No photo
                  </div>
                )}
                {isRent ? (
                  <span className="absolute top-2 left-2 rounded-full bg-emerald-600 text-white text-[10px] font-semibold uppercase tracking-wider px-2 py-1">
                    For rent
                  </span>
                ) : null}
                {i.sold ? (
                  <div className="absolute inset-0 bg-black/50 grid place-items-center">
                    <span className="text-white text-xl font-bold uppercase tracking-widest">
                      {isRent ? "Unavailable" : "Sold"}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <h4 className="font-semibold text-slate-900 line-clamp-2">{i.title}</h4>
                  <span className="text-brand-700 font-bold whitespace-nowrap">
                    ${Number(i.price).toFixed(2)}
                    {isRent ? (
                      <span className="text-xs font-medium text-slate-500">
                        /{PERIOD_LABEL[i.rent_period ?? "day"] ?? "day"}
                      </span>
                    ) : null}
                  </span>
                </div>
                {i.description ? (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{i.description}</p>
                ) : null}

                {isRent && !mine ? (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    {myRequest ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500 capitalize">
                          Request {myRequest.status}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancelRequest.mutate(myRequest.id)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Dialog
                        open={borrowFor === i.id}
                        onOpenChange={(o) => setBorrowFor(o ? i.id : null)}
                      >
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="w-full" disabled={i.sold}>
                            <HandHelping className="size-4 mr-2" /> Request to borrow
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Borrow “{i.title}”</DialogTitle>
                          </DialogHeader>
                          <form onSubmit={(e) => onBorrowSubmit(e, i.id)} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor={`sd-${i.id}`}>From</Label>
                                <Input id={`sd-${i.id}`} name="start_date" type="date" />
                              </div>
                              <div>
                                <Label htmlFor={`ed-${i.id}`}>Until</Label>
                                <Input id={`ed-${i.id}`} name="end_date" type="date" />
                              </div>
                            </div>
                            <div>
                              <Label htmlFor={`msg-${i.id}`}>Message to the owner</Label>
                              <Textarea
                                id={`msg-${i.id}`}
                                name="message"
                                rows={3}
                                maxLength={500}
                                placeholder="Hi! I need this for the robotics fest weekend."
                              />
                            </div>
                            <DialogFooter>
                              <Button
                                type="submit"
                                disabled={requestBorrow.isPending}
                                className="bg-brand-600 hover:bg-brand-700 w-full sm:w-auto"
                              >
                                {requestBorrow.isPending ? "Sending…" : "Send request"}
                              </Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                ) : null}

                {mine ? (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    {isRent && itemRequests.length ? (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Borrow requests
                        </div>
                        {itemRequests.map((r) => (
                          <div key={r.id} className="rounded-lg bg-slate-50 p-2 text-xs">
                            <div className="font-medium truncate">
                              {people.data?.[r.requester_id]?.full_name || "Student"}
                            </div>
                            {r.start_date || r.end_date ? (
                              <div className="text-slate-500">
                                {r.start_date ?? "?"} → {r.end_date ?? "?"}
                              </div>
                            ) : null}
                            {r.message ? <p className="text-slate-600 mt-1">{r.message}</p> : null}
                            <div className="flex flex-wrap items-center gap-1 mt-2">
                              <span className="capitalize text-slate-500 mr-auto">{r.status}</span>
                              {r.status === "pending" ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setStatus.mutate({ id: r.id, status: "accepted" })}
                                  >
                                    Accept
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setStatus.mutate({ id: r.id, status: "declined" })}
                                  >
                                    Decline
                                  </Button>
                                </>
                              ) : null}
                              {r.status === "accepted" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setStatus.mutate({ id: r.id, status: "returned" })}
                                >
                                  Mark returned
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-1">
                      {!i.sold ? (
                        <Button size="sm" variant="ghost" onClick={() => markSold.mutate(i.id)}>
                          <Check className="size-4 mr-1" />
                          {isRent ? "Mark unavailable" : "Mark sold"}
                        </Button>
                      ) : null}
                      <Button size="icon" variant="ghost" onClick={() => remove.mutate(i.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {!items.isLoading && visible.length === 0 ? (
          <div className="sm:col-span-2 xl:col-span-4 text-center py-16 text-slate-500 bg-card rounded-2xl border border-border">
            {tab === "rent" ? "No rental listings yet." : "No listings yet."}
          </div>
        ) : null}
      </div>
    </div>
  );
}

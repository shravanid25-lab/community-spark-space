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
import { Plus, Trash2, Calendar, MapPin, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/clubs")({
  head: () => ({
    meta: [
      { title: "Clubs & Events — Campus Connect" },
      { name: "description", content: "Discover student clubs and upcoming campus events." },
      { property: "og:title", content: "Clubs & Events — Campus Connect" },
      { property: "og:description", content: "Get involved in campus life." },
    ],
  }),
  component: ClubsPage,
});

const clubSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

const eventSchema = z.object({
  title: z.string().trim().min(2).max(120),
  location: z.string().trim().max(120).optional().or(z.literal("")),
  starts_at: z.string().min(1),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  club_id: z.string().uuid().optional().or(z.literal("")),
});

function ClubsPage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const [clubOpen, setClubOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);

  const clubs = useQuery({
    queryKey: ["clubs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, description, created_by, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const events = useQuery({
    queryKey: ["events-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, description, location, starts_at, club_id, created_by")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createClub = useMutation({
    mutationFn: async (payload: { name: string; description: string }) => {
      const uid = me?.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error } = await supabase.from("clubs").insert({
        created_by: uid,
        name: payload.name,
        description: payload.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Club created");
      qc.invalidateQueries({ queryKey: ["clubs"] });
      setClubOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createEvent = useMutation({
    mutationFn: async (payload: {
      title: string;
      description: string;
      location: string;
      starts_at: string;
      club_id: string;
    }) => {
      const uid = me?.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error } = await supabase.from("events").insert({
        created_by: uid,
        title: payload.title,
        description: payload.description || null,
        location: payload.location || null,
        starts_at: new Date(payload.starts_at).toISOString(),
        club_id: payload.club_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event created");
      qc.invalidateQueries({ queryKey: ["events-all"] });
      qc.invalidateQueries({ queryKey: ["dashboard-events"] });
      setEventOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeClub = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clubs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clubs"] }),
  });

  const removeEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events-all"] }),
  });

  async function submitClub(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = clubSchema.safeParse({
      name: form.get("name"),
      description: form.get("description") ?? "",
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    createClub.mutate({ name: parsed.data.name, description: parsed.data.description ?? "" });
  }

  async function submitEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = eventSchema.safeParse({
      title: form.get("title"),
      location: form.get("location") ?? "",
      starts_at: form.get("starts_at"),
      description: form.get("description") ?? "",
      club_id: form.get("club_id") ?? "",
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    createEvent.mutate({
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      location: parsed.data.location ?? "",
      starts_at: parsed.data.starts_at,
      club_id: parsed.data.club_id ?? "",
    });
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">
      <PageHeader
        title="Clubs & Events"
        description="Explore student communities and upcoming happenings."
        action={
          <div className="flex gap-2">
            <Dialog open={clubOpen} onOpenChange={setClubOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="size-4 mr-2" /> New Club
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a club</DialogTitle>
                </DialogHeader>
                <form onSubmit={submitClub} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" placeholder="Photography Society" required />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" rows={3} />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={createClub.isPending} className="bg-brand-600 hover:bg-brand-700">
                      {createClub.isPending ? "Creating…" : "Create"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={eventOpen} onOpenChange={setEventOpen}>
              <DialogTrigger asChild>
                <Button className="bg-brand-600 hover:bg-brand-700">
                  <Plus className="size-4 mr-2" /> New Event
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create an event</DialogTitle>
                </DialogHeader>
                <form onSubmit={submitEvent} className="space-y-4">
                  <div>
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" name="title" placeholder="Annual Tech Symposium" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="starts_at">Starts at</Label>
                      <Input id="starts_at" name="starts_at" type="datetime-local" required />
                    </div>
                    <div>
                      <Label htmlFor="location">Location</Label>
                      <Input id="location" name="location" placeholder="Innovation Hall" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="club_id">Club (optional)</Label>
                    <Select name="club_id">
                      <SelectTrigger id="club_id">
                        <SelectValue placeholder="No club" />
                      </SelectTrigger>
                      <SelectContent>
                        {clubs.data?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="event_desc">Description</Label>
                    <Textarea id="event_desc" name="description" rows={3} />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={createEvent.isPending} className="bg-brand-600 hover:bg-brand-700">
                      {createEvent.isPending ? "Creating…" : "Create"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <section>
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Users className="size-5 text-brand-600" /> Clubs
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clubs.data?.map((c) => (
            <div key={c.id} className="bg-card p-5 rounded-2xl border border-border shadow-sm">
              <div className="flex items-start justify-between">
                <h3 className="font-bold text-slate-900">{c.name}</h3>
                {me?.user?.id === c.created_by ? (
                  <Button size="icon" variant="ghost" onClick={() => removeClub.mutate(c.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                ) : null}
              </div>
              {c.description ? <p className="text-sm text-slate-500 mt-2">{c.description}</p> : null}
            </div>
          ))}
          {!clubs.isLoading && (clubs.data?.length ?? 0) === 0 ? (
            <div className="md:col-span-2 lg:col-span-3 text-center py-10 text-slate-500 bg-card rounded-2xl border border-border">
              No clubs yet.
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Calendar className="size-5 text-brand-600" /> Events
        </h2>
        <div className="space-y-3">
          {events.data?.map((e) => {
            const d = new Date(e.starts_at);
            return (
              <div key={e.id} className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                <div className="size-14 shrink-0 rounded-xl bg-brand-50 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-brand-600 uppercase">{format(d, "MMM")}</span>
                  <span className="text-xl font-bold text-brand-700 leading-none">{format(d, "d")}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900">{e.title}</h4>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span>{format(d, "EEEE, h:mm a")}</span>
                    {e.location ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" /> {e.location}
                      </span>
                    ) : null}
                  </div>
                  {e.description ? <p className="text-sm text-slate-600 mt-2">{e.description}</p> : null}
                </div>
                {me?.user?.id === e.created_by ? (
                  <Button size="icon" variant="ghost" onClick={() => removeEvent.mutate(e.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                ) : null}
              </div>
            );
          })}
          {!events.isLoading && (events.data?.length ?? 0) === 0 ? (
            <div className="text-center py-10 text-slate-500 bg-card rounded-2xl border border-border">
              No events scheduled.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

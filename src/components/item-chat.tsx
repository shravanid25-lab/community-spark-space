import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/components/app-shell";
import { blockProfanity } from "@/lib/profanity";
import { aiModerate, aiOk } from "@/lib/moderation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageCircle, ShieldAlert, ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Props = {
  itemType: "lost_found" | "marketplace";
  itemId: string;
  ownerId: string;
  itemTitle: string;
  label?: string;
};

export function ItemChatButton({ itemType, itemId, ownerId, itemTitle, label }: Props) {
  const { data: me } = useProfile();
  const uid = me?.user?.id;
  const isOwner = uid === ownerId;
  const [open, setOpen] = useState(false);
  const [participant, setParticipant] = useState<string | null>(null);
  const qc = useQueryClient();
  const key = ["item-messages", itemType, itemId];

  const messages = useQuery({
    queryKey: key,
    enabled: open && !!uid,
    refetchInterval: open ? 4000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("item_messages")
        .select("id, participant_id, sender_id, body, created_at")
        .eq("item_type", itemType)
        .eq("item_id", itemId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const threadIds = useMemo(
    () => Array.from(new Set((messages.data ?? []).map((m) => m.participant_id))),
    [messages.data],
  );
  const peopleIds = useMemo(() => Array.from(new Set([...threadIds, ownerId])), [threadIds, ownerId]);
  const names = useQuery({
    queryKey: ["chat-names", peopleIds.join(",")],
    enabled: open && peopleIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.rpc("profiles_basic", { _ids: peopleIds });
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: { id: string; full_name: string | null }) => (map[p.id] = p.full_name ?? "Student"));
      return map;
    },
  });

  const activeParticipant = isOwner ? participant : uid ?? null;
  const thread = (messages.data ?? []).filter((m) => m.participant_id === activeParticipant);

  const send = useMutation({
    mutationFn: async (body: string) => {
      if (!uid || !activeParticipant) throw new Error("Not signed in");
      await aiModerate([body]);
      const { error } = await supabase.from("item_messages").insert({
        item_type: itemType,
        item_id: itemId,
        owner_id: ownerId,
        participant_id: activeParticipant,
        sender_id: uid,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [thread.length, activeParticipant]);

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    if (body.length > 1000) return toast.error("Message is too long");
    if (blockProfanity(body)) return;
    send.mutate(body, { onSuccess: () => setText("") });
  }

  const showThread = !!activeParticipant;
  const otherName = isOwner
    ? names.data?.[participant ?? ""] ?? "Student"
    : names.data?.[ownerId] ?? "Owner";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setParticipant(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full mt-2">
          <MessageCircle className="size-4 mr-2" />
          {label ?? (isOwner ? "View messages" : "Message owner")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isOwner && showThread ? (
              <button onClick={() => setParticipant(null)} aria-label="Back" className="p-1 -ml-1 rounded hover:bg-muted">
                <ArrowLeft className="size-4" />
              </button>
            ) : null}
            <span className="truncate">
              {showThread ? `${otherName} · ${itemTitle}` : `Messages · ${itemTitle}`}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <ShieldAlert className="size-4 shrink-0 mt-0.5" />
          Please don't share personal information (phone numbers, addresses, ID or bank details). Meet in a public campus spot.
        </div>

        {!showThread ? (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {threadIds.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
            ) : (
              threadIds.map((pid) => {
                const last = [...(messages.data ?? [])].reverse().find((m) => m.participant_id === pid);
                return (
                  <button
                    key={pid}
                    onClick={() => setParticipant(pid)}
                    className="w-full text-left rounded-lg border border-border p-3 hover:bg-muted"
                  >
                    <div className="font-medium text-sm">{names.data?.[pid] ?? "Student"}</div>
                    <div className="text-xs text-muted-foreground truncate">{last?.body}</div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <>
            <div className="h-[45vh] overflow-y-auto space-y-2 rounded-lg bg-muted/40 p-3">
              {thread.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Say hello to start the conversation.</p>
              ) : (
                thread.map((m) => {
                  const mine = m.sender_id === uid;
                  return (
                    <div key={m.id} className={"flex " + (mine ? "justify-end" : "justify-start")}>
                      <div
                        className={
                          "max-w-[80%] rounded-2xl px-3 py-2 text-sm break-words " +
                          (mine ? "bg-primary text-primary-foreground" : "bg-card border border-border")
                        }
                      >
                        {m.body}
                        <div className="text-[10px] opacity-70 mt-1">{format(new Date(m.created_at), "MMM d, h:mm a")}</div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>
            <form onSubmit={onSend} className="flex gap-2">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" maxLength={1000} />
              <Button type="submit" size="icon" disabled={send.isPending || !text.trim()} aria-label="Send">
                <Send className="size-4" />
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

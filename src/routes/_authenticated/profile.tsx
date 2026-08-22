import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, useProfile } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAvatarUrl } from "@/lib/avatar";


export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — Campus Hub" },
      {
        name: "description",
        content: "Edit your photo, name, branch, skills and interests so project leaders can find you.",
      },
      { property: "og:title", content: "My Profile — Campus Hub" },
      { property: "og:description", content: "Showcase your skills and interests to campus teams." },
    ],
  }),
  component: ProfilePage,
});

type FullProfile = {
  id: string;
  full_name: string | null;
  department: string | null;
  avatar_url: string | null;
  bio: string | null;
  skills: string[] | null;
  interests: string[] | null;
};




function ProfilePage() {
  const qc = useQueryClient();
  const { data: me } = useProfile();
  const uid = me?.user?.id;

  const profileQ = useQuery({
    queryKey: ["profile-full", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, department, avatar_url, bio, skills, interests")
        .eq("id", uid!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as FullProfile | null;
    },
    enabled: !!uid,
  });

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [interests, setInterests] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const p = profileQ.data;
    if (!p) return;
    setFullName(p.full_name ?? "");
    setDepartment(p.department ?? "");
    setBio(p.bio ?? "");
    setSkills((p.skills ?? []).join(", "));
    setInterests((p.interests ?? []).join(", "));
  }, [profileQ.data]);

  const avatar = useAvatarUrl(profileQ.data?.avatar_url);

  const save = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("Not signed in");
      const toList = (s: string) =>
        s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 20);
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim().slice(0, 80) || null,
          department: department.trim().slice(0, 80) || null,
          bio: bio.trim().slice(0, 500) || null,
          skills: toList(skills),
          interests: toList(interests),
        })
        .eq("id", uid);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profile-full"] });
      qc.invalidateQueries({ queryKey: ["teammates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uid) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file");
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5 MB");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/avatar/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("campus-uploads").upload(path, file);
      if (up.error) throw up.error;
      const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", uid);
      if (error) throw error;
      toast.success("Photo updated");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profile-full"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const initials = (fullName || me?.user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const chips = (label: string, list: string) => {
    const items = list
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {items.map((t) => (
          <span key={label + t} className="text-xs px-2 py-0.5 bg-brand-50 text-brand-700 rounded">
            {t}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <PageHeader
        title="My Profile"
        description="Team leaders see this when they search for members in the Project Hub."
      />

      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative w-fit">
            <div className="size-20 rounded-full overflow-hidden bg-brand-100 text-brand-700 grid place-items-center text-lg font-semibold">
              {avatar.data ? (
                <img src={avatar.data} alt="Your profile photo" className="size-full object-cover" />
              ) : (
                initials || "U"
              )}
            </div>
            <label className="absolute -bottom-1 -right-1 size-8 rounded-full bg-brand-600 text-white grid place-items-center cursor-pointer shadow hover:bg-brand-700">
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              <span className="sr-only">Change profile photo</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickPhoto}
                disabled={uploading}
              />
            </label>
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{fullName || "Unnamed student"}</div>
            <div className="text-sm text-slate-500 truncate">{me?.user?.email}</div>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Aarav Sharma"
                maxLength={80}
              />
            </div>
            <div>
              <Label htmlFor="department">Branch / department</Label>
              <Input
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Computer Engineering"
                maxLength={80}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="bio">About you</Label>
            <Textarea
              id="bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Second-year student who loves building mobile apps and playing chess."
              maxLength={500}
            />
          </div>

          <div>
            <Label htmlFor="skills">Skills (comma-separated)</Label>
            <Input
              id="skills"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="React, Figma, Python, Public speaking"
            />
            {chips("s", skills)}
          </div>

          <div>
            <Label htmlFor="interests">Interests (comma-separated)</Label>
            <Input
              id="interests"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="Hackathons, Robotics, Startups"
            />
            {chips("i", interests)}
          </div>

          <Button
            type="submit"
            disabled={save.isPending || profileQ.isLoading}
            className="bg-brand-600 hover:bg-brand-700 w-full sm:w-auto"
          >
            {save.isPending ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </div>
    </div>
  );
}

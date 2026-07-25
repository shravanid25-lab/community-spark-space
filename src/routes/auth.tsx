import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Campus Connect" },
      { name: "description", content: "Sign in or create your Campus Connect student account." },
      { property: "og:title", content: "Sign in — Campus Connect" },
      { property: "og:description", content: "Access notes, projects, marketplace, and more." },
    ],
  }),
  component: AuthPage,
});

const PCU_DOMAIN = "pcu.edu.in";
const pcuEmail = z
  .string()
  .trim()
  .email("Enter a valid email")
  .max(255)
  .refine((v) => v.toLowerCase().endsWith(`@${PCU_DOMAIN}`), {
    message: `Only @${PCU_DOMAIN} emails are allowed`,
  });

const signInSchema = z.object({
  email: pcuEmail,
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

const signUpSchema = signInSchema.extend({
  full_name: z.string().trim().min(2, "Enter your full name").max(100),
  student_id: z.string().trim().max(50).optional().or(z.literal("")),
  department: z.string().trim().max(80).optional().or(z.literal("")),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: parsed.data.full_name,
          student_id: parsed.data.student_id || null,
          department: parsed.data.department || null,
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — welcome to Campus Connect!");
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      toast.error(result.error.message || "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-brand-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 [background:radial-gradient(circle_at_20%_20%,#3b82f6_0%,transparent_50%),radial-gradient(circle_at_80%_80%,#10b981_0%,transparent_50%)]" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-brand-600 grid place-items-center">
              <GraduationCap className="size-6" />
            </div>
            <span className="text-xl font-bold">Campus Connect</span>
          </div>
        </div>
        <div className="relative space-y-4">
          <h2 className="text-4xl font-bold leading-tight">
            Everything your campus lives on. One portal.
          </h2>
          <p className="text-brand-100 max-w-md">
            Share notes, form project teams, buy and sell, find lost gear, follow clubs, and vote in
            polls — all in one clean workspace built for students.
          </p>
        </div>
        <div className="relative text-xs text-brand-100/70">© {new Date().getFullYear()} Campus Connect University</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-center mb-6">
            <div className="inline-flex size-12 items-center justify-center rounded-xl bg-brand-600 text-white mb-3">
              <GraduationCap className="size-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome</h1>
            <p className="text-slate-500 text-sm mt-1">
              Sign in to access your university dashboard.
            </p>
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="you@university.edu" required />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" name="password" type="password" placeholder="••••••••" required />
                </div>
                <Button type="submit" className="w-full bg-brand-600 hover:bg-brand-700" disabled={loading}>
                  {loading ? "Signing in…" : "Sign In to Dashboard"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <Label htmlFor="su_full_name">Full name</Label>
                  <Input id="su_full_name" name="full_name" placeholder="Alex Rivera" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="su_student_id">Student ID</Label>
                    <Input id="su_student_id" name="student_id" placeholder="2024-00123" />
                  </div>
                  <div>
                    <Label htmlFor="su_department">Department</Label>
                    <Input id="su_department" name="department" placeholder="CS" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="su_email">Email</Label>
                  <Input id="su_email" name="email" type="email" placeholder="you@university.edu" required />
                </div>
                <div>
                  <Label htmlFor="su_password">Password</Label>
                  <Input id="su_password" name="password" type="password" placeholder="At least 6 characters" required />
                </div>
                <Button type="submit" className="w-full bg-brand-600 hover:bg-brand-700" disabled={loading}>
                  {loading ? "Creating…" : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-xs uppercase tracking-wider text-slate-400">or</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogle}
            disabled={loading}
          >
            <svg className="size-4 mr-2" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
              />
            </svg>
            Continue with Google
          </Button>
        </div>
      </div>
    </div>
  );
}


# Campus Connect — University ERP Portal

A full-stack campus portal styled after the chosen "Modern academic workspace" direction (slate/white shell, blue brand, Inter type, sidebar + card-grid dashboard). Real auth and persistent data via Lovable Cloud.

## Modules (all 7 with basic CRUD)

1. **Note Sharing** — upload/download files, list by course
2. **Project Hub** — post projects, request to join
3. **Lost & Found** — report lost/found items with image
4. **Marketplace** — list items for sale (title, price, image)
5. **Clubs & Events** — clubs list + upcoming events
6. **Campus Voice** — polls with vote counts + progress bars
7. **Overview Dashboard** — module tiles, quick stats, recent activity

## Auth & user model

- Email/password + Google sign-in via Lovable Cloud
- `profiles` table (id → auth.users, full_name, student_id, department, avatar_url) auto-created on signup via trigger
- `user_roles` table + `has_role()` security-definer function (roles: admin, student) — admins can moderate/delete any content
- `/auth` public route (login + signup, matches direction's login card)
- Protected app lives under `_authenticated/` with sidebar shell

## Routes

```
/                          -> redirect: signed-in → /dashboard, else → /auth
/auth                      -> login + signup (public)
/_authenticated/
  dashboard                -> module grid + campus voice + upcoming events
  notes                    -> list + upload dialog
  projects                 -> list + create + join
  lost-found               -> list + report
  marketplace              -> list + create
  clubs                    -> clubs + events
  polls                    -> polls list + vote + create
```

Sidebar navigates all 7 areas; header shows user avatar/name/student ID and sign-out.

## Database (Lovable Cloud / Postgres + RLS)

- `profiles`, `user_roles` (+ has_role fn, trigger for new users)
- `notes` (title, course_code, description, file_path, file_type, uploader_id, created_at)
- `projects` (title, description, tags, owner_id, status, created_at) + `project_members`
- `lost_found_items` (kind: lost|found, title, description, location, image_path, reporter_id, resolved, created_at)
- `marketplace_items` (title, description, price, image_path, seller_id, sold, created_at)
- `clubs` (name, description, banner_path, created_by) + `events` (club_id, title, description, starts_at, location)
- `polls` (question, created_by, closes_at) + `poll_options` + `poll_votes` (unique per user/poll)
- Storage buckets: `notes`, `lost-found`, `marketplace`, `clubs` (public read where appropriate; owner-write via RLS)
- RLS: authenticated users read all listings; only owner (or admin) can update/delete their rows; votes unique per user

## Design system

Port direction tokens to `src/styles.css` `@theme inline`:
- Brand: `--brand-600 #2563eb`, `--brand-500 #3b82f6`, `--brand-50 #eff6ff`, `--brand-900 #0f172a`, `--accent #10b981`
- Slate-50 background, white cards, `rounded-xl`/`rounded-2xl`, subtle shadow-sm
- Inter font loaded via `<link>` in `__root.tsx`
- Semantic tokens only; module accent chips (blue/emerald/amber/purple/rose) via mapped tokens
- shadcn Sidebar for shell; Tables for lists; Dialogs for create forms; Toast for feedback

## Tech notes

- TanStack Start server functions with `requireSupabaseAuth` for all writes/uploads
- TanStack Query for reads (loader `ensureQueryData` + `useSuspenseQuery`)
- File uploads via Supabase Storage from the browser client (RLS-scoped)
- Managed `_authenticated/route.tsx` gate handles auth redirect
- Client-side Zod validation on all forms (title/description length caps, price ≥ 0, etc.)
- Every route sets its own `head()` with title + description; `__root.tsx` OG tags updated to Campus Connect

## Scope for this build

Basic CRUD per module: list + create (+ delete-own where relevant), plus voting on polls and join-request on projects. No comments, DMs, notifications, or search — those can come next.

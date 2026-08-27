INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE lower(email) = 'shravani.deshpande25@pcu.edu.in'
ON CONFLICT (user_id, role) DO NOTHING;
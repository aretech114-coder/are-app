-- Configuration workflow ARE (à personnaliser en Production)
-- Remplacer les UUID puis exécuter dans le SQL Editor Supabase.

-- ---------------------------------------------------------------------------
-- 1. Vérifier les étapes actives (attendu : 2, 4, 6, 8, 9)
-- ---------------------------------------------------------------------------
SELECT step_order, name, is_active, responsible_roles
FROM public.workflow_steps
ORDER BY step_order;

-- ---------------------------------------------------------------------------
-- 2. Responsables par étape (remplacer les UUID)
-- ---------------------------------------------------------------------------
-- SELECT id, full_name, email FROM public.profiles ORDER BY full_name;

/*
INSERT INTO public.workflow_step_responsibles (step_number, default_user_id, assignment_mode, is_active)
VALUES
  (2, 'UUID_DG', 'default_user', true),
  (6, 'UUID_DG', 'default_user_with_fallback', true),
  (8, 'UUID_SECRETARIAT', 'default_user', true)
ON CONFLICT (step_number) DO UPDATE SET
  default_user_id = EXCLUDED.default_user_id,
  assignment_mode = EXCLUDED.assignment_mode,
  is_active = true;
*/

-- ---------------------------------------------------------------------------
-- 3. Courriers potentiellement bloqués
-- ---------------------------------------------------------------------------
SELECT reference_number, current_step, status, created_at
FROM public.mails
WHERE current_step IN (1, 3, 5, 7)
  AND status IN ('pending', 'in_progress')
ORDER BY created_at DESC
LIMIT 50;

-- ---------------------------------------------------------------------------
-- 4. Test RPC list_assignable_users (connecté en tant qu'utilisateur via app)
-- ---------------------------------------------------------------------------
-- SELECT * FROM public.list_assignable_users() LIMIT 20;

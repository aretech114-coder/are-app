-- Add dynamic workflow columns to workflow_steps
ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS responsible_role text,
  ADD COLUMN IF NOT EXISTS action_labels jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assignment_mode text DEFAULT 'default_user',
  ADD COLUMN IF NOT EXISTS color_class text DEFAULT '';

-- Add unique constraint on step_order
ALTER TABLE public.workflow_steps
  ADD CONSTRAINT workflow_steps_step_order_unique UNIQUE (step_order);

-- Seed the 9 default workflow steps (skip if already exist)
INSERT INTO public.workflow_steps (step_order, name, description, responsible_role, assignment_mode, color_class, is_active, conditions)
VALUES
  (1, 'Réception', 'Scan, attribution ID, saisie métadonnées', 'secretariat', 'default_user', 'bg-blue-500/10 text-blue-600 border-blue-200', true, '{}'),
  (2, 'Routage Hiérarchique', 'Dispatch: Ministre → Dircab → Dircaba', 'ministre', 'default_user', 'bg-purple-500/10 text-purple-600 border-purple-200', true, '{}'),
  (3, 'Filtrage Stratégique', 'Validation des instructions et réaffectation', 'dircab', 'default_user', 'bg-amber-500/10 text-amber-600 border-amber-200', true, '{"skip_if_ministre_absent": true}'),
  (4, 'Traitement', 'Rédaction notes techniques ou réponses', 'conseiller_juridique', 'dynamic_by_previous_step', 'bg-emerald-500/10 text-emerald-600 border-emerald-200', true, '{}'),
  (5, 'Vérification', 'Vérification par le DirCab avant validation', 'dircab', 'default_user', 'bg-orange-500/10 text-orange-600 border-orange-200', true, '{}'),
  (6, 'Validation Ministre', 'Validation finale ou rejet par le Ministre', 'ministre', 'default_user_with_fallback', 'bg-cyan-500/10 text-cyan-600 border-cyan-200', true, '{}'),
  (7, 'Consultation Conseillers', 'Les conseillers consultent la validation de leur note technique', 'conseiller_juridique', 'dynamic_by_previous_step', 'bg-teal-500/10 text-teal-600 border-teal-200', true, '{"skip_if_not_note_technique": true}'),
  (8, 'Retour & Preuve de Dépôt', 'Retour du document avec preuve de dépôt et scan', 'secretariat', 'default_user', 'bg-indigo-500/10 text-indigo-600 border-indigo-200', true, '{}'),
  (9, 'Archivage Final', 'Clôture définitive et transfert au dépôt central', 'secretariat', 'default_user', 'bg-slate-500/10 text-slate-600 border-slate-200', true, '{}')
ON CONFLICT (step_order) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  responsible_role = EXCLUDED.responsible_role,
  assignment_mode = EXCLUDED.assignment_mode,
  color_class = EXCLUDED.color_class,
  conditions = EXCLUDED.conditions;
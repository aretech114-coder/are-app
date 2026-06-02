-- Bootstrap action_labels + responsible_roles + libellés étapes (UI DGA/DG)
-- Idempotent — safe to re-run on Production partielle

UPDATE public.workflow_steps
SET responsible_roles = ARRAY[responsible_role]
WHERE responsible_role IS NOT NULL
  AND responsible_role <> ''
  AND (responsible_roles IS NULL OR array_length(responsible_roles, 1) IS NULL);

UPDATE public.workflow_steps SET action_labels = '{"approve":"Valider et transmettre","reject":"Renvoyer"}'::jsonb
WHERE step_order = 2;

UPDATE public.workflow_steps SET action_labels = '{"approve":"Confirmer et transmettre","reject":"Renvoyer au DG"}'::jsonb
WHERE step_order = 3;

UPDATE public.workflow_steps SET action_labels = '{"complete":"Soumettre mon traitement"}'::jsonb
WHERE step_order = 4;

UPDATE public.workflow_steps SET action_labels = '{"approve":"Valider","reject":"Renvoyer au traitement"}'::jsonb
WHERE step_order = 5;

UPDATE public.workflow_steps SET action_labels = '{"approve":"Validation DG","reject":"Renvoyer"}'::jsonb
WHERE step_order = 6;

UPDATE public.workflow_steps SET action_labels = '{"acknowledge":"Confirmer la consultation"}'::jsonb
WHERE step_order = 7;

UPDATE public.workflow_steps SET action_labels = '{"complete":"Confirmer preuve de dépôt"}'::jsonb
WHERE step_order = 8;

UPDATE public.workflow_steps SET action_labels = '{"archive":"Archiver définitivement"}'::jsonb
WHERE step_order = 9;

UPDATE public.workflow_steps
SET
  name = CASE step_order
    WHEN 3 THEN 'Filtrage stratégique (DGA)'
    WHEN 5 THEN 'Vérification (DGA)'
    ELSE name
  END,
  description = CASE step_order
    WHEN 3 THEN 'Validation des instructions et réaffectation par le DGA'
    WHEN 5 THEN 'Vérification par le DGA avant validation DG'
    WHEN 6 THEN 'Validation finale ou rejet par le DG'
    ELSE description
  END
WHERE step_order IN (3, 5, 6);

-- Defaults site_settings authority titles (colonnes setting_key / setting_value)
UPDATE public.site_settings
SET setting_value = 'DG', updated_at = now()
WHERE setting_key = 'authority_title_short'
  AND (setting_value IS NULL OR setting_value = '' OR setting_value = 'Ministre');

UPDATE public.site_settings
SET setting_value = 'Directeur général', updated_at = now()
WHERE setting_key = 'authority_title_long'
  AND (setting_value IS NULL OR setting_value = '' OR setting_value = 'Ministre');

-- Insérer les clés si absentes (Production partielle)
INSERT INTO public.site_settings (setting_key, setting_value, setting_type, label, description)
VALUES
  ('authority_title_short', 'DG', 'text', 'Titre de l''autorité (court)', 'Forme courte du titre de l''autorité supérieure (ex. DG).'),
  ('authority_title_long', 'Directeur général', 'text', 'Titre de l''autorité (long)', 'Forme longue du titre de l''autorité supérieure (ex. Directeur général).')
ON CONFLICT (setting_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

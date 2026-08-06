-- ============================================================
-- Pont ERP : rôle lecture seule pour migration legacy
-- Exécuter en SQL Editor (Production / Develop) en tant que
-- propriétaire / superuser (Dashboard → SQL).
--
-- CRITIQUE : BYPASSRLS est obligatoire. GRANT SELECT seul
-- renvoie 0 ligne tant que RLS est actif sur les tables courrier.
--
-- Après création : noter le mot de passe, construire
-- ARE_LEGACY_DB_URL =
--   postgresql://erp_readonly:<mdp>@db.<project_ref>.supabase.co:5432/postgres?sslmode=require
-- Rotater le mot de passe après cutover si possible.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_readonly') THEN
    CREATE ROLE erp_readonly LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
    RAISE NOTICE 'Rôle erp_readonly créé — CHANGEZ le mot de passe immédiatement (ALTER ROLE).';
  ELSE
    RAISE NOTICE 'Rôle erp_readonly existe déjà — grants / BYPASSRLS réappliqués.';
  END IF;
END $$;

-- Mot de passe : à fixer manuellement si rôle déjà existant
-- ALTER ROLE erp_readonly PASSWORD '<mot_de_passe_fort>';

GRANT USAGE ON SCHEMA public TO erp_readonly;

-- P0 — courriers / historique / identité
GRANT SELECT ON
  public.mails,
  public.mail_assignments,
  public.workflow_transitions,
  public.mail_contributions,
  public.mail_workflow_documents,
  public.profiles,
  public.user_roles,
  public.ged_documents
TO erp_readonly;

-- P1 — libellés / RDV / définition workflow
GRANT SELECT ON
  public.calendar_events,
  public.mail_types,
  public.services_concernes,
  public.workflow_steps,
  public.sla_config
TO erp_readonly;

-- Indispensable avec RLS activé sur les tables métier
ALTER ROLE erp_readonly BYPASSRLS;

-- Pas d'écriture (explicite : ne pas grant INSERT/UPDATE/DELETE)
-- REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM erp_readonly;

-- ------------------------------------------------------------
-- Vérifications (à relancer connecté EN erp_readonly si possible)
-- ------------------------------------------------------------
-- SELECT current_user;
-- SELECT count(*) AS mails_total FROM public.mails;
-- SELECT count(*) AS eligible
-- FROM public.mails
-- WHERE status = 'archived' AND workflow_completed_at IS NOT NULL;

SELECT
  r.rolname,
  r.rolcanlogin AS can_login,
  r.rolbypassrls AS bypass_rls
FROM pg_roles r
WHERE r.rolname = 'erp_readonly';

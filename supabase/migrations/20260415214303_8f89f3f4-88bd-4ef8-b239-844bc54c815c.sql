-- Add new roles to app_role enum (non-destructive, existing roles untouched)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'autorite_1';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'autorite_2';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'autorite_3';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'autorite_4';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'directeur';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'chef_departement';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'secretaire_direction';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'collaborateur';
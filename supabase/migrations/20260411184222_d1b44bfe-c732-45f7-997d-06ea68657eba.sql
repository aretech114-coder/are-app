-- =============================================
-- Fix 1: Remove overly permissive avatars storage policies
-- =============================================

-- Drop the overly permissive policies that allow ANY authenticated user to upload/update/delete
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete files" ON storage.objects;

-- Add a scoped DELETE policy (only owner can delete their own avatar)
CREATE POLICY "Users can delete own avatar"
ON storage.objects
FOR DELETE
TO public
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- =============================================
-- Fix 2: Add UPDATE policy for mail-documents
-- =============================================

CREATE POLICY "Admins update mail documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'mail-documents'
  AND (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- =============================================
-- Fix 3: Harden user_roles UPDATE policy
-- Drop and recreate to ensure WITH CHECK prevents escalation
-- =============================================

DROP POLICY IF EXISTS "Admins can update non-superadmin roles" ON public.user_roles;

CREATE POLICY "Admins can update non-superadmin roles"
ON public.user_roles
FOR UPDATE
TO public
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'superadmin'::app_role
)
WITH CHECK (
  role <> 'superadmin'::app_role
  AND role <> 'admin'::app_role
);
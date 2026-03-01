
-- Add participant_ids column for proper filtering
ALTER TABLE public.calendar_events ADD COLUMN participant_ids UUID[] DEFAULT '{}';

-- Drop existing policies to recreate with proper visibility
DROP POLICY IF EXISTS "Authenticated read events" ON public.calendar_events;
DROP POLICY IF EXISTS "Authenticated insert events" ON public.calendar_events;
DROP POLICY IF EXISTS "Creator or admin update events" ON public.calendar_events;
DROP POLICY IF EXISTS "Creator or admin delete events" ON public.calendar_events;

-- Ministre and DirCab see all events; others only see events where they are participants or creator
CREATE POLICY "View events"
ON public.calendar_events FOR SELECT
USING (
  has_role(auth.uid(), 'ministre'::app_role) OR
  has_role(auth.uid(), 'dircab'::app_role) OR
  has_role(auth.uid(), 'superadmin'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  created_by = auth.uid() OR
  auth.uid() = ANY(participant_ids)
);

-- Authenticated users can insert events
CREATE POLICY "Insert events"
ON public.calendar_events FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Creator, ministre, or admin can update
CREATE POLICY "Update events"
ON public.calendar_events FOR UPDATE
USING (
  created_by = auth.uid() OR
  has_role(auth.uid(), 'superadmin'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'ministre'::app_role)
);

-- Creator or admin can delete
CREATE POLICY "Delete events"
ON public.calendar_events FOR DELETE
USING (
  created_by = auth.uid() OR
  has_role(auth.uid(), 'superadmin'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);


-- Table pour les événements / RDV liés aux courriers
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mail_id UUID REFERENCES public.mails(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  event_time TIME,
  end_time TIME,
  location TEXT,
  participants TEXT[],
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read events
CREATE POLICY "Authenticated read events"
ON public.calendar_events FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Authorized users can insert events
CREATE POLICY "Authenticated insert events"
ON public.calendar_events FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Creator or admins can update events
CREATE POLICY "Creator or admin update events"
ON public.calendar_events FOR UPDATE
USING (created_by = auth.uid() OR has_role(auth.uid(), 'superadmin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'ministre'::app_role));

-- Creator or admins can delete events
CREATE POLICY "Creator or admin delete events"
ON public.calendar_events FOR DELETE
USING (created_by = auth.uid() OR has_role(auth.uid(), 'superadmin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_calendar_events_updated_at
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

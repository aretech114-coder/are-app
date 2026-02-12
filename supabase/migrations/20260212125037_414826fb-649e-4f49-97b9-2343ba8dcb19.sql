
-- Role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');

-- Mail priority enum
CREATE TYPE public.mail_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- Mail status enum
CREATE TYPE public.mail_status AS ENUM ('pending', 'in_progress', 'processed', 'archived');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  password_changed_at TIMESTAMPTZ DEFAULT now(),
  first_login BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User roles table (separate from profiles per security requirements)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'agent',
  UNIQUE(user_id, role)
);

-- Mails table
CREATE TABLE public.mails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT NOT NULL UNIQUE,
  qr_code_data TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_organization TEXT,
  subject TEXT NOT NULL,
  description TEXT,
  document_summary TEXT,
  priority mail_priority NOT NULL DEFAULT 'normal',
  status mail_status NOT NULL DEFAULT 'pending',
  assigned_agent_id UUID REFERENCES auth.users(id),
  registered_by UUID NOT NULL REFERENCES auth.users(id),
  attachment_url TEXT,
  is_read BOOLEAN DEFAULT false,
  ai_draft TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Mail processing history
CREATE TABLE public.mail_processing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_id UUID NOT NULL REFERENCES public.mails(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  mail_id UUID REFERENCES public.mails(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_processing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Security definer helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_my_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Profiles RLS
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Supervisors can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- User roles RLS
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Mails RLS
CREATE POLICY "Admins see all mail" ON public.mails
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Supervisors see all mail" ON public.mails
  FOR SELECT USING (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "Agents see assigned mail" ON public.mails
  FOR SELECT USING (assigned_agent_id = auth.uid() OR registered_by = auth.uid());
CREATE POLICY "Authenticated users can insert mail" ON public.mails
  FOR INSERT WITH CHECK (auth.uid() = registered_by);
CREATE POLICY "Admins can update any mail" ON public.mails
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Assigned agents can update mail" ON public.mails
  FOR UPDATE USING (assigned_agent_id = auth.uid());
CREATE POLICY "Admins can delete mail" ON public.mails
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Mail processing history RLS
CREATE POLICY "Admins see all history" ON public.mail_processing_history
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Supervisors see all history" ON public.mail_processing_history
  FOR SELECT USING (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "Agents see own history" ON public.mail_processing_history
  FOR SELECT USING (agent_id = auth.uid());
CREATE POLICY "Agents can insert history" ON public.mail_processing_history
  FOR INSERT WITH CHECK (auth.uid() = agent_id);

-- Notifications RLS
CREATE POLICY "Users see own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authenticated can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_mails_updated_at
  BEFORE UPDATE ON public.mails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Storage bucket for avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Anyone can view avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

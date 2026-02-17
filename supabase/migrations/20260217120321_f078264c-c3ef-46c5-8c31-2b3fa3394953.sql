
-- Add new columns for the expanded mail entry form
ALTER TABLE public.mails
ADD COLUMN IF NOT EXISTS sender_phone TEXT,
ADD COLUMN IF NOT EXISTS sender_email TEXT,
ADD COLUMN IF NOT EXISTS sender_address TEXT,
ADD COLUMN IF NOT EXISTS sender_city TEXT,
ADD COLUMN IF NOT EXISTS sender_country TEXT DEFAULT 'République démocratique du Congo',
ADD COLUMN IF NOT EXISTS reception_date DATE,
ADD COLUMN IF NOT EXISTS deposit_time TEXT,
ADD COLUMN IF NOT EXISTS addressed_to TEXT,
ADD COLUMN IF NOT EXISTS comments TEXT;

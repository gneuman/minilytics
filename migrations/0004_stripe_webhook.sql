-- Stripe webhook signing secret (whsec_...), per site. Set in the site settings.
-- Stripe signs with its own scheme (t=…,v1=… header), verified separately from Dodo's.
ALTER TABLE sites ADD COLUMN stripe_webhook_secret TEXT;

-- The BusinessSettings.name column was created with the first shop's name as its
-- default. This instance is a separate business, so the default follows it.
-- Only the DEFAULT changes: any row already in the table keeps the name it has,
-- because the name is the owner's to set at /settings, not a deployment's.
ALTER TABLE "BusinessSettings" ALTER COLUMN "name" SET DEFAULT 'Demo Traders';

-- Supabase SQL schema for Exla
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  contact_email text,
  platform text,
  industry text,
  notes text
);

create table if not exists waitlist_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  created_at timestamptz default now()
);

-- Sample seed data
insert into brands (brand_name, contact_email, platform, industry, notes) values
('GlowFit', 'collab@glowfit.com', 'Instagram', 'Fitness', 'Supplements brand'),
('EcoWear', 'partners@ecowear.com', 'TikTok', 'Fashion', 'Sustainable apparel'),
('TechNest', 'marketing@technest.io', 'Instagram', 'Tech', 'Gadgets and accessories'),
('BrewJoy', 'hello@brewjoy.co', 'TikTok', 'Food & Beverage', 'Coffee equipment'),
('ZenSkin', 'pr@zenskincare.com', 'Instagram', 'Beauty', 'Skincare line'),
('PeakGear', 'ambassadors@peakgear.com', 'Instagram', 'Outdoors', 'Backpacks and accessories'),
('FreshBites', 'team@freshbites.app', 'TikTok', 'Food', 'Meal prep app'),
('PetPal', 'partners@petpal.co', 'Instagram', 'Pets', 'Pet care products'),
('StudySpark', 'collabs@studyspark.io', 'TikTok', 'Education', 'Study tools'),
('HomeMoss', 'contact@homemoss.com', 'Instagram', 'Home', 'Home decor');



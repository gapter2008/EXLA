insert into profiles (id, email, name, role)
values
  (gen_random_uuid(), 'demo_creator@exla.dev', 'Demo Creator', 'creator')
on conflict do nothing;

-- Link token stub to the demo user (first profile found)
insert into tokens (id, user_id, provider, provider_user_id, access_token)
select gen_random_uuid(), p.id, 'tiktok', 'demo_user', 'demo_token'
from profiles p
where p.email = 'demo_creator@exla.dev'
on conflict do nothing;

-- Minimal post to test pipeline
insert into social_posts (user_id, platform, platform_post_id, caption, metrics, posted_at)
select p.id, 'tiktok', 'mock_1', 'Test caption', '{"views":1000,"likes":120,"comments":5,"shares":3}'::jsonb, now()
from profiles p
where p.email = 'demo_creator@exla.dev'
on conflict do nothing;



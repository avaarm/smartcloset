-- Fixtures: the people of t.u(). Ann is an approved stylist and Dee a stylist on probation (both with a saved profile,
-- made through the real functions); Bea and Cat have accepted the client terms; Eve is a stranger with no pro rows; Gus
-- has accepted nothing; Hal's account is one hour old; Ivy only ever appears with an anonymous token (no pro rows).
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  (t.u('ann'), 'ann@example.test', '{"name":"Ann"}', now() - interval '10 days'),
  (t.u('bea'), 'bea@example.test', '{"name":"Bea"}', now() - interval '10 days'),
  (t.u('cat'), 'cat@example.test', '{"name":"Cat"}', now() - interval '10 days'),
  (t.u('dee'), 'dee@example.test', '{"name":"Dee"}', now() - interval '10 days'),
  (t.u('eve'), 'eve@example.test', '{"name":"Eve"}', now() - interval '10 days'),
  (t.u('gus'), 'gus@example.test', '{"name":"Gus"}', now() - interval '10 days'),
  (t.u('hal'), 'hal@example.test', '{"name":"Hal"}', now() - interval '1 hour'),
  (t.u('ivy'), 'ivy@example.test', '{"name":"Ivy"}', now() - interval '10 days');

select t.as_user(t.u('ann'));
select public.accept_pro_terms('stylist', '2026-10', true);
select public.save_stylist_profile('Ann Styles', 'Wardrobe edits and capsule closets', 'Ten years of styling people for work and for weekends.',
                                   array['wardrobe_audit', 'outfit_styling', 'virtual_sessions'], array['en', 'fr'], 'From $80 per session', true);
select t.as_user(t.u('dee'));
select public.accept_pro_terms('stylist', '2026-10', true);
select public.save_stylist_profile('Dee Coach', 'Colour and occasion dressing', 'I help with colour analysis and event outfits.',
                                   array['color_analysis', 'event_styling'], array['en'], 'Ask me about rates', true);
select t.as_user(t.u('bea'));
select public.accept_pro_terms('client', '2026-10', true);
select t.as_user(t.u('cat'));
select public.accept_pro_terms('client', '2026-10', true);
select t.as_admin();
update public.pro_members set stylist_approved_at = now() where user_id = t.u('ann');

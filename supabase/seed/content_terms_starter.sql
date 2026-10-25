-- Starter list of words refused in names, notes, aliases and messages (swaps and professional accounts), matched as
-- whole words. It is a floor, not a finished list: add to it from the SQL editor as reports come in
-- (docs/MODERATION.md, "The term list"). Not a migration: swapMigrations.test.ts keeps term rows out of migrations,
-- so run this file once by hand. Safe to run twice. Checked against clothing vocabulary: no colour, cut or fabric
-- word is on it (so not "nude", "naked", "sexy", "thong", "bra", "tweed" or "bomber").
insert into public.swap_blocked_terms (term, kind)
select public.swap_fold_text(t), 'content'
  from unnest(array[
    -- abuse and profanity
    'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dickhead',
    'cunt', 'slut', 'whore', 'twat', 'wanker', 'prick', 'retard', 'retarded',
    -- threats and harassment
    'kill yourself', 'kys', 'go die', 'i will kill you', 'i will find you', 'rape', 'raping', 'rapist',
    'molest', 'pedophile', 'paedophile', 'child porn',
    -- sexual solicitation
    'porn', 'porno', 'pornography', 'escort', 'hookup', 'send nudes', 'nudes', 'sexting', 'onlyfans',
    'camgirl', 'sugar daddy', 'sugar baby', 'sex',
    -- drugs
    'cocaine', 'heroin', 'meth', 'fentanyl', 'ecstasy', 'mdma', 'lsd', 'xanax', 'adderall', 'weed', 'marijuana',
    -- weapons and extremism
    'gun for sale', 'buy a gun', 'ammo', 'firearm', 'assault rifle', 'bomb', 'terrorist', 'nazi', 'heil hitler',
    -- self harm
    'suicide', 'self harm', 'cutting myself'
  ]) as t
on conflict (term) do nothing;

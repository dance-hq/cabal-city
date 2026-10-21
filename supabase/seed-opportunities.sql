-- First curated opportunities, each read on its source page on 2026-10-21.
-- Only facts stated on that page are here; deadlines only where the page
-- gives one. Re-running is safe (matched by url). Add new ones in the app.

insert into public.opportunities
  (community_id, kind, title, provider, summary, eligibility, place, deadline, url, audiences, verified_at)
values
  ((select id from public.communities where slug = 'chicago'), 'funding',
   'Techstars Chicago accelerator', 'Techstars × Long Chicago',
   'Early-stage accelerator and venture fund with a mentor and investor network, a program built around building and fundraising, and office space downtown for up to a year.',
   'Ambitious early-stage founders in any industry. Spring 2027 program starts March 8, 2027.',
   'Chicago', '2026-11-18', 'https://www.techstars.com/accelerators/chicago', '{founder}', '2026-10-21'),

  (null, 'funding',
   'Y Combinator Winter 2027', 'Y Combinator',
   'YC invests as soon as you''re accepted, pairs you with a general partner, and includes $12M+ in credits and deals from partners like OpenAI, Anthropic, AWS and Stripe.',
   'Founders who can do the batch in person in San Francisco, January to March. On-time deadline is 8pm PT; later applications are still read.',
   'San Francisco', '2026-11-02', 'https://www.ycombinator.com/apply', '{founder}', '2026-10-21'),

  (null, 'funding',
   'America''s Seed Fund (NSF SBIR/STTR)', 'U.S. National Science Foundation',
   'Up to $2 million in non-dilutive seed funding for early-stage R&D. NSF takes no equity and you keep your IP.',
   'U.S. startups building deep technology based on fundamental science or engineering, including AI.',
   'United States', null, 'https://seedfund.nsf.gov/', '{founder}', '2026-10-21'),

  (null, 'funding',
   'Emergent Ventures', 'Mercatus Center',
   'Low-overhead fellowships and grants for people with highly scalable, zero-to-one ideas for improving society.',
   'Anyone 13 or older, anywhere. One application per project; AI-written applications are rejected.',
   'Anywhere', null, 'https://www.mercatus.org/emergent-ventures', '{founder,builder}', '2026-10-21'),

  (null, 'credits',
   'AWS Activate credits', 'Amazon Web Services',
   'Self-funded startups can apply for $1,000 in AWS credits, with up to $5,000 for some. Startups backed by an Activate Provider (an accelerator, angel or VC) can get up to $200,000.',
   'Pre-Series B, founded in the last 10 years, on a paid-tier AWS account. The $200K tier needs your investor''s Org ID.',
   'Remote', null, 'https://aws.amazon.com/startups/credits', '{founder,builder}', '2026-10-21'),

  (null, 'credits',
   'Google for Startups Cloud Program', 'Google Cloud',
   '$2,000 in Cloud credits for early teams, and up to $350,000 over two years for funded AI startups, plus 12 months of Workspace Business Plus.',
   'Start tier: founded in the past 2 years with a working MVP. Funded tiers need verifiable pre-seed to Series A funding. Your email must match your website''s domain.',
   'Remote', null, 'https://cloud.google.com/startup', '{founder,builder}', '2026-10-21'),

  (null, 'credits',
   'Microsoft for Startups', 'Microsoft',
   'Up to $150,000 in Azure credits, plus AI models and developer tools.',
   'The program page doesn''t list eligibility. Microsoft checks it when you apply.',
   'Remote', null, 'https://www.microsoft.com/en-us/startups', '{founder,builder}', '2026-10-21'),

  (null, 'credits',
   'Notion for Startups', 'Notion',
   'Up to 6 months free on Notion''s Business plan with Notion AI included, worth up to $12,000.',
   'Non-paying Notion customers with fewer than 100 employees, a work email and no earlier Notion promotion. 6 months needs a partner affiliation; 3 months needs a business website.',
   'Remote', null, 'https://www.notion.com/startups', '{founder}', '2026-10-21'),

  ((select id from public.communities where slug = 'chicago'), 'hackathon',
   'CIQ Supercomputing Local AI Hackathon', 'CIQ, NVIDIA, VAST Data, Lenovo',
   'A technical build weekend just before Supercomputing 2026. 20 teams each get two Lenovo ThinkStation PGXs on a multi-node cluster. Top 3 teams win SC26 passes and a PGX.',
   'Teams of 3 to 5 who can attend in person and have worked with multi-node or HPC systems. Entry needs host approval.',
   'Chicago', null, 'https://luma.com/local-ai-hack-chicago', '{builder}', '2026-10-21'),

  ((select id from public.communities where slug = 'chicago'), 'event',
   'Demo at AI Tinkerers Chicago', 'AI Tinkerers',
   'Monthly builder meetup built around short live demos of real systems and code, not sales decks. A good first place to show what you''re working on.',
   'Attendees are screened for hands-on AI work. Check the chapter page for the next meetup.',
   'Chicago', null, 'https://chicago.aitinkerers.org/', '{builder,founder,investor}', '2026-10-21')
on conflict (url) do nothing;

-- Improvements that really shipped to main, with their pull requests.
insert into public.ships (title, body, shipped_at, github_url)
select v.title, v.body, v.shipped_at::timestamptz, v.github_url
from (values
  ('Opening Cabal puts you back where you were',
   'Cabal now reopens the conversation you last had open. With nothing open you land on Home: who''s around, who''s locked in, and recent conversations. Lock in became optional.',
   '2026-10-21T13:36:02Z', 'https://github.com/dance-hq/cabal-city/pull/21'),
  ('Lock-in sessions pick themselves back up',
   'Step away for more than five minutes and your session pauses where it stopped, then resumes when you''re back. Time away isn''t counted.',
   '2026-10-21T13:50:41Z', 'https://github.com/dance-hq/cabal-city/pull/22'),
  ('A members panel beside every channel and team',
   'See who''s online, who''s locked in and who owns a team, right next to the conversation. Profiles now say whether someone is a founder, builder or investor.',
   '2026-10-21T17:47:09Z', 'https://github.com/dance-hq/cabal-city/pull/24')
) as v(title, body, shipped_at, github_url)
where not exists (select 1 from public.ships s where s.github_url = v.github_url);

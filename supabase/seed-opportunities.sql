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

-- Second batch, also read on each source page on 2026-10-21.
insert into public.opportunities
  (community_id, kind, title, provider, summary, eligibility, place, deadline, url, audiences, verified_at)
values
  (null, 'funding',
   'a16z speedrun SR008', 'Andreessen Horowitz',
   'Up to $1M for new startups, plus $10M+ in credits from 200+ partners, intros to 150+ C-suite members and 1,000+ executives, a 171,000-person talent network and a Demo Day.',
   'SR008 runs February 1 to April 16, 2027, in San Francisco. Deadline is 11:59pm PT; later applications are considered for the next residency. Applications are read year-round.',
   'San Francisco', '2026-11-01', 'https://speedrun.a16z.com/apply', '{founder}', '2026-10-21'),

  (null, 'funding',
   'PearX', 'Pear VC',
   '$500K to $2M per company in a cohort of fewer than 25, with a dedicated partner, a recruiter, $4.5M in credits and deals, free office space and a Demo Day.',
   'Any founder, solo founders welcome, up to $2M already raised. Teams relocate to the Bay Area for 12 weeks. Winter cohort runs January to April; applications are read year-round.',
   'San Francisco', null, 'https://pear.vc/pearx/', '{founder}', '2026-10-21'),

  (null, 'funding',
   'Entrepreneurs First', 'Entrepreneurs First',
   'Join as an individual and find a cofounder in the cohort. Equity-free grant while you ideate, up to $250K once you form a company, $600K+ in credits and a San Francisco Demo Day.',
   'People who have consistently outperformed their peers and built products or companies before. You don''t need an idea or a cofounder. Offices in London, Bangalore and San Francisco.',
   'London, Bangalore, SF', null, 'https://www.joinef.com/', '{founder,builder}', '2026-10-21'),

  (null, 'funding',
   'Antler', 'Antler',
   'Global early-stage investor. Apply at idea to pre-seed for investment, or at Series A to C through Antler Elevate.',
   'Any founder. U.S. locations are Austin, New York City and San Francisco, with more across Asia Pacific, Europe and the Middle East & Africa.',
   'Global', null, 'https://www.antler.co/apply', '{founder}', '2026-10-21'),

  (null, 'funding',
   'Thiel Fellowship', 'Thiel Foundation',
   'A $250,000 grant and two years of support from the foundation''s network of founders, investors and scientists, for young people who want to build instead of sitting in a classroom.',
   'Young people who skip or stop out of college. The page doesn''t list a deadline.',
   'Anywhere', null, 'https://thielfellowship.org/', '{founder,builder}', '2026-10-21'),

  (null, 'funding',
   'Z Fellows', 'Z Fellows',
   'A one-week program putting ten builders with founders of billion-dollar companies. Optional $10,000 investment at a $1B valuation cap, and help for the life of your company.',
   'Technical builders of any age, solo or with cofounders, no company needed, no need to quit. Mostly virtual with the last day in SF or NYC. Rolling, several cohorts a year.',
   'Remote + SF/NYC', null, 'https://www.zfellows.com/', '{builder,founder}', '2026-10-21'),

  (null, 'funding',
   'Future Founders Fellowship 2027', 'Future Founders',
   'Year-long program for young growth-stage founders: weekly Zoom sessions, 1:1 coaching, a mentor network and two retreats in Chicago with lodging and food covered.',
   'Ages 18 to 30 (early 30s for a first venture), U.S.-based, CEO or primary owner, already earning revenue. Early decision December 6; regular decision January 10, 2027.',
   'U.S. (Chicago retreats)', '2026-12-06', 'https://www.futurefounders.com/fellowship', '{founder}', '2026-10-21'),

  (null, 'funding',
   'Future Founders Startup Bootcamp 2027', 'Future Founders',
   'Three-month program for idea and early-stage founders with weekly Zoom sessions and guest speakers, ending in a live Virtual Pitch Day. Top teams continue to a second phase.',
   'Ages 18 to 30, U.S.-based, primary owner, little or no revenue yet; cofounders can apply together. Early decision December 6; regular decision January 10, 2027.',
   'U.S. (remote)', '2026-12-06', 'https://www.futurefounders.com/startup-bootcamp', '{founder}', '2026-10-21'),

  ((select id from public.communities where slug = 'chicago'), 'funding',
   'mHUB hardtech accelerator', 'mHUB',
   'Hands-on accelerator for physical products with prototyping labs, industry partners and a startup community that has raised $2.3B and launched 1,800+ products.',
   'Physical product and hardtech startups. Check the page for the next cohort.',
   'Chicago', null, 'https://www.mhubchicago.com/', '{founder}', '2026-10-21'),

  ((select id from public.communities where slug = 'chicago'), 'funding',
   'UChicago New Venture Challenge', 'Polsky Center, Chicago Booth',
   'One of the top-ranked accelerators in the country, running since 1996. Alumni include Grubhub, Braintree/Venmo and Simple Mills.',
   'University of Chicago only: Booth MBA, undergraduate, executive MBA and social-impact tracks, plus faculty and researchers.',
   'Chicago', null, 'https://polsky.uchicago.edu/programs-events/new-venture-challenge/', '{founder}', '2026-10-21'),

  (null, 'credits',
   'Vercel for Startups', 'Vercel',
   'A year of Enterprise-tier Vercel with up to $30,000 to spend on usage, including v0, AI Gateway, compute and seats, plus Slack access to the Vercel team and startup-only events.',
   'Backed by an approved Vercel startup partner (accelerator or VC), Series A or less, applying within 12 months of your last round, first time in the program. Up to 50% can go to AI Gateway.',
   'Remote', null, 'https://vercel.com/startups/credits', '{founder,builder}', '2026-10-21'),

  (null, 'credits',
   'Cloudflare for Startups', 'Cloudflare',
   'Up to $350,000 in credits for a year on Workers, Durable Objects, R2, Workers AI and more. The $10,000 tier needs no funding.',
   'Founded in the last 10 years, building a tech product, live website and business email. $10K: bootstrapped or under $1M raised. $100K and $350K need an affiliated investor.',
   'Remote', null, 'https://www.cloudflare.com/forstartups/', '{founder,builder}', '2026-10-21'),

  (null, 'credits',
   'GitHub for Startups', 'GitHub',
   '$10,000 in credits for 12 months across GitHub Enterprise, Copilot, Advanced Security and Actions.',
   'Affiliated with a GitHub for Startups partner, outside funding up to Series B, not on GitHub Enterprise in the past six months and no earlier GitHub credits.',
   'Remote', null, 'https://github.com/enterprise/startups', '{founder,builder}', '2026-10-21'),

  (null, 'credits',
   'PostHog for Startups', 'PostHog',
   '$50,000 in PostHog credits for 12 months plus about $12,000 in partner perks. Credits don''t cover PostHog''s own AI tools.',
   'Under 2 years old, less than $5M raised, on a paid PostHog plan using your company email domain. YC companies get a separate deal.',
   'Remote', null, 'https://posthog.com/startups', '{founder,builder}', '2026-10-21'),

  (null, 'credits',
   'MongoDB for Startups', 'MongoDB',
   'Atlas credits and Voyage AI tokens, technical help and go-to-market support, with tiers from bootstrapped to rapidly scaling.',
   'Under 7 years old, Series A or earlier, one software product (no agencies), active website and LinkedIn. Backed teams go through their VC; everyone else applies on the page.',
   'Remote', null, 'https://www.mongodb.com/solutions/startups', '{founder,builder}', '2026-10-21'),

  (null, 'credits',
   'ElevenLabs Grants', 'ElevenLabs',
   '12 months free on ElevenLabs with 33 million characters, over 680 hours of Agents usage, for building voice AI into your product.',
   'Startups under 25 people with a business email and a plan to make money. No agencies, one-off projects or products for children. Rolling; answers within a week.',
   'Remote', null, 'https://elevenlabs.io/startup-grants', '{founder,builder}', '2026-10-21'),

  (null, 'credits',
   'Stripe Atlas', 'Stripe',
   'Incorporate a Delaware C corp or LLC for $500, with your tax ID, founder equity and 83(b) filed for you, plus $2,500 in Stripe credits and $50,000+ in partner discounts.',
   'Founders in 175+ countries have used it. The fee comes back when you deposit $5,000 into a Stripe Treasury account.',
   'Remote', null, 'https://stripe.com/atlas', '{founder}', '2026-10-21'),

  (null, 'hackathon',
   'MLH 2027 hackathon season', 'Major League Hacking',
   'The season schedule of in-person hackathons, with dozens in November and more from January to April 2027.',
   'Mostly student-run events; each one sets its own rules and registration.',
   'Worldwide', null, 'https://mlh.io/seasons/2027/events', '{builder}', '2026-10-21'),

  (null, 'hackathon',
   'ETHGlobal hackathons', 'ETHGlobal',
   'Ethereum hackathons, conferences and meetups. Next up: ETHGlobal Mumbai on November 5 to 7, and ETHConf in New York on June 14 to 16, 2027.',
   'Open to builders; each event has its own application.',
   'Worldwide', null, 'https://ethglobal.com/events', '{builder}', '2026-10-21')
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

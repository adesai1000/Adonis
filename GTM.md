# Adonis — Go-To-Market Plan

Solo founder. Budget ≤ $200/mo (target ~$0). Goal: ≥ $50k ARR. Organic-first.
Offer (from docs/SAAS-SPEC.md): **Free** = full manual tracking + cloud sync.
**Pro** = AI Coach + Whoop + Google Fit & Fitbit (Google Health API) +
recovery dashboard, **$7.99/mo or $59.99/yr, 14-day trial**.

> **Verification note (2026-07-29):** live web verification tooling was
> partially unavailable while writing this. Every cited URL is a stable
> primary source, but the items marked **[re-verify]** below (current
> subreddit rules, Product Hunt's current featuring mechanics) must be
> re-checked the week you act on them. Nothing else in this plan changes if
> they've drifted; those plays just get re-scoped. The Google Fit sunset is
> now verified (2026-07-29): Fit REST closed to new apps May 2024, shuts
> down end-2026 — Adonis integrates via its successor, the Google Health API.

---

## 1. Positioning

**Adonis is the private, local-first training dashboard for people who take
both lifting and recovery seriously: it puts your workouts, macros, body
weight, and Whoop recovery on one screen, works fully offline as an
installable PWA, keeps your data on your device by default, and (on Pro) has
an AI coach that reads your actual week — training, food, sleep, strain — and
tells you what to change.** Nobody else combines a real lifting log, a macro
tracker, and wearable recovery in one place; the incumbents each do one third
and monetize your data or your ads-tolerance for the privilege.

### ICP, ranked

1. **Whoop owners who lift and track macros.** They already pay $199–$359/yr
   for a subscription wearable — proven willingness to pay for fitness
   software. Whoop's own app added a Strength Trainer but it's a
   muscular-load estimator, not a progressive-overload log (no proper PR/
   history/routine management), and Whoop has no real macro tracking. These
   users currently run 2–3 disconnected apps. They are the beachhead:
   high-intent, reachable in concentrated communities, and Pro gates exactly
   what they come for (Whoop sync + recovery-aware coaching).
2. **Privacy-conscious self-quantifiers leaving MyFitnessPal / ad-funded
   trackers.** MFP suffered a breach affecting ~150M accounts in 2018
   (https://en.wikipedia.org/wiki/MyFitnessPal) and is now an ad- and
   upsell-heavy product. "Local-first, your data lives on your device, export
   anytime, works offline" is a genuine architectural differentiator, not a
   marketing claim — and it's the story HN and privacy Reddit will carry for
   free.
3. **Android / Google Fit & Fitbit users who want a serious web dashboard.**
   Google killed its own Fit web UI years ago; the Fit REST API is closed to
   new apps and shuts down end-2026. Adonis integrates via its successor,
   the Google Health API (https://developers.google.com/health) — also where
   Fitbit account data lands. There's residual search demand and zero good
   web dashboards. Treat this ICP as opportunistic SEO traffic, not a pillar.

### Competitive one-liners

- **vs MyFitnessPal:** "MFP tracks your food and sells your attention; Adonis
  tracks your food, lifts, and recovery — and your data never leaves your
  device unless you ask."
- **vs Hevy / Strong:** "Great lifting logs that know nothing about your
  nutrition or recovery. Adonis is the whole picture — lifts, macros, body
  weight, Whoop recovery — in one app."
- **vs Whoop's own app/journal:** "Whoop tells you how recovered you are.
  Adonis is where you act on it: a real training log and macro tracker that
  reads your recovery."
- **vs MacroFactor:** "Best-in-class nutrition, zero training. Adonis trades
  a little nutrition sophistication for the full stack — and costs half as
  much." (MacroFactor is ~$11.99/mo, https://macrofactorapp.com)

---

## 2. Honest $50k math

Blended ARPU at a 60/40 yearly/monthly split of paying users:

| | Gross/yr | Net/yr (Stripe 2.9% + $0.30) |
|---|---|---|
| Yearly $59.99 | $59.99 | $57.95 |
| Monthly $7.99 × 12 | $95.88 | $89.50 |
| **Blended (60/40)** | **$74.35** ($6.20/mo) | **$70.57** |

**Payers needed for $50k ARR: ~673 gross, ~709 net of fees.** Call it
**~700 paying subscribers.**

Registered users required, and the monthly signup rate that implies:

| Free→Pro conversion | Registered users | Over 12 mo | Over 18 mo | Over 24 mo |
|---|---|---|---|---|
| 2% (freemium median) | ~33,600 | 2,800/mo | 1,870/mo | 1,400/mo |
| 4% (good) | ~16,800 | 1,400/mo | 930/mo | 700/mo |
| 8% (excellent, niche-only) | ~8,400 | 700/mo | 470/mo | 350/mo |

Treat the table as a **floor**: it ignores churn replacement. At ~5%/mo churn
on the monthly cohort and ~60% annual renewal, holding 700 payers means
replacing roughly 20–30 payers every month at steady state.

Context: registered-user→paid for freemium consumer software typically lands
at 2–5%; subscription health & fitness apps convert ~1–2% of installs to
paid overall but 40%+ of hard-paywall trials
(https://www.revenuecat.com/state-of-subscription-apps/).

**The realistic scenario for a solo founder is the 8% row over 24 months
(~350 signups/mo), stretching toward the 4%/24mo row (~700/mo) after SEO
compounds.** 8% is not fantasy here for one structural reason: your traffic
is pre-qualified. Someone landing from "whoop macro tracking" or a r/whoop
thread is a paying-wearable owner searching for exactly the thing that's
paywalled. Generic signups will convert at 1–2%; Whoop-intent signups can
convert at 15%+. The plan below is engineered to keep the funnel skewed
toward the latter.

It depends on three things: (1) 3–5 comparison/SEO pages ranking top-5 for
Whoop-adjacent queries by month 6, (2) sustained, reputation-first presence
in Whoop communities, (3) trial→paid ≥ 40% (card-required trial) with
monthly churn ≤ 5%. Miss two of three and this is a $15–25k/yr side project
— still fine, but know which game you're winning.

---

## 3. Channel playbook (ranked by expected ROI, all ≤ $200/mo)

### 3.1 Whoop-owner communities — Reddit, Facebook, Discord ($0)

**Why first:** highest intent-density audience on the internet for this
product; ICP #1 lives here.

**The play:** become a known helpful lifter-who-codes in r/whoop
(https://www.reddit.com/r/whoop/), the large unofficial Whoop Facebook
groups, and Whoop/biohacking Discords — *then* launch with one honest "I
built this" post, and keep showing up afterward.

**Rules compliance (non-negotiable):** r/whoop and adjacent subs
(r/naturalbodybuilding, r/Biohackers) restrict self-promotion; historically
promo posts need mod approval and r/Fitness bans self-promotion outright
(https://www.reddit.com/r/Fitness/wiki/rules) — treat r/Fitness as
**do-not-post**, comment-only. **[re-verify each sub's current rules and
message the mods before your launch post.]** Etiquette that works: 10+
genuinely useful comments before any link; disclose "I'm the developer"
every time; frame as "I built this because Whoop doesn't do X — tearing it
apart welcome" (AMA-style, respond to everything for 48h); never post the
same content across subs the same day; never have friends astroturf votes or
comments — one caught sockpuppet permanently burns the channel.

**First 30 days:** join r/whoop + 2 FB groups + 1–2 Discords; answer every
"how do I track lifting/macros with Whoop" thread (they recur weekly) with
zero links; keep a swipe file of exact phrases users complain with (this is
your landing-page copy); message mods about an "I built this" post for week
5.

**Effort:** 3–4 h/wk. **Realistic expectations:** a well-received launch
post: 200–800 visits, 50–200 signups, and — because they're Whoop owners —
your best-converting cohort ever. Ongoing comments: 5–20 signups/wk.
Compounding reputation is the real asset.

**Also:** apply to Whoop's developer platform properly
(https://developer.whoop.com/ — API v2; expect an app-review step to lift
initial user caps **[re-verify current process]**) and email Whoop
developer relations about being listed on their integrations page
(https://www.whoop.com/integrations). There is no open self-serve directory;
a listing is a long shot but costs one email and would be a permanent
high-intent referral source.

### 3.2 SEO / content ($0 + ~$12/yr domain)

**Structural prerequisite:** the app must live on a real domain with the
**marketing landing page served at the root URL** — a JS SPA shell at `/`
will not rank and makes every PH/HN/Reddit link land on an empty app frame.
Blog and comparison pages must be prerendered/static HTML (plain HTML files
are fine), with sitemap submitted to Search Console in week 2.

**Why it wins:** the target queries are low-volume but near-zero competition
and 100% intent-matched. Ten pages that each bring 5–30 visitors/day of
Whoop owners beat 100k TikTok views.

**10 articles to write (one per week, ~1,200 words, honest and specific):**

1. "Whoop Macro Tracking: The Setup Whoop Doesn't Give You (2026)"
2. "The Best Lifting App for Whoop Users: Sync Recovery With Your Training Log"
3. "Whoop Strength Trainer vs a Real Lifting Log: What's Missing"
4. "How to Plan Your Training Week Around Whoop Recovery (a Lifter's Green/Yellow/Red Protocol)"
5. "Google Fit Web Dashboard: How to See Your Google Fit Data in a Browser"
6. "7 Private MyFitnessPal Alternatives That Don't Sell Your Food Diary (2026)"
7. "How to Export Your MyFitnessPal Data — and Import It Anywhere" (ship a CSV import to pair with it; this kills switching costs)
8. "Local-First Fitness Apps: Why Your Training Data Should Outlive Any Company"
9. "MacroFactor vs MyFitnessPal vs Adonis: Which Macro Tracker Respects Your Data?"
10. "Whoop + Lifting + Macros: The Complete Tracking Stack for Natural Bodybuilders"

**Comparison pages (static, template-driven, honest — concede real
weaknesses):** Adonis vs MyFitnessPal, vs Hevy, vs Strong, vs MacroFactor,
vs Whoop Journal/Strength Trainer. These convert far above blog posts.

**Programmatic pages to SKIP:** exercise-encyclopedia pages ("barbell row
form"), food-calorie pages ("calories in a banana"), generic "best PPL
split" listicles. You will never outrank Healthline/MFP/bodybuilding.com,
and thousands of thin pages risk a spam classification that drags down the
pages that matter.

**First 30 days:** domain + landing at root + Search Console; publish
articles 1, 2, 6 and the MFP comparison page. **Effort:** 4–5 h/wk.
**Realistic expectations:** ~0 for 8–12 weeks (indexing lag), then 20–100
organic visits/day by month 6 if 3+ pages rank; this becomes the largest
channel by month 9.

### 3.3 Product Hunt + Hacker News launches ($0)

**Show HN (do this first — week 6):** local-first architecture is HN
catnip; AI-coach hype is not. Title: *"Show HN: Adonis — a local-first
fitness tracker (PWA, works offline, data stays in your browser)"*. Lead
with the technical story: localStorage as source of truth, LWW blob sync,
optional accounts, graceful degradation with zero env vars. The existing
"Explore with demo data" button is your secret weapon — Show HN rules want
something people can try without a signup wall
(https://news.ycombinator.com/showhn.html). Post Tue–Thu ~9am ET, first
comment = honest architecture writeup + what you'd criticize yourself, then
answer everything for 24h. Front page = 10k–50k visits; realistic median
outcome = a few hundred visits and brutal, useful feedback. Never ask anyone
to upvote (voting-ring detection is real and permanent).

**Product Hunt (week 7):** launches go live 12:01am PT; homepage visibility
is editorially curated ("featured") and hunter identity no longer materially
matters — follow the official guide (https://www.producthunt.com/launch)
**[re-verify current mechanics]**. Set up a "Coming soon" teaser page 2–3
weeks early to collect followers; launch Tue/Wed; reply to every comment;
rally your waitlist + X followers to *visit* (never say "upvote"). Buying
upvotes = ban. **Realistic expectations in 2026:** PH traffic is weaker than
its 2021 peak — expect 300–1,500 visits, a permanent do-follow backlink, and
"featured on Product Hunt" social proof. Worth one focused day, not more.

**Effort:** ~2 days total prep. Both launches are spikes, not channels —
their job is to seed SEO authority and the first 1,000 users.

### 3.4 Short-form video — TikTok / Reels / Shorts ($0)

Screen recordings + captions; no face required; cross-post the same clip to
all three. 5 concrete concepts:

1. **The airplane-mode test.** Turn on airplane mode on camera, log a full
   workout, everything works. Caption: "your fitness app shouldn't need the
   cloud."
2. **"Whoop says I'm 33% recovered. Here's what my training app does with
   that."** Whoop recovery screen → Adonis recovery card → AI coach
   adjusting the week.
3. **MyFitnessPal privacy-policy speed-read.** Scrolling the policy with
   highlighted data-sharing clauses → "or: an app where your food diary
   never leaves your phone."
4. **Log a 5×5 in 30 seconds.** Real-time speedrun with a timer overlay —
   the UI is the pitch.
5. **"My AI coach just read my week."** Generate the weekly summary live,
   react to what it flags (protein low, volume down, sleep debt).

**First 30 days:** film 6 clips in one afternoon; post 3/wk. **Effort:**
2 h/wk after the first batch. **Realistic expectations:** most clips die at
200–500 views; roughly 1 in 20 pops for 20k–100k+. Treat as a lottery ticket
with positive expected value and as reusable assets for the landing page,
PH gallery, and Reddit comments.

### 3.5 Built-in growth loops (engineering time, $0 marginal)

1. **Referral — give a month, get a month.** Unique code per user; referred
   user gets 1 free month via a Stripe coupon at checkout; referrer gets a
   one-month credit applied to their Stripe customer balance when the
   referee converts. ~2 days to build; put it on the post-upgrade success
   screen where goodwill peaks.
2. **Public changelog.** Static `/changelog` + in-app "what's new" dot.
   Every entry doubles as a tweet and a Reddit comment ("shipped this from
   your feedback last week —"). Shipping velocity is the founder-brand.
3. **"Share your week" image export.** Render the weekly stats (volume, PRs,
   macro adherence, recovery trend) to a canvas → PNG with a subtle
   `adonis` watermark. Fitness people love posting numbers; every share is a
   targeted ad. Highest-leverage loop on this list; build by week 8.

### 3.6 X/Twitter build-in-public ($0)

3–5 posts/wk: MRR screenshots (even $0 → $87 → $312 — the honesty is the
hook), 20-second feature clips, technical threads on local-first sync and
PWA offline. Engage with the indie-hacker, lifting, and Whoop-adjacent
crowds. **Effort:** cap at 2 h/wk. **Realistic expectations:** near-zero
direct signups for months; the actual payoff is launch-day amplification
for PH/HN, inbound DMs, and a public record that makes the Reddit "I built
this" post credible. Lowest ROI on this list — do it, but never at the
expense of 3.1 or 3.2.

---

## 4. Launch sequence — first 8 weeks

| Week | Do | The one metric |
|---|---|---|
| 1 | Buy domain; landing page live **at root** with email waitlist (Supabase table); free analytics (Vercel Analytics or self-hosted Umami); OG images | Waitlist signups (target 50) |
| 2 | Billing end-to-end: signup → trial → checkout → webhook → Pro unlock → portal cancel. Publish articles #1–2 + MFP comparison page; submit sitemap | 1 clean test conversion + pages indexed |
| 3 | Soft launch to waitlist; personally email every signup; 20 user conversations booked | Activation: ≥30% log 3 workouts in week 1 |
| 4 | Whoop-community immersion (10+ helpful comments, zero links); mod outreach for week-5 post; PH "Coming soon" teaser up; articles #3–4 | Search Console impressions (>0 and rising) |
| 5 | "I built this" post in r/whoop + 1 FB group + 1 Discord (staggered days); iterate publicly in-thread | Signups/day (target 20+ at peak) |
| 6 | **Show HN** (Tue–Thu ~9am ET), demo mode front and center; local-first architecture post published | Visitor→signup rate (target ≥5%) |
| 7 | **Product Hunt launch** (Tue/Wed); rally waitlist + X; ship referral loop this week while traffic is hot | Trial starts (target 30+ this week) |
| 8 | Retro: rank channels by signups→trials; kill the bottom half; write the next 8-week plan; start "share your week" export | Trial→paid of weeks 5–6 cohorts (≥40%) |

---

## 5. Retention & conversion levers

**Trial-end email sequence.** Supabase auth emails only cover OTP/magic
links — they cannot run lifecycle email. Add **Resend** (free to ~3k
emails/mo, then ~$20/mo — the one paid tool in this plan that's worth it,
https://resend.com) and send from a subdomain (mail.yourdomain) with
SPF/DKIM set up:

- **Day 0:** welcome; one action ("log your first workout"); reply-to goes
  to you personally.
- **Day 2:** "connect your Whoop" (trialers) / best-feature tip (free users).
- **Day 7:** your-week-in-numbers recap (mirrors the AI coach — the product
  emails its own value).
- **Day 11:** "trial ends in 3 days" + the annual math ($59.99/yr vs $95.88
  — save 37%).
- **Day 14:** last day; single direct CTA.
- **Day 17:** post-expiry: what you keep (everything you logged, free
  forever — say it explicitly), one-time win-back offer on annual.

**Paywall placement principles.** Gate **value-add**: AI Coach, Whoop sync,
Google Fit & Fitbit sync, recovery dashboard. **Never gate the user's own data**:
manual tracking, full history, export/import, and cloud sync stay free
forever. This isn't generosity — it's the trust contract that makes the
privacy positioning credible; one "they paywalled export" Reddit comment
destroys the entire narrative. Show locked features in place (grayed with an
upgrade affordance), don't hide them: visible locked value converts.

**Trial mechanics:** keep the card-required 14-day trial via Stripe Checkout
as spec'd (fewer trials, but 40–60% trial→paid vs ~25% for no-card trials —
https://www.revenuecat.com/state-of-subscription-apps/). Revisit no-card
only if trial starts fall below 5% of signups.

**Pricing experiments at >500 registered users** (one at a time, 4-week
windows, new users only):

1. **Founding-member annual-only promo:** first 100 Pro subs get $47.99/yr
   locked for life (Stripe forever-duration coupon). Front-loads cash and
   testimonials.
2. **Annual price test:** $69.99 vs $59.99 for new users; monthly stays
   $7.99 as the anchor.
3. **Rules:** never discount the monthly plan; every discount is time-boxed
   with a visible end date (fake urgency is reputational poison in
   privacy-land); grandfather existing subscribers through any price
   increase; one experiment at a time or you learn nothing.

---

## 6. What NOT to do

- **Paid ads.** Blended ARPU is $6.20/mo. Fitness CPCs run $1–4; even a
  great 4% visitor→paid funnel implies $50–150 CAC against an LTV of maybe
  $80–120. Underwater or breakeven, and $200/mo can't even buy statistical
  significance. Revisit only if LTV > $150 with proven retention.
- **App Store wrappers.** 15–30% Apple cut on a $7.99 product, review
  friction, forced IAP. The PWA installs today. Defer native until PMF —
  then do it for Apple Health access, not distribution.
- **Influencer sponsorships.** $500–5,000 per post cannot pay back at this
  ARPU. Instead: when creators show up organically as users, gift them Pro
  and stay out of their way.
- **Feature-chasing wearables** (Garmin, Oura, Apple Health) before PMF.
  Each is an OAuth app, a data-mapping layer, and a permanent support
  surface. Whoop is the wedge; the Google side already covers Fitbit via the
  Google Health API (https://developers.google.com/health) — don't multiply
  maintenance before 700 people pay you.
- **Building more product before 100 user conversations.** After the week-3
  soft launch, the rule is: talk, then build. Feature requests from
  non-payers are noise; the only roadmap inputs that count are (a) why
  trialers didn't convert and (b) why payers almost churned.

---

## 7. Metrics dashboard — 6 numbers, checked weekly

| # | Metric | Definition | Healthy range |
|---|---|---|---|
| 1 | Signup rate | New registered accounts/wk | 50+/wk by month 3; 100+/wk by month 6 |
| 2 | Activation | % of new signups logging ≥3 workouts in first 7 days | 25–40% (<20% = onboarding problem, fix before spending on traffic) |
| 3 | D30 retention | % of a signup cohort with any log event in days 24–37 | 20–35% (consumer fitness averages sit below this; you have a habit product) |
| 4 | Trial start rate | Trials started / registered users | 5–10% (card-required) |
| 5 | Trial→paid | % of trials converting to a paid subscription | 40–60% (below 35%: wrong trialers or weak day-7/11 emails) |
| 6 | Churn | Monthly-plan subscriber churn/mo; annual renewal rate | ≤5%/mo monthly; ≥60% annual renewal; net revenue churn ≤3%/mo |

One spreadsheet, one row per week, filled in every Monday in under 10
minutes. When a number leaves its band, that's the week's work — nothing
else gets prioritized until it's back.

---

### Sources

- https://www.reddit.com/r/whoop/ · https://www.reddit.com/r/Fitness/wiki/rules · https://www.reddit.com/r/naturalbodybuilding/ · https://www.reddit.com/r/Biohackers/ — community rules **[re-verify before posting]**
- https://developer.whoop.com/ — Whoop developer platform (API v2, OAuth)
- https://www.whoop.com/integrations — Whoop partner/integrations showcase
- https://developers.google.com/health — Google Health API (successor; Fit REST closed May 2024, shuts down end-2026 — verified 2026-07-29)
- https://news.ycombinator.com/showhn.html — Show HN rules
- https://www.producthunt.com/launch — official launch guide **[re-verify current featuring mechanics]**
- https://www.revenuecat.com/state-of-subscription-apps/ — subscription/trial benchmarks
- https://en.wikipedia.org/wiki/MyFitnessPal — 2018 breach, ~150M accounts
- https://macrofactorapp.com · https://www.hevyapp.com — competitor pricing/features

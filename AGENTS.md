<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Where this project stands

_Last updated 2026-10-27. Procurement is complete; the project is being
prepared for organisations other than AFRILEAD. The database is shared with
two other products. Read "Rule: three products share this database" before
any migration._

IMPACTOS is program-management software for AFRILEAD, a Cameroonian NGO.
Next.js App Router + Supabase, EN/FR throughout. It is now being made
multi-tenant: AFRILEAD is the first customer, not the only one.

**Production was wiped on 2026-10-13, deliberately.** ACCESS YAOUNDÉ turned
out to be demo data; at the client's instruction the whole system was cleaned
to start fresh, including the original AFRILEAD organisation
(`a0000000-…-0001`) and the `@impactos.test` accounts. A new AFRILEAD
organisation was created through the real signup flow the same day. Anything
in this file describing pre-wipe data is history, not current state. What has
not changed: whatever real customers put in from here on is not disposable.

## Built and runtime-verified

The **procurement module** is complete end to end, under
`src/app/dashboard/procurement/`:

| Screen | What it does |
| --- | --- |
| `vendors/` | Register, approve, blacklist (reason required), un-blacklist |
| `requests/` | List by status, create with line items |
| `requests/[id]/` | Quotes, side-by-side comparison, winner + justification, PO issuance, goods receipt, discrepancy resolve/reopen |
| `approvals/` | Approve / reject with required reason; threshold rule comes from the server |
| `settings/` | Thresholds (finance approval, competitive quotes, minimum quotes) + change history |

Every screen was exercised in the browser against the live database as each of
the four roles, asserting on the DOM `disabled` property rather than on click
outcomes. Test data was ZZ-prefixed and deleted afterwards; procurement tables
and `activity_log` are at zero, and the thresholds sit at their defaults
(500 / 2500 / 3) so the first real change records a true baseline.

### Load-bearing decisions

- **The database is the authority.** Triggers, check constraints and RLS decide;
  the UI mirrors rules only to avoid offering actions that cannot succeed, and
  never to pre-empt a refusal. `src/lib/procurementAccess.ts` mirrors the RLS
  write policies for gating buttons.
- **RLS denials arrive as zero rows, not errors.** Every mutation chains
  `.select()` so `writeErrorKey()` can treat an empty result as a denial. A
  mutation without `.select()` is a silent failure waiting to happen.
- **BEFORE triggers fire ahead of RLS `WITH CHECK`.** A trigger exception
  pre-empts the RLS decision entirely, so a test that only proves "it was
  refused" may be proving the wrong refusal. Vary one input at a time.
- **A trigger that writes to a table with narrower RLS than the triggering
  action needs `SECURITY DEFINER`**, or it silently affects zero rows. Three
  bugs came from this before the pattern was named. Postgres has no equivalent
  of the zero-row branch above — `advance_po_on_receipt` carries an explicit
  rowcount guard instead.
- **A policy defect is a pattern, never an instance.** Multi-tenant isolation
  is a property that has to be defended, not a milestone that was reached. See
  the rule below — it is the one that has already cost real leaks.
- **Errors resolve at render, not at catch.** Triggers put a stable `PROC_*`
  key in `DETAIL` and JSON params in `HINT`; `src/lib/pgError.ts` classifies,
  and the page stores the unresolved `ProcError` so wording follows the language
  toggle. See the conventions section below.
- **`src/lib/withTimeout.ts`** races mutations against 5s. `try/finally` does
  not run on a hang, and a rejected promise strands the caller exactly as a hang
  does — both are handled.

### Verification harness

`scripts/sweep-error-map.mjs` diffs `src/lib/pgError.ts` against the live database:
every `PROC_*` key any function can raise, and every constraint a client write
can violate. It imports the real module via Node's TypeScript stripping, so it
cannot drift from what ships. It was clean at the end of the build, and
exits non-zero on a mismatch. Run `node scripts/sweep-error-map.mjs` after any
migration that adds or renames a trigger or a constraint; the two lists it
compares against are refreshed by the SQL quoted at the top of the file.

# Rule: a migration here IS a production deploy

**Production (https://app.useimpactos.com) and local development share one
Supabase project — `xkpukpwbitfmmoembhbg`. There is no separate dev database.**

So every migration applied from a dev session is applied to production
immediately, and lands *underneath a frontend that has not moved*. Schema runs
ahead of code by however long it has been since the last deploy. On
2026-09-21 that gap was five months: production served commit `f85f01f`
(21 April 2026) while the schema carried every change from the procurement
build and the multi-tenant work.

The failure mode is specific and silent: a migration that tightens a policy or
adds a trigger cannot break the dev build, because the dev build is written
against the new schema. It breaks the *deployed* build, which nobody is
looking at. Two production outages were created exactly this way — see the
Phase 2 entry below.

Before applying any migration that removes a policy, tightens RLS, or adds a
trigger to a table the frontend writes to, check what the deployed commit does
with that table:

    git show <deployed-sha>:src/... | grep "from('<table>')"

and confirm on the Vercel deployment list which commit is actually live
(`impactos` project, `prj_B05MiR9OxWR8bQFgmYpiR9QmSyo4`) rather than assuming
it is HEAD.

The real fix is one of two things, and this needs deciding rather than
remembering:

1. **A separate dev Supabase project**, with migrations promoted to production
   deliberately. Removes the coupling entirely.
2. **Schema and frontend ship together** — no migration without the matching
   deploy in the same change.

Until one is in place, treat every migration as a production change and say so
when proposing one.

## Deploy steps: the email templates change WITH their deploy — and NOT together

The deployed build handles only `?code=`. The current branch handles `?code=`,
`?token_hash=&type=`, query errors and the fragment. So a template must switch
at the moment its handling ships — earlier and production breaks, later and the
cross-device problem persists.

**These two templates are on different schedules. Do not change them together.**

### Step 1 — with the multi-tenant deploy (item 1): Confirm signup ONLY

    <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">

`{{ .RedirectTo }}` returns the link to the host that began signup. `type=email`
rather than `signup`, which GoTrue treats as legacy — the callback accepts both,
verified live along with recovery, magiclink, email_change and invite.

Safe because `register/page.tsx` sends
`emailRedirectTo: <origin>/auth/callback?next=/dashboard` — it already carries a
query string, so appending `&token_hash=…` yields a valid query.

### Step 2 — with item 0c only: Reset password

    <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">

**Do NOT apply this before 0c ships.** Reset currently redirects to
`<origin>/reset-password` with **no query string**, so `{{ .RedirectTo }}&token_hash=…`
produces `/reset-password&token_hash=…` — an `&` with no preceding `?`, which is
part of the path, not a query. The page would receive nothing and reset would
break further than it already is. 0c changes that redirect to
`/auth/callback?next=/reset-password`, which carries a query; the template may
change only once it does.

**The concatenation is load-bearing in both cases.** A `redirectTo` fed to these
templates must always contain a query parameter. There is a comment at the
`signUp` call saying so; do not "tidy" the `?next=` away.

**Why not PKCE.** `{{ .ConfirmationURL }}` produces the `?code=` flow, which
needs a verifier held in the browser that began signup, and a flow state that
expires in minutes. Two silent failure modes: clicking later (observed — 52
minutes, email confirmed but no session), and registering on a laptop then
opening the email on a phone. For staff who read email on phones that is most
users. `token_hash` has neither constraint.

Magic link is not used anywhere in the codebase — nothing to change there.

## Second consequence: the test accounts are production accounts

The four `@impactos.test` logins are rows in **production** `auth.users`, and
the login page they work on is public. They were created by direct SQL insert,
which is also why they exist at all — GoTrue rejects the reserved `.test` TLD,
so they could never have been made through signup. They share one password.

Treated as decided, not open: **development moves to its own Supabase
project.** After the pending deploy, the migration is:

1. Create a separate Supabase project for development.
2. Replay the schema there from the migration history.
3. Repoint `.env.local` at it.
4. Recreate the test accounts in that project, and **delete them from
   production**.

Until step 4 lands, production carries five accounts with a shared password,
one of which (`test.viewer`) was the probe used to demonstrate the item-0
privilege escalation.

# Rule: three products share this database

_Recorded 2026-10-27._ Project `xkpukpwbitfmmoembhbg` hosts **IMPACTOS**,
**Youghazi** (`yg_*`: products, orders, order_items, staff, settings,
stock_movements, private) and **DigiSmart** (`ds_*`: leads, admin, events),
all in `public`. This is deliberate: it avoids paying for a second Supabase
project while pre-revenue. Youghazi and DigiSmart are tenants with a planned
exit, not contamination. They move out once they are tested and earning.

Rules, so that the exit stays cheap:

- **Prefixes are strict.** Every Youghazi table, function, trigger and policy
  is `yg_`, and every DigiSmart one is `ds_`. Never create an unprefixed object
  for either. Unprefixed means IMPACTOS.
- **Every migration names its product in its filename prefix**:
  `impactos_…`, `youghazi_…`, `digismart_…`. (The pre-2026-10-20 history has
  no prefix and is all IMPACTOS.)
- **A migration for one product must not touch another product's objects.**
  No cross-product foreign keys, triggers, function calls or policy references.
- **The tenant sweep knows about the prefixes.** A new product means a new row
  in `audit_other_products()`, not a looser regex. See "The sweep" below.

**Verified 2026-10-27: there is nothing crossing between products in `public`.**
No foreign key, trigger, function body or policy links an IMPACTOS object to a
`yg_`/`ds_` one, in either direction. (Watch out: the regex `(yg|ds)_` also
matches `goods_received`. Anchor it, as in `^(yg|ds)_`.)

**What they DO share is `auth`, and that is where a split will hurt:**

- `yg_staff.user_id` and `yg_stock_movements` have foreign keys to
  `auth.users`. Moving Youghazi out means migrating its users too.
- `on_auth_user_created → handle_new_user` is IMPACTOS code, and it runs for
  *every* signup in the project. So every Youghazi staff account also gets an
  IMPACTOS `profiles` row with no org. That person can then sign in at
  app.useimpactos.com, and OrgGate will offer them a new organisation. In the
  other direction, `yg_role()` links any confirmed auth user whose email
  matches an unclaimed `yg_staff` row. Same email, same identity, both
  products.
- **SMTP, email templates, Site URL, the redirect allowlist, rate limits and
  CAPTCHA are all per project.** Every change to auth settings made for
  IMPACTOS also applies to Youghazi. In particular, the `token_hash`
  Confirm-signup template (Deploy steps, step 1) is concatenated onto
  `{{ .RedirectTo }}`, so it breaks any Youghazi signup whose `emailRedirectTo`
  carries no query string. That template was switched on 2026-10-13.
  **Checked 2026-10-27: no Youghazi signup has ever happened**, so nobody has
  been broken. `auth.users` holds two accounts, both IMPACTOS. A failed
  confirmation would still have left an unconfirmed `auth.users` row, and
  there is none. Youghazi customers have no accounts (orders go through
  `yg_place_order` as anon; there are zero orders). Its only staff row is an
  unclaimed owner whose email matches the AFRILEAD owner account. That person
  becomes Youghazi owner by *signing in*, which needs no confirmation email.
  **Not checked: whether Youghazi's signup code would break.** Its source is
  not in this repo or on this machine. Before Youghazi invites a second staff
  member, confirm that its `emailRedirectTo` carries a query string.
  Turnstile (launch item 4) would lock Youghazi out of sign-in unless it ships
  the widget too.

**Why the split happens before IMPACTOS has paying customers, not after.**
IMPACTOS is live at app.useimpactos.com. A bad Youghazi or DigiSmart migration
(a dropped extension, a lock held on a shared catalogue, an auth trigger, a
project-wide auth setting) takes IMPACTOS down with it, and nothing in the
IMPACTOS repo would show why. Today that risk is acceptable: one org, two
users, no data. Once a customer is paying, it is not.

**Auth is the part to split first, before the tables.** The tables are
already isolated. Auth is not: one product's template change can break
another's signup, and a Youghazi staff account can sign in to IMPACTOS and
create an organisation. Neither of those can be fixed while the `auth` schema
is shared.

# Rule: an impersonation harness can produce a false pass

Verifying RLS by impersonating a user is the right technique, and it has two
traps that both fail *silently* — the statement runs as the wrong identity and
reports a clean result.

1. **`request.jwt.claims` is transaction-scoped, and `RESET ROLE` does not
   clear it.** Setup statements written after an impersonation block can run as
   the impersonated attacker. Always clear the claims alongside the role, or
   keep setup in its own statement before any impersonation begins.

2. **GUCs set inside a PL/pgSQL sub-block are rolled back when that sub-block
   raises.** A `BEGIN ... EXCEPTION WHEN OTHERS` block that starts by calling
   `set_config('request.jwt.claims', …, true)` and then hits the exception it
   was testing for leaves the claims reverted to *the previous block's
   identity*. Every later test in that function then runs as the wrong user.
   Observed here: a check of "an ordinary self edit still works" reported
   BLOCKED because it was silently running as the previous test's finance user,
   not the owner it named. The product was fine.

Either way the failure mode is a result that looks like evidence. Re-establish
identity at the top of every test, and when a result surprises you, re-run that
one case in isolation before believing it.

# Rule: sweep the schema for the pattern before closing a policy defect

When a policy defect is found, it is evidence about how the schema was written,
not a fact about one table. **Fix the instance, then sweep every table for the
same shape, then close it.** Skipping the sweep is how the same hole ships
three times.

This is not hypothetical. `expenses` had a role-only policy with no
organisation filter; it was fixed and closed. The same defect was still sitting
in two other tables, and a two-organisation isolation test later found them:

- `income` — role-only, no org filter. Any owner or finance user in **any**
  organisation could read every organisation's income.
- `payroll` — no org scoping at all, both policies role-only. Salary data
  readable across tenants.

Both are fixed and verified org-scoped. 21 of 22 checks in that run passed
before the fixes; the isolation test is what caught them, not review.

## The sweep

`node scripts/sweep-tenant-isolation.mjs`, which needs `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` and exits non-zero on any finding, so it belongs in
CI. It checks two things a review will not reliably catch:

1. **Every policy expression reaches a tenant anchor** — `current_user_org`,
   `org_id`, `project_id` or `auth.uid`. Both sides: `USING` decides which rows
   are visible, `WITH CHECK` decides what a row is allowed to contain. An
   `UPDATE` scoped in `USING` but unscoped in `WITH CHECK` lets a row be moved
   **into** another organisation — a `USING`-only query cannot see that, and it
   was confirmed blind to exactly that shape when the sweep was built. For
   `ALL`/`UPDATE` a NULL `WITH CHECK` inherits `USING`, so only the expression
   Postgres actually applies is tested.
2. **Every table has RLS enabled and at least one policy.** A table with RLS
   off is open no matter what its policies say, and a policy sweep can never
   see it.

Intentional exceptions live in the SQL function `audit_unscoped_policies()`,
each with a written reason, so an exception is a deliberate act rather than a
quiet edit to a regex in a script. There are currently none. (The one it used
to hold, `organisations` INSERT, went when org creation moved behind a
SECURITY DEFINER function.)

**Other products' tables are out of tenant scope, not exceptions to it.**
`audit_other_products()` lists the `yg_` (Youghazi) and `ds_` (DigiSmart)
prefixes as "separate product, planned migration out". Their policies are
excluded from check 1, because the IMPACTOS org model does not apply to them,
and the script prints that exclusion on every run. They stay in check 2: a
table with RLS off is open to anon whichever product owns it. Deliberate
deny-all tables (RLS on, zero policies, reached only through SECURITY DEFINER
functions) are named with reasons inside `audit_rls_coverage()`. Today those
are `ds_admin` and `yg_private`. Before this was added (2026-10-27) the sweep
reported 21 findings, all of them yg_/ds_, so it was permanently red, and a
real IMPACTOS finding would have been lost in the noise. Re-verified after the
change: clean, and probes in a rolled-back transaction still fired for an
IMPACTOS role-only policy, a `yg_` table with RLS off, and a `ds_` table with
no policies.

**What the sweep is not.** The scoping test is a substring match. A policy
could mention `org_id` incidentally and still leak. It catches the careless
case — which is what both real defects were. **Proof of isolation is a
two-organisation assertion run**, reading and writing every table from both
sides. Never report a green sweep as if it were that.

The tripwire was verified by building a throwaway table carrying both defect
shapes, confirming it flagged both, and dropping it — rather than trusting that
a checker written against known-good schema would fire on a bad one.


# Rule: a user-supplied redirect target is validated same-origin before use

Any value that arrives in a URL or form and is later used as a redirect
destination — `next`, `redirectTo`, `returnUrl`, whatever it is called — is
checked to be a same-origin absolute path **before** it is used. Fall back to a
fixed path when it fails; never try to repair it.

This is not hypothetical. `/auth/callback` built its redirect as
`${origin}${next}`. `next=@evil.example` makes that
`https://app.useimpactos.com@evil.example` — the origin becomes userinfo and
the browser goes off-site. Anyone can mail a confirmation link carrying that
parameter, and the redirect fires on a *successful* verification, so the
victim lands on the attacker's page straight after a genuine IMPACTOS login.

The check is `safeNext()` in `src/lib/authLinkError.ts`: the value must start
with `/`, and must not start with `//` or `/\` (both are protocol-relative to a
browser). Reuse it; do not write a second one. Concatenating a user value onto
an origin is the shape to look for in review — it reads as harmless because it
looks like a path.

# Open work

## Launch order (set 2026-10-13)

Nobody outside the team is invited until items 1–2 are live.

1. **Hardcoded `ORG_ID` + sweep.** Built and verified; see the correction under
   0a. **Deployed:** production serves `44b1448` (checked on the Vercel
   deployment list 2026-10-27), so 0a's fixes are live too. The Confirm-signup
   template was switched with it. The owner verified that by the log line
   `token_hash (type=email) -> session established`.
2. **Custom SMTP** — Resend, sending from `auth.useimpactos.com`, SPF/DKIM/DMARC.
   The built-in provider delivers only to Supabase team addresses, so signup
   works for the team and fails for every real customer. Then raise the email
   rate limit to ~100/hour, and enable the "sign-in method linked" notification.
   SMTP is per project, so Youghazi's auth email changes with it. See the
   three-products rule.

   **`/api/send-notification` was deleted on 2026-10-27, before any Resend
   domain was verified.** It had no callers (in HEAD or in `f85f01f`), so no
   notification was ever sent and nothing had been failing silently. But it
   was a phishing relay waiting for a verified domain. `RESEND_API_KEY` was
   live in Vercel production. It gated only on "signed in", and anyone can
   sign up. `to` was free. `data`, including link `href`s, was interpolated
   into the HTML unescaped. The only thing stopping it was Resend refusing its
   unverified sender, `notifications@useimpactos.com`. Notifications, if
   wanted, get rebuilt with real authorisation: a role check, recipients
   limited to the caller's org, escaped content, URLs built server-side.
   **Only `auth.useimpactos.com` is ever verified in Resend, never the root.**
   `RESEND_API_KEY` in Vercel now has no consumer; delete it, or keep it for
   the rebuild.

3. **Auth hygiene:** own copy for `over_email_send_rate_limit` ("We can't send
   email right now…" — not "too many attempts", which blames a user who made
   one); clear dead sessions (`user_not_found` / `session_not_found`) instead of
   presenting them on every request; proxy uses `getClaims()` (local ES256
   verification) instead of a `getUser()` round trip per request.
4. **Turnstile, as one unit.** Supabase's CAPTCHA setting covers password
   sign-in, signup, recover — and the settings invite, because it calls
   `signUp`. So the widget ships on **login, register, reset-password and the
   settings invite together**, deployed and confirmed sending tokens, and only
   then is CAPTCHA enabled in Supabase. Enabling it with any of the four
   missing locks that path out. Not a per-screen rollout.
5. **Phone test** — reset email opened on a phone. Closes 0c.
6. **Google sign-in** — new Google users may create an organisation via
   OrgGate; same-address sign-in links identities (accepted, including the
   inherited-org residual). Ship invites before that residual matters.

## 0a. UNFIXED — production is broken by migrations already applied

**Live: commit `f85f01f`, deployed 21 April 2026. Schema is five months ahead
of it.** Verified against the Vercel deployment list, not assumed.

Confirmed broken, each reproduced against the live database by impersonating
the role the deployed code runs as:

- **Signup is unreachable.** Deployed `middleware.ts` treats only `/login` and
  `/auth/*` as public, so `/register` 307-redirects to `/login`. Confirmed live:
  `GET https://app.useimpactos.com/register -> 307 -> /login`. This predates the
  migrations — nobody could sign up in production at any point.
- **Behind that, signup would now fail anyway.** The deployed register page
  inserts the organisation from the browser before signup; the
  `"Anyone can create an organisation"` policy was dropped, so that insert is
  refused (`42501`). A new customer would see a raw Postgres string.
- **And behind that, the profile upsert would fail.** The deployed page then
  upserts the profile with `org_id` and `role:'owner'`; `protect_profile_identity`
  now raises `PROC_SELF_ROLE_CHANGE`. Three walls, one after another.

Changed but not broken:

- **Owners can now change member roles in production**, where the click
  previously did nothing (no policy permitted it, so the update matched zero
  rows and the page reported success). The deployed UI still offers this to
  finance officers too, for whom it remains a silent no-op.
- **income / payroll org scoping hid nothing**: payroll and expenses are empty,
  and all three income rows scope to AFRILEAD projects. Reads verified intact
  for all five roles — profile, org, projects, donors, KPIs, milestones and
  reports all resolve, and income stays owner/finance-only as before.
- **Payroll logging was already broken and still is, for a different reason.**
  The deployed HR page inserts payroll without `org_id`, which is NOT NULL with
  no default — so it failed on the constraint before, and now fails on RLS
  first. Not a regression: no finance officer could ever log payroll on this
  build.

Pre-existing in the deployed build, unrelated to the migrations:

- `useApp` auto-creates a missing profile with a **hardcoded `ORG_ID`**, so any
  new user is placed into AFRILEAD. Incompatible with multi-tenancy.
- The settings invite flow calls `supabase.auth.signUp` from a signed-in
  browser, which replaces the inviter's own session.

The fix is to deploy, not to revert the schema — the current branch already
corrects all three. That makes this a release decision, not a repair.

**Correction (2026-10-13): that last paragraph was wrong about the
hardcoded `ORG_ID`.** It was still in `useApp.tsx` — in the profile
auto-create, in `refreshProjects()`'s filter, and exported to every screen as
`orgId` — and `hr/page.tsx` carried its own copy. In production that meant:
every organisation other than AFRILEAD saw zero projects, could not create a
project (the insert named the dead UUID and RLS refused it, `42501`), saw no
vendors and no team, and the settings Organisation tab showed AFRILEAD's name,
registration number, website and owner email to every tenant. Tenant isolation
held in the database and failed in the app. Fixed by reading `org_id` from the
profile; verified by a two-organisation rolled-back impersonation run (15 of 15
checks, both directions).

**A claim of "fixed" in this file is not evidence.** It records what someone
believed when they wrote it. Before relying on one, check the code or the
database — the check here was a one-line grep that nobody ran.

## 0b. FIXED — any user could move themselves into another organisation

**Re-tested 2026-10-27** by impersonation in a rolled-back transaction, against
`protect_identity` (BEFORE UPDATE on profiles). The fixtures, set up as
postgres before any impersonation, were a scratch organisation and the orphan
profile made a viewer in AFRILEAD. Identity was re-established at top level
before each test, and `auth.uid()` was recorded inside each one.

| Test | As | Result |
| --- | --- | --- |
| self `org_id` + `role` → other org / owner (the original repro) | viewer | blocked, `PROC_SELF_ROLE_CHANGE` |
| self `role` → owner | viewer | blocked, `PROC_SELF_ROLE_CHANGE` |
| self `org_id` → other org | viewer | blocked, `PROC_SELF_ROLE_CHANGE` |
| self `first_name` (control) | viewer | OK, 1 row |
| demote the owner | viewer | 0 rows (RLS) |
| self `org_id` → other org | owner | blocked, `PROC_SELF_ROLE_CHANGE` |
| move a member → other org | owner | blocked, `PROC_ORG_IMMUTABLE` |
| member role → finance (control) | owner | OK, 1 row |

The bypass `impactos.trusted_identity_write` is set only by
`bind_new_organisation`, which `anon` and `authenticated` cannot execute.
The INSERT side is 0d. The UPDATE policies still have no `WITH CHECK`. The
trigger is the guard, so dropping or weakening it reopens this. The original
finding follows.

**This is a live tenant-isolation bypass and privilege escalation. It blocks
multi-tenant launch. Found 2026-09-17, not yet fixed.**

`profiles` has UPDATE policies `USING (id = auth.uid())` with no `WITH CHECK`,
so a user may rewrite any column of their own row — including `org_id` and
`role`. Verified against the live RLS engine as `test.viewer` (the lowest
privilege role), in a rolled-back transaction:

```sql
update public.profiles
   set org_id = '<another org uuid>', role = 'owner'
 where id = auth.uid();
-- current_user_org()  -> the other organisation
-- current_user_role() -> owner
```

One PostgREST call from any signed-in user. Every other policy in the schema is
correctly scoped by `current_user_org()` — but that function reads
`profiles.org_id`, and the user can write it. **The anchor every policy trusts
is writable by the people it is meant to constrain.**

Why the two-organisation isolation run did not catch it: that run asks whether
policies scope by organisation. They do. It does not ask whether a user can
change which organisation they are in. Both the sweep and the isolation test
are blind to this by construction — record it here rather than assuming a green
check covers it.

`profiles` INSERT (`WITH CHECK (id = auth.uid())`) is the same shape: a user
whose profile row is missing can insert one naming any org and role.

Fix shape: `org_id` and `role` must not be self-writable. Either a `WITH CHECK`
that pins them to their current values, or a BEFORE UPDATE trigger that
restores them unless the caller is an owner of the same organisation. Whatever
onboarding does must set them server-side (SECURITY DEFINER), never from the
client — see the build order in Handover.

## 0c. BUILT — awaiting deploy and phone verification

**Status (2026-10-13):** the decided approach below is built. It is not done
until the Reset Password template is switched (after deploy, never before) and
the phone test passes: request on the laptop, open the email on a phone, set
the new password there, sign in on the laptop with it. The Vercel log line that
proves the cross-device path is
`[auth/callback] token_hash (type=recovery) -> session established (next=/reset-password)`.

What shipped with it:

- The page reaches `reset` from either an existing session (the callback
  verified the link server-side) or `PASSWORD_RECOVERY` (fragment links, and
  pre-0c emails still pointing at `/reset-password?code=`).
- A failed recovery link lands on `/reset-password?error=…`, not `/login` — the
  reader cannot sign in, which is why they asked.
- A missing PKCE verifier (`pkce_code_verifier_not_found`) maps to
  `link_expired`, not `link_invalid`. It is the cross-device / too-late case,
  the most common real failure, and "check you opened the most recent email"
  is the wrong advice for it.
- After the update, every session is signed out (`scope: 'global'`).
- register, login and reset-password store an `AuthErrorKey` and resolve copy
  at render, like `ProcError`.

Verification record, against a local dev server with crafted links:

| Link | Result |
| --- | --- |
| `token_hash=bogus&type=recovery&next=/reset-password` | `/reset-password?error=link_expired` |
| `code=bogus&next=/reset-password` (no verifier) | `/reset-password?error=link_expired` |
| `code=bogus&next=/dashboard` (no verifier) | `/login?error=link_expired` |
| `token_hash=x&type=sms&next=/reset-password` | `/reset-password?error=link_invalid` |

Hostile `next` values are **rejected, not routed**: `next=@evil.example`,
`next=//evil.example` and `next=/\evil.example` are each discarded by
`safeNext()` and replaced with `/dashboard` before any redirect is built. They
are not failures that happened to land somewhere safe — the value never
reaches a URL. See the redirect rule above.

Not yet verified: the reset itself on a real account, and the phone path. Both
need the deployed build and a real mailbox.

### Original finding


`reset-password/page.tsx` has four steps — `request`, `sent`, `reset`, `done` —
and **nothing ever sets `step` to `'reset'`**. The only transitions are
`request -> sent` and `-> done`. There is no `useEffect`, no
`onAuthStateChange` listening for `PASSWORD_RECOVERY`, no reading of the URL.

So a user who clicks a reset link lands on `/reset-password` and sees the
*request* form again. They can ask for another link forever and never reach a
field that sets a new password. Identical in the deployed build (`f85f01f`) —
verified against that commit, so this has never worked.

**Decided approach** (not open — build it as its own item):

- `resetPasswordForEmail` sends `redirectTo: <origin>/auth/callback?next=/reset-password`.
  One route parses every token shape. Two routes would drift apart the way
  login and register did with their error handling.
- The Reset Password template gets the same `token_hash` change as Confirm
  signup, at deploy time:
  `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">`
- `reset-password/page.tsx` detects the recovery session — the
  `PASSWORD_RECOVERY` event, or an active session arriving from the callback —
  and moves itself to the `reset` step.
- Verify end to end with a real mailbox **on a second device**. The
  laptop-to-phone case is the one that matters and the one PKCE could never
  serve.

**Tell AFRILEAD staff when it ships.** Password reset has never worked in any
build, so any user who forgot their password has had no recovery path at all —
not a degraded one, none. Anyone currently locked out has been locked out
silently, and will not know to try again unless told.

## 0d. SHIPPED 2026-10-13 — two policy defects found during the ORG_ID sweep

Schema re-checked 2026-10-27: `protect_identity_on_insert` fires on profiles
INSERT, and `organisations` has a single UPDATE policy, which requires
`current_user_role() = 'owner'`. That is a structural check, not an
impersonation run. Add one the next time work touches profiles or
organisations. The original finding follows.

Both need a migration, so neither was applied in the session that found them.

- **`profiles` INSERT is still the 0b shape.** `protect_identity` is
  `BEFORE UPDATE` only, and `Users can insert own profile` is
  `WITH CHECK (id = auth.uid())`. A user with no profile row can insert one
  naming any `org_id` and role. `handle_new_user` makes the state rare, not
  impossible. Fix: fire the trigger on INSERT too, or pin `org_id IS NULL` and
  the default role in the policy.
- **Any member can edit their organisation's details.** `organisations` has
  two UPDATE policies; `Owners can update their org` is
  `USING (id = current_user_org())` with no role check, and policies are OR'ed,
  so a viewer passes. The tenant sweep cannot see this: it checks that a policy
  reaches a tenant anchor, not which role it admits. Fix: drop the duplicate.

## The rest

Nothing below is a blocker. Recorded so it does not have to be reconstructed.

## 1. Session stall — mitigated, not root-caused

Identity would occasionally fail to resolve, leaving the dashboard signed in
but without a profile. **This has been called fixed twice and was not.** It is
currently mitigated, and not reproducible — which is not the same thing.

What was actually found and fixed: `LangProvider` read `localStorage` during
render, so a French user got an EN server / FR client mismatch that aborted
hydration on every page, and the one-shot `SIGNED_IN` handler could be missed
with no remount path (the provider sits in the root layout, and the post-login
`router.push` is a client-side navigation).

What is in place now, in `src/hooks/useApp.tsx`:

- language read server-side from the `impactos_lang` cookie (`src/app/layout.tsx`)
- bounded reconcile — 3 attempts, 300ms × n backoff — when there is a session
  cookie but no profile and no error
- an explicit `profileError` state, surfaced by `src/components/layout/ProfileGate.tsx`,
  which blocks the dashboard rather than rendering it with unknown permissions
- `withTimeout` on `getUser()`, the profile query and `refreshProjects()`, because
  a hang kept `loading` true forever and bypassed both recovery paths
- `signOut` clears local state and redirects unconditionally, before the network

The durable framing: a provider that can resolve identity only via one event,
with no retry and no remount path, is fragile regardless of how often the race
lands. If this recurs, that is the shape to attack — not the individual symptom.

## 2. Writes that report starting but not finishing

Eleven handlers outside procurement got a pending flag (disabled control while
in flight) — `donors` delete, `participants` delete ×2, `kpis` increment and
delete, `reports` markSubmitted, `hr` approveLeave / addPD / removeStaff,
`settings` updateRole / deactivate.

**None of them checks the result.** No `.select()`, no error branch, no zero-row
check. An RLS denial or a failed write still looks exactly like success: the
spinner ends, the row stays, nothing is said. The pending flag answered "did it
start?" and left "did it work?" open. This is the same defect class the
procurement module was built to avoid — `writeErrorKey()` and an `Alert` slot
are the established fix, and these pages have neither.

## 3. `statusBadge` renders untranslated strings

`src/components/ui/index.tsx` takes whatever string it is handed and renders it
raw, across `settings`, `participants`, `donors`, `reports`, `hr`. Deliberately
left alone: it is shared by five pages with differently-shaped status values,
and it needs a per-domain lookup rather than one map. Deliberately excluded from
the i18n pass so it would not ride along unreviewed.

## 4. Timeout guards not yet applied

- Auth screens: `src/app/login/`, `register/`, `reset-password/` have no
  `withTimeout`. A stalled sign-in leaves the button spinning with no way out.
  (`settings` invite already has one.)
- Server-side `getUser()` in `src/app/page.tsx:6` and `src/proxy.ts:27` are
  unguarded.

## 5. A new organisation cannot create its procurement settings

**Now on the critical path** — this was harmless with one customer and is not
any more.

`procurement_settings/page.tsx` shows an empty state saying an owner or finance
officer needs to create the row — but no UI creates it, so it is a dead end.
AFRILEAD's row exists, so this does not bite today; a second organisation would
be stuck immediately.

## 6. Smaller

- Twelve eslint warnings, all pre-existing unused imports/variables, zero errors.
- The mapped copy for `procurement_settings_min_quotes_required_check` is
  unreachable from the UI — the client gate expresses the same rule as the check
  constraint. Correct as defence in depth; verified at the boundary, never seen
  on screen.
- `procurement/vendors` and `procurement/requests` still declare `tabLabels`
  separately from `TAB_KEYS`; fine, just more ceremony than the `{key, label}`
  form now needs.

# Handover

Three items the project owner is doing directly, not tracked here: setting the
real thresholds through the settings page, deleting the four
`@impactos.test` accounts, and enabling leaked-password protection in Supabase
Auth.

## Current phase: multi-tenant

Build order, one at a time, each accepted before the next starts:

1. **Organisation onboarding.** `handle_new_user` creates a profile with no
   `org_id`, so a new customer cannot start. Nothing else matters until this
   works.
2. **User invites.** NOTE: `pending_invites` and its redeem RPC **do not
   exist** — checked across all schemas on 2026-09-17; there is no invite or
   redeem function anywhere. This item is build-the-mechanism, not
   build-the-UI. The current stand-in is `settings/page.tsx`, which calls
   `supabase.auth.signUp` directly with a random password.
3. **Expenses.** 15 budget categories with allocations and zero spend, so
   budget-versus-actual is uncomputable and the dashboard reads 0% used against
   $55,000. `expenses.purchase_order_id` exists to link spend to a documented
   purchase.
4. **Reporting and PDF export.** Note: the `reports` table is a due-date
   calendar (name, frequency, due_date, recipient, status) and holds no report
   content. There is no reporting engine.

Verification standard for this phase: every item verified at the data layer
across roles **and across two organisations**. Roles alone are no longer
sufficient. Fixtures prefixed ZZ and deleted in the same run.


# Conventions

## A string that carries identity needs its own handle

If a string means something to the *system* — it selects a branch, keys a
lookup, gets stored in a column, or is compared against — then the system
needs a handle on it that is separate from the text the user reads. When the
two are the same string, they are indistinguishable until something changes
one of them, and by then the damage is already written down.

Translation is usually the first pressure that pulls them apart, but it is
not the cause and it will not always be the trigger. A copy edit does it too:
renaming "Field work" to "Fieldwork" splits the stored data exactly as
cleanly as translating it, and nobody would think to suspect i18n.

Three instances of the same principle, already in this codebase:

- **`<option>` elements.** `<option>Training</option>` has a value — it is
  just implicit and equal to the label. Translating the label started writing
  French into columns holding English, silently, with no error. Every option
  whose text is stored now carries an explicit English `value` with a
  translated label (`src/app/dashboard/hr/page.tsx`).
- **`Tabs`** took `string[]` and used the label as the identity, so switching
  language would reset which tab was open. It now also accepts
  `{ key, label }` (`src/components/ui/index.tsx`).
- **Postgres errors.** The trigger functions put a stable `PROC_*` key in
  `DETAIL` and JSON params in `HINT`; `MESSAGE` stays English and is never
  shown to a user. The UI resolves the key to copy at render time, so the
  wording follows the language toggle instead of freezing at catch time
  (`src/lib/pgError.ts`).

The check is not "am I translating this?" It is: **does this string carry
identity for the system, and is that identity written down anywhere other
than the label?** The next instance will not announce itself as an i18n
problem either.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Where this project stands

_Last updated 2026-09-17. Procurement is complete; the project is being
prepared for organisations other than AFRILEAD._

IMPACTOS is program-management software for AFRILEAD, a Cameroonian NGO.
Next.js App Router + Supabase, EN/FR throughout. It is now being made
multi-tenant: AFRILEAD is the first customer, not the only one. ACCESS YAOUNDÉ
is a live project with real donor, KPI and milestone data in it — do not treat
that data as disposable.

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
quiet edit to a regex in a script. There is currently one: `organisations`
INSERT is unscoped because a new customer has no organisation yet.

**What the sweep is not.** The scoping test is a substring match. A policy
could mention `org_id` incidentally and still leak. It catches the careless
case — which is what both real defects were. **Proof of isolation is a
two-organisation assertion run**, reading and writing every table from both
sides. Never report a green sweep as if it were that.

The tripwire was verified by building a throwaway table carrying both defect
shapes, confirming it flagged both, and dropping it — rather than trusting that
a checker written against known-good schema would fire on a bad one.


# Open work

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

## 0b. UNFIXED — any user can move themselves into another organisation

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

## 0c. UNFIXED — password reset cannot complete, in dev and production alike

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

// Tenant-isolation tripwire. Exits non-zero if any RLS policy in `public` is
// not tenant-scoped, or if any table has RLS off or no policies at all.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/sweep-tenant-isolation.mjs
//
// Reads through two SECURITY DEFINER functions (audit_unscoped_policies,
// audit_rls_coverage) because pg_catalog is not reachable over PostgREST.
// EXECUTE on both is granted to service_role only — policy text is a map of
// the security model, and an ordinary signed-in user should not be able to
// read it. That is why this needs the service role key, not the anon key.
//
// WHAT THIS IS NOT. The scoping test is a substring match for a tenant anchor
// (current_user_org / org_id / project_id / auth.uid). A policy could mention
// one incidentally and still leak. This catches the careless case — the two
// defects it was written for were role-only policies with no org filter at
// all. Proof of isolation is a two-organisation assertion run, reading and
// writing every table from both sides. A green sweep does not substitute for
// that, and should never be reported as if it did.
//
// The allowlist of intentional exceptions lives in the SQL function, not here,
// so adding one is a deliberate act with a stated reason rather than a quiet
// loosening of a regex in a script.
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'

/**
 * Pure reporting step. Exported so the decision logic can be exercised
 * without a database. Returns the intended process exit code.
 */
export function report(unscoped, coverage, log = console.log, err = console.error) {
  for (const r of coverage) {
    err(
      r.rls_enabled
        ? `RLS ON but NO POLICIES  ${r.table_name} — denies everything; almost certainly unintended`
        : `RLS DISABLED            ${r.table_name} — open regardless of any policy`
    )
  }
  for (const r of unscoped) {
    err(`UNSCOPED POLICY  ${r.table_name}.${r.policy_name} [${r.cmd}]`)
    err(`                 ${r.problem}`)
    err(`                 ${r.expression}`)
  }
  const total = unscoped.length + coverage.length
  log(total === 0
    ? 'SWEEP: clean — every policy is tenant-scoped, every table has RLS and at least one policy'
    : `SWEEP: ${total} finding(s)`)
  return total === 0 ? 0 : 1
}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('sweep-tenant-isolation: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
    console.error('The anon key will not work — these functions are granted to service_role only.')
    return 2
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const call = async (fn) => {
    const { data, error } = await supabase.rpc(fn)
    if (error) {
      console.error(`sweep-tenant-isolation: ${fn} failed — ${error.message}`)
      console.error('If that reads "function does not exist", the migration adding it has not been applied.')
      return null
    }
    return data ?? []
  }

  const [unscoped, coverage] = await Promise.all([
    call('audit_unscoped_policies'),
    call('audit_rls_coverage'),
  ])
  // A sweep that could not run is not a sweep that passed.
  if (unscoped === null || coverage === null) return 2

  return report(unscoped, coverage)
}

// Only run when invoked directly; importing for `report` must not hit the network.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(await main())
}

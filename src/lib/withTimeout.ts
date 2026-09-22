/**
 * Races a promise against a deadline.
 *
 * Supabase client calls can stall indefinitely rather than reject — observed on
 * both signOut() and the auth/profile calls in useApp's init(). A stalled call
 * never reaches catch or finally, so try/catch cannot rescue it and any state
 * flag set before the await stays set forever. Anything whose failure would
 * strand the UI in an intermediate state must be raced, not awaited.
 */
export type TimedResult<T> =
  | { timedOut: false; value: T }
  | { timedOut: true; value: null; error?: unknown }

export const DEFAULT_TIMEOUT_MS = 5000

export async function withTimeout<T>(
  work: Promise<T>,
  ms: number = DEFAULT_TIMEOUT_MS
): Promise<TimedResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<'__timeout__'>(resolve => {
    timer = setTimeout(() => resolve('__timeout__'), ms)
  })
  try {
    const result = await Promise.race([work, deadline])
    if (result === '__timeout__') return { timedOut: true, value: null }
    return { timedOut: false, value: result as T }
  } catch (error) {
    // A rejection strands the caller exactly as a hang does: everything after
    // the await is skipped, so any pending flag set beforehand stays set. Both
    // are reported as "could not complete" so callers need only one branch.
    console.error('[withTimeout] call rejected', error)
    return { timedOut: true, value: null, error }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

'use strict'

/**
 * The relation applied when a policy does not specify one. This matches the
 * `@fastify/auth` default, so REST and GraphQL surfaces of the same application
 * agree on what an unqualified list of checks means.
 */
const DEFAULT_RELATION = 'or'

/**
 * Compose auth checks into a single check combined by `relation`:
 *
 * - `'or'` grants when any check passes.
 * - `'and'` grants only when every check passes.
 * - An empty list denies: a protected field with nothing to satisfy must never pass.
 *
 * Any relation that is not exactly `'or'` combines as AND, so an unvalidated value
 * reaching this function can never fail open.
 *
 * The result is itself a check, so compositions nest without a depth limit:
 * `compose([a, b, compose([c, d], 'and')], 'or')` is `a OR b OR (c AND d)`.
 *
 * Every check runs — there is no short circuit — so checks with side effects
 * (logging, auditing) behave consistently regardless of the relation.
 */
function compose (checks, relation = DEFAULT_RELATION) {
  return async function composedCheck (context) {
    if (checks.length === 0) {
      return false
    }
    const results = await Promise.all(checks.map(check => check(context)))
    return relation === 'or' ? results.some(Boolean) : results.every(Boolean)
  }
}

module.exports = { compose, DEFAULT_RELATION }

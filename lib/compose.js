'use strict'

const { MER_AUTH_ERR_INVALID_OPTS } = require('./errors')

/**
 * The relation applied when a policy does not specify one. This matches the
 * `@fastify/auth` default, so REST and GraphQL surfaces of the same application
 * agree on what an unqualified list of checks means.
 */
const DEFAULT_RELATION = 'or'

/**
 * How many checks run: `'all'` evaluates every check, `'first'` stops at the first
 * check that decides the outcome. `@fastify/auth` short circuits by default and
 * runs every verifier on `run: 'all'`; here the default is `'all'`, because the
 * checks of a field run concurrently and because a check with a side effect —
 * auditing an attempt, for instance — then behaves the same under either relation.
 */
const DEFAULT_RUN = 'all'

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
 * With `run: 'all'` (the default) every check runs, concurrently. With
 * `run: 'first'` the checks run in order and evaluation stops at the first check
 * that decides the outcome: one that passes under OR, or one that fails under AND.
 *
 * The result is itself a check, so compositions nest without a depth limit —
 * `compose([a, b, compose([c, d], 'and')], 'or')` is `a OR b OR (c AND d)`, where
 * `@fastify/auth` supports a single level of sub-arrays.
 */
function compose (checks, relation = DEFAULT_RELATION, run = DEFAULT_RUN) {
  if (!Array.isArray(checks)) {
    throw new MER_AUTH_ERR_INVALID_OPTS('checks must be an array.')
  }

  // Under OR the first check that passes decides the outcome, under AND the first
  // check that fails does.
  const decisive = relation === 'or'

  return async function composedCheck (context) {
    if (checks.length === 0) {
      return false
    }

    if (run === 'first') {
      for (const check of checks) {
        if (Boolean(await check(context)) === decisive) {
          return decisive
        }
      }
      return !decisive
    }

    const results = await Promise.all(checks.map(check => check(context)))
    return decisive ? results.some(Boolean) : results.every(Boolean)
  }
}

module.exports = { compose, DEFAULT_RELATION, DEFAULT_RUN }

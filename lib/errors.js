'use strict'

const createError = require('@fastify/error')

const errors = {
  /**
   * Validation errors
   */
  MER_AUTH_ERR_INVALID_OPTS: createError(
    'MER_AUTH_ERR_INVALID_OPTS',
    'Invalid options: %s'
  ),
  /**
   * Auth errors
   */
  MER_AUTH_ERR_FAILED_POLICY_CHECK: createError(
    'MER_AUTH_ERR_FAILED_POLICY_CHECK',
    'Failed auth policy check on %s'
  ),
  /**
   * Raised by the composed policies when a policy cannot be evaluated: a relation
   * the mode does not define, an external `checks` that is not a list, a failure
   * signalled with something other than an `Error`, or an `onDeny` that does not
   * return an `Error`. With `checkPoliciesOnRegister`, raised at registration for
   * every policy that cannot be evaluated.
   */
  MER_AUTH_ERR_INVALID_POLICY: createError(
    'MER_AUTH_ERR_INVALID_POLICY',
    'Invalid auth policy on %s: %s'
  ),
  /**
   * Usage errors
   */
  MER_AUTH_ERR_USAGE_ERROR: createError(
    'MER_AUTH_ERR_USAGE_ERROR',
    'Usage error: %s'
  )
}

module.exports = errors

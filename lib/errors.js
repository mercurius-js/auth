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
   * Raised by the composed policies when a policy cannot be evaluated: a check
   * that `parseCheck`/`validate` rejected, or a `prepare` failure, that was
   * signalled with something other than an `Error`.
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

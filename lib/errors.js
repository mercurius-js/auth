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
   * Usage errors
   */
  MER_AUTH_ERR_USAGE_ERROR: createError(
    'MER_AUTH_ERR_USAGE_ERROR',
    'Usage error: %s'
  )
}

module.exports = errors

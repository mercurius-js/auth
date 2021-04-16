'use strict'

const createError = require('fastify-error')

const errors = {
  /**
   * General errors
   */
  MER_AUTH_ERR_INVALID_OPTS: createError(
    'MER_AUTH_ERR_INVALID_OPTS',
    'Invalid options: %s'
  )
}

module.exports = errors

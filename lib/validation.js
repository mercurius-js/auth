'use strict'

const { MER_AUTH_ERR_INVALID_OPTS } = require('./errors')

function validateOpts (opts) {
  // Auth context is optional
  if (typeof opts.authContext !== 'undefined' && typeof opts.authContext !== 'function') {
    throw new MER_AUTH_ERR_INVALID_OPTS('opts.authContext must be a function.')
  }
  if (typeof opts.applyPolicy !== 'function') {
    throw new MER_AUTH_ERR_INVALID_OPTS('opts.applyPolicy must be a function.')
  }
  if (typeof opts.authDirective !== 'string') {
    throw new MER_AUTH_ERR_INVALID_OPTS('opts.authDirective must be a string.')
  }
}

module.exports.validateOpts = validateOpts

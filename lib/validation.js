'use strict'

const { GraphQLDirective } = require('graphql')
const { MER_AUTH_ERR_INVALID_OPTS } = require('./errors')

function validateOpts (opts) {
  // Auth context is optional
  if (typeof opts.authContext !== 'undefined' && typeof opts.authContext !== 'function') {
    throw new MER_AUTH_ERR_INVALID_OPTS('opts.authContext is not a function.')
  }
  if (typeof opts.applyPolicy !== 'function') {
    throw new MER_AUTH_ERR_INVALID_OPTS('opts.applyPolicy is not a function.')
  }
  if (!(opts.authDirective instanceof GraphQLDirective || typeof opts.authDirective === 'string')) {
    throw new MER_AUTH_ERR_INVALID_OPTS('opts.authDirective is not a string or instance of GraphQLDirective.')
  }
}

module.exports.validateOpts = validateOpts

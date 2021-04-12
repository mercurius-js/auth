'use strict'

const fp = require('fastify-plugin')
const { authContextHook, Policy } = require('./lib/hooks')

function validateOpts (opts) {
  if (typeof opts.authContext !== 'function') {
    throw new Error('opts.authContext is not a function.')
  }
  if (typeof opts.applyPolicy !== 'function') {
    throw new Error('opts.applyPolicy is not a function.')
  }
}

const plugin = fp(
  async function (app, opts) {
    // Validation
    validateOpts(opts)

    // Build auth context hook
    app.graphql.addHook('preExecution', authContextHook(opts.authContext))

    // Build apply policy hook
    const policy = new Policy(opts)
    app.graphql.addHook('preExecution', policy.applyPolicyHook.bind(policy))
    app.graphql.addHook('onResolution', policy.onResolutionHook.bind(policy))
  },
  {
    name: 'mercurius-auth',
    fastify: '>=3.x',
    dependencies: ['mercurius']
  }
)

module.exports = plugin

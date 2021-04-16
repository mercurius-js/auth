'use strict'

const fp = require('fastify-plugin')
const Auth = require('./lib/auth')

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

    const auth = new Auth(opts)

    // Register hooks
    app.graphql.addHook('preExecution', auth.authContextHook.bind(auth))
    app.graphql.addHook('preExecution', auth.applyPolicyHook.bind(auth))
    app.graphql.addHook('onResolution', auth.updateExecutionResultHook.bind(auth))
  },
  {
    name: 'mercurius-auth',
    fastify: '>=3.x',
    dependencies: ['mercurius']
  }
)

module.exports = plugin

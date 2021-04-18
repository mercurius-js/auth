'use strict'

const fp = require('fastify-plugin')
const Auth = require('./lib/auth')
const { validateOpts } = require('./lib/validation')

const plugin = fp(
  async function (app, opts) {
    validateOpts(opts)

    // Start auth and register hooks
    const auth = new Auth(opts)
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

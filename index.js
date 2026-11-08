'use strict'

const fp = require('fastify-plugin')
const Auth = require('./lib/auth')
const { validateOpts } = require('./lib/validation')
const filterSchema = require('./lib/filter-schema')
const { compose } = require('./lib/compose')
const {
  composeDirectivePolicy,
  composeExternalPolicy,
  composeDirectiveSdl
} = require('./lib/composed-policy')

const plugin = fp(
  async function (app, opts) {
    validateOpts(opts)

    // Start auth and register hooks
    const auth = new Auth(opts)

    // Get auth policy
    const authSchema = auth.getPolicy(app.graphql.schema)

    // Reject a policy that cannot be evaluated now, rather than on every request
    if (opts.checkPoliciesOnRegister === true) {
      auth.checkPolicies(authSchema)
    }

    // Wrap resolvers with auth handlers
    auth.registerAuthHandlers(app.graphql.schema, authSchema, opts.outputPolicyErrors)

    // Add hook to regenerate the resolvers when the schema is refreshed
    if (app.graphqlGateway) {
      app.graphqlGateway.addHook('onGatewayReplaceSchema', async (instance, schema) => {
        const authSchema = auth.getPolicy(schema)
        auth.registerAuthHandlers(schema, authSchema, opts.outputPolicyErrors)
        if (opts.filterSchema === true) {
          filterSchema.updatePolicy(app, authSchema, opts)
        }
        // The gateway serves the new schema before this hook runs, and logs what it
        // throws, so its fields are protected first and a policy that cannot be
        // evaluated is reported after, failing closed as it does without the check
        if (opts.checkPoliciesOnRegister === true) {
          auth.checkPolicies(authSchema)
        }
      })
    }

    if (typeof opts.authContext !== 'undefined') {
      app.graphql.addHook('preExecution', auth.authContextHook.bind(auth))
    }

    if (opts.filterSchema === true) {
      filterSchema(app, authSchema, opts)
    }
  },
  {
    name: 'mercurius-auth',
    fastify: '5.x',
    dependencies: ['mercurius']
  }
)

module.exports = plugin
module.exports.compose = compose
module.exports.composeDirectivePolicy = composeDirectivePolicy
module.exports.composeExternalPolicy = composeExternalPolicy
module.exports.composeDirectiveSdl = composeDirectiveSdl

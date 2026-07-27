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
// The plugin is also exposed as a named and a `default` export so that ESM and
// bundler consumers resolve the plugin itself, not the module namespace object.
module.exports.default = plugin
module.exports.mercuriusAuth = plugin
module.exports.compose = compose
module.exports.composeDirectivePolicy = composeDirectivePolicy
module.exports.composeExternalPolicy = composeExternalPolicy
module.exports.composeDirectiveSdl = composeDirectiveSdl

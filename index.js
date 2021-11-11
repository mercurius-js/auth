'use strict'

const fp = require('fastify-plugin')
const Auth = require('./lib/auth')
const { validateOpts } = require('./lib/validation')

const plugin = fp(
  async function (app, opts) {
    validateOpts(opts)

    // Start auth and register hooks
    const auth = new Auth(opts)

    // Get auth policy
    const authSchema = auth.getPolicy(app.graphql.schema)

    // console.log(app.graphql.schema)

    // Wrap resolvers with auth handlers
    auth.registerAuthHandlers(app.graphql.schema, authSchema)

    // Add hook to regenerate the resolvers when the schema is refreshed
    app.graphql.addHook('onGatewayReplaceSchema', async (instance, schema) => {
      const authSchema = auth.getPolicy(schema)
      auth.registerAuthHandlers(schema, authSchema)
    })

    if (typeof opts.authContext !== 'undefined') {
      app.graphql.addHook('preExecution', auth.authContextHook.bind(auth))
    }

    app.graphql.addHook('preExecution', async function filterHook (schema, document, context) {
      const filteredSchema = await auth.filterDirectives(schema, authSchema, context)
      return {
        schema: filteredSchema
      }
    })

    // app.graphql.addHook('onResolution', async (execution, context) => {
    //   require('fs').writeFileSync('./exe.json', JSON.stringify(execution, null, 2))
    //   return execution
    // })
  },
  {
    name: 'mercurius-auth',
    fastify: '>=3.x',
    dependencies: ['mercurius']
  }
)

module.exports = plugin

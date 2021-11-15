'use strict'

const fp = require('fastify-plugin')
const Auth = require('./lib/auth')
const { validateOpts } = require('./lib/validation')

const kSchemaFilterHook = Symbol('schemaFilterHook')

const plugin = fp(
  async function (app, opts) {
    validateOpts(opts)

    // Start auth and register hooks
    const auth = new Auth(opts)

    // Get auth policy
    const authSchema = auth.getPolicy(app.graphql.schema)

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

    if (!app[kSchemaFilterHook]) {
      app.graphql.addHook('preExecution', async function filterHook (schema, document, context) {
        if (!isIntrospection(document)) {
          return
        }
        const filteredSchema = await auth.filterDirectives(schema, authSchema, context)
        return {
          schema: filteredSchema
        }
      })
      app[kSchemaFilterHook] = true
    }
  },
  {
    name: 'mercurius-auth',
    fastify: '>=3.x',
    dependencies: ['mercurius']
  }
)

module.exports = plugin

function isIntrospection (document) {
  // TODO switch the logic: exit when one non-introspection operation is found
  const queryTypes = document.definitions.filter(def => def.operation === 'query')
  for (const qt of queryTypes) {
    // TODO: __Schema, __Type, __TypeKind, __Field, __InputValue, __EnumValue, __Directive
    if (qt.selectionSet.selections.some(sel => (
      sel.name.value === '__schema' ||
      sel.name.value === '__type'
    ))) {
      return true
    }
  }
  return false
}

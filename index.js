'use strict'

const fp = require('fastify-plugin')
const Auth = require('./lib/auth')
const { validateOpts } = require('./lib/validation')
const { filterSchema } = require('./lib/filter-schema')

const kDirectiveNamespace = Symbol('mercurius-auth.namespace')

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

    if (opts.namespace && opts.authDirective) {
      if (!app[kDirectiveNamespace]) {
        app[kDirectiveNamespace] = {}

        // the filter hook must be the last one to be executed (after all the authContextHook ones)
        app.ready(err => {
          // todo recreate this use case
          /* istanbul ignore next */
          if (err) throw err
          app.graphql.addHook('preExecution', filterGraphQLSchemaHook(opts.namespace).bind(app))
        })
      }

      if (app[kDirectiveNamespace][opts.namespace]) {
        app[kDirectiveNamespace][opts.namespace].push({ authSchema, authFunction: opts.applyPolicy })
      } else {
        app[kDirectiveNamespace][opts.namespace] = [{ authSchema, authFunction: opts.applyPolicy }]
      }
    }
  },
  {
    name: 'mercurius-auth',
    fastify: '>=3.x',
    dependencies: ['mercurius']
  }
)

module.exports = plugin

function filterGraphQLSchemaHook (namespace) {
  return async function filterHook (schema, document, context) {
    if (!isIntrospection(document)) {
      // TODO check once if the document is introspection - now it's done for each directive
      return
    }
    let filteredSchema = schema
    const authSchemaArray = this[kDirectiveNamespace][namespace]

    // TODO: merge the authSchema into one object and call filterSchema only once
    for (const { authSchema, authFunction } of authSchemaArray) {
      filteredSchema = await filterSchema(filteredSchema, authSchema, authFunction, context)
    }

    return {
      schema: filteredSchema
    }
  }
}

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

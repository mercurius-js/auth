'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const app = Fastify()

// The application supplies one check — a required scope — and the plugin composes
// the checks of a field with the field's AND/OR relation.
const { applyPolicy, sdl, authDirective } = mercuriusAuth.composeDirectivePolicy({
  checkInput: 'scope: String!',
  parseCheck (node) {
    if (node.kind !== 'ObjectValue') {
      throw new Error('each check must be an object')
    }
    const scope = node.fields.find(field => field.name.value === 'scope')
    if (scope?.value.kind !== 'StringValue') {
      throw new Error('each check requires a scope')
    }
    return { scope: scope.value.value }
  },
  prepare (context) {
    return context.auth.scopes
  },
  evaluate (check, scopes) {
    return scopes.includes(check.scope)
  }
})

const schema = `
  ${sdl}

  type Query {
    # granted to a caller holding either scope
    add(x: Int, y: Int): Int @auth(checks: [{ scope: "admin" }, { scope: "owner" }], relation: OR)
    # granted only to a caller holding both
    subtract(x: Int, y: Int): Int @auth(checks: [{ scope: "admin" }, { scope: "audit" }], relation: AND)
  }
`

const resolvers = {
  Query: {
    add: async (_, { x, y }) => x + y,
    subtract: async (_, { x, y }) => x - y
  }
}

app.register(mercurius, {
  schema,
  resolvers
})

app.register(mercuriusAuth, {
  authContext (context) {
    const scopes = context.reply.request.headers['x-scopes'] ?? ''
    return { scopes: scopes.split(',').filter(Boolean) }
  },
  applyPolicy,
  authDirective
})

app.listen({ port: 3000 })

// curl -X POST -H 'content-type: application/json' -H 'x-scopes: owner' \
//   -d '{"query":"{ add(x: 1, y: 2) }"}' http://localhost:3000/graphql
// curl -X POST -H 'content-type: application/json' -H 'x-scopes: admin,audit' \
//   -d '{"query":"{ subtract(x: 3, y: 1) }"}' http://localhost:3000/graphql

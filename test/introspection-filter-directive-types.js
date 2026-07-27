'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const queryQueryFields = `{
  __type(name: "Query") {
    fields {
      name
    }
  }
}`

const queryAuthDirective = `{
  __schema {
    directives {
      name
      args {
        name
      }
    }
  }
}`

const resolvers = {
  Query: {
    open: async () => true,
    protected: async () => true
  }
}

const inject = (app, query, scopes) => app.inject({
  method: 'POST',
  url: '/graphql',
  headers: { 'content-type': 'application/json', 'x-scopes': scopes },
  body: JSON.stringify({ query })
}).then(response => JSON.parse(response.body))

test('introspection filter - filters a schema whose auth directive takes an input type', async (t) => {
  t.plan(3)

  const app = Fastify()
  t.after(() => app.close())

  // The directive definitions of a schema reference the type instances of that
  // schema, so a directive argument typed by a rebuilt type used to leave the pruned
  // schema holding two types of the same name.
  app.register(mercurius, {
    schema: `
    input Check {
      scope: String!
    }

    directive @auth(checks: [Check!]!) on OBJECT | FIELD_DEFINITION

    type Query {
      open: Boolean
      protected: Boolean @auth(checks: [{ scope: "admin" }])
    }
`,
    resolvers
  })
  app.register(mercuriusAuth, {
    authDirective: 'auth',
    filterSchema: true,
    async applyPolicy (authDirectiveAST, parent, args, context) {
      return context.reply.request.headers['x-scopes'] === 'admin'
    }
  })

  await app.ready()

  t.assert.deepStrictEqual(await inject(app, queryQueryFields, 'guest'), {
    data: { __type: { fields: [{ name: 'open' }] } }
  })
  t.assert.deepStrictEqual(await inject(app, queryQueryFields, 'admin'), {
    data: { __type: { fields: [{ name: 'open' }, { name: 'protected' }] } }
  })

  // The directive definition itself is not what filtering hides.
  const { data } = await inject(app, queryAuthDirective, 'guest')
  t.assert.deepStrictEqual(
    data.__schema.directives.find(directive => directive.name === 'auth'),
    { name: 'auth', args: [{ name: 'checks' }] }
  )
})

test('introspection filter - filters a schema whose auth directive takes a filtered input type', async (t) => {
  t.plan(2)

  const app = Fastify()
  t.after(() => app.close())

  // The input type of the directive argument is itself filtered out, so it is not
  // among the types the pruned schema is built from.
  app.register(mercurius, {
    schema: `
    input Check {
      scope: String!
      internal: String @auth(checks: [{ scope: "admin" }])
    }

    directive @auth(checks: [Check!]!) on OBJECT | FIELD_DEFINITION | INPUT_FIELD_DEFINITION

    type Query {
      open: Boolean
      protected: Boolean @auth(checks: [{ scope: "admin" }])
    }
`,
    resolvers
  })
  app.register(mercuriusAuth, {
    authDirective: 'auth',
    filterSchema: true,
    async applyPolicy (authDirectiveAST, parent, args, context) {
      return context.reply.request.headers['x-scopes'] === 'admin'
    }
  })

  await app.ready()

  t.assert.deepStrictEqual(await inject(app, queryQueryFields, 'guest'), {
    data: { __type: { fields: [{ name: 'open' }] } }
  })
  t.assert.deepStrictEqual(await inject(app, queryQueryFields, 'admin'), {
    data: { __type: { fields: [{ name: 'open' }, { name: 'protected' }] } }
  })
})

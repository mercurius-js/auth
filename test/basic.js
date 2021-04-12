'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const schema = `
  directive @auth(
    requires: Role = ADMIN,
  ) on OBJECT | FIELD_DEFINITION

  enum Role {
    ADMIN
    REVIEWER
    USER
    UNKNOWN
  }

  type Query {
    add(x: Int, y: Int): Int @auth(requires: ADMIN)
    subtract(x: Int, y: Int): Int
  }
`

const query = `query {
  four: add(x: 2, y: 2)
  six: add(x: 3, y: 3)
  subtract(x: 3, y: 3)
}`

const resolvers = {
  Query: {
    add: async (_, obj) => {
      const { x, y } = obj
      return x + y
    },
    subtract: async (_, obj) => {
      const { x, y } = obj
      return x - y
    }
  }
}

test('registration - should protect the schema not affect queries when everything is okay', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers
  })
  app.register(mercuriusAuth, {
    authContext: (context) => {
      context.auth = {
        identity: context.reply.request.headers['x-user']
      }
    },
    applyPolicy: async (authPolicy, context) => {
      return context.auth.identity === 'admin'
    }
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'admin' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: 4,
      six: 6,
      subtract: 0
    }
  })
})

test('registration - should protect the schema and error accordingly', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers
  })
  app.register(mercuriusAuth, {
    authContext: (context) => {
      context.auth = {
        identity: context.reply.request.headers['x-user']
      }
    },
    applyPolicy: async (authPolicy, context) => {
      return context.auth.identity === 'admin'
    }
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: null,
      six: null,
      subtract: 0
    },
    errors: [
      {
        message: 'auth error',
        locations: [
          {
            line: 2,
            column: 3
          }
        ],
        path: [
          'four'
        ]
      },
      {
        message: 'auth error',
        locations: [
          {
            line: 3,
            column: 3
          }
        ],
        path: [
          'six'
        ]
      }
    ]
  })
})

test('registration - should work alongside existing directives', async (t) => {
  t.plan(1)

  const schema = `
    directive @auth(
      requires: Role = ADMIN,
    ) on OBJECT | FIELD_DEFINITION

    directive @notUsed on OBJECT | FIELD_DEFINITION

    enum Role {
      ADMIN
      REVIEWER
      USER
      UNKNOWN
    }

    type Query {
      add(x: Int, y: Int): Int @auth(requires: ADMIN) @notUsed
      subtract(x: Int, y: Int): Int @notUsed
    }
`

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers
  })
  app.register(mercuriusAuth, {
    authContext: (context) => {
      context.auth = {
        identity: context.reply.request.headers['x-user']
      }
    },
    applyPolicy: async (authPolicy, context) => {
      return context.auth.identity === 'admin'
    }
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: null,
      six: null,
      subtract: 0
    },
    errors: [
      {
        message: 'auth error',
        locations: [
          {
            line: 2,
            column: 3
          }
        ],
        path: [
          'four'
        ]
      },
      {
        message: 'auth error',
        locations: [
          {
            line: 3,
            column: 3
          }
        ],
        path: [
          'six'
        ]
      }
    ]
  })
})

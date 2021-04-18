'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const { GraphQLDirective, GraphQLField } = require('graphql')
const mercuriusAuth = require('..')

test('basic - apply policy should provide authDirectiveAST', async (t) => {
  t.plan(4)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  const schema = `
  directive @auth on OBJECT | FIELD_DEFINITION

  type Query {
    add(x: Int, y: Int): Int @auth
    subtract(x: Int, y: Int): Int
  }
`

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

  app.register(mercurius, {
    schema,
    resolvers
  })
  app.register(mercuriusAuth, {
    authContext: (context) => {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    applyPolicy: async (authDirectiveAST, context, field) => {
      t.equal(authDirectiveAST.kind, 'Directive')
      t.equal(authDirectiveAST.name.value, 'auth')
      t.same(authDirectiveAST.arguments, [])
      return true
    },
    authDirective: new GraphQLDirective({ name: 'auth', locations: [] })
  })

  const query = `query {
  four: add(x: 2, y: 2)
  subtract(x: 3, y: 3)
}`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'ADMIN' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: 4,
      subtract: 0
    }
  })
})

test('basic - apply policy should provide auth on context', async (t) => {
  t.plan(2)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  const schema = `
  directive @auth on OBJECT | FIELD_DEFINITION

  type Query {
    add(x: Int, y: Int): Int @auth
    subtract(x: Int, y: Int): Int
  }
`

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

  app.register(mercurius, {
    schema,
    resolvers
  })
  app.register(mercuriusAuth, {
    authContext: (context) => {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    applyPolicy: async (authDirectiveAST, context, field) => {
      t.same(context.auth, { identity: 'ADMIN' })
      return true
    },
    authDirective: new GraphQLDirective({ name: 'auth', locations: [] })
  })

  const query = `query {
  four: add(x: 2, y: 2)
  subtract(x: 3, y: 3)
}`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'ADMIN' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: 4,
      subtract: 0
    }
  })
})

test('basic - apply policy should provide field', async (t) => {
  t.plan(2)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  const schema = `
  directive @auth on OBJECT | FIELD_DEFINITION

  type Query {
    add(x: Int, y: Int): Int @auth
    subtract(x: Int, y: Int): Int
  }
`

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

  app.register(mercurius, {
    schema,
    resolvers
  })
  app.register(mercuriusAuth, {
    authContext: (context) => {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    applyPolicy: async (authDirectiveAST, context, field) => {
      t.equal(field.name, 'add')
      return true
    },
    authDirective: new GraphQLDirective({ name: 'auth', locations: [] })
  })

  const query = `query {
  four: add(x: 2, y: 2)
  subtract(x: 3, y: 3)
}`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'ADMIN' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: 4,
      subtract: 0
    }
  })
})

test('basic - apply policy should access the field AST definition', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

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

  app.register(mercurius, {
    schema,
    resolvers
  })
  app.register(mercuriusAuth, {
    authContext: (context) => {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    applyPolicy: async (authDirectiveAST, context, field) => {
      const requiredRole = authDirectiveAST.arguments[0].value.value
      return context.auth.identity === requiredRole
    },
    authDirective: new GraphQLDirective({ name: 'auth', locations: [] })
  })

  const query = `query {
  four: add(x: 2, y: 2)
  subtract(x: 3, y: 3)
}`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'ADMIN' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: 4,
      subtract: 0
    }
  })
})

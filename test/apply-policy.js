'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const { GraphQLSchema } = require('graphql')
const mercuriusAuth = require('..')

test('apply policy - should provide authDirectiveAST', async (t) => {
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
    authContext (context) {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      t.equal(authDirectiveAST.kind, 'Directive')
      t.equal(authDirectiveAST.name.value, 'auth')
      t.same(authDirectiveAST.arguments, [])
      return true
    },
    authDirective: 'auth'
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

test('apply policy - should provide auth on context', async (t) => {
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
    authContext (context) {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      t.same(context.auth, { identity: 'ADMIN' })
      return true
    },
    authDirective: 'auth'
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

test('apply policy - should have access to parent', async (t) => {
  t.plan(2)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  const schema = `
  directive @auth on OBJECT | FIELD_DEFINITION

  type Message {
    title: String!
    private: String @auth
  }

  type Query {
    messages: [Message!]!
  }
`

  const resolvers = {
    Query: {
      messages: () => [
        {
          title: 'one',
          private: 'private one'
        }
      ]
    }
  }

  app.register(mercurius, {
    schema,
    resolvers
  })
  app.register(mercuriusAuth, {
    authContext (context) {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      t.same(parent, { title: 'one', private: 'private one' })
      return true
    },
    authDirective: 'auth'
  })

  const query = `query {
    messages {
      title
      private
    }
  }`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'ADMIN' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      messages: [
        {
          title: 'one',
          private: 'private one'
        }
      ]
    }
  })
})

test('apply policy - should have access to args', async (t) => {
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
    authContext (context) {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      t.same(args, { x: 2, y: 2 })
      return true
    },
    authDirective: 'auth'
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

test('apply policy - should have access to info', async (t) => {
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
    authContext (context) {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      t.equal(info.fieldName, 'add')
      t.type(info.schema, GraphQLSchema)
      t.same(info.path, { prev: undefined, key: 'four', typename: 'Query' })
      return true
    },
    authDirective: 'auth'
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

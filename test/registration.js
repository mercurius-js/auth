'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const { AssertionError } = require('assert')
const { GraphQLDirective, GraphQLError } = require('graphql')
const mercuriusAuth = require('..')
const { MER_AUTH_ERR_INVALID_OPTS } = require('../lib/errors')

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  Query: {
    add: async (_, obj) => {
      const { x, y } = obj
      return x + y
    }
  }
}

test('registration - should error if mercurius is not loaded', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  try {
    await app.register(mercuriusAuth, {})
  } catch (error) {
    t.same(
      error,
      new AssertionError({
        message:
          "The dependency 'mercurius' of plugin 'mercurius-auth' is not registered",
        actual: false,
        expected: true,
        operator: '=='
      })
    )
  }
})

test('registration - should error if authContext not a function', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))
  app.register(mercurius, {
    schema,
    resolvers
  })

  try {
    await app.register(mercuriusAuth, { authContext: '' })
  } catch (error) {
    t.same(error, new MER_AUTH_ERR_INVALID_OPTS('opts.authContext is not a function.'))
  }
})

test('registration - should error if applyPolicy not specified', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))
  app.register(mercurius, {
    schema,
    resolvers
  })

  try {
    await app.register(mercuriusAuth, {
      authContext: () => {}
    })
  } catch (error) {
    t.same(error, new MER_AUTH_ERR_INVALID_OPTS('opts.applyPolicy is not a function.'))
  }
})

test('registration - should error if applyPolicy not specified', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))
  app.register(mercurius, {
    schema,
    resolvers
  })

  try {
    await app.register(mercuriusAuth, {
      authContext: () => {},
      applyPolicy: () => {}
    })
  } catch (error) {
    t.same(error, new MER_AUTH_ERR_INVALID_OPTS('opts.authDirective is not a string or instance of GraphQLDirective.'))
  }
})

test('registration - should register the plugin', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers
  })
  await app.register(mercuriusAuth, {
    authContext: () => {},
    applyPolicy: () => {},
    authDirective: new GraphQLDirective({ name: 'auth', locations: [] })
  })
  t.ok('mercurius auth plugin is registered')
})

test('registration - should handle invalid string based auth Directive definitions', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers
  })

  try {
    await app.register(mercuriusAuth, {
      authContext (context) {
        return {
          identity: context.reply.request.headers['x-user']
        }
      },
      async applyPolicy (authDirectiveAST, parent, args, context, info) {
        return context.auth.identity === 'admin'
      },
      authDirective: 'invalid'
    })
  } catch (error) {
    t.same(error, new GraphQLError('Syntax Error: Unexpected Name "invalid".', undefined, 'invalid', [0]))
  }
})

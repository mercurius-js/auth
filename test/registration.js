'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const { AssertionError } = require('assert')
const mercuriusAuth = require('..')

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

test('registration - should error if authContext not specified', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))
  app.register(mercurius, {
    schema,
    resolvers
  })

  try {
    await app.register(mercuriusAuth, {})
  } catch (error) {
    // TODO: specific error
    t.same(error, new Error('opts.authContext is not a function.'))
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
    // TODO: specific error
    t.same(error, new Error('opts.applyPolicy is not a function.'))
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
    applyPolicy: () => {}
  })
  t.ok('mercurius auth plugin is registered')
})

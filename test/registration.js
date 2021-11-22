'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const { AssertionError } = require('assert')
const mercuriusAuth = require('..')
const { MER_AUTH_ERR_INVALID_OPTS } = require('../lib/errors')

const schema = `
  directive @auth on OBJECT | FIELD_DEFINITION

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
    await app.register(mercuriusAuth, { applyPolicy: () => {}, authDirective: 'auth', authContext: '' })
  } catch (error) {
    t.same(error, new MER_AUTH_ERR_INVALID_OPTS('opts.authContext must be a function.'))
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
    t.same(error, new MER_AUTH_ERR_INVALID_OPTS('opts.applyPolicy must be a function.'))
  }
})

test('registration - should error if authDirective not specified', async (t) => {
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
    t.same(error, new MER_AUTH_ERR_INVALID_OPTS('opts.authDirective must be a string.'))
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
    authDirective: 'auth'
  })
  t.ok('mercurius auth plugin is registered')
})

test('should error if mode is not a string', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers
  })
  await t.rejects(app.register(mercuriusAuth, {
    authContext: () => {},
    applyPolicy: () => {},
    mode: {}
  }), new MER_AUTH_ERR_INVALID_OPTS('opts.mode must be a string.'))
})

test('registration - external policy', t => {
  t.plan(4)

  t.test('should error if policy is not an object', async (t) => {
    t.plan(1)

    const app = Fastify()
    t.teardown(app.close.bind(app))

    app.register(mercurius, {
      schema,
      resolvers
    })
    await t.rejects(app.register(mercuriusAuth, {
      applyPolicy: () => {},
      mode: 'external',
      policy: ''
    }), new MER_AUTH_ERR_INVALID_OPTS('opts.policy must be an object.'))
  })

  t.test('should error if policy type is not an object', async (t) => {
    t.plan(1)

    const app = Fastify()
    t.teardown(app.close.bind(app))

    app.register(mercurius, {
      schema,
      resolvers
    })
    await t.rejects(app.register(mercuriusAuth, {
      applyPolicy: () => {},
      mode: 'external',
      policy: {
        Query: {
          add: { some: 'policy' }
        },
        wrong: 'string'
      }
    }), new MER_AUTH_ERR_INVALID_OPTS('opts.policy.wrong must be an object.'))
  })

  t.test('registration - should register the plugin', async (t) => {
    t.plan(1)

    const app = Fastify()
    t.teardown(app.close.bind(app))

    app.register(mercurius, {
      schema,
      resolvers
    })
    await app.register(mercuriusAuth, {
      applyPolicy: () => {},
      mode: 'external',
      policy: {
        Query: {
          add: { some: 'policy' }
        }
      }
    })
    t.ok('mercurius auth plugin is registered')
  })

  t.test('cannot filter introspection schema on external mode', async (t) => {
    t.plan(1)

    const app = Fastify()
    t.teardown(app.close.bind(app))

    app.register(mercurius, {
      schema,
      resolvers
    })
    await t.rejects(app.register(mercuriusAuth, {
      applyPolicy: () => {},
      mode: 'external',
      filterSchema: true
    }), new MER_AUTH_ERR_INVALID_OPTS('opts.filterSchema cannot be used when mode is external.'))
  })
})

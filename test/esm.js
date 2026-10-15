'use strict'

const { test } = require('node:test')
const mercuriusAuth = require('..')

// The package is CommonJS, so an ESM consumer reaches it through the interop
// layer. The default export has to be the plugin itself rather than the module
// namespace object, which is what the `export =` declaration in the types
// describes: `import mercuriusAuth from 'mercurius-auth'` must be registerable
// without a `.default` access.
test('esm - the default export is the plugin', async (t) => {
  t.plan(3)

  const imported = await import('../index.js')

  t.assert.strictEqual(imported.default, mercuriusAuth)
  t.assert.strictEqual(imported.mercuriusAuth, mercuriusAuth)
  t.assert.strictEqual(typeof imported.default, 'function')
})

test('esm - the composed policy helpers are named exports', async (t) => {
  t.plan(4)

  const { compose, composeDirectivePolicy, composeExternalPolicy, composeDirectiveSdl } = await import('../index.js')

  t.assert.strictEqual(compose, mercuriusAuth.compose)
  t.assert.strictEqual(composeDirectivePolicy, mercuriusAuth.composeDirectivePolicy)
  t.assert.strictEqual(composeExternalPolicy, mercuriusAuth.composeExternalPolicy)
  t.assert.strictEqual(composeDirectiveSdl, mercuriusAuth.composeDirectiveSdl)
})

test('esm - the plugin registers when imported as ESM', async (t) => {
  t.plan(1)

  const Fastify = require('fastify')
  const mercurius = require('mercurius')
  const { default: plugin } = await import('../index.js')

  const app = Fastify()
  t.after(() => app.close())

  app.register(mercurius, {
    schema: `
    directive @auth on OBJECT | FIELD_DEFINITION

    type Query {
      add(x: Int, y: Int): Int @auth
    }
`,
    resolvers: {
      Query: {
        add: async (_, { x, y }) => x + y
      }
    }
  })
  app.register(plugin, {
    authDirective: 'auth',
    applyPolicy: async () => true
  })

  await app.ready()

  const response = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ add(x: 1, y: 2) }' })
  })

  t.assert.deepStrictEqual(JSON.parse(response.body), { data: { add: 3 } })
})

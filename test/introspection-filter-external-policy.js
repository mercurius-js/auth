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

const queryMessageFields = `{
  __type(name: "Message") {
    name
    fields {
      name
    }
  }
}`

const schema = `
  type Message {
    title: String
    message: String
    adminMessage: String
  }

  type Query {
    open: Boolean
    messages: [Message]
  }
`

const resolvers = {
  Query: {
    open: async () => true,
    messages: async () => [{ title: 'one', message: 'one', adminMessage: 'admin one' }]
  }
}

const inject = (app, query, permission) => app.inject({
  method: 'POST',
  url: '/graphql',
  headers: { 'content-type': 'application/json', 'x-user': permission },
  body: JSON.stringify({ query })
}).then(response => JSON.parse(response.body))

const buildApp = async (t, policy, applyPolicy) => {
  const app = Fastify()
  t.after(() => app.close())

  app.register(mercurius, { schema, resolvers })
  app.register(mercuriusAuth, {
    mode: 'external',
    filterSchema: true,
    authContext (context) {
      return { permission: context.reply.request.headers['x-user'] }
    },
    applyPolicy: applyPolicy ?? (async (policy, parent, args, context) => context.auth.permission === policy.requires),
    policy
  })

  await app.ready()
  return app
}

test('external policy - filters the introspection schema by policy', async (t) => {
  t.plan(4)

  const app = await buildApp(t, {
    Message: {
      adminMessage: { requires: 'admin' }
    },
    Query: {
      messages: { requires: 'user' }
    }
  })

  t.assert.deepStrictEqual(await inject(app, queryQueryFields, 'user'), {
    data: { __type: { fields: [{ name: 'open' }, { name: 'messages' }] } }
  })
  t.assert.deepStrictEqual(await inject(app, queryQueryFields, 'admin'), {
    data: { __type: { fields: [{ name: 'open' }] } }
  })

  t.assert.deepStrictEqual(await inject(app, queryMessageFields, 'admin'), {
    data: { __type: { name: 'Message', fields: [{ name: 'title' }, { name: 'message' }, { name: 'adminMessage' }] } }
  })
  t.assert.deepStrictEqual(await inject(app, queryMessageFields, 'user'), {
    data: { __type: { name: 'Message', fields: [{ name: 'title' }, { name: 'message' }] } }
  })
})

test('external policy - filters a whole type through __typePolicy', async (t) => {
  t.plan(2)

  const app = await buildApp(t, {
    Message: {
      __typePolicy: { requires: 'user' }
    }
  })

  t.assert.deepStrictEqual(await inject(app, queryMessageFields, 'user'), {
    data: { __type: { name: 'Message', fields: [{ name: 'title' }, { name: 'message' }, { name: 'adminMessage' }] } }
  })
  // The type is filtered out, and so is the field returning it.
  t.assert.deepStrictEqual(await inject(app, queryQueryFields, 'admin'), {
    data: { __type: { fields: [{ name: 'open' }] } }
  })
})

test('external policy - every policy mapped to a field has to pass', async (t) => {
  t.plan(2)

  const app = await buildApp(t, {
    Query: {
      messages: [{ requires: 'user' }, { requires: 'admin' }]
    }
  })

  t.assert.deepStrictEqual(await inject(app, queryQueryFields, 'user'), {
    data: { __type: { fields: [{ name: 'open' }] } }
  })
  t.assert.deepStrictEqual(await inject(app, queryQueryFields, 'admin'), {
    data: { __type: { fields: [{ name: 'open' }] } }
  })
})

test('external policy - a policy that throws filters the field out', async (t) => {
  t.plan(1)

  const app = await buildApp(t, {
    Query: {
      messages: { requires: 'user' }
    }
  }, async () => {
    throw new Error('policy error')
  })

  t.assert.deepStrictEqual(await inject(app, queryQueryFields, 'user'), {
    data: { __type: { fields: [{ name: 'open' }] } }
  })
})

test('external policy - ignores a policy naming a type or field the schema does not have', async (t) => {
  t.plan(2)

  const app = await buildApp(t, {
    Missing: {
      __typePolicy: { requires: 'user' }
    },
    Message: {
      missing: { requires: 'user' }
    },
    Query: {
      messages: { requires: 'user' }
    }
  })

  t.assert.deepStrictEqual(await inject(app, queryQueryFields, 'user'), {
    data: { __type: { fields: [{ name: 'open' }, { name: 'messages' }] } }
  })
  t.assert.deepStrictEqual(await inject(app, queryQueryFields, 'admin'), {
    data: { __type: { fields: [{ name: 'open' }] } }
  })
})

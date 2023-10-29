'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const messages = [
  {
    title: 'one',
    message: 'acme one',
    notes: 'acme one',
    password: 'acme-one'
  },
  {
    title: 'two',
    message: 'acme two',
    notes: 'acme two',
    password: 'acme-two'
  }
]

test('remove valid notes results and replace it with null without any errors', async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @filterData (disallow: String!) on OBJECT | FIELD_DEFINITION

    type Message {
      message: String!
      notes: String! @filterData (disallow: "no-read-notes")
    }
    type Query {
      publicMessages: [Message!]
    }
    `,
    resolvers: {
      Query: {
        publicMessages: async (parent, args, context, info) => {
          return messages
        }
      }
    }
  })

  app.register(mercuriusAuth, {
    authContext: hasPermissionContext,
    applyPolicy: hasFilterPolicy,
    outputPolicyErrors: {
      enabled: false
    },
    authDirective: 'filterData'
  })

  const query = `{
    publicMessages { message, notes }
  }`

  const response = await app.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-permission': 'no-read-notes'
    },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  const { data } = JSON.parse(response.body)

  t.plan(data.publicMessages.length)
  for (let i = 0; i < data.publicMessages.length; i++) {
    t.ok((data.publicMessages[i].notes == null), 'notes are null')
  }
})

test("ensure that a user who doesn't have the role to filter, still sees the notes", async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @filterData (disallow: String!) on OBJECT | FIELD_DEFINITION

    type Message {
      message: String!
      notes: String! @filterData (disallow: "no-read-notes")
    }
    type Query {
      publicMessages: [Message!]
    }
    `,
    resolvers: {
      Query: {
        publicMessages: async (parent, args, context, info) => {
          return messages
        }
      }
    }
  })

  app.register(mercuriusAuth, {
    authContext: hasPermissionContext,
    applyPolicy: hasFilterPolicy,
    outputPolicyErrors: {
      enabled: false
    },
    filterSchema: true,
    authDirective: 'filterData'
  })

  const query = `{
    publicMessages { message, notes }
  }`

  const response = await app.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-permission': 'read-notes'
    },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  const { data } = JSON.parse(response.body)

  t.plan(data.publicMessages.length)
  for (let i = 0; i < data.publicMessages.length; i++) {
    t.ok((data.publicMessages[i].notes !== null), 'notes are valid')
  }
})

test(`remove valid notes results and replace it with "foo" without any errors`, async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @filterData (disallow: String!) on OBJECT | FIELD_DEFINITION

    type Message {
      message: String!
      notes: String! @filterData (disallow: "no-read-notes")
    }
    type Query {
      publicMessages: [Message!]
    }
    `,
    resolvers: {
      Query: {
        publicMessages: async (parent, args, context, info) => {
          return messages
        }
      }
    }
  })

  app.register(mercuriusAuth, {
    authContext: hasPermissionContext,
    applyPolicy: hasFilterPolicy,
    outputPolicyErrors: {
      enabled: false,
      valueOverride: 'foo'
    },
    authDirective: 'filterData'
  })

  const query = `{
    publicMessages { message, notes }
  }`

  const response = await app.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-permission': 'no-read-notes'
    },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  const { data } = JSON.parse(response.body)

  t.plan(data.publicMessages.length)
  for (let i = 0; i < data.publicMessages.length; i++) {
    t.ok((data.publicMessages[i].notes === 'foo'), 'notes is foo')
  }
})

function hasPermissionContext (context) {
  const headerValue = context.reply.request.headers['x-permission']

  return { permission: headerValue ? headerValue.split(',') : [] }
}

async function hasFilterPolicy (authDirectiveAST, parent, args, context, info) {
  const notNeeded = authDirectiveAST.arguments.find(arg => arg.name.value === 'disallow').value.value

  return !context.auth.permission.includes(notNeeded)
}

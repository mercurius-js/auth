'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

test('repeteable directives - should protect the schema and not affect queries when everything is okay', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  const schema = `
    directive @hasPermission (grant: String!) repeatable on OBJECT | FIELD_DEFINITION

    type Message {
      title: String!
      notes: String @hasPermission(grant: "lv1") @hasPermission(grant: "notes")
    }

    type Query {
      messages: [Message!]!
      adminMessages: [Message!] @hasPermission(grant: "lv1") @hasPermission(grant: "admin")
    }
  `

  const resolvers = {
    Query: {
      messages: async () => {
        return [
          {
            title: 'one',
            notes: 'note one'
          },
          {
            title: 'two',
            notes: 'note two'
          }
        ]
      },
      adminMessages: async () => {
        return [
          {
            title: 'admin one',
            notes: 'admin note one'
          },
          {
            title: 'admin two',
            notes: 'admin note two'
          }
        ]
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
        permission: context.reply.request.headers['x-permission'].split(',')
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      const needed = authDirectiveAST.arguments.find(arg => arg.name.value === 'grant').value.value

      return context.auth.permission.includes(needed)
    },
    authDirective: 'hasPermission'
  })

  const query = `query {
    messages {
      title
      notes
    }
    adminMessages {
      title
      notes
    }
  }`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Permission': 'notes,admin,lv1' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      messages: [
        {
          title: 'one',
          notes: 'note one'
        },
        {
          title: 'two',
          notes: 'note two'
        }
      ],
      adminMessages: [
        {
          title: 'admin one',
          notes: 'admin note one'
        },
        {
          title: 'admin two',
          notes: 'admin note two'
        }
      ]
    }
  })
})

test('repeteable directives - should protect the schema and error accordingly', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  const schema = `
    directive @hasPermission (grant: String!) repeatable on OBJECT | FIELD_DEFINITION

    type Message {
      title: String!
      notes: String @hasPermission(grant: "lv1") @hasPermission(grant: "notes")
    }

    type Query {
      messages: [Message!]!
      adminMessages: [Message!] @hasPermission(grant: "lv1") @hasPermission(grant: "admin")
    }
  `

  const resolvers = {
    Query: {
      messages: async () => {
        return [
          {
            title: 'one',
            notes: 'note one'
          },
          {
            title: 'two',
            notes: 'note two'
          }
        ]
      },
      adminMessages: async () => {
        return [
          {
            title: 'admin one',
            notes: 'admin note one'
          },
          {
            title: 'admin two',
            notes: 'admin note two'
          }
        ]
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
        permission: context.reply.request.headers['x-permission'].split(',')
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      const needed = authDirectiveAST.arguments.find(arg => arg.name.value === 'grant').value.value

      return context.auth.permission.includes(needed)
    },
    authDirective: 'hasPermission'
  })

  const query = `query {
    messages {
      title
      notes
    }
    adminMessages {
      title
      notes
    }
  }`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Permission': 'lv1' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      messages: [
        {
          title: 'one',
          notes: null
        },
        {
          title: 'two',
          notes: null
        }
      ],
      adminMessages: null
    },
    errors: [
      { message: 'Failed auth policy check on adminMessages', locations: [{ line: 6, column: 5 }], path: ['adminMessages'] },
      { message: 'Failed auth policy check on notes', locations: [{ line: 4, column: 7 }], path: ['messages', '0', 'notes'] },
      { message: 'Failed auth policy check on notes', locations: [{ line: 4, column: 7 }], path: ['messages', '1', 'notes'] }
    ]
  })
})

test('repeteable directives - should throw a validation error when the repeated directive is not flagged as "repeatable"', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  const schema = `
    directive @hasPermission (grant: String!) on OBJECT | FIELD_DEFINITION

    type Message {
      title: String!
      notes: String @hasPermission(grant: "lv1") @hasPermission(grant: "notes")
    }

    type Query {
      messages: [Message!]!
    }
  `

  const resolvers = {
    Query: {
      messages: async () => {
        return [
          {
            title: 'one',
            notes: 'note one'
          },
          {
            title: 'two',
            notes: 'note two'
          }
        ]
      },
      adminMessages: async () => {
        return [
          {
            title: 'admin one',
            notes: 'admin note one'
          },
          {
            title: 'admin two',
            notes: 'admin note two'
          }
        ]
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
        permission: context.reply.request.headers['x-permission'].split(',')
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      const needed = authDirectiveAST.arguments.find(arg => arg.name.value === 'grant').value.value

      return context.auth.permission.includes(needed)
    },
    authDirective: 'hasPermission'
  })

  const query = `query {
    messages {
      title
      notes
    }
    adminMessages {
      title
      notes
    }
  }`

  try {
    await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Permission': 'lv1' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })
  } catch (validationError) {
    t.ok(validationError)
  }
})

'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const orgMembers = {
  acme: ['alice'],
  other: ['alice', 'bob']
}

const schema = `
  directive @orgAuth on OBJECT | FIELD_DEFINITION

  type Message {
    title: String!
    message: String!
  }

  type Query {
    messages(org: String!): [Message!] @orgAuth
  }
`

const messages = {
  acme: [
    {
      title: 'one',
      message: 'acme one'
    },
    {
      title: 'two',
      message: 'acme two'
    }
  ],
  other: [
    {
      title: 'one',
      message: 'other one'
    },
    {
      title: 'two',
      message: 'other two'
    }
  ]
}

const resolvers = {
  Query: {
    messages: async (parent, args, context, info) => {
      return messages[args.org]
    }
  }
}

function authContext (context) {
  return {
    identity: context.reply.request.headers['x-user']
  }
}

async function applyPolicy (authDirectiveAST, parent, args, context, info) {
  const requestedOrg = args.org
  const username = context.auth.identity

  if (orgMembers[requestedOrg]) {
    const result = orgMembers[requestedOrg].includes(username)
    if (!result) {
      throw new Error(`Insufficient access: user ${username} not a member of ${requestedOrg}`)
    }
    return true
  }
  return false
}

test('should be able to access the query to determine that users have sufficient access to run related operations', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers
  })

  app.register(mercuriusAuth, {
    authContext,
    applyPolicy,
    authDirective: 'orgAuth'
  })

  const query = `query {
    messages(org: "acme") {
      title
      message
    }
  }`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'alice' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      messages: [
        {
          title: 'one',
          message: 'acme one'
        },
        {
          title: 'two',
          message: 'acme two'
        }
      ]
    }
  })
})

test('should be able to access the query to determine that users have insufficient access to run related operations', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers
  })

  app.register(mercuriusAuth, {
    authContext,
    applyPolicy,
    authDirective: 'orgAuth'
  })

  const query = `query {
    messages(org: "acme") {
      title
      message
    }
  }`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'bob' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      messages: null
    },
    errors: [
      {
        message: 'Insufficient access: user bob not a member of acme',
        locations: [
          {
            line: 2,
            column: 5
          }
        ],
        path: [
          'messages'
        ]
      }
    ]
  })
})

test('should support being registered multiple times', async (t) => {
  t.plan(2)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  const schema = `
  directive @auth1 on OBJECT | FIELD_DEFINITION
  directive @auth2 on OBJECT | FIELD_DEFINITION

  enum Role {
    ADMIN
    REVIEWER
    USER
    UNKNOWN
  }

  type Query {
    add(x: Int, y: Int): Int @auth1
    subtract(x: Int, y: Int): Int @auth2
  }
`

  const resolvers = {
    Query: {
      add: async (_, { x, y }) => x + y,
      subtract: async (_, { x, y }) => x - y
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
      return context.auth.identity.includes('user')
    },
    authDirective: 'auth1'
  })

  app.register(mercuriusAuth, {
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      return context.auth.identity === 'super-user'
    },
    authDirective: 'auth2'
  })

  const query = `query {
    add(x: 1 y: 2)
    subtract(x: 2 y: 1)
  }`

  {
    const response = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-User': 'user' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(response.body), {
      data: {
        add: 3,
        subtract: null
      },
      errors: [
        {
          message: 'Failed auth policy check on subtract',
          locations: [
            {
              line: 3,
              column: 5
            }
          ],
          path: [
            'subtract'
          ]
        }
      ]
    })
  }

  {
    const response = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-User': 'super-user' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(response.body), {
      data: {
        add: 3,
        subtract: 1
      }
    })
  }
})

test('register multiple times readme example', async (t) => {
  t.plan(4)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  const schema = `
  directive @hasRole(
    type: String,
  ) on FIELD_DEFINITION

  directive @hasPermission(
    grant: String,
  ) on FIELD_DEFINITION

  type Query {
    read: [String] @hasPermission(grant: "read")
  }

  type Mutation {
    publish(txt: String): Int @hasRole(type: "publisher") @hasPermission(grant: "write")
  }
`

  const resolvers = {
    Query: {
      read: async (_) => ['txt']
    },
    Mutation: {
      publish: async (_, { txt }) => 42
    }
  }

  app.register(mercurius, {
    schema,
    resolvers
  })

  app.register(mercuriusAuth, {
    authContext (context) {
      return {
        role: context.reply.request.headers['x-role']
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      return context.auth.role === 'publisher'
    },
    authDirective: 'hasRole'
  })

  app.register(mercuriusAuth, {
    authContext (context) {
      return {
        permission: context.reply.request.headers['x-permission']
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      return context.auth.permission === authDirectiveAST
        .arguments.find(arg => arg.name.value === 'grant').value.value
    },
    authDirective: 'hasPermission'
  })

  const query = `query {
    read
  }`
  const mutation = `mutation {
    publish(txt:"hello")
  }`

  {
    const response = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(response.body), {
      data: {
        read: null
      },
      errors: [
        {
          message: 'Failed auth policy check on read',
          locations: [
            { line: 2, column: 5 }
          ],
          path: ['read']
        }
      ]
    })
  }

  {
    const response = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-permission': 'read' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(response.body), {
      data: {
        read: ['txt']
      }
    })
  }

  {
    const response = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-role': 'publisher', 'X-permission': 'read' },
      url: '/graphql',
      body: JSON.stringify({ query: mutation })
    })

    t.same(JSON.parse(response.body), {
      data: {
        publish: null
      },
      errors: [
        {
          message: 'Failed auth policy check on publish',
          locations: [
            { line: 2, column: 5 }
          ],
          path: ['publish']
        }
      ]
    })
  }

  {
    const response = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-role': 'publisher', 'X-permission': 'write' },
      url: '/graphql',
      body: JSON.stringify({ query: mutation })
    })

    t.same(JSON.parse(response.body), {
      data: {
        publish: 42
      }
    })
  }
})

test('the authContext must be executed in serial', async (t) => {
  t.plan(8)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  const schema = `
  directive @auth1 on FIELD_DEFINITION
  directive @auth2 on FIELD_DEFINITION

  enum Role {
    ADMIN
    REVIEWER
    USER
    UNKNOWN
  }

  type Query {
    add(x: Int, y: Int): Int @auth1
    subtract(x: Int, y: Int): Int @auth2
  }
`

  const resolvers = {
    Query: {
      add: async (_, { x, y }) => x + y,
      subtract: async (_, { x, y }) => x - y
    }
  }

  const userType = [{
    identity: 'user',
    foo: 'bar'
  }, {
    identity: 'super-user',
    foo: 'bar'
  }]

  app.register(mercurius, {
    schema,
    resolvers
  })

  app.register(mercuriusAuth, {
    authContext (context) {
      t.notOk(context.auth, 'this is the first hook executed')
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      t.same(context.auth, userType.shift())
      return context.auth.identity.includes('user')
    },
    authDirective: 'auth1'
  })

  app.register(mercuriusAuth, {
    authContext (context) {
      t.ok(context.auth.identity, 'this is the second hook executed')
      return {
        foo: 'bar'
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      return context.auth.identity === 'super-user'
    },
    authDirective: 'auth2'
  })

  const query = `query {
    add(x: 1 y: 2)
    subtract(x: 2 y: 1)
  }`

  {
    const response = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-User': 'user' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(response.body), {
      data: {
        add: 3,
        subtract: null
      },
      errors: [
        {
          message: 'Failed auth policy check on subtract',
          locations: [
            {
              line: 3,
              column: 5
            }
          ],
          path: [
            'subtract'
          ]
        }
      ]
    })
  }

  {
    const response = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-User': 'super-user' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(response.body), {
      data: {
        add: 3,
        subtract: 1
      }
    })
  }
})

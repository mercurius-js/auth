'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const schema = `
  directive @auth on OBJECT | FIELD_DEFINITION
  directive @hasRole (role: String!) on OBJECT | FIELD_DEFINITION
  directive @hasPermission (grant: String!) on OBJECT | FIELD_DEFINITION

  type Message {
    title: String!
    message: String @auth
    password: String @hasPermission(grant: "see-all")
  }
  
  type AdminMessage @hasRole(role: "admin") {
    title: String!
    message: String @auth
  }

  type Query {
    publicMessages(org: String): [Message!]
    semiPublicMessages(org: String): [Message!] @auth
    privateMessages(org: String): [Message!] @auth @hasRole(role: "admin")
    cryptoMessages(org: String): [AdminMessage!]
  }
`

const messages = [
  {
    title: 'one',
    message: 'acme one',
    password: 'acme-one'
  },
  {
    title: 'two',
    message: 'acme two',
    password: 'acme-two'
  }
]

const resolvers = {
  Query: {
    publicMessages: async (parent, args, context, info) => { return messages },
    semiPublicMessages: async (parent, args, context, info) => { return messages },
    privateMessages: async (parent, args, context, info) => { return messages },
    cryptoMessages: async (parent, args, context, info) => { return messages }
  }
}

test('should be able to access the query to determine that users have sufficient access to run related operations', async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers
  })

  app.register(mercuriusAuth, {
    authContext: authContext,
    applyPolicy: authPolicy,
    namespace: 'authorization-filtering',
    authDirective: 'auth'
  })
  app.register(mercuriusAuth, {
    authContext: hasRoleContext,
    applyPolicy: hasRolePolicy,
    namespace: 'authorization-filtering',
    authDirective: 'hasRole'
  })
  app.register(mercuriusAuth, {
    authContext: hasPermissionContext,
    applyPolicy: hasPermissionPolicy,
    namespace: 'authorization-filtering',
    authDirective: 'hasPermission'
  })

  const queryListBySchema = `{
    __schema {
      queryType {
        name
        fields{
          name
        }
      }
    }
  }`

  const queryListByType = `{
    __type(name:"Query"){
      name
      fields{
        name
      }
    }
  }`

  ;[
    {
      name: 'simple not introspection query',
      query: '{ publicMessages { title } }',
      result: {
        data: {
          publicMessages: [
            { title: 'one' },
            { title: 'two' }
          ]
        }
      }
    },
    {
      name: 'filter @auth queries using __type',
      query: queryListByType,
      result: {
        data: {
          __type: {
            name: 'Query',
            fields: [
              { name: 'publicMessages' },
              { name: 'cryptoMessages' }
            ]
          }
        }
      }
    },
    {
      name: 'filter @auth queries using __schema',
      query: queryListBySchema,
      result: {
        data: {
          __schema: {
            queryType: {
              name: 'Query',
              fields: [
                { name: 'publicMessages' },
                { name: 'cryptoMessages' }
              ]
            }
          }
        }
      }
    },
    {
      name: '@auth user queries using __type',
      query: queryListByType,
      headers: {
        'x-token': 'token'
      },
      result: {
        data: {
          __type: {
            name: 'Query',
            fields: [
              { name: 'publicMessages' },
              { name: 'semiPublicMessages' },
              { name: 'cryptoMessages' }
            ]
          }
        }
      }
    },
    {
      name: '@auth user with valid role queries using __schema',
      query: queryListBySchema,
      headers: {
        'x-token': 'token',
        'x-role': 'admin'
      },
      result: {
        data: {
          __schema: {
            queryType: {
              name: 'Query',
              fields: [
                { name: 'publicMessages' },
                { name: 'semiPublicMessages' },
                { name: 'privateMessages' },
                { name: 'cryptoMessages' }
              ]
            }
          }
        }
      }
    },
    {
      name: '@auth user with INVALID role queries using __schema',
      query: queryListBySchema,
      headers: {
        'x-token': 'token',
        'x-role': 'viewer'
      },
      result: {
        data: {
          __schema: {
            queryType: {
              name: 'Query',
              fields: [
                { name: 'publicMessages' },
                { name: 'semiPublicMessages' },
                { name: 'cryptoMessages' }
              ]
            }
          }
        }
      }
    }
  ].forEach(({ name, query, result, headers }) => {
    t.test(name, async t => {
      t.plan(1)
      const response = await app.inject({
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        url: '/graphql',
        body: JSON.stringify({ query })
      })
      t.same(response.json(), result)
    })
  })
})

test('the single filter preExecution lets the app crash', async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers
  })

  app.register(mercuriusAuth, {
    authContext: authContext,
    applyPolicy: authPolicy,
    namespace: 'authorization-filtering',
    authDirective: 'auth'
  })

  app.register(async function plugin () {
    throw new Error('boom')
  })

  try {
    await app.listen(0)
  } catch (error) {
    t.equal(error.message, 'boom')
  }
})

function authContext (context) {
  return { token: context.reply.request.headers['x-token'] || false }
}
async function authPolicy (authDirectiveAST, parent, args, context, info) {
  return context.auth.token !== false
}

function hasRoleContext (context) {
  return { role: context.reply.request.headers['x-role'] }
}
async function hasRolePolicy (authDirectiveAST, parent, args, context, info) {
  return context.auth.role === authDirectiveAST.arguments.find(arg => arg.name.value === 'role').value.value
}

function hasPermissionContext (context) {
  return { permission: context.reply.request.headers['x-permission'] }
}
async function hasPermissionPolicy (authDirectiveAST, parent, args, context, info) {
  const needed = authDirectiveAST.arguments.find(arg => arg.name.value === 'grant').value.value
  const hasGrant = context.auth.permission === needed
  if (!hasGrant) {
    throw new Error(`Needed ${needed} grant`)
  }
  return true
}

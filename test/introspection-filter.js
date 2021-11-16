'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const { getIntrospectionQuery } = require('graphql')
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
    password: String @hasPermission(grant: "see-all-admin")
  }

  type SimpleMessage {
    title: String!
    message: String @auth
  }

  union MessageUnion = AdminMessage | SimpleMessage

  type Query {
    publicMessages(org: String): [Message!]
    semiPublicMessages(org: String): [Message!] @auth
    privateMessages(org: String): [Message!] @auth @hasRole(role: "admin")
    cryptoMessages(org: String): [MessageUnion!]
    adminMessages(org: String): [AdminMessage!]
  }
`

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

const queryObjectMessage = `{
  __type(name: "Message") {
    name
    fields {
      name
    }
  }
}`

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
    cryptoMessages: async (parent, args, context, info) => { return messages },
    adminMessages: async (parent, args, context, info) => { return messages }
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
      name: 'simple query with auth failing',
      query: '{ semiPublicMessages { title } }',
      result: {
        data: { semiPublicMessages: null },
        errors: [{
          message: 'Failed auth policy check on semiPublicMessages',
          locations: [{ line: 1, column: 3 }],
          path: ['semiPublicMessages']
        }]
      }
    },
    {
      name: 'simple query within an inspection query filter the schema and avoid triggering errors',
      query: `{
        __type(name:"Query"){ name }
        semiPublicMessages { title }
      }`,
      result: {
        data: {
          __type: {
            name: 'Query'
          }
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
              // notes that the adminMessages query is filtered out
              // because we don't satisfy the AdminMessage @hasRole(role: "admin")
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
                { name: 'cryptoMessages' },
                { name: 'adminMessages' }
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
    },
    {
      name: 'Message type with INVALID permission',
      query: queryObjectMessage,
      headers: {
        'x-token': 'token',
        'x-permission': 'none'
      },
      result: {
        data: {
          __type: {
            name: 'Message',
            fields: [
              { name: 'title' },
              { name: 'message' }
            ]
          }
        }
      }
    },
    {
      name: 'Complete introspection query',
      query: getIntrospectionQuery(),
      headers: {
        'x-token': 'token',
        'x-role': 'not-an-admin',
        'x-permission': 'see-all'
      },
      result (t, responseJson) {
        t.plan(3)
        const { types } = responseJson.data.__schema

        t.notOk(types.find(type => type.name === 'AdminMessage'), 'the AdminMessage type has been filtered')

        const objMessage = types.find(type => type.name === 'Message')
        t.ok(objMessage, 'the Message type is present')
        t.ok(objMessage.fields.find(field => field.name === 'password'), 'role is right')
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

      if (typeof result !== 'function') {
        t.same(response.json(), result)
      } else {
        t.test('response', t => {
          result(t, response.json())
        })
      }
    })
  })
})

test('UNION check filtering', async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @unionCheck on UNION | FIELD_DEFINITION

    type Message {
      title: String!
      password: String @unionCheck
    }

    type SimpleMessage {
      title: String!
      message: String
    }

    union MessageUnion @unionCheck = Message | SimpleMessage
  
    type Query {
      publicMessages(org: String): [MessageUnion!]
    }
    `
  })

  app.register(mercuriusAuth, {
    applyPolicy: async function hasRolePolicy (authDirectiveAST, parent, args, context, info) {
      return context.reply.request.headers['x-union'] === 'show'
    },
    namespace: 'authorization-filtering',
    authDirective: 'unionCheck'
  })

  ;[
    {
      name: 'show UNION type',
      query: queryListByType,
      headers: {
        'x-union': 'show'
      },
      result: {
        data: {
          __type: {
            name: 'Query',
            fields: [
              { name: 'publicMessages' }
            ]
          }
        }
      }
    },
    {
      name: 'hide UNION type',
      query: queryListByType,
      headers: {
        'x-union': 'hide'
      },
      result: {
        data: {
          __type: {
            name: 'Query',
            fields: []
          }
        }
      }
    },
    {
      name: 'show UNION type',
      query: queryObjectMessage,
      headers: {
        'x-union': 'show'
      },
      result: {
        data: {
          __type: {
            name: 'Message',
            fields: [
              { name: 'title' },
              { name: 'password' }
            ]
          }
        }
      }
    },
    {
      name: 'hide UNION type - cannot access to this type',
      query: queryObjectMessage,
      headers: {
        'x-union': 'hide'
      },
      result: {
        data: {
          __type: null
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

      if (typeof result !== 'function') {
        t.same(response.json(), result)
      } else {
        t.test('response', t => {
          result(t, response.json())
        })
      }
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
    await app.ready()
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

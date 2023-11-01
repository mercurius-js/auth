'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')
const { MER_AUTH_ERR_FAILED_POLICY_CHECK } = require('../lib/errors')

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

const query = 'query { publicMessages { message, notes } }'

test('remove valid notes results and replace it with empty string without any errors since user has a permission that does so', async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @filterData (disallow: String!) on FIELD_DEFINITION

    type Message {
      message: String!
      notes: String @filterData (disallow: "no-read-notes")
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
    t.ok((data.publicMessages[i].notes === null), 'notes are null')
  }
})

test("ensure that a user who doesn't have the role to filter, still sees the notes as they normally would", async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @filterData (disallow: String!) on FIELD_DEFINITION

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

test('remove valid notes results and replace it with "foo" without any errors, using straight replace', async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @filterData (disallow: String!) on FIELD_DEFINITION

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
    t.ok((data.publicMessages[i].notes === 'foo'), 'notes do equal foo')
  }
})

test('remove valid notes results and replace it with "foo" without any errors, using function method', async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @filterData (disallow: String!) on FIELD_DEFINITION

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
      valueOverride: () => {
        return 'foo'
      }
    },
    authDirective: 'filterData'
  })

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
    t.ok((data.publicMessages[i].notes === 'foo'), 'notes do equal foo')
  }
})

test('remove valid notes results and if the function returns anything other than a string, error out', async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @filterData (disallow: String!) on FIELD_DEFINITION

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
      valueOverride: () => {
        return 1
      }
    },
    authDirective: 'filterData'
  })

  try {
    await app.inject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-permission': 'no-read-notes'
      },
      url: '/graphql',
      body: JSON.stringify({ query })
    })
  } catch (error) {
    t.same(error, new MER_AUTH_ERR_FAILED_POLICY_CHECK('Replacement must be a valid string.'))
  }
})

test('can not filter and replace on a type that is not a String type', async (t) => {
  ;[
    {
      name: 'should fail on ID type',
      schema: `
        directive @filterData (disallow: String!) on FIELD_DEFINITION

    type Message {
      id: ID! @filterData (disallow: "no-read-notes")
      message: String!
      notes: String! 
    }
    
    type Query {
      publicMessages: [Message!]
    }`
    }, {
      name: 'should fail on Int type',
      schema: `
        directive @filterData (disallow: String!) on FIELD_DEFINITION

    type Message {
      message: String!
      notes: Int! @filterData (disallow: "no-read-notes")
    }
    
    type Query {
      publicMessages: [Message!]
    }`
    }, {
      name: 'should fail on Boolean type',
      schema: `
        directive @filterData (disallow: String!) on FIELD_DEFINITION

    type Message {
      message: String!
      notes: Boolean! @filterData (disallow: "no-read-notes")
    }
    
    type Query {
      publicMessages: [Message!]
    }`
    }, {
      name: 'should fail on Float type',
      schema: `
        directive @filterData (disallow: String!) on FIELD_DEFINITION

    type Message {
      message: String!
      notes: Float! @filterData (disallow: "no-read-notes")
    }
    
    type Query {
      publicMessages: [Message!]
    }`
    }].forEach(({ name, schema }) => {
    t.test(name, async (t) => {
      const app = Fastify()
      t.teardown(app.close.bind(app))

      app.register(mercurius, {
        schema,
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
          valueOverride: 'bar'
        },
        authDirective: 'filterData'
      })

      try {
        await app.inject({
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-permission': 'no-read-notes'
          },
          url: '/graphql',
          body: JSON.stringify({ query })
        })
      } catch (error) {
        t.same(error, new MER_AUTH_ERR_FAILED_POLICY_CHECK('You can not do a replacement on a GraphQL scalar type that is not a String'))
      }
    })
  })
})

function hasPermissionContext (context) {
  const headerValue = context.reply.request.headers['x-permission']

  return { permission: headerValue ? headerValue.split(',') : [] }
}

async function hasFilterPolicy (authDirectiveAST, parent, args, context, info) {
  const notNeeded = authDirectiveAST.arguments.find(arg => arg.name.value === 'disallow').value.value

  return !context.auth.permission.includes(notNeeded)
}

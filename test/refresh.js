'use strict'

const { test } = require('tap')
const FakeTimers = require('@sinonjs/fake-timers')
const { promisify } = require('util')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const immediate = promisify(setImmediate)

test('polling interval with a new schema should trigger refresh of schema policy build', async (t) => {
  t.plan(4)

  const clock = FakeTimers.install({
    shouldAdvanceTime: true,
    advanceTimeDelta: 40
  })
  t.teardown(() => clock.uninstall())

  const user = {
    id: 'u1',
    name: 'John',
    lastName: 'Doe'
  }

  const resolvers = {
    Query: {
      me: (root, args, context, info) => user
    },
    User: {
      __resolveReference: (user, args, context, info) => user
    }
  }

  const userService = Fastify()
  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await userService.close()
  })

  userService.register(mercurius, {
    schema: `
      directive @auth on OBJECT | FIELD_DEFINITION

      extend type Query {
        me: User
      }

      type User @key(fields: "id") {
        id: ID!
        name: String @auth
      }
    `,
    resolvers: resolvers,
    federationMetadata: true
  })

  await userService.listen(0)

  const userServicePort = userService.server.address().port

  await gateway.register(mercurius, {
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`
        }
      ],
      pollingInterval: 2000
    }
  })

  await gateway.register(mercuriusAuth, {
    authContext (context) {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      t.ok('should be called')
      return context.auth.identity === 'admin'
    },
    authDirective: 'auth'
  })

  {
    const query = `query {
    me {
      id
      name
    }
  }`

    const res = await gateway.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user': 'user' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(res.body), {
      data: {
        me: {
          id: 'u1',
          name: null
        }
      },
      errors: [
        {
          message: 'Failed auth policy check on name',
          locations: [
            {
              line: 4,
              column: 7
            }
          ],
          path: [
            'me',
            'name'
          ]
        }
      ]
    })
  }

  userService.graphql.replaceSchema(
    mercurius.buildFederationSchema(`
      directive @auth on OBJECT | FIELD_DEFINITION

      extend type Query {
        me: User
      }

      type User @key(fields: "id") {
        id: ID!
        name: String 
        lastName: String @auth
      }
    `)
  )
  userService.graphql.defineResolvers(resolvers)

  await clock.tickAsync(2000)

  // We need the event loop to actually spin twice to
  // be able to propagate the change
  await immediate()
  await immediate()

  {
    const query = `query {
    me {
      id
      name
      lastName
    }
  }`

    const res = await gateway.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user': 'user' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(res.body), {
      data: {
        me: {
          id: 'u1',
          name: 'John',
          lastName: null
        }
      },
      errors: [
        {
          message: 'Failed auth policy check on lastName',
          locations: [
            {
              line: 5,
              column: 7
            }
          ],
          path: [
            'me',
            'lastName'
          ]
        }
      ]
    })
  }
})

test('polling a filtered schema should complete the refresh succesfully', async (t) => {
  t.plan(8)

  const clock = FakeTimers.install({
    shouldAdvanceTime: true,
    advanceTimeDelta: 40
  })
  t.teardown(() => clock.uninstall())

  const user = {
    id: 'u1',
    name: 'John',
    lastName: 'Doe'
  }

  const resolvers = {
    Query: {
      me: (root, args, context, info) => user
    },
    User: {
      __resolveReference: (user, args, context, info) => user
    }
  }

  const userService = Fastify()
  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await userService.close()
  })

  userService.register(mercurius, {
    schema: `
      directive @auth on OBJECT | FIELD_DEFINITION

      extend type Query {
        me: User
      }

      type User @key(fields: "id") {
        id: ID!
        name: String @auth
      }
    `,
    resolvers: resolvers,
    federationMetadata: true
  })

  await userService.listen(0)

  const userServicePort = userService.server.address().port

  await gateway.register(mercurius, {
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`
        }
      ],
      pollingInterval: 2000
    }
  })

  await gateway.register(mercuriusAuth, {
    filterSchema: true,
    authContext (context) {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      t.ok('should be called')
      return context.auth.identity === 'admin'
    },
    authDirective: 'auth'
  })

  {
    const query = `query {
    me {
      id
      name
    }
  }`

    const res = await gateway.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user': 'user' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(res.body), {
      data: {
        me: {
          id: 'u1',
          name: null
        }
      },
      errors: [
        {
          message: 'Failed auth policy check on name',
          locations: [
            {
              line: 4,
              column: 7
            }
          ],
          path: [
            'me',
            'name'
          ]
        }
      ]
    })
  }

  {
    const query = `{
      __type(name:"User"){
        name
        fields{
          name
        }
      }
    }`

    const res = await gateway.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user': 'user' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(res.json(), {
      data: {
        __type: {
          name: 'User',
          fields: [
            { name: 'id' }
          ]
        }
      }
    })
  }

  userService.graphql.replaceSchema(
    mercurius.buildFederationSchema(`
      directive @auth on OBJECT | FIELD_DEFINITION

      extend type Query {
        me: User
      }

      type User @key(fields: "id") {
        id: ID!
        name: String 
        lastName: String @auth
      }
    `)
  )
  userService.graphql.defineResolvers(resolvers)

  await clock.tickAsync(2000)

  // We need the event loop to actually spin twice to
  // be able to propagate the change
  await immediate()
  await immediate()

  {
    const query = `query {
    me {
      id
      name
      lastName
    }
  }`

    const res = await gateway.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user': 'user' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(res.body), {
      data: {
        me: {
          id: 'u1',
          name: 'John',
          lastName: null
        }
      },
      errors: [
        {
          message: 'Failed auth policy check on lastName',
          locations: [
            {
              line: 5,
              column: 7
            }
          ],
          path: [
            'me',
            'lastName'
          ]
        }
      ]
    })
  }

  {
    const query = `{
      __type(name:"User"){
        name
        fields{
          name
        }
      }
    }`

    const res = await gateway.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user': 'user' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(res.json(), {
      data: {
        __type: {
          name: 'User',
          fields: [
            { name: 'id' },
            { name: 'name' }
          ]
        }
      }
    })
  }
})

'use strict'

const { test } = require('node:test')
const FakeTimers = require('@sinonjs/fake-timers')
const { promisify } = require('util')
const Fastify = require('fastify')
const { mercuriusFederationPlugin, buildFederationSchema } = require('@mercuriusjs/federation')
const mercuriusGateway = require('@mercuriusjs/gateway')
const mercuriusAuth = require('..')

const immediate = promisify(setImmediate)

test('polling interval with a new schema should trigger refresh of schema policy build', async (t) => {
  const clock = FakeTimers.install({
    shouldAdvanceTime: true,
    advanceTimeDelta: 40
  })
  t.after(() => clock.uninstall())

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
  t.after(async () => {
    await gateway.close()
    await userService.close()
  })

  userService.register(mercuriusFederationPlugin, {
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
    resolvers
  })

  await userService.listen({ port: 0 })

  const userServicePort = userService.server.address().port

  await gateway.register(mercuriusGateway, {
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://127.0.0.1:${userServicePort}/graphql`
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
      t.assert.ok('should be called')
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

    t.assert.deepStrictEqual(JSON.parse(res.body), {
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
    buildFederationSchema(`
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

    t.assert.deepStrictEqual(JSON.parse(res.body), {
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

test('polling a filtered schema should complete the refresh successfully', async (t) => {
  t.plan(8)

  const clock = FakeTimers.install({
    shouldAdvanceTime: true,
    advanceTimeDelta: 40
  })
  t.after(() => clock.uninstall())

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
  t.after(async () => {
    await gateway.close()
    await userService.close()
  })

  userService.register(mercuriusFederationPlugin, {
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
    resolvers
  })

  await userService.listen({ port: 0 })

  const userServicePort = userService.server.address().port

  await gateway.register(mercuriusGateway, {
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://127.0.0.1:${userServicePort}/graphql`
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
      t.assert.ok('should be called')
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

    t.assert.deepStrictEqual(JSON.parse(res.body), {
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

    t.assert.deepStrictEqual(res.json(), {
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
    buildFederationSchema(`
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

    t.assert.deepStrictEqual(JSON.parse(res.body), {
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

    t.assert.deepStrictEqual(res.json(), {
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

test('polling a schema with a composed policy that cannot be evaluated logs it and keeps the field protected when checkPoliciesOnRegister is set', async (t) => {
  t.plan(3)

  const clock = FakeTimers.install({
    shouldAdvanceTime: true,
    advanceTimeDelta: 40
  })
  t.after(() => clock.uninstall())

  const { applyPolicy, sdl, authDirective } = mercuriusAuth.composeDirectivePolicy({
    checkInput: 'scope: String!',
    parseCheck: node => ({ scope: node.fields.find(field => field.name.value === 'scope').value.value }),
    evaluate: (check, context) => context.reply.request.headers['x-scope'] === check.scope
  })

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
  // The gateway logs what the onGatewayReplaceSchema hook throws
  let logRefreshError
  const refreshError = new Promise(resolve => { logRefreshError = resolve })
  const gateway = Fastify({ logger: { level: 'error', stream: { write: line => logRefreshError(JSON.parse(line).err) } } })
  t.after(async () => {
    await gateway.close()
    await userService.close()
  })

  userService.register(mercuriusFederationPlugin, {
    schema: `
      ${sdl}

      extend type Query {
        me: User
      }

      type User @key(fields: "id") {
        id: ID!
        name: String @auth(checks: [{ scope: "admin" }])
      }
    `,
    resolvers
  })

  await userService.listen({ port: 0 })

  const userServicePort = userService.server.address().port

  await gateway.register(mercuriusGateway, {
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://127.0.0.1:${userServicePort}/graphql`
        }
      ],
      pollingInterval: 2000
    }
  })

  await gateway.register(mercuriusAuth, {
    applyPolicy,
    authDirective,
    checkPoliciesOnRegister: true
  })

  const query = selection => gateway.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-scope': 'admin' },
    url: '/graphql',
    body: JSON.stringify({ query: `query { me { ${selection} } }` })
  }).then(res => JSON.parse(res.body))

  userService.graphql.replaceSchema(
    buildFederationSchema(`
      ${sdl}

      extend type Query {
        me: User
      }

      type User @key(fields: "id") {
        id: ID!
        name: String @auth(checks: [{ scope: "admin" }])
        lastName: String @auth(checks: [{ scpoe: "admin" }])
      }
    `)
  )
  userService.graphql.defineResolvers(resolvers)

  await clock.tickAsync(2000)

  const error = await refreshError
  t.assert.deepStrictEqual({ code: error.code, message: error.message }, {
    code: 'MER_AUTH_ERR_INVALID_POLICY',
    message: "Invalid auth policy on the schema: User.lastName: Cannot read properties of undefined (reading 'value')"
  })
  t.assert.deepStrictEqual(await query('id name'), { data: { me: { id: 'u1', name: 'John' } } })
  t.assert.deepStrictEqual(await query('lastName'), {
    data: { me: { lastName: null } },
    errors: [{ message: "Cannot read properties of undefined (reading 'value')", locations: [{ line: 1, column: 14 }], path: ['me', 'lastName'] }]
  })
})

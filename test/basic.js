'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const schema = `
  directive @auth(
    requires: Role = ADMIN,
  ) on OBJECT | FIELD_DEFINITION

  enum Role {
    ADMIN
    REVIEWER
    USER
    UNKNOWN
  }

  type Message {
    title: String!
    public: String!
    private: String @auth(requires: ADMIN)
  }

  type Query {
    add(x: Int, y: Int): Int @auth(requires: ADMIN)
    subtract(x: Int, y: Int): Int
    messages: [Message!]!
    adminMessages: [Message!] @auth(requires: ADMIN)
  }
`

const resolvers = {
  Query: {
    add: async (_, obj) => {
      const { x, y } = obj
      return x + y
    },
    subtract: async (_, obj) => {
      const { x, y } = obj
      return x - y
    },
    messages: async () => {
      return [
        {
          title: 'one',
          public: 'public one',
          private: 'private one'
        },
        {
          title: 'two',
          public: 'public two',
          private: 'private two'
        }
      ]
    },
    adminMessages: async () => {
      return [
        {
          title: 'admin one',
          public: 'admin public one',
          private: 'admin private one'
        },
        {
          title: 'admin two',
          public: 'admin public two',
          private: 'admin private two'
        }
      ]
    }
  }
}

test('basic - should protect the schema and not affect queries when everything is okay', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

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
      return context.auth.identity === 'admin'
    },
    authDirective: 'auth'
  })

  const query = `query {
  four: add(x: 2, y: 2)
  six: add(x: 3, y: 3)
  subtract(x: 3, y: 3)
  messages {
    title
    public
    private
  }
  adminMessages {
    title
    public
    private
  }
}`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'admin' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: 4,
      six: 6,
      subtract: 0,
      messages: [
        {
          title: 'one',
          public: 'public one',
          private: 'private one'
        },
        {
          title: 'two',
          public: 'public two',
          private: 'private two'
        }
      ],
      adminMessages: [
        {
          title: 'admin one',
          public: 'admin public one',
          private: 'admin private one'
        },
        {
          title: 'admin two',
          public: 'admin public two',
          private: 'admin private two'
        }
      ]
    }
  })
})

test('basic - should protect the schema and error accordingly', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

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
      return context.auth.identity === 'admin'
    },
    authDirective: 'auth'
  })

  const query = `query {
  four: add(x: 2, y: 2)
  six: add(x: 3, y: 3)
  subtract(x: 3, y: 3)
  messages {
    title
    public
    private
  }
  adminMessages {
    title
    public
    private
  }
}`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: null,
      six: null,
      subtract: 0,
      messages: [
        {
          title: 'one',
          public: 'public one',
          private: null
        },
        {
          title: 'two',
          public: 'public two',
          private: null
        }
      ],
      adminMessages: null
    },
    errors: [
      { message: 'Failed auth policy check on add', locations: [{ line: 2, column: 3 }], path: ['four'] },
      { message: 'Failed auth policy check on add', locations: [{ line: 3, column: 3 }], path: ['six'] },
      { message: 'Failed auth policy check on adminMessages', locations: [{ line: 10, column: 3 }], path: ['adminMessages'] },
      { message: 'Failed auth policy check on private', locations: [{ line: 8, column: 5 }], path: ['messages', 0, 'private'] },
      { message: 'Failed auth policy check on private', locations: [{ line: 8, column: 5 }], path: ['messages', 1, 'private'] }
    ]
  })
})

test('basic - should work alongside existing directives', async (t) => {
  t.plan(1)

  const schema = `
    directive @auth(
      requires: Role = ADMIN,
    ) on OBJECT | FIELD_DEFINITION

    enum Role {
      ADMIN
      REVIEWER
      USER
      UNKNOWN
    }

    directive @notUsed on OBJECT | FIELD_DEFINITION

    type Query {
      add(x: Int, y: Int): Int @auth(requires: ADMIN) @notUsed
      subtract(x: Int, y: Int): Int @notUsed
    }
`
  const resolvers = {
    Query: {
      add: async (_, obj) => {
        const { x, y } = obj
        return x + y
      },
      subtract: async (_, obj) => {
        const { x, y } = obj
        return x - y
      }
    }
  }

  const query = `query {
  four: add(x: 2, y: 2)
  six: add(x: 3, y: 3)
  subtract(x: 3, y: 3)
}`

  const app = Fastify()
  t.teardown(app.close.bind(app))

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
      return context.auth.identity === 'admin'
    },
    authDirective: 'auth'
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: null,
      six: null,
      subtract: 0
    },
    errors: [
      { message: 'Failed auth policy check on add', locations: [{ line: 2, column: 3 }], path: ['four'] },
      { message: 'Failed auth policy check on add', locations: [{ line: 3, column: 3 }], path: ['six'] }
    ]
  })
})

test('basic - should handle when no fields within a type are allowed', async (t) => {
  t.plan(1)

  const schema = `
  directive @auth(
    requires: Role = ADMIN,
  ) on OBJECT | FIELD_DEFINITION

  enum Role {
    ADMIN
    REVIEWER
    USER
    UNKNOWN
  }

  type Message {
    title: String @auth(requires: ADMIN)
    private: String @auth(requires: ADMIN)
  }

  type Query {
    add(x: Int, y: Int): Int @auth(requires: ADMIN)
    subtract(x: Int, y: Int): Int
    messages: [Message!]!
  }
`

  const resolvers = {
    Query: {
      add: async (_, obj) => {
        const { x, y } = obj
        return x + y
      },
      subtract: async (_, obj) => {
        const { x, y } = obj
        return x - y
      },
      messages: async () => {
        return [
          {
            title: 'one',
            private: 'private one'
          },
          {
            title: 'two',
            private: 'private two'
          }
        ]
      }
    }
  }

  const query = `query {
  four: add(x: 2, y: 2)
  six: add(x: 3, y: 3)
  subtract(x: 3, y: 3)
  messages {
    title
    private
  }
}`

  const app = Fastify()
  t.teardown(app.close.bind(app))

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
      return context.auth.identity === 'admin'
    },
    authDirective: 'auth'
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: null,
      six: null,
      subtract: 0,
      messages: [
        {
          title: null,
          private: null
        },
        {
          title: null,
          private: null
        }
      ]
    },
    errors: [
      { message: 'Failed auth policy check on add', locations: [{ line: 2, column: 3 }], path: ['four'] },
      { message: 'Failed auth policy check on add', locations: [{ line: 3, column: 3 }], path: ['six'] },
      { message: 'Failed auth policy check on title', locations: [{ line: 6, column: 5 }], path: ['messages', 0, 'title'] },
      { message: 'Failed auth policy check on private', locations: [{ line: 7, column: 5 }], path: ['messages', 0, 'private'] },
      { message: 'Failed auth policy check on title', locations: [{ line: 6, column: 5 }], path: ['messages', 1, 'title'] },
      { message: 'Failed auth policy check on private', locations: [{ line: 7, column: 5 }], path: ['messages', 1, 'private'] }
    ]
  })
})

test('basic - should handle custom errors thrown in applyPolicy', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

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
      if (context.auth.identity !== 'admin') {
        throw new Error(`custom auth error on ${info.fieldName}`)
      }
      return true
    },
    authDirective: 'auth'
  })

  const query = `query {
  four: add(x: 2, y: 2)
  six: add(x: 3, y: 3)
  subtract(x: 3, y: 3)
  messages {
    title
    public
    private
  }
  adminMessages {
    title
    public
    private
  }
}`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: null,
      six: null,
      subtract: 0,
      messages: [
        {
          title: 'one',
          public: 'public one',
          private: null
        },
        {
          title: 'two',
          public: 'public two',
          private: null
        }
      ],
      adminMessages: null
    },
    errors: [
      { message: 'custom auth error on add', locations: [{ line: 2, column: 3 }], path: ['four'] },
      { message: 'custom auth error on add', locations: [{ line: 3, column: 3 }], path: ['six'] },
      { message: 'custom auth error on adminMessages', locations: [{ line: 10, column: 3 }], path: ['adminMessages'] },
      { message: 'custom auth error on private', locations: [{ line: 8, column: 5 }], path: ['messages', 0, 'private'] },
      { message: 'custom auth error on private', locations: [{ line: 8, column: 5 }], path: ['messages', 1, 'private'] }
    ]
  })
})

test('basic - should handle custom errors returned in applyPolicy', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

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
      if (context.auth.identity !== 'admin') {
        return new Error(`custom auth error on ${info.fieldName}`)
      }
      return true
    },
    authDirective: 'auth'
  })

  const query = `query {
  four: add(x: 2, y: 2)
  six: add(x: 3, y: 3)
  subtract(x: 3, y: 3)
  messages {
    title
    public
    private
  }
  adminMessages {
    title
    public
    private
  }
}`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: null,
      six: null,
      subtract: 0,
      messages: [
        {
          title: 'one',
          public: 'public one',
          private: null
        },
        {
          title: 'two',
          public: 'public two',
          private: null
        }
      ],
      adminMessages: null
    },
    errors: [
      { message: 'custom auth error on add', locations: [{ line: 2, column: 3 }], path: ['four'] },
      { message: 'custom auth error on add', locations: [{ line: 3, column: 3 }], path: ['six'] },
      { message: 'custom auth error on adminMessages', locations: [{ line: 10, column: 3 }], path: ['adminMessages'] },
      { message: 'custom auth error on private', locations: [{ line: 8, column: 5 }], path: ['messages', 0, 'private'] },
      { message: 'custom auth error on private', locations: [{ line: 8, column: 5 }], path: ['messages', 1, 'private'] }
    ]
  })
})

test('basic - should handle when auth context is not defined', async (t) => {
  t.plan(3)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers
  })
  await app.register(mercuriusAuth, {
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      return context.other.identity === 'admin'
    },
    authDirective: 'auth'
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    context.other = {
      identity: context.reply.request.headers['x-user']
    }
    t.type(context.auth, 'undefined')
    t.ok('called')
  })

  const query = `query {
  four: add(x: 2, y: 2)
  six: add(x: 3, y: 3)
  subtract(x: 3, y: 3)
  messages {
    title
    public
    private
  }
  adminMessages {
    title
    public
    private
  }
}`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'admin' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: 4,
      six: 6,
      subtract: 0,
      messages: [
        {
          title: 'one',
          public: 'public one',
          private: 'private one'
        },
        {
          title: 'two',
          public: 'public two',
          private: 'private two'
        }
      ],
      adminMessages: [
        {
          title: 'admin one',
          public: 'admin public one',
          private: 'admin private one'
        },
        {
          title: 'admin two',
          public: 'admin public two',
          private: 'admin private two'
        }
      ]
    }
  })
})

test('basic - should support jit', async (t) => {
  t.plan(2)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers,
    jit: 1
  })
  app.register(mercuriusAuth, {
    authContext (context) {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      return context.auth.identity === 'admin'
    },
    authDirective: 'auth'
  })

  const query = `query {
  four: add(x: 2, y: 2)
  six: add(x: 3, y: 3)
  subtract(x: 3, y: 3)
  messages {
    title
    public
    private
  }
  adminMessages {
    title
    public
    private
  }
}`

  {
    const response = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-User': 'admin' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(response.body), {
      data: {
        four: 4,
        six: 6,
        subtract: 0,
        messages: [
          {
            title: 'one',
            public: 'public one',
            private: 'private one'
          },
          {
            title: 'two',
            public: 'public two',
            private: 'private two'
          }
        ],
        adminMessages: [
          {
            title: 'admin one',
            public: 'admin public one',
            private: 'admin private one'
          },
          {
            title: 'admin two',
            public: 'admin public two',
            private: 'admin private two'
          }
        ]
      }
    })
  }

  // Trigger JIT compilation
  {
    const response = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-User': 'admin' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(response.body), {
      data: {
        four: 4,
        six: 6,
        subtract: 0,
        messages: [
          {
            title: 'one',
            public: 'public one',
            private: 'private one'
          },
          {
            title: 'two',
            public: 'public two',
            private: 'private two'
          }
        ],
        adminMessages: [
          {
            title: 'admin one',
            public: 'admin public one',
            private: 'admin private one'
          },
          {
            title: 'admin two',
            public: 'admin public two',
            private: 'admin private two'
          }
        ]
      }
    })
  }
})

test('basic - should work at type level with field resolvers', async (t) => {
  t.plan(1)

  const schema = `
    directive @auth(
      requires: Role = ADMIN,
    ) on OBJECT | FIELD_DEFINITION

    enum Role {
      ADMIN
      REVIEWER
      USER
      UNKNOWN
    }

    type Query {
      getUser: User
    }

    type User @auth(requires: USER) {
      id: Int
      name: String
    }`

  const resolvers = {
    Query: {
      getUser: async (_, obj) => ({
        id: 1,
        name: 'testuser',
        test: 'TEST'
      })
    },
    User: {
      id: async (src) => src.id
    }
  }

  const query = `query {
    getUser {
      id
      name
    }
  }`

  const app = Fastify()
  t.teardown(app.close.bind(app))

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
      return context.auth.identity === 'user'
    },
    authDirective: 'auth'
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      getUser: {
        id: 1,
        name: 'testuser'
      }
    }
  })
})

test('basic - should work at type level with nested directive', async (t) => {
  t.plan(1)

  const schema = `
    directive @auth(
      requires: Role = ADMIN,
    ) on OBJECT | FIELD_DEFINITION

    enum Role {
      ADMIN
      REVIEWER
      USER
      UNKNOWN
    }

    type Query {
      getUser: User
    }

    type User @auth(requires: USER) {
      id: Int
      name: String
      protected: String @auth(requires: ADMIN)
    }`

  const resolvers = {
    Query: {
      getUser: async (_, obj) => ({
        id: 1,
        name: 'testuser',
        protected: 'protected data'
      })
    },
    User: {
      id: async (src) => src.id
    }
  }

  const query = `query {
    getUser {
      id
      name
      protected
    }
  }`

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers
  })
  app.register(mercuriusAuth, {
    authContext (context) {
      return {
        identity: context.reply.request.headers['x-user'].toUpperCase().split(',')
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      const findArg = (arg, ast) => {
        let result
        ast.arguments.forEach((a) => {
          if (a.kind === 'Argument' &&
            a.name.value === arg) {
            result = a.value.value
          }
        })
        return result
      }
      const requires = findArg('requires', authDirectiveAST)
      return context.auth.identity.includes(requires)
    },
    authDirective: 'auth'
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      getUser: {
        id: 1,
        name: 'testuser',
        protected: null
      }
    },
    errors: [
      { message: 'Failed auth policy check on protected', locations: [{ line: 5, column: 7 }], path: ['getUser', 'protected'] }
    ]
  })
})

test('basic - should error for all fields in type', async (t) => {
  t.plan(1)

  const schema = `
    directive @auth(
      requires: Role = ADMIN,
    ) on OBJECT | FIELD_DEFINITION

    enum Role {
      ADMIN
      REVIEWER
      USER
      UNKNOWN
    }

    type Query {
      getUser: User
    }

    type User @auth(requires: ADMIN) {
      id: Int
      name: String
    }`

  const resolvers = {
    Query: {
      getUser: async (_, obj) => ({
        id: 1,
        name: 'testuser'
      })
    },
    User: {
      id: async (src) => src.id
    }
  }

  const query = `query {
    getUser {
      id
      name
    }
  }`

  const app = Fastify()
  t.teardown(app.close.bind(app))

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
      return context.auth.identity === 'admin'
    },
    authDirective: 'auth'
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      getUser: {
        id: null,
        name: null
      }
    },
    errors: [
      { message: 'Failed auth policy check on id', locations: [{ line: 3, column: 7 }], path: ['getUser', 'id'] },
      { message: 'Failed auth policy check on name', locations: [{ line: 4, column: 7 }], path: ['getUser', 'name'] }
    ]
  })
})

test('basic - should work at type level, entity query', async (t) => {
  t.plan(2)

  const schema = `
    directive @auth(
      requires: Role = ADMIN,
    ) on OBJECT | FIELD_DEFINITION

    enum Role {
      ADMIN
      REVIEWER
      USER
      UNKNOWN
    }

    type Query {
      getUser: UserX
    }

    type UserX @auth(requires: USER) @key(fields: "id") {
      id: Int
      name: String
      protected: String @auth(requires: ADMIN)
    }`

  const resolvers = {
    Query: {
      getUser: async (_, obj) => ({
        id: 1,
        name: 'testuser',
        protected: 'protected data'
      })
    },
    UserX: {
      __resolveReference ({ id }) {
        return {
          id,
          name: 'testuser'
        }
      }
    }
  }

  const variables = {
    representations: [
      {
        __typename: 'UserX',
        id: 1
      }
    ]
  }

  const query = `query GetEntities($representations: [_Any!]!) {
    _entities(representations: $representations) {
      __typename
      ... on UserX {
        id
        name
      }
    }
  }`

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema,
    resolvers,
    federationMetadata: true
  })
  app.register(mercuriusAuth, {
    authContext (context) {
      return {
        identity: context.reply.request.headers['x-user'].toUpperCase().split(',')
      }
    },
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      const findArg = (arg, ast) => {
        let result
        ast.arguments.forEach((a) => {
          if (a.kind === 'Argument' &&
            a.name.value === arg) {
            result = a.value.value
          }
        })
        return result
      }
      const requires = findArg('requires', authDirectiveAST)
      return context.auth.identity.includes(requires)
    },
    authDirective: 'auth'
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user': 'user' },
    url: '/graphql',
    body: JSON.stringify({ variables, query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      _entities: [
        {
          __typename: 'UserX',
          id: 1,
          name: 'testuser'
        }
      ]
    }
  })

  const responseBad = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user': 'userx' },
    url: '/graphql',
    body: JSON.stringify({ variables, query })
  })

  t.same(JSON.parse(responseBad.body), {
    data: {
      _entities: [
        null
      ]
    },
    errors: [
      {
        message: 'Failed auth policy check on _entities',
        locations: [
          {
            line: 2,
            column: 5
          }
        ],
        path: [
          '_entities',
          '0'
        ]
      }
    ]
  })
})

test('basic - should be able to turn off directive based auth by setting mode to "external"', async (t) => {
  t.plan(1)

  const app = Fastify()
  t.teardown(app.close.bind(app))

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
      return context.auth.identity === 'admin'
    },
    authDirective: 'auth',
    mode: 'external'
  })

  const query = `query {
    four: add(x: 2, y: 2)
    six: add(x: 3, y: 3)
    subtract(x: 3, y: 3)
    messages {
      title
      public
      private
    }
    adminMessages {
      title
      public
      private
    }
  }`

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-User': 'user' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(response.body), {
    data: {
      four: 4,
      six: 6,
      subtract: 0,
      messages: [
        {
          title: 'one',
          public: 'public one',
          private: 'private one'
        },
        {
          title: 'two',
          public: 'public two',
          private: 'private two'
        }
      ],
      adminMessages: [
        {
          title: 'admin one',
          public: 'admin public one',
          private: 'admin private one'
        },
        {
          title: 'admin two',
          public: 'admin public two',
          private: 'admin private two'
        }
      ]
    }
  })
})

'use strict'

const t = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const schema = `
  type Message {
    title: String!
    public: String!
    private: String
  }

  type Query {
    add(x: Int, y: Int): Int
    subtract(x: Int, y: Int): Int
    messages: [Message!]!
    adminMessages: [Message!]
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

t.test('external policy', t => {
  t.plan(8)

  t.test('should protect the schema and not affect queries when everything is okay', async (t) => {
    t.plan(8)

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
      async applyPolicy (policy, parent, args, context, info) {
        t.ok(policy)
        return context.auth.identity.includes(policy.requires)
      },
      mode: 'external',
      policy: {
        Wrong: {},
        Message: {
          private: { requires: 'admin' },
          wrong: { requires: '' }
        },
        Query: {
          add: { requires: 'admin' },
          adminMessages: { requires: 'admin' }
        }
      }
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

  t.test('should protect the schema and error accordingly', async (t) => {
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
      async applyPolicy (policy, parent, args, context, info) {
        return context.auth.identity.includes(policy.requires)
      },
      mode: 'external',
      policy: {
        Wrong: {},
        Message: {
          private: { requires: 'admin' },
          wrong: { requires: '' }
        },
        Query: {
          add: { requires: 'admin' },
          adminMessages: { requires: 'admin' }
        }
      }
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
        { message: 'Failed auth policy check on add', locations: [{ line: 2, column: 7 }], path: ['four'] },
        { message: 'Failed auth policy check on add', locations: [{ line: 3, column: 7 }], path: ['six'] },
        { message: 'Failed auth policy check on adminMessages', locations: [{ line: 10, column: 7 }], path: ['adminMessages'] },
        { message: 'Failed auth policy check on private', locations: [{ line: 8, column: 9 }], path: ['messages', 0, 'private'] },
        { message: 'Failed auth policy check on private', locations: [{ line: 8, column: 9 }], path: ['messages', 1, 'private'] }
      ]
    })
  })

  t.test('should handle when no fields within a type are allowed', async (t) => {
    t.plan(1)

    const schema = `  
    type Message {
      title: String
      private: String
    }
  
    type Query {
      add(x: Int, y: Int): Int
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
      async applyPolicy (policy, parent, args, context, info) {
        return context.auth.identity.includes(policy.requires)
      },
      mode: 'external',
      policy: {
        Message: {
          private: { requires: 'admin' },
          title: { requires: 'admin' }
        },
        Query: {
          add: { requires: 'admin' }
        }
      }
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
        { message: 'Failed auth policy check on add', locations: [{ line: 2, column: 7 }], path: ['four'] },
        { message: 'Failed auth policy check on add', locations: [{ line: 3, column: 7 }], path: ['six'] },
        { message: 'Failed auth policy check on title', locations: [{ line: 6, column: 9 }], path: ['messages', 0, 'title'] },
        { message: 'Failed auth policy check on private', locations: [{ line: 7, column: 9 }], path: ['messages', 0, 'private'] },
        { message: 'Failed auth policy check on title', locations: [{ line: 6, column: 9 }], path: ['messages', 1, 'title'] },
        { message: 'Failed auth policy check on private', locations: [{ line: 7, column: 9 }], path: ['messages', 1, 'private'] }
      ]
    })
  })

  t.test('should support jit', async (t) => {
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
      async applyPolicy (policy, parent, args, context, info) {
        return context.auth.identity.includes(policy.requires)
      },
      mode: 'external',
      policy: {
        Wrong: {},
        Message: {
          private: { requires: 'admin' },
          wrong: { requires: '' }
        },
        Query: {
          add: { requires: 'admin' },
          adminMessages: { requires: 'admin' }
        }
      }
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
          {
            message: 'Failed auth policy check on add',
            locations: [
              {
                line: 2,
                column: 7
              }
            ],
            path: [
              'four'
            ]
          },
          {
            message: 'Failed auth policy check on add',
            locations: [
              {
                line: 3,
                column: 7
              }
            ],
            path: [
              'six'
            ]
          },
          {
            message: 'Failed auth policy check on adminMessages',
            locations: [
              {
                line: 10,
                column: 7
              }
            ],
            path: [
              'adminMessages'
            ]
          },
          {
            message: 'Failed auth policy check on private',
            locations: [
              {
                line: 8,
                column: 9
              }
            ],
            path: [
              'messages',
              '0',
              'private'
            ]
          },
          {
            message: 'Failed auth policy check on private',
            locations: [
              {
                line: 8,
                column: 9
              }
            ],
            path: [
              'messages',
              '1',
              'private'
            ]
          }
        ]
      })
    }

    // Trigger JIT compilation
    {
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
          {
            message: 'Failed auth policy check on add',
            locations: [
              {
                line: 2,
                column: 7
              }
            ],
            path: [
              'four'
            ]
          },
          {
            message: 'Failed auth policy check on add',
            locations: [
              {
                line: 3,
                column: 7
              }
            ],
            path: [
              'six'
            ]
          },
          {
            message: 'Failed auth policy check on adminMessages',
            locations: [
              {
                line: 10,
                column: 7
              }
            ],
            path: [
              'adminMessages'
            ]
          },
          {
            message: 'Failed auth policy check on private',
            locations: [
              {
                line: 8,
                column: 9
              }
            ],
            path: [
              'messages',
              '0',
              'private'
            ]
          },
          {
            message: 'Failed auth policy check on private',
            locations: [
              {
                line: 8,
                column: 9
              }
            ],
            path: [
              'messages',
              '1',
              'private'
            ]
          }
        ]
      })
    }
  })

  t.test('should work at type level with field resolvers', async (t) => {
    t.plan(1)

    const schema = `
      type Query {
        getUser: User
      }
  
      type User {
        id: Int
        name: String
      }`

    const resolvers = {
      Query: {
        getUser: async (_, obj) => ({
          id: 1,
          name: 'test user',
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
      async applyPolicy (policy, parent, args, context, info) {
        return context.auth.identity.includes(policy.requires)
      },
      mode: 'external',
      policy: {
        User: {
          __typePolicy: { requires: 'admin' }
        }
      }
    })

    const response = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-User': 'admin' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(response.body), {
      data: {
        getUser: {
          id: 1,
          name: 'test user'
        }
      }
    })
  })

  t.test('should work at type level with nested directive', async (t) => {
    t.plan(1)

    const schema = `
      type Query {
        getUser: User
      }
  
      type User {
        id: Int
        name: String
        protected: String
      }`

    const resolvers = {
      Query: {
        getUser: async (_, obj) => ({
          id: 1,
          name: 'test user',
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
          identity: context.reply.request.headers['x-user']
        }
      },
      async applyPolicy (policy, parent, args, context, info) {
        return context.auth.identity.includes(policy.requires)
      },
      mode: 'external',
      policy: {
        User: {
          __typePolicy: { requires: 'user' },
          protected: { requires: 'admin' }
        }
      }
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
          name: 'test user',
          protected: null
        }
      },
      errors: [
        { message: 'Failed auth policy check on protected', locations: [{ line: 5, column: 9 }], path: ['getUser', 'protected'] }
      ]
    })
  })

  t.test('should error for all fields in type', async (t) => {
    t.plan(1)

    const schema = `
      type Query {
        getUser: User
      }
  
      type User {
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
      async applyPolicy (policy, parent, args, context, info) {
        return context.auth.identity.includes(policy.requires)
      },
      mode: 'external',
      policy: {
        User: {
          __typePolicy: { requires: 'admin' }
        }
      }
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
        { message: 'Failed auth policy check on id', locations: [{ line: 3, column: 9 }], path: ['getUser', 'id'] },
        { message: 'Failed auth policy check on name', locations: [{ line: 4, column: 9 }], path: ['getUser', 'name'] }
      ]
    })
  })

  t.test('should work at type level for reference resolvers', async (t) => {
    t.plan(2)

    const schema = `  
      type Query {
        getUser: User
      }
  
      type User @key(fields: "id") {
        id: Int
        name: String
        protected: String
      }`

    const resolvers = {
      Query: {
        getUser: async (_, obj) => ({
          id: 1,
          name: 'test user',
          protected: 'protected data'
        })
      },
      User: {
        __resolveReference ({ id }) {
          return {
            id,
            name: 'test user'
          }
        }
      }
    }

    const variables = {
      representations: [
        {
          __typename: 'User',
          id: 1
        }
      ]
    }

    const query = `query GetEntities($representations: [_Any!]!) {
      _entities(representations: $representations) {
        __typename
        ... on User {
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
          identity: context.reply.request.headers['x-user']
        }
      },
      async applyPolicy (policy, parent, args, context, info) {
        return context.auth.identity.includes(policy.requires)
      },
      mode: 'external',
      policy: {
        User: {
          __typePolicy: { requires: 'user' },
          protected: { requires: 'admin' }
        }
      }
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
            __typename: 'User',
            id: 1,
            name: 'test user'
          }
        ]
      }
    })

    const responseBad = await app.inject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user': 'guest' },
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
              column: 7
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
})

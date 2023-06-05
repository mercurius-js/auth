'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const { mercuriusFederationPlugin } = require('@mercuriusjs/federation')
const mercuriusAuth = require('..')

const schema = `
  directive @auth(requires: [Role]) on OBJECT | FIELD_DEFINITION

  enum Role {
    ADMIN
    USER
    UNKNOWN
  }

  type Message {
    title: String!
    public: String!
    private: String @auth(requires: [ADMIN])
  }

  type Query {
    add(x: Int, y: Int): Int @auth(requires: [ADMIN])
    subtract(x: Int, y: Int): Int @auth(requires: [ADMIN, USER])
    messages: [Message!]!
    adminMessages: [Message!] @auth(requires: [ADMIN])
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
          private: 'private one',
        },
        {
          title: 'two',
          public: 'public two',
          private: 'private two',
        },
      ]
    },
    adminMessages: async () => {
      return [
        {
          title: 'admin one',
          public: 'admin public one',
          private: 'admin private one',
        },
        {
          title: 'admin two',
          public: 'admin public two',
          private: 'admin private two',
        },
      ]
    },
  },
}

const authContext = (context) => {
  return {
    user: {
      id: context.reply.request.headers['x-user-id'],
      role: context.reply.request.headers['x-user-role'],
    },
  }
}

const AUTHENTICATION_ERROR = 'No Authorization was found in request.headers'
const AUTHORIZATION_ERROR = 'Insufficient permission for {{fieldName}}'

const applyPolicy = (policy, context, info) => {
  const userId = context?.auth?.user?.id
  const userRole = context?.auth?.user?.role ?? ''

  if (!userId) throw new Error(AUTHENTICATION_ERROR)

  const roles = [userRole]
  const requires = policy.arguments[0].value.values.map((roleEnum) =>
    roleEnum.value.toLowerCase()
  )

  const isAuthorized = roles.some((role) => requires.includes(role))
  if (isAuthorized) return true
  throw new Error(AUTHORIZATION_ERROR.replace('{{fieldName}}', info.fieldName))
}

test('mutliple auth roles', (t) => {
  t.test(
    'should protect the schema and not affect queries when everything is okay',
    async (t) => {
      t.plan(1)

      const app = Fastify()
      t.teardown(app.close.bind(app))

      app.register(mercurius, {
        schema,
        resolvers,
      })
      app.register(mercuriusAuth, {
        authContext(context) {
          return authContext(context)
        },
        async applyPolicy(policy, parent, args, context, info) {
          return applyPolicy(policy, context, info)
        },
        authDirective: 'auth',
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
        headers: {
          'content-type': 'application/json',
          'x-user-id': '1',
          'x-user-role': 'admin',
        },
        url: '/graphql',
        body: JSON.stringify({ query }),
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
              private: 'private one',
            },
            {
              title: 'two',
              public: 'public two',
              private: 'private two',
            },
          ],
          adminMessages: [
            {
              title: 'admin one',
              public: 'admin public one',
              private: 'admin private one',
            },
            {
              title: 'admin two',
              public: 'admin public two',
              private: 'admin private two',
            },
          ],
        },
      })
    }
  )

  t.test('should protect the schema and error accordingly', async (t) => {
    t.plan(1)

    const app = Fastify()
    t.teardown(app.close.bind(app))

    app.register(mercurius, {
      schema,
      resolvers,
    })
    app.register(mercuriusAuth, {
      authContext(context) {
        return authContext(context)
      },
      async applyPolicy(policy, parent, args, context, info) {
        return applyPolicy(policy, context, info)
      },
      authDirective: 'auth',
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
      headers: {
        'content-type': 'application/json',
        'x-user-id': '1',
        'x-user-role': 'user',
      },
      url: '/graphql',
      body: JSON.stringify({ query }),
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
            private: null,
          },
          {
            title: 'two',
            public: 'public two',
            private: null,
          },
        ],
        adminMessages: null,
      },
      errors: [
        {
          message: 'Insufficient permission for add',
          locations: [{ line: 2, column: 7 }],
          path: ['four'],
        },
        {
          message: 'Insufficient permission for add',
          locations: [{ line: 3, column: 7 }],
          path: ['six'],
        },
        {
          message: 'Insufficient permission for adminMessages',
          locations: [{ line: 10, column: 7 }],
          path: ['adminMessages'],
        },
        {
          message: 'Insufficient permission for private',
          locations: [{ line: 8, column: 9 }],
          path: ['messages', '0', 'private'],
        },
        {
          message: 'Insufficient permission for private',
          locations: [{ line: 8, column: 9 }],
          path: ['messages', '1', 'private'],
        },
      ],
    })
  })

  t.test('should work alongside existing directives', async (t) => {
    t.plan(1)

    const schema = `
    directive @auth(requires: [Role]) on OBJECT | FIELD_DEFINITION

    enum Role {
      ADMIN
      USER
      UNKNOWN
    }

    directive @notUsed on OBJECT | FIELD_DEFINITION

    type Query {
      add(x: Int, y: Int): Int @auth(requires: [ADMIN]) @notUsed
      subtract(x: Int, y: Int): Int @notUsed
    }`

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
      },
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
      resolvers,
    })
    app.register(mercuriusAuth, {
      authContext(context) {
        return authContext(context)
      },
      async applyPolicy(policy, parent, args, context, info) {
        return applyPolicy(policy, context, info)
      },
      authDirective: 'auth',
    })

    const response = await app.inject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': '1',
        'x-user-role': 'user',
      },
      url: '/graphql',
      body: JSON.stringify({ query }),
    })

    t.same(JSON.parse(response.body), {
      data: {
        four: null,
        six: null,
        subtract: 0,
      },
      errors: [
        {
          message: 'Insufficient permission for add',
          locations: [{ line: 2, column: 5 }],
          path: ['four'],
        },
        {
          message: 'Insufficient permission for add',
          locations: [{ line: 3, column: 5 }],
          path: ['six'],
        },
      ],
    })
  })

  t.test(
    'should handle when no fields within a type are allowed',
    async (t) => {
      t.plan(1)

      const schema = `
    directive @auth(requires: [Role]) on OBJECT | FIELD_DEFINITION

    enum Role {
      ADMIN
      USER
      UNKNOWN
    }

    type Message {
      title: String @auth(requires: [ADMIN])
      private: String @auth(requires: [ADMIN])
    }

    type Query {
      add(x: Int, y: Int): Int @auth(requires: [ADMIN])
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
                private: 'private one',
              },
              {
                title: 'two',
                private: 'private two',
              },
            ]
          },
        },
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
        resolvers,
      })
      app.register(mercuriusAuth, {
        authContext(context) {
          return authContext(context)
        },
        async applyPolicy(policy, parent, args, context, info) {
          return applyPolicy(policy, context, info)
        },
        authDirective: 'auth',
      })

      const response = await app.inject({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': '1',
          'x-user-role': 'user',
        },
        url: '/graphql',
        body: JSON.stringify({ query }),
      })

      t.same(JSON.parse(response.body), {
        data: {
          four: null,
          six: null,
          subtract: 0,
          messages: [
            {
              title: null,
              private: null,
            },
            {
              title: null,
              private: null,
            },
          ],
        },
        errors: [
          {
            message: 'Insufficient permission for add',
            locations: [{ line: 2, column: 5 }],
            path: ['four'],
          },
          {
            message: 'Insufficient permission for add',
            locations: [{ line: 3, column: 5 }],
            path: ['six'],
          },
          {
            message: 'Insufficient permission for title',
            locations: [{ line: 6, column: 7 }],
            path: ['messages', 0, 'title'],
          },
          {
            message: 'Insufficient permission for private',
            locations: [{ line: 7, column: 7 }],
            path: ['messages', 0, 'private'],
          },
          {
            message: 'Insufficient permission for title',
            locations: [{ line: 6, column: 7 }],
            path: ['messages', 1, 'title'],
          },
          {
            message: 'Insufficient permission for private',
            locations: [{ line: 7, column: 7 }],
            path: ['messages', 1, 'private'],
          },
        ],
      })
    }
  )

  t.test('should work at type level with field resolvers', async (t) => {
    t.plan(1)

    const schema = `
    directive @auth(requires: [Role]) on OBJECT | FIELD_DEFINITION

    enum Role {
      ADMIN
      USER
      UNKNOWN
    }

    type Query {
      getUser: User
    }

    type User @auth(requires: [USER]) {
      id: Int
      name: String
    }`

    const resolvers = {
      Query: {
        getUser: async (_, obj) => ({
          id: 1,
          name: 'testuser',
          test: 'TEST',
        }),
      },
      User: {
        id: async (src) => src.id,
      },
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
      resolvers,
    })
    app.register(mercuriusAuth, {
      authContext(context) {
        return authContext(context)
      },
      async applyPolicy(policy, parent, args, context, info) {
        return applyPolicy(policy, context, info)
      },
      authDirective: 'auth',
    })

    const response = await app.inject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': '1',
        'x-user-role': 'user',
      },
      url: '/graphql',
      body: JSON.stringify({ query }),
    })

    t.same(JSON.parse(response.body), {
      data: {
        getUser: {
          id: 1,
          name: 'testuser',
        },
      },
    })
  })

  t.test('should work at type level with nested directive', async (t) => {
    t.plan(1)

    const schema = `
    directive @auth(requires: [Role]) on OBJECT | FIELD_DEFINITION

    enum Role {
      ADMIN
      USER
      UNKNOWN
    }

    type Query {
      getUser: User
    }

    type User @auth(requires: [USER]) {
      id: Int
      name: String
      protected: String @auth(requires: [ADMIN])
    }`

    const resolvers = {
      Query: {
        getUser: async (_, obj) => ({
          id: 1,
          name: 'testuser',
          protected: 'protected data',
        }),
      },
      User: {
        id: async (src) => src.id,
      },
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
      resolvers,
    })
    app.register(mercuriusAuth, {
      authContext(context) {
        return authContext(context)
      },
      async applyPolicy(policy, parent, args, context, info) {
        return applyPolicy(policy, context, info)
      },
      authDirective: 'auth',
    })

    const response = await app.inject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': '1',
        'x-user-role': 'user',
      },
      url: '/graphql',
      body: JSON.stringify({ query }),
    })

    t.same(JSON.parse(response.body), {
      data: {
        getUser: {
          id: 1,
          name: 'testuser',
          protected: null,
        },
      },
      errors: [
        {
          message: 'Insufficient permission for protected',
          locations: [{ line: 5, column: 7 }],
          path: ['getUser', 'protected'],
        },
      ],
    })
  })

  t.test('should error for all fields in type', async (t) => {
    t.plan(1)

    const schema = `
    directive @auth(requires: [Role]) on OBJECT | FIELD_DEFINITION

    enum Role {
      ADMIN
      USER
      UNKNOWN
    }

    type Query {
      getUser: User
    }

    type User @auth(requires: [ADMIN]) {
      id: Int
      name: String
    }`

    const resolvers = {
      Query: {
        getUser: async (_, obj) => ({
          id: 1,
          name: 'testuser',
        }),
      },
      User: {
        id: async (src) => src.id,
      },
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
      resolvers,
    })
    app.register(mercuriusAuth, {
      authContext(context) {
        return authContext(context)
      },
      async applyPolicy(policy, parent, args, context, info) {
        return applyPolicy(policy, context, info)
      },
      authDirective: 'auth',
    })

    const response = await app.inject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': '1',
        'x-user-role': 'user',
      },
      url: '/graphql',
      body: JSON.stringify({ query }),
    })

    t.same(JSON.parse(response.body), {
      data: {
        getUser: {
          id: null,
          name: null,
        },
      },
      errors: [
        {
          message: 'Insufficient permission for id',
          locations: [{ line: 3, column: 7 }],
          path: ['getUser', 'id'],
        },
        {
          message: 'Insufficient permission for name',
          locations: [{ line: 4, column: 7 }],
          path: ['getUser', 'name'],
        },
      ],
    })
  })

  t.test('should work at type level, entity query', async (t) => {
    t.plan(2)

    const schema = `
    directive @auth(requires: [Role]) on OBJECT | FIELD_DEFINITION

    enum Role {
      ADMIN
      USER
      UNKNOWN
    }

    type Query {
      getUser: UserX
    }

    type UserX @auth(requires: [USER]) @key(fields: "id") {
      id: Int
      name: String
      protected: String @auth(requires: [ADMIN])
    }`

    const resolvers = {
      Query: {
        getUser: async (_, obj) => ({
          id: 1,
          name: 'testuser',
          protected: 'protected data',
        }),
      },
      UserX: {
        __resolveReference({ id }) {
          return {
            id,
            name: 'testuser',
          }
        },
      },
    }

    const variables = {
      representations: [
        {
          __typename: 'UserX',
          id: 1,
        },
      ],
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

    app.register(mercuriusFederationPlugin, {
      schema,
      resolvers,
    })
    app.register(mercuriusAuth, {
      authContext(context) {
        return authContext(context)
      },
      async applyPolicy(policy, parent, args, context, info) {
        return applyPolicy(policy, context, info)
      },
      authDirective: 'auth',
    })

    const response = await app.inject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': '1',
        'x-user-role': 'user',
      },
      url: '/graphql',
      body: JSON.stringify({ variables, query }),
    })

    t.same(JSON.parse(response.body), {
      data: {
        _entities: [
          {
            __typename: 'UserX',
            id: 1,
            name: 'testuser',
          },
        ],
      },
    })

    const responseBad = await app.inject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': '1',
        'x-user-role': 'userx',
      },
      url: '/graphql',
      body: JSON.stringify({ variables, query }),
    })

    t.same(JSON.parse(responseBad.body), {
      data: {
        _entities: [null],
      },
      errors: [
        {
          message: 'Insufficient permission for _entities',
          locations: [
            {
              line: 2,
              column: 5,
            },
          ],
          path: ['_entities', '0'],
        },
      ],
    })
  })

  t.end()
})

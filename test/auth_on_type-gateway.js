'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

async function createTestService (t, schema, resolvers = {}) {
  const service = Fastify()
  service.register(mercurius, {
    schema,
    resolvers,
    federationMetadata: true
  })
  service.register(mercuriusAuth, {
    authContext (context) {
      return {
        identity: context.reply.request.headers['x-user']
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
      if (!context.auth.identity) {
        return false
      }
      const chk = context.auth.identity.toUpperCase().split(',')
      if (!chk.includes(requires)) {
        if (info.fieldName === '_entities') {
          throw new Error(`Failed auth policy check on ${parent.__typename}`)
        }
        return false
      }
      return true
    },
    authDirective: 'auth'
  })

  await service.listen(0)
  return [service, service.server.address().port]
}

const users = {
  u1: {
    id: 'u1',
    name: 'John'
  },
  u2: {
    id: 'u2',
    name: 'Jane'
  }
}

const posts = {
  p1: {
    pid: 'p1',
    title: 'Post 1',
    content: 'Content 1',
    authorId: 'u1'
  },
  p2: {
    pid: 'p2',
    title: 'Post 2',
    content: 'Content 2',
    authorId: 'u2'
  },
  p3: {
    pid: 'p3',
    title: 'Post 3',
    content: 'Content 3',
    authorId: 'u1'
  },
  p4: {
    pid: 'p4',
    title: 'Post 4',
    content: 'Content 4',
    authorId: 'u1'
  }
}

async function createTestGatewayServer (t) {
  // User service
  const userServiceSchema = `
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

  type Query @extends {
    me: User @auth(requires: ADMIN)
  }

  type User @key(fields: "id") @auth(requires: ADMIN) {
    id: ID!
    name: String
  }`
  const userServiceResolvers = {
    Query: {
      me: (root, args, context, info) => {
        return users.u1
      }
    },
    User: {
      __resolveReference: (user, args, context, info) => {
        return users[user.id]
      }
    }
  }
  const [userService, userServicePort] = await createTestService(t, userServiceSchema, userServiceResolvers)

  // Post service
  const postServiceSchema = `
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

  extend type Query {
    topPosts(count: Int): [Post] @auth(requires: USER)
  }

  type Post @key(fields: "pid") @auth(requires: USER) {
    pid: ID!
    author: User
  }

  type User @key(fields: "id") @extends {
    id: ID! @external
    topPosts(count: Int!): [Post] @notUsed
  }`
  const postServiceResolvers = {
    Post: {
      __resolveReference: (post, args, context, info) => {
        return posts[post.pid]
      },
      author: (post, args, context, info) => {
        return {
          __typename: 'User',
          id: post.authorId
        }
      }
    },
    User: {
      topPosts: (user, { count }, context, info) => {
        return Object.values(posts).filter(p => p.authorId === user.id).slice(0, count)
      }
    },
    Query: {
      topPosts: (root, { count = 2 }) => Object.values(posts).slice(0, count)
    }
  }
  const [postService, postServicePort] = await createTestService(t, postServiceSchema, postServiceResolvers)

  const gateway = Fastify()
  t.teardown(async () => {
    await gateway.close()
    await userService.close()
    await postService.close()
  })
  gateway.register(mercurius, {
    gateway: {
      services: [
        {
          name: 'user',
          url: `http://localhost:${userServicePort}/graphql`,
          rewriteHeaders: (headers, context) => {
            if (headers['x-user']) {
              return {
                'x-user': headers['x-user']
              }
            }
            return null
          }
        }, {
          name: 'post',
          url: `http://localhost:${postServicePort}/graphql`,
          rewriteHeaders: (headers, context) => {
            if (headers['x-user']) {
              return {
                'x-user': headers['x-user']
              }
            }
            return null
          }
        }
      ]
    }
  })

  return gateway
}

test('gateway - should protect the schema as normal', async (t) => {
  t.plan(1)
  const app = await createTestGatewayServer(t)

  const query = `query {
  me {
    id
    name
    topPosts(count: 2) {
      pid
      author {
        id
      }
    }
  }
  topPosts(count: 2) {
    pid
  }
}`

  const res = await app.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user': 'user,admin'
    },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      me: {
        id: 'u1',
        name: 'John',
        topPosts: [
          {
            pid: 'p1',
            author: {
              id: 'u1'
            }
          },
          {
            pid: 'p3',
            author: {
              id: 'u1'
            }
          }
        ]
      },
      topPosts: [
        {
          pid: 'p1'
        },
        {
          pid: 'p2'
        }
      ]
    }
  })
})

test('gateway - should protect the schema, user object protected', async (t) => {
  t.plan(1)
  const app = await createTestGatewayServer(t)

  const query = `query {
  me {
    id
    name
  }
  topPosts(count: 2) {
    pid
    author {
      id
      name
    }
  }
}`

  const res = await app.inject({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user': 'user'
    },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(JSON.parse(res.body), {
    data: {
      me: null,
      topPosts: [
        {
          pid: 'p1',
          author: null
        },
        {
          pid: 'p2',
          author: null
        }
      ]
    },
    errors: [
      {
        message: 'Failed auth policy check on me',
        locations: [
          {
            line: 2,
            column: 3
          }
        ],
        path: [
          'me'
        ]
      },
      {
        message: 'Failed auth policy check on User',
        locations: [
          {
            line: 2,
            column: 3
          }
        ],
        path: [
          '_entities',
          '0'
        ]
      },
      {
        message: 'Failed auth policy check on User',
        locations: [
          {
            line: 2,
            column: 3
          }
        ],
        path: [
          '_entities',
          '1'
        ]
      },
      {
        message: 'Failed auth policy check on User',
        locations: [
          {
            line: 2,
            column: 3
          }
        ],
        path: [
          '_entities',
          '0'
        ]
      },
      {
        message: 'Failed auth policy check on User',
        locations: [
          {
            line: 2,
            column: 3
          }
        ],
        path: [
          '_entities',
          '1'
        ]
      }
    ]
  })
})

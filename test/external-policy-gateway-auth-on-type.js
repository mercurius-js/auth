'use strict'

const t = require('tap')
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
  type Query @extends {
    me: User
  }

  type User @key(fields: "id") {
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
  extend type Query {
    topPosts(count: Int): [Post]
  }

  type Post @key(fields: "pid") @auth(requires: USER) {
    pid: ID!
    author: User
  }

  type User @key(fields: "id") @extends {
    id: ID! @external
    topPosts(count: Int!): [Post]
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
            return {
              'x-user': headers['x-user']
            }
          }
        }, {
          name: 'post',
          url: `http://localhost:${postServicePort}/graphql`,
          rewriteHeaders: (headers, context) => {
            return {
              'x-user': headers['x-user']
            }
          }
        }
      ]
    }
  })

  gateway.register(mercuriusAuth, {
    authContext (context) {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    async applyPolicy (policy, parent, args, context, info) {
      return policy.requires.includes(context.auth.identity)
    },
    mode: 'external',
    policy: {
      Query: {
        me: { requires: ['admin'] },
        topPost: { requires: ['admin', 'user'] }
      },
      User: {
        __typePolicy: { requires: ['admin'] }
      },
      Post: {
        __typePolicy: { requires: ['admin', 'user'] }
      }
    }
  })

  return gateway
}

t.test('gateway', t => {
  t.plan(1)

  t.test('external policy', t => {
    t.plan(2)

    t.test('gateway - should protect the schema as normal', async (t) => {
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
          'x-user': 'admin'
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

    t.test('gateway - should protect the schema, user object protected', async (t) => {
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
                column: 9
              }
            ],
            path: [
              'me'
            ]
          },
          {
            message: 'Failed auth policy check on name',
            locations: [
              {
                line: 10,
                column: 13
              }
            ],
            path: [
              'topPosts',
              '0',
              'author',
              'name'
            ]
          },
          {
            message: 'Failed auth policy check on name',
            locations: [
              {
                line: 10,
                column: 13
              }
            ],
            path: [
              'topPosts',
              '1',
              'author',
              'name'
            ]
          },
          {
            message: 'Failed auth policy check on id',
            locations: [
              {
                line: 9,
                column: 13
              }
            ],
            path: [
              'topPosts',
              '0',
              'author',
              'id'
            ]
          },
          {
            message: 'Failed auth policy check on id',
            locations: [
              {
                line: 9,
                column: 13
              }
            ],
            path: [
              'topPosts',
              '1',
              'author',
              'id'
            ]
          }
        ]
      })
    })
  })
})

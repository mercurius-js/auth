'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { mercuriusFederationPlugin } = require('@mercuriusjs/federation')
const mercuriusGateway = require('@mercuriusjs/gateway')
const mercuriusAuth = require('..')

async function createTestService (t, schema, resolvers = {}) {
  const service = Fastify()
  service.register(mercuriusFederationPlugin, {
    schema,
    resolvers
  })
  await service.listen({ port: 0 })
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

async function createTestGatewayServer (t, authOpts) {
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
    type Post @key(fields: "pid") {
      pid: ID!
      author: User
    }

    extend type Query {
      topPosts(count: Int): [Post]
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
  gateway.register(mercuriusGateway, {
    gateway: {
      services: [{
        name: 'user',
        url: `http://127.0.0.1:${userServicePort}/graphql`
      }, {
        name: 'post',
        url: `http://127.0.0.1:${postServicePort}/graphql`
      }]
    }
  })

  gateway.register(mercuriusAuth, authOpts || {
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
        name: { requires: 'admin' }
      },
      Post: {
        author: { requires: 'admin' }
      },
      Query: {
        topPosts: { requires: 'admin' }
      }
    }
  })
  return gateway
}

t.test('gateway - external policy', t => {
  t.plan(3)

  t.test('should protect the schema as normal if everything is okay', async (t) => {
    t.plan(1)

    const app = await createTestGatewayServer(t)

    const query = `query {
    me {
      id
      name
      nickname: name
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
      headers: { 'content-type': 'application/json', 'x-user': 'admin' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(res.body), {
      data: {
        me: {
          id: 'u1',
          name: 'John',
          nickname: 'John',
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

  t.test('should protect the schema if everything is not okay', async (t) => {
    t.plan(1)
    const app = await createTestGatewayServer(t)

    const query = `query {
      me {
        id
        name
        nickname: name
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
      headers: { 'content-type': 'application/json', 'x-user': 'user' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(res.body), {
      data: {
        me: {
          id: 'u1',
          name: null,
          nickname: null,
          topPosts: [
            {
              pid: 'p1',
              author: null
            },
            {
              pid: 'p3',
              author: null
            }
          ]
        },
        topPosts: null
      },
      errors: [
        { message: 'Failed auth policy check on topPosts', locations: [{ line: 13, column: 7 }], path: ['topPosts'] },
        { message: 'Failed auth policy check on name', locations: [{ line: 4, column: 9 }], path: ['me', 'name'] },
        { message: 'Failed auth policy check on name', locations: [{ line: 5, column: 9 }], path: ['me', 'nickname'] },
        { message: 'Failed auth policy check on author', locations: [{ line: 8, column: 11 }], path: ['me', 'topPosts', 0, 'author'] },
        { message: 'Failed auth policy check on author', locations: [{ line: 8, column: 11 }], path: ['me', 'topPosts', 1, 'author'] }
      ]
    })
  })

  t.test('should handle custom errors', async (t) => {
    t.plan(1)
    const app = await createTestGatewayServer(t, {
      authContext (context) {
        return {
          identity: context.reply.request.headers['x-user']
        }
      },
      async applyPolicy (policy, parent, args, context, info) {
        if (!context.auth.identity.includes(policy.requires)) {
          return new Error(`custom auth error on ${info.fieldName}`)
        }
        return true
      },
      mode: 'external',
      policy: {
        User: {
          name: { requires: 'admin' }
        },
        Post: {
          author: { requires: 'admin' }
        },
        Query: {
          topPosts: { requires: 'admin' }
        }
      }
    })

    const query = `query {
      me {
        id
        name
        nickname: name
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
      headers: { 'content-type': 'application/json', 'x-user': 'user' },
      url: '/graphql',
      body: JSON.stringify({ query })
    })

    t.same(JSON.parse(res.body), {
      data: {
        me: {
          id: 'u1',
          name: null,
          nickname: null,
          topPosts: [
            {
              pid: 'p1',
              author: null
            },
            {
              pid: 'p3',
              author: null
            }
          ]
        },
        topPosts: null
      },
      errors: [
        { message: 'custom auth error on topPosts', locations: [{ line: 13, column: 7 }], path: ['topPosts'] },
        { message: 'custom auth error on name', locations: [{ line: 4, column: 9 }], path: ['me', 'name'] },
        { message: 'custom auth error on name', locations: [{ line: 5, column: 9 }], path: ['me', 'nickname'] },
        { message: 'custom auth error on author', locations: [{ line: 8, column: 11 }], path: ['me', 'topPosts', 0, 'author'] },
        { message: 'custom auth error on author', locations: [{ line: 8, column: 11 }], path: ['me', 'topPosts', 1, 'author'] }
      ]
    })
  })
})

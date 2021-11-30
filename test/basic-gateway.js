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

async function createTestGatewayServer (t, authOpts) {
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
    me: User
  }

  type User @key(fields: "id") {
    id: ID! @notUsed
    name: String @auth(requires: ADMIN) @notUsed
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

  type Post @key(fields: "pid") {
    pid: ID!
    author: User @auth(requires: ADMIN)
  }

  extend type Query {
    topPosts(count: Int): [Post] @auth(requires: ADMIN)
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
      services: [{
        name: 'user',
        url: `http://localhost:${userServicePort}/graphql`
      }, {
        name: 'post',
        url: `http://localhost:${postServicePort}/graphql`
      }]
    }
  })

  gateway.register(mercuriusAuth, authOpts || {
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
  return gateway
}

test('gateway - should protect the schema as normal if everything is okay', async (t) => {
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

test('gateway - should protect the schema if everything is not okay', async (t) => {
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
      { message: 'Failed auth policy check on topPosts', locations: [{ line: 13, column: 3 }], path: ['topPosts'] },
      { message: 'Failed auth policy check on name', locations: [{ line: 4, column: 5 }], path: ['me', 'name'] },
      { message: 'Failed auth policy check on name', locations: [{ line: 5, column: 5 }], path: ['me', 'nickname'] },
      { message: 'Failed auth policy check on author', locations: [{ line: 8, column: 7 }], path: ['me', 'topPosts', 0, 'author'] },
      { message: 'Failed auth policy check on author', locations: [{ line: 8, column: 7 }], path: ['me', 'topPosts', 1, 'author'] }
    ]
  })
})

test('gateway - should handle custom errors', async (t) => {
  t.plan(1)
  const app = await createTestGatewayServer(t, {
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
      { message: 'custom auth error on topPosts', locations: [{ line: 13, column: 3 }], path: ['topPosts'] },
      { message: 'custom auth error on name', locations: [{ line: 4, column: 5 }], path: ['me', 'name'] },
      { message: 'custom auth error on name', locations: [{ line: 5, column: 5 }], path: ['me', 'nickname'] },
      { message: 'custom auth error on author', locations: [{ line: 8, column: 7 }], path: ['me', 'topPosts', 0, 'author'] },
      { message: 'custom auth error on author', locations: [{ line: 8, column: 7 }], path: ['me', 'topPosts', 1, 'author'] }
    ]
  })
})

test('gateway - should handle when auth context is not defined', async (t) => {
  t.plan(1)
  const app = await createTestGatewayServer(t, {
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      if (context.other.identity !== 'admin') {
        return new Error(`custom auth error on ${info.fieldName}`)
      }
      return true
    },
    authDirective: 'auth'
  })

  app.graphql.addHook('preGatewayExecution', async (schema, document, context, service) => {
    Object.assign(context, {
      other: {
        identity: context.reply.request.headers['x-user']
      }
    })
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

test('gateway - should filter the schema output', async (t) => {
  t.plan(4)

  const order = [
    'topPosts',
    'name',
    'author'
  ]

  const app = await createTestGatewayServer(t, {
    filterSchema: true,
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      t.equal(info.fieldName, order.shift())
      return false
    },
    authDirective: 'auth'
  })

  const query = `{
    __type(name: "Query") {
      name
      fields {
        name
      }
    }
  }`

  const res = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user': 'admin' },
    url: '/graphql',
    body: JSON.stringify({ query })
  })

  t.same(res.json(), {
    data: {
      __type: {
        name: 'Query',
        fields: [
          {
            name: 'me'
          }
        ]
      }
    }
  })
})

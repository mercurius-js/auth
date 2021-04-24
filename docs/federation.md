# Federation

The auth plugin also works in the Mercurius gateway. Federated services must implement the auth directive within their schemas but do not need the auth plugin registered. When registering the auth plugin on the gateway server, it will need to load the same auth directive that the federated services both use.

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

async function createService (schema, resolvers = {}) {
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

async function start (authOpts) {
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
  const [, userServicePort] = await createService(userServiceSchema, userServiceResolvers)

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
  const [, postServicePort] = await createService(postServiceSchema, postServiceResolvers)

  const gateway = Fastify()

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

  await gateway.listen(3000)
}

start()
```

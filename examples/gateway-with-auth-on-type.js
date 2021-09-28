'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

async function createService (schema, resolvers = {}) {
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
      return chk.includes(requires)
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

async function start () {
  // User service
  // note that we have a auth of USER on the User type and another auth of ADMIN on the name
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

  type User @key(fields: "id") @auth(requires: USER) {
    id: ID!
    name: String @auth(requires: ADMIN)
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
  // here we are protecting the Post type with USER
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

  type Post @key(fields: "pid") @auth(requires: USER) {
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
      }]
    },
    graphiql: true
  })

  await gateway.listen(3000)
}

start()

'use strict'

const Fastify = require('fastify')
const { GraphQLDirective } = require('graphql')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

const app = Fastify()

const schema = `
  directive @auth1 on OBJECT | FIELD_DEFINITION

  directive @auth2 on OBJECT | FIELD_DEFINITION

  enum Role {
    ADMIN
    REVIEWER
    USER
    UNKNOWN
  }

  type Query {
    add(x: Int, y: Int): Int @auth1
    subtract(x: Int, y: Int): Int @auth2
  }
`

const resolvers = {
  Query: {
    add: async (_, { x, y }) => x + y,
    subtract: async (_, { x, y }) => x - y
  }
}

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
    return context.auth.identity.includes('user')
  },
  authDirective: new GraphQLDirective({ name: 'auth1', locations: [] })
})

app.register(mercuriusAuth, {
  async applyPolicy (authDirectiveAST, parent, args, context, info) {
    return context.auth.identity === 'super-user'
  },
  authDirective: new GraphQLDirective({ name: 'auth2', locations: [] })
})

app.listen(3000)

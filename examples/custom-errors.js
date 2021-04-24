'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const app = Fastify()

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
    add(x: Int, y: Int): Int @auth(requires: USER)
  }
`

const resolvers = {
  Query: {
    add: async (_, { x, y }) => x + y
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
    if (context.auth.identity !== 'admin') {
      return new Error(`custom auth error on ${info.fieldName}`)
    }
    return true
  },
  authDirective: 'auth'
})

app.listen(3000)

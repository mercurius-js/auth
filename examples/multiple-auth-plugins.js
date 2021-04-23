'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const app = Fastify()

const authDirective1 = 'directive @auth1 on OBJECT | FIELD_DEFINITION'

const authDirective2 = 'directive @auth2 on OBJECT | FIELD_DEFINITION'

const schema = `
${authDirective1}

${authDirective2}

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
  authDirective: authDirective1
})

app.register(mercuriusAuth, {
  async applyPolicy (authDirectiveAST, parent, args, context, info) {
    return context.auth.identity === 'super-user'
  },
  authDirective: authDirective2
})

app.listen(3000)

'use strict'

const Fastify = require('fastify')
const { GraphQLDirective } = require('graphql')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

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

async function start () {
  const app = Fastify()

  app.register(mercurius, {
    schema,
    resolvers
  })

  await app.register(mercuriusAuth, {
    async applyPolicy (authDirectiveAST, parent, args, context, info) {
      return context.other.identity === 'admin'
    },
    authDirective: new GraphQLDirective({ name: 'auth', locations: [] })
  })

  app.graphql.addHook('preExecution', async (schema, document, context) => {
    context.other = {
      identity: context.reply.request.headers['x-user']
    }
  })

  app.listen(3000)
}

start()

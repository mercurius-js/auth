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

  type Message {
    title: String!
    public: String!
    private: String @auth(requires: ADMIN)
  }

  type Query {
    add(x: Int, y: Int): Int @auth(requires: ADMIN)
    subtract(x: Int, y: Int): Int
    messages: [Message!]!
    adminMessages: [Message!] @auth(requires: ADMIN)
  }
`

const resolvers = {
  Query: {
    add: async (_, obj) => {
      const { x, y } = obj
      return x + y
    },
    subtract: async (_, obj) => {
      const { x, y } = obj
      return x - y
    },
    messages: async () => {
      return [
        {
          title: 'one',
          public: 'public one',
          private: 'private one'
        },
        {
          title: 'two',
          public: 'public two',
          private: 'private two'
        }
      ]
    },
    adminMessages: async () => {
      return [
        {
          title: 'admin one',
          public: 'admin public one',
          private: 'admin private one'
        },
        {
          title: 'admin two',
          public: 'admin public two',
          private: 'admin private two'
        }
      ]
    }
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
      return context.auth.identity === 'admin'
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

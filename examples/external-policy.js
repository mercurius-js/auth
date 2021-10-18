'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const app = Fastify()

const schema = `
  type Message {
    title: String
    message: String
    adminMessage: String
  }

  type Query {
    messages: [Message]
    message(title: String): Message
  }
`

const messages = [
  {
    title: 'one',
    message: 'one',
    adminMessage: 'admin message one'
  },
  {
    title: 'two',
    message: 'two',
    adminMessage: 'admin message two'
  }
]

const resolvers = {
  Query: {
    messages: async (parent, args, context, info) => {
      return messages
    },
    message: async (parent, args, context, info) => {
      return messages.find(message => message.title === args.title)
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers
})

app.register(mercuriusAuth, {
  authContext (context) {
    const permissions = context.reply.request.headers['x-user'] || ''
    return { permissions }
  },
  async applyPolicy (policy, parent, args, context, info) {
    return context.auth.permissions.includes(policy.requires)
  },
  mode: 'external',
  policy: {
    Message: {
      __typePolicy: { requires: 'user' },
      adminMessage: { requires: 'admin' }
    },
    Query: {
      messages: { requires: 'user' }
    }
  }
})

app.listen(3000)

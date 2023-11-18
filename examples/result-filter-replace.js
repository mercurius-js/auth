'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const app = Fastify()

const schema = `
    directive @filterData (disallow: String!) on FIELD_DEFINITION

    type Message {
      message: String!
      notes: String @filterData (disallow: "no-read-notes")
    }
    
    type Query {
      publicMessages: [Message!]
    }
`

const messages = [
  {
    title: 'one',
    message: 'acme one',
    notes: 'acme one',
    password: 'acme-one'
  },
  {
    title: 'two',
    message: 'acme two',
    notes: 'acme two',
    password: 'acme-two'
  }
]

const resolvers = {
  Query: {
    publicMessages: async (parent, args, context, info) => {
      return messages
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers
})

app.register(mercuriusAuth, {
  authContext (context) {
    const headerValue = context.reply.request.headers['x-permission']
    return { permission: headerValue ? headerValue.split(',') : [] }
  },
  async applyPolicy (authDirectiveAST, parent, args, context, info) {
    const notNeeded = authDirectiveAST.arguments.find(arg => arg.name.value === 'disallow').value.value

    return !context.auth.permission.includes(notNeeded)
  },
  outputPolicyErrors: {
    enabled: false
  },
  filterSchema: true,
  authDirective: 'filterData'
})

app.listen({ port: 3000 })

'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const app = Fastify()

const orgMembers = {
  acme: ['alice'],
  other: ['alice', 'bob']
}

const authDirective = 'directive @orgAuth on OBJECT | FIELD_DEFINITION'

const schema = `
  ${authDirective}

  type Message {
    title: String!
    message: String!
  }

  type Query {
    messages(org: String!): [Message!] @orgAuth
  }
`

const messages = {
  acme: [
    {
      title: 'one',
      message: 'acme one'
    },
    {
      title: 'two',
      message: 'acme two'
    }
  ],
  other: [
    {
      title: 'one',
      message: 'other one'
    },
    {
      title: 'two',
      message: 'other two'
    }
  ]
}

const resolvers = {
  Query: {
    messages: async (parent, args, context, info) => {
      return messages[args.org]
    }
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
    const requestedOrg = args.org
    const username = context.auth.identity

    if (orgMembers[requestedOrg]) {
      const result = orgMembers[requestedOrg].includes(username)
      if (!result) {
        throw new Error(`Insufficient access: user ${username} not a member of ${requestedOrg}`)
      }
      return true
    }
    return false
  },
  authDirective
})

app.listen(3000)

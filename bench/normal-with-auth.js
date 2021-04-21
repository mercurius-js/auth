'use strict'

const Fastify = require('fastify')
const { GraphQLDirective } = require('graphql')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')
const { schema, resolvers } = require('./normal-setup')

const app = Fastify()

app.register(mercurius, {
  schema,
  resolvers,
  graphiql: false,
  jit: 1
})

app.register(mercuriusAuth, {
  authContext (context) {
    return {
      identity: context.reply.request.headers['x-user']
    }
  },
  async applyPolicy (authDirectiveAST, parent, args, context, info) {
    return context.auth.identity === 'admin'
  },
  authDirective: new GraphQLDirective({ name: 'auth', locations: [] })
})

app.listen(3000)

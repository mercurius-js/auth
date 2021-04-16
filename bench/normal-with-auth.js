'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')
const { schema, resolvers } = require('./normal-setup')

const app = Fastify()

app.register(mercurius, {
  schema,
  resolvers
})

app.register(mercuriusAuth, {
  authContext: (context) => {
    return {
      identity: context.reply.request.headers['x-user']
    }
  },
  applyPolicy: async (authPolicy, context) => {
    return context.auth.identity === 'admin'
  }
})

app.listen(3000)

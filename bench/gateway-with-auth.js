'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const app = Fastify()

app.register(mercurius, {
  gateway: {
    services: [{
      name: 'user',
      url: 'http://localhost:3001/graphql'
    }, {
      name: 'post',
      url: 'http://localhost:3002/graphql'
    }]
  },
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
  authDirective: 'auth'
})

app.listen(3000)

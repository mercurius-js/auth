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
  }
})

app.register(mercuriusAuth, {
  authContext: (context) => {
    return {
      identity: context.reply.request.headers['x-user']
    }
  },
  applyPolicy: async (authDirectiveAST, context, field) => {
    return context.auth.identity === 'admin'
  }
})

app.listen(3000)

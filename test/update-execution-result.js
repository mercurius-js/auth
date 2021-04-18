'use strict'

const { test } = require('tap')
const Auth = require('../lib/auth')
const { GraphQLDirective, GraphQLError } = require('graphql')
const { kAuthErrors } = require('../lib/symbols')

test('update execution result - should handle when data is null', async (t) => {
  t.plan(1)

  const opts = {
    authContext: (context) => {
      return {
        identity: context.reply.request.headers['x-user']
      }
    },
    applyPolicy: async (authDirectiveAST, context, field) => {
      return context.auth.identity === 'admin'
    },
    authDirective: new GraphQLDirective({ name: 'auth', locations: [] })
  }

  const auth = new Auth(opts)

  const context = {
    [kAuthErrors]: [
      new GraphQLError('auth kaboom', undefined, undefined, [1])
    ]
  }
  const execution = {
    data: null,
    errors: [{
      message: 'kaboom'
    }]
  }
  await auth.updateExecutionResultHook(execution, context)

  t.same(execution, {
    data: null,
    errors: [{
      message: 'kaboom'
    }]
  })
})

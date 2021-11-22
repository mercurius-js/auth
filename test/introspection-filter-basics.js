'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const queryObjectMessage = `{
  __type(name: "Message") {
    name
    fields {
      name
    }
  }
}`

test('mixed directives: one filtered out and one not', async (t) => {
  t.plan(3)
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @hideMe on FIELD_DEFINITION
    directive @showMe on FIELD_DEFINITION

    type Message {
      message: String @showMe
      password: String @hideMe
    }

    type Query {
      publicMessages(org: String): [Message!]
    }
    `
  })

  app.register(mercuriusAuth, {
    filterSchema: true,
    authDirective: 'hideMe',
    applyPolicy: async () => {
      t.pass('should be called on an introspection query')
      return false
    }
  })

  app.register(mercuriusAuth, {
    filterSchema: false,
    authDirective: 'showMe',
    applyPolicy: async () => {
      t.fail('should not be called on an introspection query')
      return true
    }
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query: queryObjectMessage })
  })

  t.same(response.json(), {
    data: {
      __type: {
        name: 'Message',
        fields: [
          { name: 'message' }
        ]
      }
    }
  })

  checkInternals(t, app, { directives: 1 })
})

test('multiple filtered directives on different contexts', async (t) => {
  t.plan(6)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @root on FIELD_DEFINITION
    directive @child on FIELD_DEFINITION
    directive @subChild on FIELD_DEFINITION

    type Message {
      message: String @root
      password: String @child
      title: String @subChild
    }

    type Query {
      publicMessages(org: String): [Message!] @subChild
    }
    `
  })

  app.register(mercuriusAuth, {
    filterSchema: true,
    authDirective: 'root',
    applyPolicy: async () => {
      t.pass('root called')
      return false
    }
  })

  app.register(function plugin (instance, opts, next) {
    instance.register(mercuriusAuth, {
      filterSchema: true,
      authDirective: 'child',
      applyPolicy: async () => {
        t.pass('child called')
        return false
      }
    })

    instance.register(function plugin (instance, opts, next) {
      instance.register(mercuriusAuth, {
        filterSchema: true,
        authDirective: 'subChild',
        applyPolicy: async () => {
          t.pass('subChild called twice because it appears on two different fields')
          return true
        }
      })
      next()
    })

    next()
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query: queryObjectMessage })
  })

  t.same(response.json(), {
    data: {
      __type: {
        name: 'Message',
        fields: [
          { name: 'title' }
        ]
      }
    }
  })

  checkInternals(t, app, { directives: 3 })
})

function checkInternals (t, app, { directives }) {
  const checkGrouping = Object.getOwnPropertySymbols(app)
  const groupSym = checkGrouping.find(sym => sym.toString().includes('mercurius-auth.filtering.group'))
  t.equal(app[groupSym].length, directives)
}

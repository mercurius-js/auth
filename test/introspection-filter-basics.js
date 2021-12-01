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

const queryListByType = `{
  __type(name:"Query"){
    name
    fields{
      name
    }
  }
}`

const queryArguments = `{
  __type(name: "Query") {
    name
    fields {
      name
      args {
        name
      }
    }
  }
}`

const queryListAll = `{
  __schema {
    types {
      name
      kind
    }
  }
}`

const queryEnumValues = `{
  __type(name: "Role") {
    kind
    name
    enumValues {
      name
    }
  }
}`

const queryInputFields = `{
  __type(name: "Query") {
    kind
    name
    fields {
      name
      args {
        name
        type {
          name
          inputFields {
            name
          }
        }
      }
    }
  }
}
`

test('TypeSystemDirectiveLocation: OBJECT', async (t) => {
  t.plan(3)
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @hideMe on OBJECT

    type Message @hideMe {
      message: String
      password: String
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

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query: queryObjectMessage })
  })

  t.same(response.json(), {
    data: {
      __type: null
    }
  })

  checkInternals(t, app, { directives: 1 })
})

test('TypeSystemDirectiveLocation: ARGUMENT_DEFINITION', { todo: 'not supported. Need FilterInputObjectFields' }, async (t) => {
  t.plan(3)
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @hideMe on ARGUMENT_DEFINITION

    type Message {
      message: String
      password: String
    }

    type Query {
      publicMessages(org: String @hideMe): [Message!]
    }`
  })

  app.register(mercuriusAuth, {
    filterSchema: true,
    authDirective: 'hideMe',
    applyPolicy: async () => {
      t.pass('should be called on an introspection query')
      return false
    }
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query: queryArguments })
  })

  t.same(response.json(), {
    data: {
      __type: {
        name: 'Query',
        fields: [
          {
            name: 'publicMessages',
            args: null
          }
        ]
      }
    }
  })

  checkInternals(t, app, { directives: 1 })
})

test('TypeSystemDirectiveLocation: INTERFACE', async (t) => {
  t.plan(3)
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @hideMe on INTERFACE

    interface BasicMessage @hideMe {
      message: String
    }

    type Message implements BasicMessage {
      title: String
      message: String
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

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query: queryListAll })
  })
  t.notOk(response.json().data.__schema.types.find(({ name }) => name === 'BasicMessage'), 'should not have BasicMessage')
  checkInternals(t, app, { directives: 1 })
})

test('TypeSystemDirectiveLocation: UNION', async (t) => {
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @unionCheck on UNION | FIELD_DEFINITION

    type Message {
      title: String!
      password: String @unionCheck
    }

    type SimpleMessage {
      title: String!
      message: String
    }

    union MessageUnion @unionCheck = Message | SimpleMessage
  
    type Query {
      publicMessages(org: String): [MessageUnion!]
    }
    `
  })

  app.register(mercuriusAuth, {
    applyPolicy: async function hasRolePolicy (authDirectiveAST, parent, args, context, info) {
      return context.reply.request.headers['x-union'] === 'show'
    },
    filterSchema: true,
    authDirective: 'unionCheck'
  })

  ;[
    {
      name: 'show UNION type',
      query: queryListByType,
      headers: {
        'x-union': 'show'
      },
      result: {
        data: {
          __type: {
            name: 'Query',
            fields: [
              { name: 'publicMessages' }
            ]
          }
        }
      }
    },
    {
      name: 'hide UNION type',
      query: queryListByType,
      headers: {
        'x-union': 'hide'
      },
      result: {
        data: {
          __type: {
            name: 'Query',
            fields: []
          }
        }
      }
    },
    {
      name: 'show UNION type',
      query: queryObjectMessage,
      headers: {
        'x-union': 'show'
      },
      result: {
        data: {
          __type: {
            name: 'Message',
            fields: [
              { name: 'title' },
              { name: 'password' }
            ]
          }
        }
      }
    },
    {
      name: 'hide UNION type - cannot access to this type',
      query: queryObjectMessage,
      headers: {
        'x-union': 'hide'
      },
      result: {
        data: {
          __type: null
        }
      }
    }
  ].forEach(({ name, query, result, headers }) => {
    t.test(name, async t => {
      t.plan(1)
      const response = await app.inject({
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        url: '/graphql',
        body: JSON.stringify({ query })
      })

      if (typeof result !== 'function') {
        t.same(response.json(), result)
      } else {
        t.test('response', t => {
          result(t, response.json())
        })
      }
    })
  })
})

test('TypeSystemDirectiveLocation: ENUM_VALUE', { todo: 'not supported. Need TransformEnumValues' }, async (t) => {
  t.plan(3)
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @hideMe on ENUM_VALUE

    enum Role {
      ADMIN
      REVIEWER
      USER
      SECRET @hideMe
    }

    type Query {
      publicMessages(org: String): [String!]
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

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query: queryEnumValues })
  })

  require('fs').writeFileSync('./asd.json', JSON.stringify(response.json(), null, 2))

  t.same(response.json(), {
    data: {
      __type: {
        kind: 'ENUM',
        name: 'Role',
        enumValues: [
          { name: 'ADMIN' },
          { name: 'REVIEWER' },
          { name: 'USER' }
        ]
      }
    }
  })

  checkInternals(t, app, { directives: 1 })
})

test('TypeSystemDirectiveLocation: INPUT_OBJECT', async (t) => {
  t.plan(3)
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @hideMe on INPUT_OBJECT

    input MessageInput @hideMe {
      message: String
      password: String
    }

    type Query {
      publicMessages(org: MessageInput): [String!]
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

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query: queryInputFields })
  })

  t.same(response.json(), {
    data: {
      __type: {
        kind: 'OBJECT',
        name: 'Query',
        fields: [
          {
            name: 'publicMessages',
            args: []
          }
        ]
      }
    }
  })

  checkInternals(t, app, { directives: 1 })
})

test('TypeSystemDirectiveLocation: INPUT_FIELD_DEFINITION', async (t) => {
  t.plan(3)
  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @hideMe on INPUT_FIELD_DEFINITION

    input MessageInput {
      message: String!
      password: String @hideMe
    }

    type Query {
      publicMessages(org: MessageInput): [String!]
    }`
  })

  app.register(mercuriusAuth, {
    filterSchema: true,
    authDirective: 'hideMe',
    applyPolicy: async () => {
      t.pass('should be called on an introspection query')
      return false
    }
  })

  const response = await app.inject({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    url: '/graphql',
    body: JSON.stringify({ query: queryInputFields })
  })

  t.same(response.json(), {
    data: {
      __type: {
        kind: 'OBJECT',
        name: 'Query',
        fields: [
          {
            name: 'publicMessages',
            args: []
          }
        ]
      }
    }
  })

  checkInternals(t, app, { directives: 1 })
})

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

test('repeatable directive', async (t) => {
  t.plan(5)

  const app = Fastify()
  t.teardown(app.close.bind(app))

  app.register(mercurius, {
    schema: `
    directive @counter repeatable on FIELD_DEFINITION

    type Message {
      title: String
      message: String @counter @counter @counter
    }

    type Query {
      publicMessages(org: String): [Message!]
    }`
  })

  app.register(mercuriusAuth, {
    filterSchema: true,
    authDirective: 'counter',
    applyPolicy: async () => {
      t.pass('should be called three times')
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
          { name: 'title' },
          { name: 'message' }
        ]
      }
    }
  })

  checkInternals(t, app, { directives: 1 })
})

function checkInternals (t, app, { directives }) {
  const checkGrouping = Object.getOwnPropertySymbols(app)
  const groupSym = checkGrouping.find(sym => sym.toString().includes('mercurius-auth.filtering.group'))
  t.equal(app[groupSym].length, directives)
}

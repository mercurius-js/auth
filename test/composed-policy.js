'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')
const { composeDirectivePolicy, composeExternalPolicy, composeDirectiveSdl } = require('..')
const { MER_AUTH_ERR_INVALID_OPTS } = require('../lib/errors')

// A self-contained check for these tests: a required `scope`, judged against the
// scopes the caller holds (sent as a comma separated `x-scopes` header). This
// stands in for any application check, which the plugin knows nothing about.
const heldScopes = context => {
  const scopes = context.reply.request.headers['x-scopes']
  return typeof scopes === 'string' ? scopes.split(',').filter(Boolean) : []
}

const parseScopeCheck = node => {
  if (node.kind !== 'ObjectValue') {
    throw new Error('each check must be an object')
  }
  const scope = node.fields.find(field => field.name.value === 'scope')
  if (scope?.value.kind !== 'StringValue' || scope.value.value === '') {
    throw new Error('each check requires a non-empty scope')
  }
  return { scope: scope.value.value }
}

const evaluateScopeCheck = (check, scopes) => scopes.includes(check.scope)

const scopeCheckOptions = {
  checkInput: 'scope: String!',
  parseCheck: parseScopeCheck,
  prepare: heldScopes,
  evaluate: evaluateScopeCheck
}

const query = (app, selection, scopes) => app.inject({
  method: 'POST',
  url: '/graphql',
  headers: {
    'content-type': 'application/json',
    ...(typeof scopes === 'string' ? { 'x-scopes': scopes } : {})
  },
  body: JSON.stringify({ query: `query { ${selection} }` })
}).then(response => JSON.parse(response.body))

const buildDirectiveApp = async (t, opts) => {
  const app = Fastify()
  t.after(() => app.close())

  const { applyPolicy, sdl, authDirective } = composeDirectivePolicy({ ...scopeCheckOptions, ...opts })

  app.register(mercurius, {
    schema: `
    ${sdl}

    type Query {
      anyScope: Boolean @auth(checks: [{ scope: "a" }, { scope: "b" }], relation: OR)
      everyScope: Boolean @auth(checks: [{ scope: "a" }, { scope: "b" }], relation: AND)
      unqualified: Boolean @auth(checks: [{ scope: "a" }, { scope: "b" }])
      repeated: Boolean @auth(checks: [{ scope: "a" }]) @auth(checks: [{ scope: "b" }])
      noChecks: Boolean @auth(checks: [])
      malformed: Boolean @auth(checks: [{ scope: "" }])
      unprotected: Boolean
    }
`,
    resolvers: {
      Query: {
        anyScope: async () => true,
        everyScope: async () => true,
        unqualified: async () => true,
        repeated: async () => true,
        noChecks: async () => true,
        malformed: async () => true,
        unprotected: async () => true
      }
    }
  })
  app.register(mercuriusAuth, { mode: 'directive', authDirective, applyPolicy })

  await app.ready()
  return app
}

const buildExternalApp = async (t, policy, opts) => {
  const app = Fastify()
  t.after(() => app.close())

  const { applyPolicy } = composeExternalPolicy({
    prepare: heldScopes,
    evaluate: evaluateScopeCheck,
    ...opts
  })

  app.register(mercurius, {
    schema: `
    type Query {
      anyScope: Boolean
      everyScope: Boolean
    }
`,
    resolvers: {
      Query: {
        anyScope: async () => true,
        everyScope: async () => true
      }
    }
  })
  app.register(mercuriusAuth, { mode: 'external', applyPolicy, policy })

  await app.ready()
  return app
}

test('composed directive policy - OR grants when any check passes and denies when none do', async (t) => {
  t.plan(2)

  const app = await buildDirectiveApp(t)

  t.assert.deepStrictEqual(await query(app, 'anyScope', 'b,c'), {
    data: { anyScope: true }
  })
  t.assert.deepStrictEqual((await query(app, 'anyScope', 'c')).errors[0].message, 'Failed auth policy check on anyScope')
})

test('composed directive policy - AND grants only when every check passes', async (t) => {
  t.plan(2)

  const app = await buildDirectiveApp(t)

  t.assert.deepStrictEqual(await query(app, 'everyScope', 'a,b'), {
    data: { everyScope: true }
  })
  t.assert.deepStrictEqual((await query(app, 'everyScope', 'a')).errors[0].message, 'Failed auth policy check on everyScope')
})

test('composed directive policy - an omitted relation defaults to OR', async (t) => {
  t.plan(1)

  const app = await buildDirectiveApp(t)

  t.assert.deepStrictEqual(await query(app, 'unqualified', 'a'), {
    data: { unqualified: true }
  })
})

test('composed directive policy - defaultRelation applies to a field with no relation', async (t) => {
  t.plan(2)

  const app = await buildDirectiveApp(t, { defaultRelation: 'and' })

  t.assert.deepStrictEqual((await query(app, 'unqualified', 'a')).errors[0].message, 'Failed auth policy check on unqualified')
  t.assert.deepStrictEqual(await query(app, 'unqualified', 'a,b'), {
    data: { unqualified: true }
  })
})

test('composed directive policy - repeating the directive ANDs the composed policies', async (t) => {
  t.plan(2)

  const app = await buildDirectiveApp(t)

  t.assert.deepStrictEqual(await query(app, 'repeated', 'a,b'), {
    data: { repeated: true }
  })
  t.assert.deepStrictEqual((await query(app, 'repeated', 'a')).errors[0].message, 'Failed auth policy check on repeated')
})

test('composed directive policy - an empty checks list denies', async (t) => {
  t.plan(1)

  const app = await buildDirectiveApp(t)

  t.assert.deepStrictEqual((await query(app, 'noChecks', 'a,b')).errors[0].message, 'Failed auth policy check on noChecks')
})

test('composed directive policy - a check parseCheck rejects becomes the field error', async (t) => {
  t.plan(1)

  const app = await buildDirectiveApp(t)

  t.assert.deepStrictEqual((await query(app, 'malformed', 'a')).errors[0].message, 'each check requires a non-empty scope')
})

test('composed directive policy - onDeny replaces the default denial error', async (t) => {
  t.plan(2)

  const app = await buildDirectiveApp(t, {
    onDeny: (context, info) => new Error(`custom auth error on ${info.fieldName}`)
  })

  t.assert.deepStrictEqual((await query(app, 'anyScope', 'c')).errors[0].message, 'custom auth error on anyScope')
  t.assert.deepStrictEqual(await query(app, 'anyScope', 'a'), {
    data: { anyScope: true }
  })
})

test('composed directive policy - a prepare failure is the field error, not a denial', async (t) => {
  t.plan(1)

  const app = await buildDirectiveApp(t, {
    prepare: () => { throw new Error('identity unavailable') },
    onDeny: () => new Error('unauthorized')
  })

  t.assert.deepStrictEqual((await query(app, 'anyScope', 'a')).errors[0].message, 'identity unavailable')
})

test('composed directive policy - enabled: false passes every protected field', async (t) => {
  t.plan(1)

  const app = await buildDirectiveApp(t, { enabled: false })

  t.assert.deepStrictEqual(await query(app, 'everyScope', 'c'), {
    data: { everyScope: true }
  })
})

test('composed directive policy - the checks of a field are parsed once', async (t) => {
  t.plan(3)

  let parsed = 0
  const app = await buildDirectiveApp(t, {
    parseCheck: node => {
      parsed += 1
      return parseScopeCheck(node)
    }
  })

  t.assert.deepStrictEqual(await query(app, 'anyScope', 'a'), { data: { anyScope: true } })
  t.assert.deepStrictEqual(await query(app, 'anyScope', 'a'), { data: { anyScope: true } })
  t.assert.strictEqual(parsed, 2)
})

test('composed directive policy - protects a type', async (t) => {
  t.plan(2)

  const app = Fastify()
  t.after(() => app.close())

  const { applyPolicy, sdl, authDirective } = composeDirectivePolicy(scopeCheckOptions)

  app.register(mercurius, {
    schema: `
    ${sdl}

    type Message @auth(checks: [{ scope: "a" }]) {
      title: String
    }

    type Query {
      message: Message
    }
`,
    resolvers: {
      Query: {
        message: async () => ({ title: 'one' })
      }
    }
  })
  app.register(mercuriusAuth, { mode: 'directive', authDirective, applyPolicy })

  await app.ready()

  t.assert.deepStrictEqual(await query(app, 'message { title }', 'a'), {
    data: { message: { title: 'one' } }
  })
  t.assert.deepStrictEqual((await query(app, 'message { title }', 'b')).errors[0].message, 'Failed auth policy check on title')
})

test('composed external policy - composes AND/OR over the policy values', async (t) => {
  t.plan(4)

  const app = await buildExternalApp(t, {
    Query: {
      anyScope: { checks: [{ scope: 'a' }, { scope: 'b' }], relation: 'or' },
      everyScope: { checks: [{ scope: 'a' }, { scope: 'b' }], relation: 'and' }
    }
  })

  t.assert.deepStrictEqual(await query(app, 'anyScope', 'b'), { data: { anyScope: true } })
  t.assert.deepStrictEqual((await query(app, 'anyScope', 'c')).errors[0].message, 'Failed auth policy check on anyScope')
  t.assert.deepStrictEqual(await query(app, 'everyScope', 'a,b'), { data: { everyScope: true } })
  t.assert.deepStrictEqual((await query(app, 'everyScope', 'a')).errors[0].message, 'Failed auth policy check on everyScope')
})

test('composed external policy - an unknown relation combines as AND', async (t) => {
  t.plan(2)

  const app = await buildExternalApp(t, {
    Query: {
      everyScope: { checks: [{ scope: 'a' }, { scope: 'b' }], relation: 'AND' }
    }
  })

  t.assert.deepStrictEqual((await query(app, 'everyScope', 'a')).errors[0].message, 'Failed auth policy check on everyScope')
  t.assert.deepStrictEqual(await query(app, 'everyScope', 'a,b'), { data: { everyScope: true } })
})

test('composed external policy - defaultRelation applies to a policy with no relation', async (t) => {
  t.plan(2)

  const app = await buildExternalApp(t, {
    Query: {
      everyScope: { checks: [{ scope: 'a' }, { scope: 'b' }] }
    }
  }, { defaultRelation: 'and' })

  t.assert.deepStrictEqual((await query(app, 'everyScope', 'a')).errors[0].message, 'Failed auth policy check on everyScope')
  t.assert.deepStrictEqual(await query(app, 'everyScope', 'a,b'), { data: { everyScope: true } })
})

test('composed external policy - a policy value without checks denies', async (t) => {
  t.plan(2)

  const app = await buildExternalApp(t, {
    Query: {
      anyScope: { checks: [] },
      everyScope: 'user'
    }
  })

  t.assert.deepStrictEqual((await query(app, 'anyScope', 'a')).errors[0].message, 'Failed auth policy check on anyScope')
  t.assert.deepStrictEqual((await query(app, 'everyScope', 'a')).errors[0].message, 'Failed auth policy check on everyScope')
})

test('composed external policy - a check validate rejects becomes the field error', async (t) => {
  t.plan(1)

  const app = await buildExternalApp(t, {
    Query: {
      anyScope: { checks: [{ scope: '' }] }
    }
  }, {
    validate: check => {
      if (check.scope === '') {
        throw new Error('each check requires a non-empty scope')
      }
    }
  })

  t.assert.deepStrictEqual((await query(app, 'anyScope', 'a')).errors[0].message, 'each check requires a non-empty scope')
})

test('composed external policy - the checks of a policy are validated once', async (t) => {
  t.plan(3)

  let validated = 0
  const app = await buildExternalApp(t, {
    Query: {
      anyScope: { checks: [{ scope: 'a' }] }
    }
  }, {
    validate: () => { validated += 1 }
  })

  t.assert.deepStrictEqual(await query(app, 'anyScope', 'a'), { data: { anyScope: true } })
  t.assert.deepStrictEqual(await query(app, 'anyScope', 'a'), { data: { anyScope: true } })
  t.assert.strictEqual(validated, 1)
})

test('composed external policy - without prepare the checks are judged against the context', async (t) => {
  t.plan(2)

  const app = await buildExternalApp(t, {
    Query: {
      anyScope: { checks: [{ scope: 'a' }] }
    }
  }, {
    prepare: undefined,
    evaluate: (check, context) => {
      t.assert.strictEqual(typeof context.reply, 'object')
      return evaluateScopeCheck(check, heldScopes(context))
    }
  })

  t.assert.deepStrictEqual(await query(app, 'anyScope', 'a'), { data: { anyScope: true } })
})

test('composed external policy - enabled: false passes every protected field', async (t) => {
  t.plan(1)

  const app = await buildExternalApp(t, {
    Query: {
      everyScope: { checks: [{ scope: 'a' }], relation: 'and' }
    }
  }, { enabled: false })

  t.assert.deepStrictEqual(await query(app, 'everyScope', 'c'), { data: { everyScope: true } })
})

test('composed directive policy - a directive without arguments denies', async (t) => {
  t.plan(1)

  const { applyPolicy } = composeDirectivePolicy(scopeCheckOptions)
  const authDirectiveAST = { kind: 'Directive', name: { kind: 'Name', value: 'auth' } }

  t.assert.strictEqual(await applyPolicy(authDirectiveAST, {}, {}, {}, { fieldName: 'add' }), false)
})

test('composed directive policy - a relation that is not one of the known enum values falls back', async (t) => {
  t.plan(2)

  const { applyPolicy } = composeDirectivePolicy({ ...scopeCheckOptions, prepare: () => ['a'], defaultRelation: 'and' })
  const directiveAST = relation => ({
    kind: 'Directive',
    name: { kind: 'Name', value: 'auth' },
    arguments: [
      {
        kind: 'Argument',
        name: { kind: 'Name', value: 'checks' },
        value: {
          kind: 'ListValue',
          values: [
            { kind: 'ObjectValue', fields: [{ kind: 'ObjectField', name: { kind: 'Name', value: 'scope' }, value: { kind: 'StringValue', value: 'a' } }] },
            { kind: 'ObjectValue', fields: [{ kind: 'ObjectField', name: { kind: 'Name', value: 'scope' }, value: { kind: 'StringValue', value: 'b' } }] }
          ]
        }
      },
      { kind: 'Argument', name: { kind: 'Name', value: 'relation' }, value: relation }
    ]
  })

  // An unknown enum value, and a value that is not an enum at all: both are
  // treated as unset, so `defaultRelation` decides.
  t.assert.strictEqual(await applyPolicy(directiveAST({ kind: 'EnumValue', value: 'MAYBE' }), {}, {}, {}, { fieldName: 'add' }), false)
  t.assert.strictEqual(await applyPolicy(directiveAST({ kind: 'StringValue', value: 'or' }), {}, {}, {}, { fieldName: 'add' }), false)
})

test('composed directive policy - a parseCheck rejection that is not an Error is a coded policy error', async (t) => {
  t.plan(2)

  const { applyPolicy } = composeDirectivePolicy({
    ...scopeCheckOptions,
    parseCheck: () => { throw 'not an Error' } // eslint-disable-line no-throw-literal
  })
  const authDirectiveAST = {
    kind: 'Directive',
    name: { kind: 'Name', value: 'auth' },
    arguments: [
      {
        kind: 'Argument',
        name: { kind: 'Name', value: 'checks' },
        value: { kind: 'ListValue', values: [{ kind: 'ObjectValue', fields: [] }] }
      }
    ]
  }

  const result = await applyPolicy(authDirectiveAST, {}, {}, {}, { fieldName: 'add' })

  t.assert.strictEqual(result.code, 'MER_AUTH_ERR_INVALID_POLICY')
  t.assert.strictEqual(result.message, 'Invalid auth policy on add: not an Error')
})

test('composed external policy - a prepare failure that is not an Error is a coded policy error', async (t) => {
  t.plan(2)

  const { applyPolicy } = composeExternalPolicy({
    evaluate: evaluateScopeCheck,
    prepare: () => { throw 'not an Error' } // eslint-disable-line no-throw-literal
  })

  const result = await applyPolicy({ checks: [{ scope: 'a' }] }, {}, {}, {}, { fieldName: 'add' })

  t.assert.strictEqual(result.code, 'MER_AUTH_ERR_INVALID_POLICY')
  t.assert.strictEqual(result.message, 'Invalid auth policy on add: not an Error')
})

test('composed directive sdl - names the generated types after the directive', async (t) => {
  t.plan(6)

  const sdl = composeDirectiveSdl()

  t.assert.ok(sdl.includes('enum AuthRelation {'))
  t.assert.ok(sdl.includes('input AuthCheck {'))
  t.assert.ok(sdl.includes('requires: [String!]!'))
  t.assert.ok(sdl.includes('directive @auth('))
  t.assert.ok(sdl.includes('repeatable on OBJECT | FIELD_DEFINITION'))
  t.assert.ok(composeDirectiveSdl('canAccess', 'scope: String!').includes('enum CanAccessRelation {'))
})

test('composed policy options - validates the options', async (t) => {
  const invalid = [
    [composeDirectivePolicy, null, 'opts must be an object.'],
    [composeDirectivePolicy, {}, 'opts.evaluate must be a function.'],
    [composeDirectivePolicy, { evaluate: () => true, prepare: 'nope' }, 'opts.prepare must be a function.'],
    [composeDirectivePolicy, { evaluate: () => true, onDeny: 'nope' }, 'opts.onDeny must be a function.'],
    [composeDirectivePolicy, { evaluate: () => true, defaultRelation: 'OR' }, "opts.defaultRelation must be either 'and' or 'or'."],
    [composeDirectivePolicy, { evaluate: () => true, enabled: 'nope' }, 'opts.enabled must be a boolean.'],
    [composeDirectivePolicy, { evaluate: () => true }, 'opts.parseCheck must be a function.'],
    [composeDirectivePolicy, { evaluate: () => true, parseCheck: () => ({}), authDirective: 1 }, 'opts.authDirective must be a string.'],
    [composeDirectivePolicy, { evaluate: () => true, parseCheck: () => ({}), checkInput: 1 }, 'opts.checkInput must be a string.'],
    [composeExternalPolicy, { evaluate: () => true, validate: 'nope' }, 'opts.validate must be a function.']
  ]

  t.plan(invalid.length)

  for (const [composePolicy, opts, message] of invalid) {
    t.assert.throws(() => composePolicy(opts), new MER_AUTH_ERR_INVALID_OPTS(message))
  }
})

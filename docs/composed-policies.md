# Composed Policies

- [Why](#why)
- [Directive mode](#directive-mode)
- [External Policy mode](#external-policy-mode)
- [Relations](#relations)
- [Nesting checks](#nesting-checks)
- [Errors](#errors)
- [Relation to `@fastify/auth`](#relation-to-fastifyauth)
- [API](#api)

`applyPolicy` is called once per protected field and its single result allows or denies that field. When a field is protected by more than one condition — "an admin **or** the owner of the record" — the combination has to be written by hand in every `applyPolicy`.

The composed policies do that combination for you: you provide a single check and the plugin composes the checks of a field with an `AND`/`OR` relation, the way [`@fastify/auth`](https://github.com/fastify/fastify-auth) composes verifiers for a route. They are built on top of `applyPolicy`, so nothing else about the plugin changes.

The plugin ships **no checks**: what a check contains, and what makes it pass, is entirely yours.

## Why

Composing by hand couples every policy to the shape of its checks:

```js
async applyPolicy (authDirectiveAST, parent, args, context, info) {
  const required = authDirectiveAST.arguments[0].value.values.map(value => value.value)
  // The AND/OR decision, the empty-list case and the error to return all live here,
  // repeated in every application.
  return required.some(scope => context.auth.scopes.includes(scope))
}
```

With a composed policy, the application supplies only the check — one required scope, and whether the caller holds it:

```js
const { applyPolicy, sdl, authDirective } = mercuriusAuth.composeDirectivePolicy({
  checkInput: 'scope: String!',
  parseCheck: node => ({ scope: node.fields.find(field => field.name.value === 'scope').value.value }),
  prepare: context => context.auth.scopes,
  evaluate: (check, scopes) => scopes.includes(check.scope)
})
```

## Directive mode

`composeDirectivePolicy` returns the `applyPolicy` to register, the `sdl` that defines the directive, and the `authDirective` name:

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

const app = Fastify()

// A check is one required scope. `parseCheck` reads it out of the directive AST and
// `evaluate` decides whether the caller holds it.
const { applyPolicy, sdl, authDirective } = mercuriusAuth.composeDirectivePolicy({
  checkInput: 'scope: String!',
  parseCheck (node) {
    if (node.kind !== 'ObjectValue') {
      throw new Error('each check must be an object')
    }
    const scope = node.fields.find(field => field.name.value === 'scope')
    if (scope?.value.kind !== 'StringValue') {
      throw new Error('each check requires a scope')
    }
    return { scope: scope.value.value }
  },
  prepare (context) {
    return context.auth.scopes
  },
  evaluate (check, scopes) {
    return scopes.includes(check.scope)
  }
})

const schema = `
  ${sdl}

  type Query {
    add(x: Int, y: Int): Int @auth(checks: [{ scope: "admin" }, { scope: "owner" }], relation: OR)
    subtract(x: Int, y: Int): Int @auth(checks: [{ scope: "admin" }, { scope: "audit" }], relation: AND)
  }
`

const resolvers = {
  Query: {
    add: async (_, { x, y }) => x + y,
    subtract: async (_, { x, y }) => x - y
  }
}

app.register(mercurius, { schema, resolvers })

app.register(mercuriusAuth, {
  authContext (context) {
    return { scopes: (context.reply.request.headers['x-scopes'] ?? '').split(',') }
  },
  applyPolicy,
  authDirective
})

app.listen({ port: 3000 })
```

`add` is granted to a caller holding either scope, `subtract` only to a caller holding both.

The generated `sdl` defines three things, named after the directive so that several composed directives can coexist in one schema:

```graphql
enum AuthRelation {
  AND
  OR
}

input AuthCheck {
  scope: String!
}

directive @auth(
  checks: [AuthCheck!]!
  relation: AuthRelation
) repeatable on OBJECT | FIELD_DEFINITION
```

Add it to the schema as above, or with [`extendSchema`](https://mercurius.dev/#/docs/api/options?id=graphql-decorator) when the schema is built elsewhere:

```js
await app.graphql.extendSchema(sdl)
```

Because the directive is `repeatable`, repeating it on a field ANDs the composed policies — each occurrence is enforced independently:

```graphql
type Query {
  # (admin OR owner) AND (audit)
  add(x: Int, y: Int): Int
    @auth(checks: [{ scope: "admin" }, { scope: "owner" }], relation: OR)
    @auth(checks: [{ scope: "audit" }])
}
```

## External Policy mode

`composeExternalPolicy` reads the checks from the policy values mapped onto types and fields, so no SDL is involved:

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

const app = Fastify()

const { applyPolicy } = mercuriusAuth.composeExternalPolicy({
  // Optional: reject a malformed check up front, the way `parseCheck` does.
  validate (check) {
    if (typeof check.scope !== 'string') {
      throw new Error('each check requires a scope')
    }
  },
  prepare (context) {
    return context.auth.scopes
  },
  evaluate (check, scopes) {
    return scopes.includes(check.scope)
  }
})

const schema = `
  type Message {
    title: String
    message: String
    adminMessage: String
  }

  type Query {
    messages: [Message]
  }
`

app.register(mercurius, {
  schema,
  resolvers: {
    Query: {
      messages: async () => [{ title: 'one', message: 'one', adminMessage: 'admin one' }]
    }
  }
})

app.register(mercuriusAuth, {
  authContext (context) {
    return { scopes: (context.reply.request.headers['x-scopes'] ?? '').split(',') }
  },
  mode: 'external',
  applyPolicy,
  policy: {
    Message: {
      __typePolicy: { checks: [{ scope: 'user' }] },
      adminMessage: { checks: [{ scope: 'admin' }, { scope: 'support' }], relation: 'or' }
    },
    Query: {
      messages: { checks: [{ scope: 'user' }, { scope: 'audit' }], relation: 'and' }
    }
  }
})

app.listen({ port: 3000 })
```

A mapped value that carries no `checks` list denies the field, so a policy value of another shape can never accidentally grant access.

## Relations

- `OR` (`'or'` in external mode) grants when any check passes.
- `AND` (`'and'`) grants only when every check passes.
- A field that does not specify a relation uses `defaultRelation`, which is `'or'` unless you set it.
- An **empty list of checks denies**: a protected field with nothing to satisfy must never pass.
- A relation spelled in any other way — `'AND'` in an external policy value, an enum value the generated directive does not define — is an authoring mistake, and the field is denied with `MER_AUTH_ERR_INVALID_POLICY` rather than silently composed.

By default every check of a field runs, concurrently, so checks that log or audit behave the same under either relation. Set `run: 'first'` to evaluate the checks in order and stop at the first one that decides the outcome — a check that passes under OR, or one that fails under AND — which is worth it when a check is expensive:

```js
mercuriusAuth.composeDirectivePolicy({ parseCheck, evaluate, run: 'first' })
```

## Nesting checks

`compose` is the combinator underneath both modes, exported for checks that are themselves compositions. It composes plain predicates over any value, so compositions nest without a depth limit:

```js
const { compose } = require('mercurius-auth')

// isAdmin OR (isOwner AND isVerified)
const check = compose([isAdmin, compose([isOwner, isVerified], 'and')], 'or')

if (await check(context)) { /* granted */ }
```

There is no depth limit, where `@fastify/auth` supports a single level of sub-arrays. A policy's own `checks` list is flat: to group checks within a policy, either compose them in `evaluate` — a check whose shape holds nested checks — or repeat the directive, which ANDs the composed policies of the field.

## Errors

A composed policy distinguishes three outcomes:

| Outcome | Result |
| --- | --- |
| Granted | `true` — the resolver runs. |
| Denied | `false`, which the plugin reports as [`MER_AUTH_ERR_FAILED_POLICY_CHECK`](errors.md) naming the field. Provide `onDeny` to return your own error instead. |
| Not evaluated | The error that `parseCheck`, `validate` or `prepare` threw, returned as the field's error. |
| Denied by a check that failed | The error that `evaluate` threw, returned as the field's error. |

A check that throws is a check that did not pass, the way a `@fastify/auth` verifier that calls `done(err)` is: its error is reported only if the composition ends up denying, so one failing check cannot deny a field that another check grants under `OR`.

The third outcome is what separates "you may not do this" from "authorization could not be established", which usually deserve different messages and status codes:

```js
mercuriusAuth.composeDirectivePolicy({
  parseCheck,
  evaluate,
  prepare (context) {
    if (typeof context.auth === 'undefined') {
      throw new mercurius.ErrorWithProps('identity unavailable', { code: 'UNAUTHENTICATED' }, 401)
    }
    return context.auth.scopes
  },
  onDeny (context, info) {
    return new mercurius.ErrorWithProps(`unauthorized on ${info.fieldName}`, { code: 'FORBIDDEN' }, 403)
  }
})
```

A `parseCheck`, `validate` or `prepare` failure signalled with something that is not an `Error` denies the field with `MER_AUTH_ERR_INVALID_POLICY`, so a policy that cannot be evaluated never grants access.

## Relation to `@fastify/auth`

The composed policies are the GraphQL counterpart of [`@fastify/auth`](https://github.com/fastify/fastify-auth): the same composition, applied at the seam a GraphQL field has rather than at a route's `preHandler`.

| `@fastify/auth` | Composed policies |
| --- | --- |
| `fastify.auth([verifier, ...], { relation })` per route | `checks` + `relation` per protected field, from the directive or the policy value |
| `defaultRelation`, default `'or'` | `defaultRelation`, default `'or'` |
| Verifiers are supplied by the application | Checks are supplied by the application: `parseCheck`/`validate` and `evaluate` |
| A verifier signals failure with `done(err)`, and its error is reported only when the composition fails | A check signals failure by returning `false`, or with an error by throwing, which is reported only when the composition denies |
| Short circuits by default; `run: 'all'` runs every verifier | Runs every check by default, concurrently; `run: 'first'` short circuits |
| One level of sub-arrays, combined with the opposite relation | `compose` nests without a limit; within a policy, group with a repeated directive or in `evaluate` |
| Rejects a relation that is neither `'or'` nor `'and'` | Rejects a relation the mode does not define, per field, with `MER_AUTH_ERR_INVALID_POLICY` |
| `fastify.auth([])` throws `Missing auth functions` at wiring time | An empty `checks` list denies the field: a schema can declare one, and a denial is the fail-closed reading |
| Replies `401` on failure | Returns a GraphQL field error; use `onDeny` with mercurius' `ErrorWithProps` to choose the code and status |

## API

### `composeDirectivePolicy(options)`

Returns `{ applyPolicy, sdl, authDirective }`.

- **evaluate** `(check: any, prepared: any) => boolean | Promise<boolean>` - judge one check against the `prepare`d value. Called once per check of the matching policy.
- **parseCheck** `(node: ValueNode) => any` - parse one element of the directive's `checks` list. Throw to reject a malformed check.
- **prepare** `(context: MercuriusContext) => any` (optional) - derive the value the checks are judged against, once per protected field, before any check runs. When omitted, the context itself is passed to `evaluate`.
- **onDeny** `(context: MercuriusContext, info: GraphQLResolveInfo) => Error` (optional) - the error returned when the composition denies. Defaults to returning `false`, which the plugin reports as `MER_AUTH_ERR_FAILED_POLICY_CHECK`.
- **defaultRelation** `'and' | 'or'` (optional, default: `'or'`) - the relation applied to a field that does not specify one.
- **run** `'all' | 'first'` (optional, default: `'all'`) - `'all'` evaluates every check of a policy concurrently, `'first'` evaluates them in order and stops at the first check that decides the outcome.
- **enabled** `boolean` (optional, default: `true`) - when `false`, every composed policy passes without evaluating its checks.
- **authDirective** `string` (optional, default: `'auth'`) - the name of the composed directive. The generated type names are derived from it.
- **checkInput** `string` (optional, default: `'requires: [String!]!'`) - the body of the generated `<Name>Check` input type.

The checks of a field are parsed once, not per request.

### `composeExternalPolicy(options)`

Returns `{ applyPolicy }`. Takes the same options as `composeDirectivePolicy` except `parseCheck`, `authDirective` and `checkInput`, plus:

- **validate** `(check: any) => void` (optional) - validate one check of a policy value. Throw to reject it. When omitted, checks are evaluated as supplied.

The checks of a policy value are validated once, not per request.

### `composeDirectiveSdl(authDirective, checkInput)`

Returns the SDL defining the composed directive: the `<Name>Relation` enum, the `<Name>Check` input and the repeatable `@<name>(checks, relation)` directive. `composeDirectivePolicy` calls it for you; call it directly when the schema is assembled before the policy.

### `compose(checks, relation, run)`

Composes checks — predicates over any value — into a single check combined by `relation` (default: `'or'`) and evaluated according to `run` (default: `'all'`). An empty list of checks denies. Compositions nest.

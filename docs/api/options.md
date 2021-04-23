# mercurius-auth

- [Plugin options](#plugin-options)

## Plugin options

**mercurius-auth** supports the following options:

* **applyPolicy** `(authDirectiveAST: DirectiveNode, parent: object, args: Record<string, any>, context: MercuriusContext, info: GraphQLResolveInfo) => Promise<boolean | Error>` - the policy promise to run when an auth directive protected field is selected by the query. This must return `true` in order to pass the check and allow access to the protected field.
* **authDirective** `string` - the directive that the Mercurius auth plugin will look for within the GraphQL schema in order to identify protected fields. This must be in the form of a schema directive definition and must only contain **one** directive.
* **authContext** `(context: MercuriusContext) => object | Promise<object>` (optional) - assigns the returned data to `MercuriusContext.auth` for use in the `applyPolicy` function. This runs within a [`preExecution`](https://mercurius.dev/#/docs/hooks?id=preexecution) Mercurius GraphQL request hook.

## Registration

The plugin must be registered **after** Mercurius is registered.

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

const app = Fastify()

const authDirective = `directive @auth(
  requires: Role = ADMIN,
) on OBJECT | FIELD_DEFINITION

enum Role {
  ADMIN
  REVIEWER
  USER
  UNKNOWN
}`

const schema = `
  ${authDirective}

  type Query {
    add(x: Int, y: Int): Int @auth(requires: USER)
  }
`

const resolvers = {
  Query: {
    add: async (_, { x, y }) => x + y
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
    return context.auth.identity === 'admin'
  },
  authDirective
})

app.listen(3000)
```

# mercurius-auth

- [Plugin options](#plugin-options)

## Plugin options

**mercurius-auth** supports the following options:

* **authContext** `(context: MercuriusContext) => object | Promise<object>` (optional) - a function that assigns the returned data to `MercuriusContext.auth` for use in the `applyPolicy` function.
<!-- TODO: check these types -->
* **applyPolicy** `(authDirectiveAST: DocumentNode, parent: object, args: object, info: GraphQLInfo) => Promise<true | Error>` - the policy to run when an auth directive protected field is selected by the query.
* **authDirective** `string | GraphQLDirective` - the directive that the Mercurius auth plugin to look with within the GraphQL schema.

## Registration

The plugin must be registered **after** Mercurius is registered:

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

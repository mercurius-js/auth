# Apply Policy

When called, the `applyPolicy` Promise provides the matching authDirective as a parameter in addition to exactly the same parameters that a `graphql-js` resolver will use. This allows us to tap into the auth directive definition and make policy decisions based on the associated type information.

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
    if (authDirectiveAST.arguments[0].value.value === context.auth.identity) {
      context.log.error(`auth error on ${info.fieldName}`)
      return
    }
    return true
  },
  authDirective
})

app.listen(3000)
```

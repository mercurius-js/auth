# mercurius-auth

- [Plugin options](#plugin-options)

## Plugin options

**mercurius-auth** supports the following options:

* **applyPolicy** `(policy: any, parent: object, args: Record<string, any>, context: MercuriusContext, info: GraphQLResolveInfo) => Promise<boolean | Error>` - the policy promise to run when an auth protected field is selected by the query. This must return `true` in order to pass the check and allow access to the protected field.
* **authContext** `(context: MercuriusContext) => object | Promise<object>` (optional) - assigns the returned data to `MercuriusContext.auth` for use in the `applyPolicy` function. This runs within a [`preExecution`](https://mercurius.dev/#/docs/hooks?id=preexecution) Mercurius GraphQL request hook.
* **mode** `'directive' | 'external'` (optional, default: `'directive'`) - the mode of operation for the plugin. Depending on the mode of operation selected, this has the following options:

### `directive` (default) mode

* **authDirective** `string` - the name of the directive that the Mercurius auth plugin will look for within the GraphQL schema in order to identify protected fields. For example, for directive definition `directive @auth on OBJECT | FIELD_DEFINITION`, the corresponding name would be `auth`.

* **filterSchema** `boolean` - when `true`, [introspection queries](https://graphql.org/learn/introspection/) will only return the parts of the schema which are accessible based on the applied policies.
### `external` mode

* **policy** `MercuriusAuthPolicy` (optional) - the auth policy definition. The field definition is passed as the first argument when `applyPolicy` is called for the associated field.

#### Parameter: `MercuriusAuthPolicy`

Extends: `Record<string, MercuriusAuthTypePolicy>`

Each key within the `MercuriusAuthPolicy` type corresponds with the GraphQL type name. For example, if we wanted to protect an object type:

```graphql
type Message {
  ...
}
```

We would use the key: `Message`:

```js
{
  Message: { ... }
}
```

#### Parameter: `MercuriusAuthTypePolicy`

Extends: `Record<string, any>`

- **__typePolicy** `any` (optional) - The policy definition for the type.

Each key within the `MercuriusAuthTypePolicy` type corresponds with the GraphQL field name on a type. For example, if we wanted to protect type field `message`:

```graphql
type Message {
  title: String
  message: String
}
```

We would use the key: `message`:

```js
{
  Message: {
    message: { requires: 'user' }
  }
}
```

If we want to protect the entire type, we would use `__typePolicy`:

```js
{
  Message: {
    __typePolicy: { requires: 'user' }
  }
}
```

This also works alongside specific field policies on the type:

```js
{
  Message: {
    __typePolicy: { requires: 'user', }
    message: { requires: 'admin' }
  }
}
```

## Registration

The plugin must be registered **after** Mercurius is registered.

### Directive (default) mode

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

const app = Fastify()

const schema = `
  directive @auth(
    requires: Role = ADMIN,
  ) on OBJECT | FIELD_DEFINITION

  enum Role {
    ADMIN
    REVIEWER
    USER
    UNKNOWN
  }

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
  authDirective: 'auth'
})

app.listen(3000)
```

### External Policy mode

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const app = Fastify()

const schema = `
  type Message {
    title: String
    message: String
    adminMessage: String
  }

  type Query {
    messages: [Message]
    message(title: String): Message
  }
`

const messages = [
  {
    title: 'one',
    message: 'one',
    adminMessage: 'admin message one'
  },
  {
    title: 'two',
    message: 'two',
    adminMessage: 'admin message two'
  }
]

const resolvers = {
  Query: {
    messages: async (parent, args, context, info) => {
      return messages
    },
    message: async (parent, args, context, info) => {
      return messages.find(message => message.title === args.title)
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers
})

app.register(mercuriusAuth, {
  authContext (context) {
    const permissions = context.reply.request.headers['x-user'] || ''
    return { permissions }
  },
  async applyPolicy (policy, parent, args, context, info) {
    return context.auth.permissions.includes(policy.requires)
  },
  mode: 'external',
  policy: {
    Message: {
      __typePolicy: { requires: 'user' },
      adminMessage: { requires: 'admin' }
    },
    Query: {
      messages: { requires: 'user' }
    }
  }
})

app.listen(3000)
```

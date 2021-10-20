# Apply Policy

- [Directive mode](#directive-mode)
- [External Policy mode](#external-policy-mode)

When called, the `applyPolicy` Promise provides the matching policy as a parameter in addition to exactly the same parameters that a `graphql-js` resolver will use. This allows us to tap into the policy definition and make policy decisions based on the associated type information.

The value of the policy parameter is dependent on the mode of operation:

## Directive mode

Here, the first parameter is the matching auth directive AST. This can be used to read the directive policy definition and apply accordingly.

```js
async applyPolicy (authDirectiveAST, parent, args, context, info) { ... }
```

**Example usage**:

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
    if (authDirectiveAST.arguments[0].value.value === context.auth.identity) {
      context.log.error(`auth error on ${info.fieldName}`)
      return
    }
    return true
  },
  authDirective: 'auth'
})

app.listen(3000)
```

## External Policy mode

Here, the first parameter is the matching policy for the field. This can be used to read the directive policy definition and apply accordingly.

If we have the following policy:

```js
const policy = {
  Message: {
    __typePolicy: { requires: 'user' },
    adminMessage: { requires: 'admin' }
  },
  Query: {
    messages: { requires: 'user' }
  }
}
```

Then when `applyPolicy` for `messages` is called, the value of `policy` argument is `{ requires: 'user' }`.

**Example usage**:

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
    // For field `Message.adminMessage`
    // policy: { requires: 'admin' }
    // context.auth.permissions: ['user', 'admin'] - the permissions associated with the user
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

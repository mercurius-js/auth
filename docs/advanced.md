# Advanced

Here we detail some advanced functionality made available by the `mercurius-auth` plugin.

- [Conditionally determine a user's access to run related operations](#Conditionally-determine-a-users-access-to-run-related-operations)
- [Run multiple auth plugins at the same time](#run-multiple-auth-plugins-at-the-same-time)

## Conditionally determine a user's access to run related operations

Here we have two users, Alice and Bob. Alice is a member of acme and Bob isn't. We use the auth plugin to make sure that users that have access to the platform only request information relevant to organizations they belong to. Consider the following query:

```graphql
query {
  messages(org: "other") {
    title
    message
  }
}
```

Alice will successfully retrieve the `messages` data because they are a member of acme. Whereas if Bob tries, they will received an error in the GraphQL response because they are not a member of acme.

See the example below for more details:

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

const app = Fastify()

const orgMembers = {
  acme: ['alice'],
  other: ['alice', 'bob']
}

const schema = `
  directive @orgAuth on OBJECT | FIELD_DEFINITION

  type Message {
    title: String!
    message: String!
  }

  type Query {
    messages(org: String!): [Message!] @orgAuth
  }
`

const messages = {
  acme: [
    {
      title: 'one',
      message: 'acme one'
    },
    {
      title: 'two',
      message: 'acme two'
    }
  ],
  other: [
    {
      title: 'one',
      message: 'other one'
    },
    {
      title: 'two',
      message: 'other two'
    }
  ]
}

const resolvers = {
  Query: {
    messages: async (parent, args, context, info) => {
      return messages[args.org]
    }
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
    const requestedOrg = args.org
    const username = context.auth.identity

    if (orgMembers[requestedOrg]) {
      const result = orgMembers[requestedOrg].includes(username)
      if (!result) {
        throw new Error(`Insufficient access: user ${username} not a member of ${requestedOrg}`)
      }
      return true
    }
    return false
  },
  authDirective: 'auth'
})

app.listen(3000)
```

## Run multiple auth plugins at the same time

Note, only the last `authContext` will be applied onto the context. If you want to add an identity to the context in a different way, you can use [Mercurius hooks](https://mercurius.dev/#/docs/hooks).

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

const app = Fastify()

const schema = `
  directive @auth1 on OBJECT | FIELD_DEFINITION

  directive @auth2 on OBJECT | FIELD_DEFINITION

  enum Role {
    ADMIN
    REVIEWER
    USER
    UNKNOWN
  }

  type Query {
    add(x: Int, y: Int): Int @auth1
    subtract(x: Int, y: Int): Int @auth2
  }
`

const resolvers = {
  Query: {
    add: async (_, { x, y }) => x + y,
    subtract: async (_, { x, y }) => x - y
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
    return context.auth.identity.includes('user')
  },
  authDirective: 'auth1'
})

app.register(mercuriusAuth, {
  async applyPolicy (authDirectiveAST, parent, args, context, info) {
    return context.auth.identity === 'super-user'
  },
  authDirective: 'auth2'
})

app.listen(3000)
```

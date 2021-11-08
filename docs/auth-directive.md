# Auth directive

The auth directive is used as an identifier for protected fields within the GraphQL schema. This is expressed as a `string`.

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

The auth directive can also be use at the type level, to wrap all fields of a type (useful when working with federated types).  You can nest auth directives this way as well to protect certain types/fields of a parent type.

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
    user: User
  }

  type User @auth(requires: USER) {
    id: Int
    name: String
    location: String @auth(requires: ADMIN)
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

## Multiple Directives

You can use multiple auth directives by registering the `mercurius-auth` plugin multiple times.

You must know that all the `authContext` functions will be executed in the order they are registered.

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

const app = Fastify()

const schema = `
  directive @hasRole(
    type: String,
  ) on FIELD_DEFINITION

  directive @hasPermission(
    grant: String,
  ) on FIELD_DEFINITION

  type Query {
    read: [String] @hasPermission(grant: "read")
  }

  type Mutation {
    publish(txt: String): Int @hasRole(type: "publisher") @hasPermission(grant: "write")
  }
`

const resolvers = {
  Query: {
    read: async (_) => ['txt']
  },
  Mutation: {
    publish: async (_, { txt }) => 42
  }
}

app.register(mercurius, {
  schema,
  resolvers
})

app.register(mercuriusAuth, {
  authContext (context) {
    return {
      role: context.reply.request.headers['x-role']
    }
  },
  async applyPolicy (authDirectiveAST, parent, args, context, info) {
    return context.auth.role === 'publisher'
  },
  authDirective: 'hasRole'
})

app.register(mercuriusAuth, {
  authContext (context) {
    return {
      permission: context.reply.request.headers['x-permission']
    }
  },
  async applyPolicy (authDirectiveAST, parent, args, context, info) {
    return context.auth.permission === authDirectiveAST
      .arguments.find(arg => arg.name.value === 'grant').value.value
  },
  authDirective: 'hasPermission'
})

app.listen(3000)
```

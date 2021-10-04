# Errors

The `applyPolicy` function runs on protected fields within the GraphQL schema. In order to pass the check, the policy check Promise must return `true`. If the policy check fails for any reason, errors will be returned in the GraphQL response. For example, for the schema:

- [Custom Errors](#custom-errors)
  - [Throwing the custom error in the `applyPolicy` function](#throwing-the-custom-error-in-the-applypolicy-function)
  - [Returning the custom error in the `applyPolicy` function](#returning-the-custom-error-in-the-applypolicy-function)

```graphql
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
```

A failed auth response would look like:

```json
{
  "data": {
    "add": null
  },
  "errors": [
    {
      "message": "Failed auth policy check on add",
      "locations": [
        {
          "line": 2,
          "column": 3
        }
      ],
      "path": [
        "add"
      ]
    }
  ]
}
```

## Custom errors

You can return errors in the GraphQL response in two ways.

### Throwing the custom error in the `applyPolicy` function

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
    if (context.auth.identity !== 'admin') {
      throw new Error(`custom auth error on ${info.fieldName}`)
    }
    return true
  },
  authDirective: 'auth'
})

app.listen(3000)
```

### Returning the custom error in the `applyPolicy` function

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
    if (context.auth.identity !== 'admin') {
      return new Error(`custom auth error on ${info.fieldName}`)
    }
    return true
  },
  authDirective: 'auth'
})

app.listen(3000)
```
### Status Code
Mercurius defaults all errors with the HTTP 500 status code. You can customize this property by using the built-in `ErrorWithProps` custom error provided by the underlining Mercurius plug-in

```js
...

 async applyPolicy (authDirectiveAST, parent, args, context, info) {
    if (context.auth.identity !== 'admin') {
      const err = new mercurius.ErrorWithProps(`custom auth error on ${info.fieldName}`);
      err.statusCode = 200;
      return err // or throw err
    }
    return true
  }

...
```
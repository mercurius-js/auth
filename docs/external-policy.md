# External Policy auth mode

- [GraphQL field auth policy](#graphql-field-auth-policy)
- [GraphQL Object type auth policy](#graphql-object-type-auth-policy)

By default, Mercurius Auth runs in `directive` mode when defining in-band auth policies. It supports the following auth policy definitions:

- Policy on GraphQL Object type fields
- Policy on GraphQL Object types

## GraphQL field auth policy

For the following GraphQL schema:

```graphql
type Message {
  title: String
  message: String
}

type Query {
  message(title: String): Message
}
```

You can define an auth policy on the `Query.message` field as follows:

```js
app.register(mercuriusAuth, {
  authContext (context) {
    const permissions = context.reply.request.headers['x-user'] || ''
    return { permissions }
  },
  async applyPolicy (policy, parent, args, context, info) {
    return context.auth.permissions.includes(policy)
  },
  mode: 'external-policy',
  policy: {
    Query: {
      message: 'user'
    }
  }
})
```

Upon failure(s), an example GraphQL response will look like:

```json
{
  "data": {
    "message": null
  },
  "errors": [
    {
      "message": "Failed auth policy check on message",
      "locations": [
        {
          "line": 2,
          "column": 3
        }
      ],
      "path": [
        "message"
      ]
    }
  ]
}
```

## GraphQL Object type auth policy

For the following GraphQL schema:

```graphql
type Message {
  title: String
  message: String
}

type Query {
  message(title: String): Message
}
```

You can define an auth policy on the `Message` object type using the reserved `__typePolicy` field as follows:

```js
app.register(mercuriusAuth, {
  authContext (context) {
    const permissions = context.reply.request.headers['x-user'] || ''
    return { permissions }
  },
  async applyPolicy (policy, parent, args, context, info) {
    return context.auth.permissions.includes(policy)
  },
  mode: 'external-policy',
  policy: {
    Message: {
      __typePolicy: 'user'
    }
  }
})
```

Upon failure(s), an example GraphQL response will look like:

```json
{
  "data": {
    "message": {
      "title": null,
      "message": null
    }
  },
  "errors": [
    {
      "message": "Failed auth policy check on title",
      "locations": [
        {
          "line": 11,
          "column": 3
        }
      ],
      "path": [
        "message",
        "title"
      ]
    },
    {
      "message": "Failed auth policy check on message",
      "locations": [
        {
          "line": 12,
          "column": 3
        }
      ],
      "path": [
        "message",
        "message"
      ]
    }
  ]
}
```
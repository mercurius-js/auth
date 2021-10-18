# External Policy auth mode

- [Implementing a policy system](#implementing-a-policy-system)
  - [Identifying the fields to protect](#identifying-the-fields-to-protect)
  - [Defining the policy for each protected field](#defining-the-policy-for-each-protected-field)
  - [Applying the policy on each field](#applying-the-policy-on-each-field)
- [GraphQL field auth policy](#graphql-field-auth-policy)
- [GraphQL Object type auth policy](#graphql-object-type-auth-policy)

By default, Mercurius Auth runs in `directive` mode. To define out-of-band external auth policies in a policy system, we must set the `mode` to `'external'`. This is done at plugin registration.

```js
app.register(mercuriusAuth, {
  ...,
  mode: 'external',
  policy: {
    ...
  }
})
```

When enabled, External Policy mode supports the following auth policy features:

- Apply policies on GraphQL Object type fields
- Apply policies on GraphQL Object types

## Implementing a policy system

Let's say we want to implement a policy system such that only users with appropriate permissions can access specific fields within the GraphQL schema. In External Policy mode, we need to:

- Identify the fields to protect.
- Define the policy for each protected field.
- Apply this policy on each field.

### Identifying the fields to protect

Consider the following GraphQL schema:

```graphql
type Message {
  title: String
  message: String
  adminMessage: String
}

type Query {
  messages: [Message]
  message(title: String): Message
}
```

We want to protect the GraphQL schema such that:

- Only admins can access `Message.adminMessage` field.
- Only users can access the `messages` Query.
- Only users can access the `Message` Object Type.

Each user can have the following permissions:

- `user`
- `admin`

In this scenario, a users permission is passed in the GraphQL request header: `x-user`.

### Defining the policy for each protected field

To protect the `Message.adminMessage` field, we define a [GraphQL field auth policy](graphql-field-auth-policy) using the `Message` key for the type and `adminMessage` key for the field:

```js
const policy = {
  Message: {
    adminMessage: { requires: 'admin' }
  }
}
```

To protect the `messages` Query, we define a [GraphQL field auth policy](graphql-field-auth-policy) using the `Query` key for the type and `messages` key for the field:

```js
const policy = {
  Query: {
    messages: { requires: 'user' }
  }
}
```

To protect the `Message` Object type, we define a [GraphQL Object type auth policy](#graphql-object-type-auth-policy) using the `Message` key for the type and `__typePolicy` key to protect the entire type:

```js
const policy = {
  Message: {
    __typePolicy: { requires: 'user' }
  }
}
```

Putting it all together, we have the final policy:

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

### Applying the policy on each field

To apply the policy, we first need to register it and set the mode to `external`:

```js
app.register(mercuriusAuth, {
  ...,
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
```

Next, we need to set the auth `context` in order to be able to access the users permissions:

```js
app.register(mercuriusAuth, {
  authContext (context) {
    const permissions = context.reply.request.headers['x-user'] || ''
    return { permissions }
  },
})
```

Finally, we define the `applyPolicy` function. The first argument passed to the `applyPolicy` is the associated policy for the field. For example, for the `Message.adminMessage` field, `applyPolicy` this would be:

- `{ requires: 'admin' }`

Therefore, we can use this to apply different policies for different fields (and types in the case of `__typePolicy`). Using this information, we can apply the policy for a field and control the system behaviour accordingly for incoming GraphQL requests.

```js
app.register(mercuriusAuth, {
  ...,
  async applyPolicy (policy, parent, args, context, info) {
    // For field `Message.adminMessage`
    // policy: { requires: 'admin' }
    // context.auth.permissions: ['user', 'admin'] - the permissions associated with the user (passed as headers in authContext)
    return context.auth.permissions.includes(policy.requires)
  },
  ...
})
```

## GraphQL field auth policy

When building a policy for a field, each key within the policy corresponds with the GraphQL type name. For example, if we wanted to protect a field on an Object Type:

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

Each key within the Object Type corresponds with the GraphQL field name on a type. For example, if we wanted to protect type field `message`:

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
    message: 'user'
  }
}
```

Consider the following GraphQL schema:

```graphql
type Message {
  title: String
  message: String
}

type Query {
  message(title: String): Message
}
```

You can define an auth policy at plugin registration to protect the `Query.message` field as follows:

```js
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
    Query: {
      message: { requires: 'user' }
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

Building a policy for an entire type is initially similar to defining a policy for a field. Each key within the policy corresponds with the GraphQL type name. For example, if we wanted to protect an Object Type:

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

Then, to protect the entire GraphQL Object Type, we use the `__typePolicy` key:

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
    __typePolicy: { requires: 'user'} ,
    message: { requires: 'admin' }
  }
}
```

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

You can define an auth policy at plugin registration to protect the `Message` object type using the reserved `__typePolicy` field as follows:

```js
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
      __typePolicy: { requires: 'user' }
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
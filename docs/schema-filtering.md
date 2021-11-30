# GraphQL Schema Filtering

Using mercurius you can optionally filter the GraphQL schema based on the user's permissions.
This feature limits the [Introspection queries](https://graphql.org/learn/introspection/) visibility.
Doing so, the user will only be able to see the fields that are accessible to them.

To enable this feature, you can use the `filterSchema` plugin's option:

```js
const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

const schema = `
  directive @hasPermission (grant: String!) on OBJECT | FIELD_DEFINITION

  type Message {
    title: String!
    message: String!
    notes: String @hasPermission(grant: "see-all")
  }

  type Query {
    publicMessages: [Message!]
  }
`

const app = Fastify()
app.register(mercurius, {
  schema,
  resolvers
})

app.register(mercuriusAuth, {
  filterSchema: true,
  authDirective: 'hasPermission',
  authContext: function (context) {
    return { permission: context.reply.request.headers['x-permission'] }
  },
  applyPolicy: async function hasPermissionPolicy (authDirectiveAST, parent, args, context, info) {
    const needed = authDirectiveAST.arguments.find(arg => arg.name.value === 'grant').value.value
    const hasGrant = context.auth.permission === needed
    if (!hasGrant) {
      throw new Error(`Needed ${needed} grant`)
    }
    return true
  }
})

app.listen(3000)
```

After starting the server, you can use the following GraphQL query to test the filtering:

```graphql
{
  __type (name:"Message") {
    name
    fields {
      name
    }
  }
}
```

You should get the following response:

```json
{
  "data": {
    "__type": {
      "name": "Message",
      "fields": [
        {
          "name": "title"
        },
        {
          "name": "message"
        }
      ]
    }
  }
}
```

The `notes` field is not accessible to the user because the user doesn't have the `see-all` permission.

Adding the Request Headers as follows:

```json
{
  "x-permission": "see-all"
}
```

Will make the user able to see the `notes` field.

## Implementations details

- During the introspection query, the `applyPolicy` function is executed once per single GraphQL object.
- The `applyPolicy` function doesn't have the input `parent` and `args` arguments set during the introspection run.
- The `applyPolicy` function receives the `info` argument which contains basic information about the GraphQL entity assinged to the directive.
- When the HTTP request payload contains an introspection query and a user-land query, you will not get auth errors because the introspection query is executed before the user-land query and filters the schema. Note that the protected fields will **not** be returned as expected, without any security implications. Here is an example of a GraphQL query that will not throw an error:

```graphql
{
  __type (name:"Message") {
    name
    fields {
      name
    }
  }

  publicMessages {
    notes
  }
}
```

### Special usages

Depending on the [`DirectiveLocations`](https://github.com/graphql/graphql-spec/blob/main/spec/Section%203%20--%20Type%20System.md#directives) you will have two main behaviors:

- The normal behaviour is when the `DirectiveLocations` is hidden from the introspection query.
- The augmented behaviour is when the schema has additional hidden entities from the introspection query. It happens when:
  - The directive is `on INPUT_FIELD_DEFINITION`: the whole `input` item is hidden
  - The `Query` is hidden if the user doesn't have access to the `input` or `output` object types.

# Schema Replacement

The auth directive can be used as an identifier
to protect a GraphQL String Scalar field within the GraphQL schema
to do a replacement of the output if the policy allows it.

This is designed to potentially obfuscate your database output to the end user without having to do this on the frontend. Useful to prevent people who may or may not have a role or matching the required "profile" to not see what is being sent from the server.

Example could be to:
* Social Security Numbers
* HIPPA
* PCI Information

It will take the string and replace it with something that you designate. It doesn't change the database backend, which is helpful during obfuscation.

```js
const messages = [
  {
    title: 'one',
    message: 'acme one',
    notes: 'acme one',
    password: 'acme-one'
  },
  {
    title: 'two',
    message: 'acme two',
    notes: '123-45-6789',
    password: 'acme-two'
  }
]
```
A sample message object.

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

const app = Fastify()

const schema = `
    directive @filterData (disallow: String!) on FIELD_DEFINITION

    type Message {
      message: String!
      notes: String @filterData (disallow: "no-read-notes")
    }
    
    type Query {
      publicMessages: [Message!]
    }
`

const resolvers = {
  Query: {
    publicMessages: async (parent, args, context, info) => {
      return messages
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers
})

app.register(mercuriusAuth, {
  authContext: function hasPermissionContext (context) {
    const headerValue = context.reply.request.headers['x-permission']
    return { permission: headerValue ? headerValue.split(',') : [] }
  },
  applyPolicy: async function hasFilterPolicy (authDirectiveAST, parent, args, context, info) {
    const notNeeded = authDirectiveAST.arguments.find(arg => arg.name.value === 'disallow').value.value
    return !context.auth.permission.includes(notNeeded)
  },
  outputPolicyErrors: {
    enabled: false
  },
  authDirective: 'filterData'
})

app.listen({ port: 3000 })
```
The `applyPolicy` must return `false` in order to do the replacement. Returning `true` will output as normal.

This by default will make `notes` equal `null` when sent back to the client and not error back as long as your schema accepts `null` values, otherwise trigger and error.

### String Return

Within the `app.register` block, you can need to efficacy a function or a common string that will do your replacement. No matter what, the return ***must*** be a string.

```js
app.register(mercuriusAuth, {
  authContext: function hasPermissionContext (context) {
    const headerValue = context.reply.request.headers['x-permission']
    return { permission: headerValue ? headerValue.split(',') : [] }
  },
  applyPolicy: async function hasFilterPolicy (authDirectiveAST, parent, args, context, info) {
    const notNeeded = authDirectiveAST.arguments.find(arg => arg.name.value === 'disallow').value.value
    return !context.auth.permission.includes(notNeeded)
  },
  outputPolicyErrors: {
    enabled: false,
    valueOverride: 'foo'
  },
  authDirective: 'filterData'
})
```

This will replace the `notes` schema, no matter what it is from the database, with the string `foo`.

_or_

```js
app.register(mercuriusAuth, {
  authContext: function hasPermissionContext (context) {
    const headerValue = context.reply.request.headers['x-permission']
    return { permission: headerValue ? headerValue.split(',') : [] }
  },
  applyPolicy: async function hasFilterPolicy (authDirectiveAST, parent, args, context, info) {
    const notNeeded = authDirectiveAST.arguments.find(arg => arg.name.value === 'disallow').value.value
    return !context.auth.permission.includes(notNeeded)
  },
  outputPolicyErrors: {
    enabled: false,
    valueOverride: (value) => {
      // replace the first 7 numbers of your social security number with *
      return value.replace(/\d(?=.{5,})/g, "*");
    }
  },
  authDirective: 'filterData'
})
```

This will replace the `notes` schema if it matches the regex for removing the first seven (7) characters with asterisks. Since this would not apply to `notes: 'acme one'` this would come over as it is.

## Invalid Scalar Types

You can only do the replacement on String Scalar types.

Please note that you create a custom Scalar type, however,
it still must be registered as a String otherwise it will fail.


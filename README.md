# mercurius-auth

![CI workflow](https://github.com/mercurius-js/auth/workflows/CI%20workflow/badge.svg)

Mercurius Auth is a plugin for [Mercurius](https://mercurius.dev) that adds configurable Authentication and Authorization support.

Features:

- Define auth directives on fields anywhere in your schema and this plugin will apply custom policies against these protected fields when a GraphQL request is made.
- Works in both normal and gateway mode.
- In addition to the matching auth directive, auth policies have access to the same GraphQL information that any GraphQL resolver has access to.
- Build up an auth context to load identities onto the context before policies are applied.
- Define custom errors.
- GraphQL spec compliant.

## Docs

- [Install](#install)
- [Quick Start](#quick-start)
  - [Directive (default) mode](#directive-default-mode)
  - [External Policy mode](#external-policy-mode)
- [Examples](#examples)
- [Benchmarks](#benchmarks)
- [API](docs/api/options.md)
- [Auth Context](docs/auth-context.md)
- [Apply Policy](docs/apply-policy.md)
- [Auth Directive](docs/auth-directive.md)
  - [Schema filtering](docs/schema-filtering.md)
- [External Policy](docs/external-policy.md)
- [Errors](docs/errors.md)
- [Federation](docs/federation.md)

## Install

```bash
npm i fastify mercurius mercurius-auth
```

## Quick Start

We have two modes of operation for Mercurius Auth:

### Directive (default) mode

Setup in Directive mode as follows (this is the default mode of operation):

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

Instead of using GraphQL Directives, you can implement an External Policy at plugin registration to protect GraphQL fields and types. You can find more information about implementing policy systems and how to build external policies for a GraphQL schema in the [External Policy documentation](docs/external-policy.md).

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

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
  // Load the permissions into the context from the request headers
  authContext (context) {
    const permissions = context.reply.request.headers['x-user'] || ''
    return { permissions }
  },
  async applyPolicy (policy, parent, args, context, info) {
    // When called on field `Message.adminMessage`
    // policy: { requires: 'admin' }
    // context.auth.permissions: ['user', 'admin'] - the permissions associated with the user (passed as headers in authContext)
    return context.auth.permissions.includes(policy.requires)
  },
  // Enable External Policy mode
  mode: 'external',
  policy: {
    // Associate policy with the 'Message' Object type
    Message: {
      // Define policy for 'Message' Object type
      __typePolicy: { requires: 'user' },
      // Define policy for 'adminMessage' field
      adminMessage: { requires: 'admin' }
    },
    // Associate policy with the Query root type
    Query: {
      // Define policy for 'message' Query
      messages: { requires: 'user' }
    }
  }
})

app.listen(3000)
```

## Examples

Check [GitHub repo](https://github.com/mercurius-js/auth/tree/master/examples) for more examples.

## Benchmarks

### Normal GraphQL Server Mode | Without Auth

Last run: `2021-04-21`

```text
┌─────────┬──────┬──────┬───────┬───────┬─────────┬─────────┬───────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%   │ Avg     │ Stdev   │ Max   │
├─────────┼──────┼──────┼───────┼───────┼─────────┼─────────┼───────┤
│ Latency │ 4 ms │ 5 ms │ 9 ms  │ 13 ms │ 5.21 ms │ 2.01 ms │ 57 ms │
└─────────┴──────┴──────┴───────┴───────┴─────────┴─────────┴───────┘
┌───────────┬─────────┬─────────┬─────────┬─────────┬──────────┬─────────┬─────────┐
│ Stat      │ 1%      │ 2.5%    │ 50%     │ 97.5%   │ Avg      │ Stdev   │ Min     │
├───────────┼─────────┼─────────┼─────────┼─────────┼──────────┼─────────┼─────────┤
│ Req/Sec   │ 11135   │ 11135   │ 18223   │ 18671   │ 17550.19 │ 2049.52 │ 11134   │
├───────────┼─────────┼─────────┼─────────┼─────────┼──────────┼─────────┼─────────┤
│ Bytes/Sec │ 5.86 MB │ 5.86 MB │ 9.58 MB │ 9.82 MB │ 9.23 MB  │ 1.08 MB │ 5.86 MB │
└───────────┴─────────┴─────────┴─────────┴─────────┴──────────┴─────────┴─────────┘

Req/Bytes counts sampled once per second.
193k requests in 11.03s, 102 MB read
```

### Normal GraphQL Server Mode | With Auth

Last run: `2021-04-21`

```text
┌─────────┬──────┬──────┬───────┬───────┬─────────┬────────┬───────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%   │ Avg     │ Stdev  │ Max   │
├─────────┼──────┼──────┼───────┼───────┼─────────┼────────┼───────┤
│ Latency │ 5 ms │ 5 ms │ 10 ms │ 14 ms │ 5.59 ms │ 2.1 ms │ 64 ms │
└─────────┴──────┴──────┴───────┴───────┴─────────┴────────┴───────┘
┌───────────┬─────────┬─────────┬─────────┬─────────┬──────────┬─────────┬─────────┐
│ Stat      │ 1%      │ 2.5%    │ 50%     │ 97.5%   │ Avg      │ Stdev   │ Min     │
├───────────┼─────────┼─────────┼─────────┼─────────┼──────────┼─────────┼─────────┤
│ Req/Sec   │ 9463    │ 9463    │ 17279   │ 17583   │ 16586.55 │ 2260.65 │ 9459    │
├───────────┼─────────┼─────────┼─────────┼─────────┼──────────┼─────────┼─────────┤
│ Bytes/Sec │ 4.98 MB │ 4.98 MB │ 9.08 MB │ 9.25 MB │ 8.72 MB  │ 1.19 MB │ 4.98 MB │
└───────────┴─────────┴─────────┴─────────┴─────────┴──────────┴─────────┴─────────┘

Req/Bytes counts sampled once per second.
182k requests in 11.03s, 96 MB read
```

### Gateway GraphQL Server Mode | Without Auth

Last run: `2021-04-21`

```text
┌─────────┬───────┬───────┬───────┬───────┬──────────┬──────────┬────────┐
│ Stat    │ 2.5%  │ 50%   │ 97.5% │ 99%   │ Avg      │ Stdev    │ Max    │
├─────────┼───────┼───────┼───────┼───────┼──────────┼──────────┼────────┤
│ Latency │ 29 ms │ 32 ms │ 66 ms │ 88 ms │ 34.96 ms │ 11.57 ms │ 195 ms │
└─────────┴───────┴───────┴───────┴───────┴──────────┴──────────┴────────┘
┌───────────┬────────┬────────┬─────────┬────────┬────────┬────────┬────────┐
│ Stat      │ 1%     │ 2.5%   │ 50%     │ 97.5%  │ Avg    │ Stdev  │ Min    │
├───────────┼────────┼────────┼─────────┼────────┼────────┼────────┼────────┤
│ Req/Sec   │ 1286   │ 1286   │ 3039    │ 3135   │ 2819.5 │ 543.65 │ 1286   │
├───────────┼────────┼────────┼─────────┼────────┼────────┼────────┼────────┤
│ Bytes/Sec │ 450 kB │ 450 kB │ 1.06 MB │ 1.1 MB │ 987 kB │ 190 kB │ 450 kB │
└───────────┴────────┴────────┴─────────┴────────┴────────┴────────┴────────┘

Req/Bytes counts sampled once per second.
28k requests in 10.03s, 9.87 MB read
```

### Gateway GraphQL Server Mode | With Auth

Last run: `2021-04-21`

```text
┌─────────┬───────┬───────┬───────┬───────┬──────────┬──────────┬────────┐
│ Stat    │ 2.5%  │ 50%   │ 97.5% │ 99%   │ Avg      │ Stdev    │ Max    │
├─────────┼───────┼───────┼───────┼───────┼──────────┼──────────┼────────┤
│ Latency │ 29 ms │ 33 ms │ 69 ms │ 93 ms │ 35.92 ms │ 12.46 ms │ 209 ms │
└─────────┴───────┴───────┴───────┴───────┴──────────┴──────────┴────────┘
┌───────────┬────────┬────────┬─────────┬────────┬────────┬────────┬────────┐
│ Stat      │ 1%     │ 2.5%   │ 50%     │ 97.5%  │ Avg    │ Stdev  │ Min    │
├───────────┼────────┼────────┼─────────┼────────┼────────┼────────┼────────┤
│ Req/Sec   │ 1216   │ 1216   │ 2943    │ 3129   │ 2744.7 │ 552.54 │ 1216   │
├───────────┼────────┼────────┼─────────┼────────┼────────┼────────┼────────┤
│ Bytes/Sec │ 426 kB │ 426 kB │ 1.03 MB │ 1.1 MB │ 961 kB │ 193 kB │ 426 kB │
└───────────┴────────┴────────┴─────────┴────────┴────────┴────────┴────────┘

Req/Bytes counts sampled once per second.
27k requests in 10.03s, 9.61 MB read
```

## License

MIT

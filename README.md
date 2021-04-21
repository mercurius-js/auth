# mercurius-auth

![CI workflow](https://github.com/mercurius-js/auth/workflows/CI%20workflow/badge.svg)

Mercurius Auth is a plugin for [Mercurius](https://mercurius.dev) that adds configurable Authentication and Authorization support.

Features:

- Define auth directives on fields anywhere in your schema and this plugin will apply custom policies against these protected fields on a request
- Works in both normal and gateway mode
- Build up an auth context to load identities onto the context before policies are applied
- In addition to the matching auth directive, auth policies have access to the same GraphQL information that any GraphQL resolver has access to
- Can define custom errors
- GraphQL spec compliant

## Docs

- [Install](#install)
- [Quick Start](#quick-start)
- [Examples](#examples)
- [Benchmarks](#benchmarks)
- [API](docs/api/options.md)
- [Auth Context](docs/auth-context.md)
- [Apply Policy](docs/apply-policy.md)
- [Auth Directive](docs/auth-directive.md)
- [Errors](docs/errors.md)
- [Federation](docs/federation.md)

## Install

```bash
npm i fastify mercurius mercurius-auth
```

## Quick Start

```js
'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('mercurius-auth')

const app = Fastify()

const authDirective = `directive @auth(
  requires: Role = ADMIN,
) on OBJECT | FIELD_DEFINITION

enum Role {
  ADMIN
  REVIEWER
  USER
  UNKNOWN
}`

const schema = `
  ${authDirective}

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
  authDirective
})

app.listen(3000)
```

## Examples

Check [GitHub repo](https://github.com/mercurius-js/auth/tree/master/examples) for more examples.

## Benchmarks

### Normal GraphQL Server Mode | Without Auth

Last run: `2021-04-19`

```text
┌─────────┬──────┬──────┬───────┬───────┬─────────┬─────────┬────────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%   │ Avg     │ Stdev   │ Max    │
├─────────┼──────┼──────┼───────┼───────┼─────────┼─────────┼────────┤
│ Latency │ 0 ms │ 8 ms │ 18 ms │ 23 ms │ 8.63 ms │ 4.62 ms │ 162 ms │
└─────────┴──────┴──────┴───────┴───────┴─────────┴─────────┴────────┘
┌───────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│ Stat      │ 1%      │ 2.5%    │ 50%     │ 97.5%   │ Avg     │ Stdev   │ Min     │
├───────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ Req/Sec   │ 5447    │ 5447    │ 10743   │ 11463   │ 10135.4 │ 1649.76 │ 5447    │
├───────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ Bytes/Sec │ 2.87 MB │ 2.87 MB │ 5.65 MB │ 6.03 MB │ 5.33 MB │ 868 kB  │ 2.87 MB │
└───────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘

Req/Bytes counts sampled once per second.
109k requests in 10.04s, 57.4 MB read
```

### Normal GraphQL Server Mode | With Auth

Last run: `2021-04-19`

```text
┌─────────┬──────┬───────┬───────┬───────┬─────────┬─────────┬────────┐
│ Stat    │ 2.5% │ 50%   │ 97.5% │ 99%   │ Avg     │ Stdev   │ Max    │
├─────────┼──────┼───────┼───────┼───────┼─────────┼─────────┼────────┤
│ Latency │ 0 ms │ 10 ms │ 20 ms │ 24 ms │ 9.42 ms │ 4.57 ms │ 123 ms │
└─────────┴──────┴───────┴───────┴───────┴─────────┴─────────┴────────┘
┌───────────┬─────────┬─────────┬─────────┬────────┬─────────┬─────────┬─────────┐
│ Stat      │ 1%      │ 2.5%    │ 50%     │ 97.5%  │ Avg     │ Stdev   │ Min     │
├───────────┼─────────┼─────────┼─────────┼────────┼─────────┼─────────┼─────────┤
│ Req/Sec   │ 4783    │ 4783    │ 9551    │ 9879   │ 9173    │ 1472.79 │ 4783    │
├───────────┼─────────┼─────────┼─────────┼────────┼─────────┼─────────┼─────────┤
│ Bytes/Sec │ 2.52 MB │ 2.52 MB │ 5.03 MB │ 5.2 MB │ 4.82 MB │ 774 kB  │ 2.52 MB │
└───────────┴─────────┴─────────┴─────────┴────────┴─────────┴─────────┴─────────┘

Req/Bytes counts sampled once per second.
101k requests in 10.02s, 53.1 MB read
```

### Gateway GraphQL Server Mode | Without Auth

Last run: `2021-04-19`

```text
┌─────────┬───────┬───────┬───────┬────────┬──────────┬──────────┬────────┐
│ Stat    │ 2.5%  │ 50%   │ 97.5% │ 99%    │ Avg      │ Stdev    │ Max    │
├─────────┼───────┼───────┼───────┼────────┼──────────┼──────────┼────────┤
│ Latency │ 41 ms │ 44 ms │ 75 ms │ 113 ms │ 47.17 ms │ 12.92 ms │ 219 ms │
└─────────┴───────┴───────┴───────┴────────┴──────────┴──────────┴────────┘
┌───────────┬────────┬────────┬────────┬────────┬─────────┬────────┬────────┐
│ Stat      │ 1%     │ 2.5%   │ 50%    │ 97.5%  │ Avg     │ Stdev  │ Min    │
├───────────┼────────┼────────┼────────┼────────┼─────────┼────────┼────────┤
│ Req/Sec   │ 1094   │ 1094   │ 2213   │ 2309   │ 2091.31 │ 358.12 │ 1094   │
├───────────┼────────┼────────┼────────┼────────┼─────────┼────────┼────────┤
│ Bytes/Sec │ 383 kB │ 383 kB │ 775 kB │ 808 kB │ 732 kB  │ 125 kB │ 383 kB │
└───────────┴────────┴────────┴────────┴────────┴─────────┴────────┴────────┘

Req/Bytes counts sampled once per second.
21k requests in 10.03s, 7.32 MB read
```

### Gateway GraphQL Server Mode | With Auth

Last run: `2021-04-19`

```text
┌─────────┬───────┬───────┬───────┬────────┬──────────┬──────────┬────────┐
│ Stat    │ 2.5%  │ 50%   │ 97.5% │ 99%    │ Avg      │ Stdev    │ Max    │
├─────────┼───────┼───────┼───────┼────────┼──────────┼──────────┼────────┤
│ Latency │ 42 ms │ 45 ms │ 77 ms │ 116 ms │ 48.86 ms │ 13.48 ms │ 239 ms │
└─────────┴───────┴───────┴───────┴────────┴──────────┴──────────┴────────┘
┌───────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│ Stat      │ 1%     │ 2.5%   │ 50%    │ 97.5%  │ Avg    │ Stdev  │ Min    │
├───────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┤
│ Req/Sec   │ 1043   │ 1043   │ 2149   │ 2245   │ 2020.5 │ 353    │ 1043   │
├───────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┤
│ Bytes/Sec │ 365 kB │ 365 kB │ 752 kB │ 785 kB │ 707 kB │ 123 kB │ 365 kB │
└───────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┘

Req/Bytes counts sampled once per second.
20k requests in 10.02s, 7.07 MB read
```

## License

MIT

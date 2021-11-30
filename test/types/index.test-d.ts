import { expectAssignable, expectType } from 'tsd'
import fastify from 'fastify'
import { DirectiveNode, GraphQLResolveInfo } from 'graphql'
import { MercuriusContext } from 'mercurius'
import mercuriusAuth, {
  ApplyPolicyHandler,
  AuthContextHandler,
  MercuriusAuthOptions,
  MercuriusAuthContext
} from '../..'

const app = fastify()

// 1. BASIC USAGE: DEFAULT TYPES
app.register(mercuriusAuth, {
  authDirective: 'auth',
  async applyPolicy (authDirectiveAST, parent, args, context, info) {
    expectAssignable<DirectiveNode>(authDirectiveAST)
    expectType<any>(parent)
    expectType<any>(args)
    expectType<MercuriusContext>(context)
    expectType<GraphQLResolveInfo>(info)
    // `context.auth` may be undefined if `authContext` is not provided
    expectType<MercuriusAuthContext|undefined>(context.auth)
    return true
  },
  authContext (context) {
    expectType<MercuriusContext>(context)
    return {}
  }
})

// 2. Using options as object without generic
interface CustomParent {
  parent: Record<string, any>;
}
interface CustomArgs {
  arg: Record<string, any>;
}
interface CustomContext extends MercuriusContext {
  auth?: { identity?: string };
}
const authOptions: MercuriusAuthOptions = {
  filterSchema: true,
  authDirective: 'auth',
  async applyPolicy (
    authDirectiveAST,
    parent: CustomParent,
    args: CustomArgs,
    context: CustomContext,
    info
  ) {
    expectAssignable<DirectiveNode>(authDirectiveAST)
    expectType<CustomParent>(parent)
    expectType<CustomArgs>(args)
    expectType<CustomContext>(context)
    expectType<GraphQLResolveInfo>(info)
    expectType<string | undefined>(context?.auth?.identity)
    return true
  },
  authContext (context: CustomContext) {
    expectType<CustomContext>(context)
    return { identity: context.reply.request.headers['x-auth'] }
  }
}

app.register(mercuriusAuth, authOptions)

// 3. Using options as object with generics
const authOptionsWithGenerics: MercuriusAuthOptions<CustomParent, CustomArgs, CustomContext> = {
  authDirective: 'auth',
  async applyPolicy (authDirectiveAST, parent, args, context, info) {
    expectAssignable<DirectiveNode>(authDirectiveAST)
    expectType<CustomParent>(parent)
    expectType<CustomArgs>(args)
    expectType<CustomContext>(context)
    expectType<GraphQLResolveInfo>(info)
    expectType<string | undefined>(context?.auth?.identity)
    return true
  },
  authContext (context) {
    expectType<CustomContext>(context)
    return { identity: context.reply.request.headers['x-auth'] }
  }
}

app.register(mercuriusAuth, authOptionsWithGenerics)

// 4. creating functions using types handlers
const authContext: AuthContextHandler<CustomContext> = (context) => {
  expectType<CustomContext>(context)
  return { identity: context.reply.request.headers['x-auth'] }
}

const applyPolicy: ApplyPolicyHandler<{}, {}, CustomContext> =
  async (authDirectiveAST, parent, args, context, info) => {
    expectAssignable<DirectiveNode>(authDirectiveAST)
    expectType<{}>(parent)
    expectType<{}>(args)
    expectType<CustomContext>(context)
    expectType<GraphQLResolveInfo>(info)
    expectType<string|undefined>(context?.auth?.identity)
    return true
  }

app.register(mercuriusAuth, {
  authDirective: 'auth',
  authContext,
  applyPolicy
})

app.register(mercuriusAuth, {
  applyPolicy,
  authContext,
  authDirective: 'auth',
  mode: 'directive'
})

// External policy for fields only
app.register(mercuriusAuth, {
  async applyPolicy (policy: string, parent, args, context, info) {
    expectType<string>(policy)
    expectType<any>(parent)
    expectType<any>(args)
    expectType<MercuriusContext>(context)
    expectType<GraphQLResolveInfo>(info)
    expectType<MercuriusAuthContext | undefined>(context.auth)
    return true
  },
  authContext,
  mode: 'external',
  policy: {
    Message: {
      message: 'user'
    },
    Query: {
      messages: 'user'
    }
  }
})

// External policy for field and types
app.register(mercuriusAuth, {
  async applyPolicy (policy: string, parent, args, context, info) {
    expectType<string>(policy)
    expectType<any>(parent)
    expectType<any>(args)
    expectType<MercuriusContext>(context)
    expectType<GraphQLResolveInfo>(info)
    expectType<MercuriusAuthContext | undefined>(context.auth)
    return true
  },
  authContext,
  mode: 'external',
  policy: {
    Message: {
      __typePolicy: 'user',
      message: 'admin'
    },
    Query: {
      messages: 'user'
    }
  }
})

// External Policy with a custom Policy type
interface CustomPolicy {
  requires: string[]
}
const externalPolicyOptions: MercuriusAuthOptions<CustomParent, CustomArgs, CustomContext, CustomPolicy> = {
  async applyPolicy (policy, parent, args, context, info) {
    expectType<CustomPolicy>(policy)
    expectType<CustomParent>(parent)
    expectType<CustomArgs>(args)
    expectType<CustomContext>(context)
    expectType<GraphQLResolveInfo>(info)
    expectType<string | undefined>(context?.auth?.identity)
    return true
  },
  authContext (context) {
    expectType<CustomContext>(context)
    return { identity: context.reply.request.headers['x-auth'] }
  },
  mode: 'external',
  policy: {
    Message: {
      __typePolicy: 'user',
      message: 'admin'
    },
    Query: {
      messages: 'user'
    }
  }
}
app.register(mercuriusAuth, externalPolicyOptions)

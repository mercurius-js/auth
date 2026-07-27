import fastify from 'fastify'
import { DirectiveNode, GraphQLResolveInfo, ValueNode } from 'graphql'
import { MercuriusContext } from 'mercurius'
import { expect } from 'tstyche'
import mercuriusAuth, {
  ApplyPolicyHandler,
  AuthCheck,
  AuthContextHandler,
  AuthRelation,
  ComposedPolicy,
  MercuriusAuthContext,
  MercuriusAuthOptions,
  compose,
  composeDirectivePolicy,
  composeDirectiveSdl,
  composeExternalPolicy
} from '..'

const app = fastify()

// 1. BASIC USAGE: DEFAULT TYPES
app.register(mercuriusAuth, {
  authDirective: 'auth',
  async applyPolicy (authDirectiveAST, parent, args, context, info) {
    expect(authDirectiveAST).type.toBe<any>()
    expect(parent).type.toBe<any>()
    expect(args).type.toBe<any>()
    expect(context).type.toBe<MercuriusContext>()
    expect(info).type.toBe<GraphQLResolveInfo>()
    expect(context.auth).type.toBe<MercuriusAuthContext | undefined>()
    return true
  },
  authContext (context) {
    expect(context).type.toBe<MercuriusContext>()
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
    authDirectiveAST: DirectiveNode,
    parent: CustomParent,
    args: CustomArgs,
    context: CustomContext,
    info
  ) {
    expect(authDirectiveAST).type.toBe<DirectiveNode>()
    expect(parent).type.toBe<CustomParent>()
    expect(args).type.toBe<CustomArgs>()
    expect(context).type.toBe<CustomContext>()
    expect(info).type.toBe<GraphQLResolveInfo>()
    expect(context?.auth?.identity).type.toBe<string | undefined>()
    return true
  },
  authContext (context: CustomContext) {
    expect(context).type.toBe<CustomContext>()
    return { identity: context.reply.request.headers['x-auth'] }
  }
}

app.register(mercuriusAuth, authOptions)

// 3. Using options as object with generics
const authOptionsWithGenerics: MercuriusAuthOptions<CustomParent, CustomArgs, CustomContext> = {
  authDirective: 'auth',
  async applyPolicy (authDirectiveAST, parent, args, context, info) {
    expect(authDirectiveAST).type.toBe<any>()
    expect(parent).type.toBe<CustomParent>()
    expect(args).type.toBe<CustomArgs>()
    expect(context).type.toBe<CustomContext>()
    expect(info).type.toBe<GraphQLResolveInfo>()
    expect(context?.auth?.identity).type.toBe<string | undefined>()
    return true
  },
  authContext (context) {
    expect(context).type.toBe<CustomContext>()
    return { identity: context.reply.request.headers['x-auth'] }
  }
}

app.register(mercuriusAuth, authOptionsWithGenerics)

// 4. creating functions using types handlers
const authContext: AuthContextHandler<CustomContext> = (context) => {
  expect(context).type.toBe<CustomContext>()
  return { identity: context.reply.request.headers['x-auth'] }
}

const applyPolicy: ApplyPolicyHandler<{}, {}, CustomContext> =
  async (authDirectiveAST, parent, args, context, info) => {
    expect(authDirectiveAST).type.toBe<any>()
    expect(parent).type.toBe<{}>()
    expect(args).type.toBe<{}>()
    expect(context).type.toBe<CustomContext>()
    expect(info).type.toBe<GraphQLResolveInfo>()
    expect(context?.auth?.identity).type.toBe<string | undefined>()
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
    expect(policy).type.toBe<string>()
    expect(parent).type.toBe<any>()
    expect(args).type.toBe<any>()
    expect(context).type.toBe<MercuriusContext>()
    expect(info).type.toBe<GraphQLResolveInfo>()
    expect(context.auth).type.toBe<MercuriusAuthContext | undefined>()
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
    expect(policy).type.toBe<string>()
    expect(parent).type.toBe<any>()
    expect(args).type.toBe<any>()
    expect(context).type.toBe<MercuriusContext>()
    expect(info).type.toBe<GraphQLResolveInfo>()
    expect(context.auth).type.toBe<MercuriusAuthContext | undefined>()
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
    expect(policy).type.toBe<CustomPolicy>()
    expect(parent).type.toBe<CustomParent>()
    expect(args).type.toBe<CustomArgs>()
    expect(context).type.toBe<CustomContext>()
    expect(info).type.toBe<GraphQLResolveInfo>()
    expect(context?.auth?.identity).type.toBe<string | undefined>()
    return true
  },
  authContext (context) {
    expect(context).type.toBe<CustomContext>()
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

// COMPOSED POLICIES
interface ScopeCheck {
  scope: string
}

// 1. The core combinator
expect(compose<string[]>([scopes => scopes.includes('admin')])).type.toBe<(prepared: string[]) => Promise<boolean>>()
expect(compose<string[]>([async scopes => scopes.includes('admin')], 'and')).type.toBe<(prepared: string[]) => Promise<boolean>>()
expect(compose([context => typeof context.auth !== 'undefined'])).type.toBe<(prepared: MercuriusContext) => Promise<boolean>>()

// 2. Directive mode
const directivePolicy = composeDirectivePolicy<ScopeCheck, string[]>({
  checkInput: 'scope: String!',
  authDirective: 'auth',
  defaultRelation: 'or',
  enabled: true,
  parseCheck (node) {
    expect(node).type.toBe<ValueNode>()
    return { scope: 'admin' }
  },
  prepare (context) {
    expect(context).type.toBe<MercuriusContext>()
    return []
  },
  evaluate (check, prepared) {
    expect(check).type.toBe<ScopeCheck>()
    expect(prepared).type.toBe<string[]>()
    return true
  },
  onDeny (context, info) {
    expect(context).type.toBe<MercuriusContext>()
    expect(info).type.toBe<GraphQLResolveInfo>()
    return new Error('denied')
  }
})

expect(directivePolicy.sdl).type.toBe<string>()
expect(directivePolicy.authDirective).type.toBe<string>()
expect(directivePolicy.applyPolicy).type.toBe<ApplyPolicyHandler<any, any, MercuriusContext, DirectiveNode>>()

app.register(mercuriusAuth, {
  authDirective: directivePolicy.authDirective,
  applyPolicy: directivePolicy.applyPolicy
})

// 3. External mode
const externalPolicy = composeExternalPolicy<ScopeCheck, string[], CustomContext>({
  prepare (context) {
    expect(context).type.toBe<CustomContext>()
    return []
  },
  evaluate (check, prepared) {
    expect(check).type.toBe<ScopeCheck>()
    expect(prepared).type.toBe<string[]>()
    return true
  },
  validate (check) {
    expect(check).type.toBe<ScopeCheck>()
  }
})

expect(externalPolicy.applyPolicy).type.toBe<ApplyPolicyHandler<any, any, CustomContext, ComposedPolicy<ScopeCheck>>>()

const composedPolicy: ComposedPolicy<ScopeCheck> = {
  checks: [{ scope: 'admin' }],
  relation: 'and'
}

expect(composedPolicy.relation).type.toBe<AuthRelation | undefined>()

app.register(mercuriusAuth, {
  mode: 'external',
  applyPolicy: externalPolicy.applyPolicy,
  policy: {
    Query: {
      messages: composedPolicy
    }
  }
})

// 4. The check type
const scopeCheck: AuthCheck<string[]> = scopes => scopes.includes('admin')
expect(scopeCheck).type.toBe<AuthCheck<string[]>>()

// 5. SDL generation
expect(composeDirectiveSdl()).type.toBe<string>()
expect(composeDirectiveSdl('auth', 'scope: String!')).type.toBe<string>()

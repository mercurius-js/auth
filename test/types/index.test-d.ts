import { expectType } from 'tsd'
import fastify from 'fastify'
import { DirectiveNode, GraphQLResolveInfo } from 'graphql'
import {  MercuriusContext } from 'mercurius'
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
    expectType<DirectiveNode>(authDirectiveAST)
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
  authDirective: 'auth',
  async applyPolicy (
    authDirectiveAST,
    parent: CustomParent,
    args: CustomArgs,
    context: CustomContext,
    info
  ) {
    expectType<DirectiveNode>(authDirectiveAST)
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
    expectType<DirectiveNode>(authDirectiveAST)
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
    expectType<DirectiveNode>(authDirectiveAST)
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

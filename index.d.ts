import { FastifyPluginAsync } from 'fastify'
import { DirectiveNode, GraphQLResolveInfo } from 'graphql'
import { MercuriusContext } from 'mercurius'

/**
 * the policy promise to run when an auth directive protected field is selected by the query.
 * This must return true in order to pass the check and allow access to the protected field.
 */
export type ApplyPolicyHandler<TParent=any, TArgs=any, TContext=MercuriusContext> = (
  authDirectiveAST: DirectiveNode,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<boolean | Error>;

/** assigns the returned data to `MercuriusContext.auth` for use in the `applyPolicy` function. */
export type AuthContextHandler<TContext=MercuriusContext> = (context: TContext) => object | Promise<object>;

export interface MercuriusAuthOptions<TParent=any, TArgs=any, TContext=MercuriusContext> {
  /** The name of the directive that the Mercurius auth plugin will look for within the GraphQL schema in order to identify protected fields. For example, for directive definition `directive @auth on OBJECT | FIELD_DEFINITION`, the corresponding name would be auth. */
  authDirective: string;
  /**
   * the policy promise to run when an auth directive protected field is selected by the query.
   * This must return true in order to pass the check and allow access to the protected field.
   */
  applyPolicy: ApplyPolicyHandler<TParent, TArgs, TContext>
  /** assigns the returned data to `MercuriusContext.auth` for use in the `applyPolicy` function. */
  authContext?: AuthContextHandler<TContext>;
}

/** Mercurius Auth is a plugin for `mercurius` that adds configurable Authentication and Authorization support. */
declare const mercuriusAuth: FastifyPluginAsync<MercuriusAuthOptions>

export interface MercuriusAuthContext extends Record<string, any> {}

declare module 'mercurius' {
  export interface MercuriusContext {
    auth?: MercuriusAuthContext
  }
}

export default mercuriusAuth

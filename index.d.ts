import { FastifyPluginAsync } from 'fastify'
import { DirectiveNode, GraphQLResolveInfo } from 'graphql'
import { MercuriusContext } from 'mercurius'

/**
 * the policy promise to run when an auth directive protected field is selected by the query.
 * This must return true in order to pass the check and allow access to the protected field.
 */
export type ApplyPolicyHandler = (
  authDirectiveAST: DirectiveNode,
  parent: any,
  args: any,
  context: MercuriusContext,
  info: GraphQLResolveInfo
) => Promise<boolean | Error>;

/** assigns the returned data to `MercuriusContext.auth` for use in the `applyPolicy` function. */
export type AuthContextHandler = (context: MercuriusContext) => object | Promise<object>;

export interface MercuriusAuthOptions {
  /** The name of the directive that the Mercurius auth plugin will look for within the GraphQL schema in order to identify protected fields. For example, for directive definition `directive @auth on OBJECT | FIELD_DEFINITION`, the corresponding name would be auth. */
  authDirective: string;
  /**
   * the policy promise to run when an auth directive protected field is selected by the query.
   * This must return true in order to pass the check and allow access to the protected field.
   */
  applyPolicy: ApplyPolicyHandler;
  /** assigns the returned data to `MercuriusContext.auth` for use in the `applyPolicy` function. */
  authContext?: AuthContextHandler;
}

/** Mercurius Auth is a plugin for `mercurius` that adds configurable Authentication and Authorization support. */
declare const mercuriusAuth: FastifyPluginAsync<MercuriusAuthOptions>

declare module 'mercurius' {
  interface MercuriusAuthContext {
    auth?: Record<string, any>
  }
  export interface MercuriusContext extends MercuriusAuthContext {}
}

export default mercuriusAuth

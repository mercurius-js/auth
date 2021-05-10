import { FastifyInstance } from 'fastify'
import { DirectiveNode, GraphQLResolveInfo } from 'graphql'
import { MercuriusContext } from 'mercurius'

type ObjectType = Record<string, unknown>

/**
 * the policy promise to run when an auth directive protected field is selected by the query.
 * This must return true in order to pass the check and allow access to the protected field.
 */
export type ApplyPolicyHandler<
  TParent = ObjectType,
  TArgs = { [argName: string]: any },
  TContext = MercuriusContext
> = (
  authDirectiveAST: DirectiveNode,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<boolean | Error>

/** assigns the returned data to `MercuriusContext.auth` for use in the `applyPolicy` function. (optional) */
export type AuthContextHandler<TContext = MercuriusContext> = (
  context: TContext
) => ObjectType | Promise<ObjectType>

export interface MercuriusAuthOptions<
  TParent = ObjectType,
  TArgs = { [argName: string]: any },
  TContext = MercuriusContext
> {
  /**
   * @property { string } authDirective
   * @description the name of the directive that the Mercurius auth plugin will look for within the GraphQL schema in order to identify protected fields.
   * @example for directive definition `directive @auth on OBJECT | FIELD_DEFINITION`, the corresponding name would be auth.
   */
  authDirective: string
  /**
   * the policy promise to run when an auth directive protected field is selected by the query.
   * This must return true in order to pass the check and allow access to the protected field.
   */
  applyPolicy: ApplyPolicyHandler<TParent, TArgs, TContext>
  /** assigns the returned data to `MercuriusContext.auth` for use in the `applyPolicy` function. (optional) */
  authContext?: AuthContextHandler<TContext>
}

/** Mercurius Auth is a plugin for `mercurius` that adds configurable Authentication and Authorization support. */
declare function mercuriusAuth(
  instance: FastifyInstance,
  options: MercuriusAuthOptions<any, any, any>
): void

declare module 'mercurius' {
  interface MercuriusContext {
    auth?: { [argName: string]: any }
  }
}

export default mercuriusAuth

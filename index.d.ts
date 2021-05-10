import { FastifyInstance } from "fastify";
import { DirectiveNode, GraphQLResolveInfo } from "graphql";
import { MercuriusContext } from "mercurius";

/**
 * @async
 * @name applyPolicy
 * @description the policy promise to run when an auth directive protected field is selected by the query. This must return true in order to pass the check and allow access to the protected field.
 * @param { DirectiveNode } authDirectiveAST
 * @param { TParent } parent
 * @param { TArgs } args
 * @param { TContext } context
 * @param { GraphQLResolveInfo } info
 * @returns `Promise<boolean|Error>`
 */
export type ApplyPolicyHandler<
  TParent = object,
  TArgs = { [argName: string]: any },
  TContext = MercuriusContext
> = (
  authDirectiveAST: DirectiveNode,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<Boolean | Error>;

/**
 * @name authContext
 * @description  (optional) - assigns the returned data to `MercuriusContext.auth` for use in the `applyPolicy` function.
 * @param { TContext } context
 * @returns {object} `object | Promise<object>`
 */
export type AuthContextHandler<TContext = MercuriusContext> = (
  context: TContext
) => object | Promise<object>;

/**
 * mercurius-auth supports the following options
 * @param { string } authDirective
 * @param { ApplyPolicyHandler } applyPolicy
 * @param { AuthContextHandler= } [authContext]
 */
export type MercuriusAuthOptions = {
  authDirective: string;
  applyPolicy: ApplyPolicyHandler;
  authContext?: AuthContextHandler;
};

/**
 * @func mercuriusAuth
 * @param { FastifyInstance } instance
 * @param  { MercuriusAuthOptions } options
 * @description Mercurius Auth is a plugin for `mercurius` that adds configurable Authentication and Authorization support.
 */
declare function mercuriusAuth(
  instance: FastifyInstance,
  options: MercuriusAuthOptions
): void;

declare module "fastify" {
  interface MercuriusContext {
    auth?: object;
  }
}

export default mercuriusAuth;

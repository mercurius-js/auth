import { FastifyPluginAsync } from 'fastify'
import { DirectiveNode, GraphQLResolveInfo } from 'graphql'
import { MercuriusContext } from 'mercurius'

// The types below are declared as a namespace merged with the callable declaration
// of the plugin, which is how a CommonJS module is described to TypeScript. The two
// halves of that merge reference each other by design, so the two rules that read it
// as an accident are turned off for this file.
/* eslint-disable no-use-before-define, no-redeclare */

type MercuriusAuthPlugin = FastifyPluginAsync<mercuriusAuth.MercuriusAuthOptions>

declare namespace mercuriusAuth {
  /**
   * The auth policy definitions used to protect the type and fields within the GraphQL Object type.
   */
  export interface MercuriusAuthTypePolicy extends Record<string, any> {
    /**
     * Define the auth policy for the associated GraphQL type.
     */
    __typePolicy?: any;
  }

  /**
   * The auth policy definitions used to protect the types and fields within a GraphQL schema.
   */
  export type MercuriusAuthPolicy = Record<string, MercuriusAuthTypePolicy>

  /**
   * The mode of operation for Mercurius Auth (default: 'directive').
   */
  export type MercuriusAuthMode = 'directive' | 'external'

  /**
   * The policy promise to run when an auth directive protected field is selected by the query.
   * This must return true in order to pass the check and allow access to the protected field.
   */
  export type ApplyPolicyHandler<TParent=any, TArgs=any, TContext=MercuriusContext, TPolicy=any> = (
    policy: TPolicy,
    parent: TParent,
    args: TArgs,
    context: TContext,
    info: GraphQLResolveInfo
  ) => Promise<boolean | Error>;

  /** Assigns the returned data to `MercuriusContext.auth` for use in the `applyPolicy` function. */
  export type AuthContextHandler<TContext=MercuriusContext> = (context: TContext) => object | Promise<object>;

  export interface MercuriusAuthBaseOptions<TParent=any, TArgs=any, TContext=MercuriusContext, TPolicy=any> {
    /**
     * The policy promise to run when a protected field is selected by the query.
     * This must return true in order to pass the check and allow access to the protected field.
     */
    applyPolicy: ApplyPolicyHandler<TParent, TArgs, TContext, TPolicy>
    /**
     * Assigns the returned data to `MercuriusContext.auth` for use in the `applyPolicy` function.
     */
    authContext?: AuthContextHandler<TContext>;
    /**
     * The mode of operation for Mercurius Auth (default: `'directive'`).
     */
    mode?: MercuriusAuthMode;
  }

  export interface MercuriusAuthDirectiveOptions<TParent=any, TArgs=any, TContext=MercuriusContext, TPolicy=DirectiveNode> extends MercuriusAuthBaseOptions<TParent, TArgs, TContext, TPolicy> {
    /**
     * The Directive mode of operation for Mercurius Auth.
     */
    mode?: 'directive';
    /**
     * The name of the directive that the Mercurius auth plugin will look for within the GraphQL schema in order to identify protected fields. For example, for directive definition `directive @auth on OBJECT | FIELD_DEFINITION`, the corresponding name would be auth.
     */
    authDirective: string;
    /**
     * When set to true, the plugin will automatically filter the output Schema during Introspection queries if the applyPolicy function is not satisfated.
     */
    filterSchema?: boolean;
    /**
     * Output Policy Errors
     */
    outputPolicyErrors?: {
      /**
       * If this is set any 'string' type would be replaced with the returned string value either static or from a function.
       */
      valueOverride?: ((input: string) => string) | string;
    }
  }

  export interface MercuriusAuthExternalPolicyOptions<TParent=any, TArgs=any, TContext=MercuriusContext, TPolicy=any> extends MercuriusAuthBaseOptions<TParent, TArgs, TContext, TPolicy> {
    /**
     * The External Policy mode of operation for Mercurius Auth.
     */
    mode: 'external';
    /**
     * The auth policy definitions used to protect the types and fields within a GraphQL schema.
     */
    policy?: MercuriusAuthPolicy;
  }

  export type MercuriusAuthOptions<TParent=any, TArgs=any, TContext=MercuriusContext, TPolicy=any> = MercuriusAuthDirectiveOptions<TParent, TArgs, TContext, TPolicy> | MercuriusAuthExternalPolicyOptions<TParent, TArgs, TContext, TPolicy>

  export interface MercuriusAuthContext extends Record<string, any> {}

  /** Mercurius Auth is a plugin for `mercurius` that adds configurable Authentication and Authorization support. */
  export const mercuriusAuth: MercuriusAuthPlugin

  export { mercuriusAuth as default }
}

/**
 * Mercurius Auth is a plugin for `mercurius` that adds configurable Authentication
 * and Authorization support.
 *
 * The package is CommonJS, so the types are declared with `export =`: `require`, a
 * default import and a namespace import all resolve to the plugin itself, with no
 * `.default` indirection under the `node16`/`nodenext` module modes.
 */
declare function mercuriusAuth (...params: Parameters<MercuriusAuthPlugin>): ReturnType<MercuriusAuthPlugin>

declare module 'mercurius' {
  export interface MercuriusContext {
    auth?: mercuriusAuth.MercuriusAuthContext
  }
}

export = mercuriusAuth

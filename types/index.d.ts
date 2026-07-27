import { FastifyPluginAsync } from 'fastify'
import { DirectiveNode, GraphQLResolveInfo, ValueNode } from 'graphql'
import { MercuriusContext } from 'mercurius'

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

  /**
   * How a list of auth checks combines: `'or'` grants when any check passes,
   * `'and'` only when every check passes.
   */
  export type AuthRelation = 'and' | 'or'

  /**
   * A single auth check: a predicate over the value the checks are evaluated against.
   */
  export type AuthCheck<TPrepared=MercuriusContext> = (prepared: TPrepared) => boolean | Promise<boolean>

  /**
   * Compose auth checks into a single check combined by `relation` (default: `'or'`).
   * An empty list of checks denies, and any relation that is not exactly `'or'`
   * combines as AND, so composition can never fail open. Compositions nest.
   */
  export function compose<TPrepared=MercuriusContext>(
    checks: ReadonlyArray<AuthCheck<TPrepared>>,
    relation?: AuthRelation
  ): (prepared: TPrepared) => Promise<boolean>

  /**
   * The options shared by both composed policy modes: how one check is judged, and
   * what happens around it.
   */
  export interface ComposedPolicyOptions<TCheck=any, TPrepared=MercuriusContext, TContext=MercuriusContext> {
    /**
     * Judge one check against the `prepare`d value. Called once per check of the
     * matching policy; the results are combined by the policy's relation.
     */
    evaluate: (check: TCheck, prepared: TPrepared) => boolean | Promise<boolean>;
    /**
     * Derive the value the checks are judged against from the context, once per
     * protected field, before any check runs. If it throws, the thrown error becomes
     * the field's error, which distinguishes "authorization unavailable" from a
     * denial. When omitted, the context itself is passed to `evaluate`.
     */
    prepare?: (context: TContext) => TPrepared | Promise<TPrepared>;
    /**
     * The error returned when the composition denies. When omitted, the composed
     * policy returns `false` and the plugin raises `MER_AUTH_ERR_FAILED_POLICY_CHECK`.
     */
    onDeny?: (context: TContext, info: GraphQLResolveInfo) => Error;
    /**
     * The relation applied when a policy does not specify one (default: `'or'`).
     */
    defaultRelation?: AuthRelation;
    /**
     * When `false`, every composed policy passes without evaluating its checks
     * (default: `true`).
     */
    enabled?: boolean;
  }

  /**
   * The options of a composed `directive` mode policy.
   */
  export interface ComposedDirectivePolicyOptions<TCheck=any, TPrepared=MercuriusContext, TContext=MercuriusContext> extends ComposedPolicyOptions<TCheck, TPrepared, TContext> {
    /**
     * Parse one element of the directive's `checks` list into a check. Throw to
     * reject a malformed check: the error becomes the protected field's error.
     */
    parseCheck: (node: ValueNode) => TCheck;
    /**
     * The name of the composed auth directive (default: `'auth'`). The generated
     * type names are derived from it, so several composed directives can coexist.
     */
    authDirective?: string;
    /**
     * The body of the generated `<Name>Check` input type
     * (default: `'requires: [String!]!'`).
     */
    checkInput?: string;
  }

  /**
   * The options of a composed `external` mode policy.
   */
  export interface ComposedExternalPolicyOptions<TCheck=any, TPrepared=MercuriusContext, TContext=MercuriusContext> extends ComposedPolicyOptions<TCheck, TPrepared, TContext> {
    /**
     * Validate one check of a policy value. Throw to reject it: the error becomes
     * the protected field's error. When omitted, checks are evaluated as supplied.
     */
    validate?: (check: TCheck) => void;
  }

  /**
   * An `external` mode policy value holding the checks to compose.
   */
  export interface ComposedPolicy<TCheck=any> {
    checks: ReadonlyArray<TCheck>;
    relation?: AuthRelation;
  }

  /**
   * Compose the checks of a `@<name>(checks: [...], relation: AND | OR)` directive
   * into an `applyPolicy` for `directive` mode, alongside the `sdl` defining the
   * directive and the `authDirective` name to register the plugin with.
   */
  export function composeDirectivePolicy<TCheck=any, TPrepared=MercuriusContext, TContext=MercuriusContext, TParent=any, TArgs=any>(
    options: ComposedDirectivePolicyOptions<TCheck, TPrepared, TContext>
  ): {
    applyPolicy: ApplyPolicyHandler<TParent, TArgs, TContext, DirectiveNode>;
    sdl: string;
    authDirective: string;
  }

  /**
   * Compose the checks of a `{ checks: [...], relation: 'and' | 'or' }` policy value
   * into an `applyPolicy` for `external` mode.
   */
  export function composeExternalPolicy<TCheck=any, TPrepared=MercuriusContext, TContext=MercuriusContext, TParent=any, TArgs=any>(
    options: ComposedExternalPolicyOptions<TCheck, TPrepared, TContext>
  ): {
    applyPolicy: ApplyPolicyHandler<TParent, TArgs, TContext, ComposedPolicy<TCheck>>;
  }

  /**
   * Build the SDL defining a composed auth directive: the `<Name>Relation` enum, the
   * `<Name>Check` input, and the repeatable `@<name>(checks, relation)` directive.
   */
  export function composeDirectiveSdl(authDirective?: string, checkInput?: string): string

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

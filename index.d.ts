import { FastifyInstance } from "fastify";
import { DirectiveNode, GraphQLResolveInfo } from "graphql";
import { MercuriusContext } from "mercurius";

interface MercuriusAuthOptions {
  authContext?: (context: MercuriusContext) => object | Promise<object>;
  applyPolicy: (
    authDirectiveAST: DirectiveNode,
    parent: object,
    args: Record<string, any>,
    context: MercuriusContext,
    info: GraphQLResolveInfo
  ) => Promise<boolean | Error>;
  authDirective: string;
}

declare function mercuriusAuth(
  instance: FastifyInstance,
  opts: MercuriusAuthOptions
): void;

declare module "mercurius" {
  interface MercuriusContext {
    auth?: Record<string, any>;
  }
}

export = mercuriusAuth;

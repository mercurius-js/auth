'use strict'

const Fastify = require('fastify')
const mercurius = require('mercurius')
const mercuriusAuth = require('..')

const app = Fastify()

const schema = `
  directive @auth(requires: [Role]) on OBJECT | FIELD_DEFINITION

  enum Role {
    ADMIN
    USER
    UNKNOWN
  }

  type Query {
    add(x: Int, y: Int): Int @auth(requires: [ADMIN, USER])
    subtract(x: Int, y: Int): Int @auth(requires: [ADMIN])
  }
`

const resolvers = {
  Query: {
    add: async (_, { x, y }) => x + y,
    subtract: async (_, { x, y }) => x - y,
  },
}

app.register(mercurius, {
  schema,
  resolvers,
})

app.register(mercuriusAuth, {
  authContext(context) {
    return {
      user: {
        id: context.reply.request.headers['x-user-id'],
        role: context.reply.request.headers['x-user-role'],
      },
    }
  },
  async applyPolicy(policy, parent, args, context, info) {
    const userId = context?.auth?.user?.id
    const userRole = context?.auth?.user?.role ?? ''

    if (!userId)
      throw new Error('No Authorization was found in request.headers')

    const roles = [userRole]
    const requires = policy.arguments[0].value.values.map((roleEnum) =>
      roleEnum.value.toLowerCase()
    )

    const isAuthorized = roles.some((role) => requires.includes(role))
    if (isAuthorized) return true
    throw new Error(`Insufficient permission for ${info.fieldName}`)
  },
  authDirective: 'auth',
})

app.listen({ port: 3000 })

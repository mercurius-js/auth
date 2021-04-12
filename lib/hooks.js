'use strict'

const { GraphQLDirective, GraphQLError } = require('graphql')

function authContextHook (authContext) {
  return async (_schema, _document, context) => {
    await authContext(context)
    // TODO: assign context from result
    // if (typeof result !== 'undefined') {
    //   Object.assign(context, result)
    // }
  }
}

class Policy {
  constructor ({ applyPolicy }) {
    this.applyPolicy = applyPolicy
    // TODO: set this from options
    this.authDirective = new GraphQLDirective({ name: 'auth', locations: [] })
  }

  getAuthDirectiveAST (field) {
    if (field.astNode && field.astNode.directives && field.astNode.directives.length > 0) {
      const authDirective = field.astNode.directives.find(directive => directive.name.value === this.authDirective.name)
      if (typeof authDirective !== 'undefined') {
        return authDirective
      }
    }
    return null
  }

  buildCursor (cursor, selection) {
    const selectionName = typeof selection.alias !== 'undefined' ? selection.alias.value : selection.name.value
    return {
      path: cursor.path.concat(selectionName)
    }
  }

  async walkQueryAST (schemaTypeMap, definition, context, cursor) {
    const newSelections = []
    const errors = []
    for (const selection of definition.selectionSet.selections) {
      const newCursor = this.buildCursor(cursor, selection)
      const authDirectiveAST = this.getAuthDirectiveAST(schemaTypeMap[selection.name.value])
      if (authDirectiveAST !== null) {
        if (await this.applyPolicy(authDirectiveAST, context)) {
          // TODO: support nested types
          // if (typeof selection !== 'undefined' && typeof selection.selectionSet !== 'undefined') {
          //   await this.walkQueryAST(schemaTypeMap, selection, context, newCursor)
          // }
          newSelections.push(selection)
        } else {
          errors.push(new GraphQLError('auth error', selection, undefined, undefined, newCursor.path))
        }
      } else {
        newSelections.push(selection)
      }
    }
    // TODO: add test case here
    /* istanbul ignore else: not yet tested */
    if (newSelections.length > 0) {
      definition.selectionSet.selections = newSelections
    } else {
      // TODO: return here in the future so we can remove types from a query when nothing is allowed
      // definition.selectionSet = undefined
    }
    return errors
  }

  async applyPolicyHook (schema, document, context) {
    // TODO: first check if there are directives
    const authErrors = []

    for (const definition of document.definitions) {
      // TODO: support mutations and subscriptions
      const schemaTypeMap = schema.getQueryType().getFields()

      // TODO: run check on definition
      /* istanbul ignore else: not yet tested */
      if (typeof definition.selectionSet !== 'undefined') {
        const errors = await this.walkQueryAST(schemaTypeMap, definition, context, { path: [] })
        authErrors.push(...errors)
      }
      //   if (isObjectType(type) && !isDefaultType(type.name)) {
      //     const serviceForType = typeToServiceMap[type.name]

    //     for (const field of Object.values(type.getFields())) {
    //     }
    //   }
    }

    if (authErrors.length === 0) {
      context.auth.errors = null
    } else {
      context.auth.errors = authErrors
    }

    return {
      document,
      errors: authErrors
    }
  }

  async onResolutionHook (execution, context) {
    if (context.auth.errors !== null) {
      for (const authError of context.auth.errors) {
        const path = [].concat(authError.path)
        const executionScope = execution.data
        // TODO: add test case here
        /* istanbul ignore else: not yet tested */
        if (executionScope !== null) {
          for (const pathScope of path) {
            // TODO: add test case here
            /* istanbul ignore else: not yet tested */
            if (executionScope !== null) {
              // TODO: add test case here
              /* istanbul ignore else: not yet tested */
              if (typeof executionScope[pathScope] === 'undefined') {
                executionScope[pathScope] = null
              } else {
                // TODO: support nested queries
                // executionScope = executionScope[pathScope]
              }
            }
          }
        }
      }
    }
  }
}

module.exports.authContextHook = authContextHook
module.exports.Policy = Policy

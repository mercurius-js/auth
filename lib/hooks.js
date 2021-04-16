'use strict'

const { GraphQLDirective, GraphQLError, getNamedType } = require('graphql')

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
    // TODO: use symbols
    this.applyPolicy = applyPolicy
    // TODO: set this from options
    this.authDirective = new GraphQLDirective({ name: 'auth', locations: [] })
    this.schemaNamedTypeMap = null
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

  async walkQueryAST (fieldTypeMap, definition, context, cursor) {
    const selectionsToRemove = []
    const errors = []
    const nestedPromises = []
    await Promise.all(definition.selectionSet.selections.map(async selection => {
      const newCursor = this.buildCursor(cursor, selection)
      const field = fieldTypeMap[selection.name.value]
      const namedType = getNamedType(field.type)
      const authDirectiveAST = this.getAuthDirectiveAST(field)
      if (authDirectiveAST !== null) {
        const canAccessField = await this.applyPolicy(authDirectiveAST, context)
        if (canAccessField) {
          // TODO: centralise these
          if (typeof selection !== 'undefined' && typeof selection.selectionSet !== 'undefined' && selection.selectionSet.selections.length > 0) {
            nestedPromises.push(this.walkQueryAST(namedType.getFields(), selection, context, newCursor))
          }
        } else {
          errors.push(new GraphQLError('auth error', selection, undefined, undefined, newCursor.path))
          selectionsToRemove.push(selection.name.value)
        }
        // TODO: centralise these
      } else if (typeof selection !== 'undefined' && typeof selection.selectionSet !== 'undefined') {
        nestedPromises.push(this.walkQueryAST(namedType.getFields(), selection, context, newCursor))
      }
    }))

    const nestedErrors = await Promise.all(nestedPromises)
    errors.push(...nestedErrors.flat())

    // TODO: add test case here
    /* istanbul ignore else: not yet tested */
    if (selectionsToRemove.length > 0) {
      definition.selectionSet.selections = definition.selectionSet.selections.filter(selection => !selectionsToRemove.includes(selection.name.value))
    } else {
      // TODO: return here in the future so we can remove types from a query when nothing is allowed
      // definition.selectionSet = undefined
    }
    return errors
  }

  async applyPolicyHook (schema, document, context) {
    this.schemaNamedTypeMap = schema.getTypeMap()
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

  setErrorFieldsToNull (execution, path) {
    const [field] = path
    if (Array.isArray(execution[field])) {
      for (const idx of execution[field].keys()) {
        this.setErrorFieldsToNull(execution[field][idx], path.slice(1))
      }
    } else {
      const isLastPath = path.length === 1
      // TODO: add test case here
      /* istanbul ignore else: not yet tested */
      if (typeof execution[field] === 'undefined') {
        execution[field] = null
      } else {
        if (!isLastPath) {
          this.setErrorFieldsToNull(execution[field], path.slice(1))
        }
      }
    }
  }

  async onResolutionHook (execution, context) {
    if (context.auth.errors !== null) {
      for (const { path } of context.auth.errors) {
        // TODO: add test case here
        /* istanbul ignore else: not yet tested */
        if (execution.data !== null) {
          this.setErrorFieldsToNull(execution.data, path)
        }
      }
    }
  }
}

module.exports.authContextHook = authContextHook
module.exports.Policy = Policy

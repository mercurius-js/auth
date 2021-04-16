'use strict'

const { GraphQLDirective, GraphQLError, getNamedType } = require('graphql')
const { upperFirst } = require('./utils')

function authContextHook (authContext) {
  return async (_schema, _document, context) => {
    const auth = await authContext(context)
    Object.assign(context, { auth })
  }
}

class Policy {
  constructor ({ applyPolicy }) {
    // TODO: use symbols
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

  async applyPolicyToSelections (fieldTypeMap, parentDefinition, definition, context, cursor) {
    const selectionsToRemove = []
    const errors = []
    const nestedSelectionsPromises = []
    await Promise.all(definition.selectionSet.selections.map(async selection => {
      // Build cursor so we know where we are
      const newCursor = this.buildCursor(cursor, selection)

      // Check if protected field
      const field = fieldTypeMap[selection.name.value]
      const authDirectiveAST = this.getAuthDirectiveAST(field)

      // If protected field, apply policy and apply errors
      if (authDirectiveAST !== null && !await this.applyPolicy(authDirectiveAST, context)) {
        errors.push(new GraphQLError('auth error', selection, undefined, undefined, newCursor.path))
        selectionsToRemove.push(selection.name.value)
        return
      }

      // Continue down the tree if we have further fields to check
      const namedType = getNamedType(field.type)
      if (typeof namedType.getFields === 'function') {
        nestedSelectionsPromises.push(this.applyPolicyToSelections(namedType.getFields(), definition, selection, context, newCursor))
      }
    }))

    const nestedErrors = await Promise.all(nestedSelectionsPromises)
    errors.push(...nestedErrors.flat())

    // TODO: add test case here
    /* istanbul ignore else: not yet tested */
    if (selectionsToRemove.length > 0) {
      if (parentDefinition !== null && selectionsToRemove.length === definition.selectionSet.selections.length) {
        parentDefinition.selectionSet.selections = parentDefinition.selectionSet.selections.filter(selection => selection.name.value !== definition.name.value)
      } else {
        definition.selectionSet.selections = definition.selectionSet.selections.filter(selection => !selectionsToRemove.includes(selection.name.value))
      }
    } else {
      // TODO: return here in the future so we can remove types from a query when nothing is allowed
      // definition.selectionSet = undefined
    }
    return errors
  }

  async applyPolicyHook (schema, document, context) {
    // Make a symbol
    context.authErrors = null

    // TODO: first check if there are directives
    const authErrors = []

    // Apply policy to document definitions
    for (const definition of document.definitions) {
      const schemaTypeMap = schema.getType(upperFirst(definition.operation)).getFields()

      // TODO: run check on definition
      /* istanbul ignore else: not yet tested */
      if (typeof definition.selectionSet !== 'undefined') {
        const errors = await this.applyPolicyToSelections(schemaTypeMap, null, definition, context, { path: [] })
        authErrors.push(...errors)
      }
    }

    if (authErrors.length > 0) {
      context.authErrors = authErrors
    }

    return {
      document,
      errors: authErrors
    }
  }

  setForbiddenFieldsToNull (execution, path) {
    const [field] = path
    if (Array.isArray(execution[field])) {
      for (const idx of execution[field].keys()) {
        this.setForbiddenFieldsToNull(execution[field][idx], path.slice(1))
      }
    } else {
      if (typeof execution[field] === 'undefined') {
        execution[field] = null
      } else if (execution[field] !== null) {
        this.setForbiddenFieldsToNull(execution[field], path.slice(1))
      }
    }
  }

  async onResolutionHook (execution, context) {
    if (context.authErrors !== null) {
      for (const { path } of context.authErrors) {
        // TODO: add test case here
        /* istanbul ignore else: not yet tested */
        if (execution.data !== null) {
          this.setForbiddenFieldsToNull(execution.data, path)
        }
      }
    }
  }
}

module.exports.authContextHook = authContextHook
module.exports.Policy = Policy

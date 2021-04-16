'use strict'

function upperFirst (input) {
  return `${input.charAt(0).toUpperCase()}${input.slice(1)}`
}

module.exports.upperFirst = upperFirst

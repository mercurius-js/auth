'use strict'

module.exports = {
  kMode: Symbol('mode'),
  kPolicy: Symbol('policy'),
  kApplyPolicy: Symbol('apply policy'),
  kAuthContext: Symbol('auth context'),
  kAuthDirective: Symbol('auth directive'),
  kGetAuthDirectiveAST: Symbol('get auth directive ast'),
  kMakeProtectedResolver: Symbol('make protected resolver'),
  kBuildPolicy: Symbol('build policy'),
  kSetTypePolicy: Symbol('set type policy'),
  kSetFieldPolicy: Symbol('set field policy'),
  kWrapFieldResolver: Symbol('wrap field resolver')
}

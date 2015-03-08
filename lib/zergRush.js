
// Default usage of zerg-rush should include the registrations and runner
var zergRush = require('./registration.js')
zergRush.run = require('./runner.js').run

// This way you could choose to use the runner and/or registrations without all the built-in modules
zergRush.registerBuiltInModules()

module.exports = zergRush
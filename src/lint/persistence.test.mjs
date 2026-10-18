import { describe, it } from 'node:test'
import { RuleTester } from 'oxlint/plugins-dev'
import plugin from './persistence.js'

RuleTester.describe = describe
RuleTester.it = it
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } })
const valid = ["$.store.set('settings', {})", "$.store.delete('settings')", "$.store.get('cards')", "$.fs.read('a')", "$.fs.write(path, 'b')", "$.config.get('x')"]
const invalid = ["$.store.set('cards', {})", "$.store.set('words', {})", "$.store.set(key, {})", "$.store.delete('cards')", "$.config.set('x', 1)", "$.process.run('ls')"]
tester.run('settings-only', plugin.rules['settings-only'], { valid, invalid: invalid.map(code => ({ code, errors: 1 })) })

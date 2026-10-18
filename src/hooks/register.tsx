import type { Register } from 'claude-code'
import { board } from './ship'
import { guard } from './guard'
import { dashboard, setAfloat } from './flagship'
import { askUser, recordDecision, reportStatus, setBrief } from './tools'

// ディレクトリの審査は、on の登録がこのファイルに 1 行ずつ並んでいないと読めない
export const register: Register = on => {
  on('command.run', { command: 'software-fleet:set-afloat' }, setAfloat)
  on('tool.call', { tool: 'Artifact' }, dashboard)
  on('tool.call', { tool: 'Skill' }, board)
  on('tool.call', { tool: 'ArtifactData' }, guard)
  on('tool.call', { tool: 'mcp__software-fleet__set_brief' }, setBrief)
  on('tool.call', { tool: 'mcp__software-fleet__ask_user' }, askUser)
  on('tool.call', { tool: 'mcp__software-fleet__record_decision' }, recordDecision)
  on('tool.call', { tool: 'mcp__software-fleet__report_status' }, reportStatus)
}

import { describe, it, expect, beforeEach } from 'vitest'
import { WorkflowEngine } from '../engine'
import { PluginSDK } from '../pluginSDK'
import { registerBaseWorkflows } from '../baseWorkflows'
import { getCommand, registerCommand, clearCommands } from '../commandRegistry'
import { parseCommand } from '../../shared/commandUtils'

describe('Command registration', () => {
  beforeEach(() => {
    clearCommands()
  })

  it('registerCommand via SDK stores handle, getCommand retrieves it', () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    const sdk = new PluginSDK(engine, 'test-plugin')
    const handle = sdk.defineWorkflow('test:cmd', () => {})
    sdk.registerCommand('.test', handle)

    expect(getCommand('.test')).toBe(handle)
  })

  it('getCommand returns undefined for unknown commands', () => {
    expect(getCommand('.nonexistent')).toBeUndefined()
  })

  it('base workflows register .r and .roll after registerBaseWorkflows', () => {
    // registerBaseWorkflows calls registerCommand for .r and .roll
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)

    expect(getCommand('.r')).toBeDefined()
    expect(getCommand('.roll')).toBeDefined()
    expect(getCommand('.r')).toBe(getCommand('.roll')) // aliases
  })

  it('plugin can register custom commands via SDK', () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)
    const sdk = new PluginSDK(engine, 'test-cmd-plugin')
    const wf = sdk.defineWorkflow('test:custom', () => {})
    sdk.registerCommand('.custom', wf)

    expect(getCommand('.custom')).toBeDefined()
  })

  it('clearCommands clears command map', () => {
    const engine = new WorkflowEngine()
    registerBaseWorkflows(engine)

    expect(getCommand('.r')).toBeDefined()

    clearCommands()
    expect(getCommand('.r')).toBeUndefined()
  })

  it('registerCommand directly stores and retrieves handle', () => {
    const engine = new WorkflowEngine()
    const handle = engine.defineWorkflow('direct:test', () => {})
    registerCommand('.direct', handle)

    expect(getCommand('.direct')).toBe(handle)
  })
})

describe('parseCommand', () => {
  it('parses .r 2d6 → name=".r", raw="2d6"', () => {
    expect(parseCommand('.r 2d6')).toEqual({ name: '.r', raw: '2d6' })
  })

  it('parses .dd @agility → name=".dd", raw="@agility"', () => {
    expect(parseCommand('.dd @agility')).toEqual({ name: '.dd', raw: '@agility' })
  })

  it('parses .roll 2d6+3 → name=".roll", raw="2d6+3"', () => {
    expect(parseCommand('.roll 2d6+3')).toEqual({ name: '.roll', raw: '2d6+3' })
  })

  it('parses .DD → case insensitive → name=".dd"', () => {
    expect(parseCommand('.DD')).toEqual({ name: '.dd', raw: '' })
  })

  it('returns null for non-command text', () => {
    expect(parseCommand('hello world')).toBeNull()
  })

  it('returns null for bare dot (. text)', () => {
    expect(parseCommand('. text')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseCommand('')).toBeNull()
  })

  it('handles command with no args', () => {
    expect(parseCommand('.dd')).toEqual({ name: '.dd', raw: '' })
  })

  it('handles command with multiple spaces before args', () => {
    expect(parseCommand('.r   2d6')).toEqual({ name: '.r', raw: '2d6' })
  })

  it('preserves whitespace within args', () => {
    expect(parseCommand('.r 2d6 + 3')).toEqual({ name: '.r', raw: '2d6 + 3' })
  })
})

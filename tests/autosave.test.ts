import type { Engine, On } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const MIN = 60_000

// The engine beneath the plugin: records each command the mod runs.
const world = (on: On) => {
  const clock = mock.clock(on)
  const ran: string[] = []
  on('command.run', (_, e) => {
    ran.push(`${e.command} ${e.args}`.trim())
    return { text: '' }
  })
  on('tool.call', () => ({ result: {} }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 's1' }) as never)
  return { clock, ran }
}

let turns = 0
const typed = async ($: Engine, text = 'go on') => {
  const turnId = `t${++turns}`
  await $.prompt.submit({ text, origin: { kind: 'composer' } } as never)
  await $.turn.start({ text, turnId })
  return turnId
}
const reply = ($: Engine, turnId: string) =>
  $.turn.complete({ turnId, answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer' } as never)
const skill = ($: Engine, name: string) => $.tool.call({ tool: 'Skill', skill: name } as never)
const edit = ($: Engine) =>
  $.tool.call({ tool: 'Edit', file_path: '/x', old_string: 'a', new_string: 'b' } as never)

const begin = async ($: Engine) =>
  $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as never)

test('an idle session with notes work and a write saves once, without promotion', async ($, on) => {
  const { clock, ran } = world(on)
  await begin($)
  const t = await typed($)
  await skill($, 'nk:load')
  await edit($)
  await reply($, t)

  await clock.advance(29 * MIN)
  expect(ran).toEqual([])
  await clock.advance(1 * MIN)
  expect(ran).toEqual(['nk:save --unattended --no-promote'])

  // The save's own turn ends; nothing re-arms until a prompt is typed.
  await reply($, 'save-turn')
  await clock.advance(120 * MIN)
  expect(ran.length).toBe(1)
})

test('typing before the timer ends cancels it', async ($, on) => {
  const { clock, ran } = world(on)
  await begin($)
  const t = await typed($)
  await skill($, 'nk:load')
  await edit($)
  await reply($, t)
  await clock.advance(20 * MIN)
  await typed($)
  await clock.advance(20 * MIN)
  expect(ran).toEqual([])
})

test('no nk: skill in the session, no save', async ($, on) => {
  const { clock, ran } = world(on)
  await begin($)
  const t = await typed($)
  await edit($)
  await reply($, t)
  await clock.advance(60 * MIN)
  expect(ran).toEqual([])
})

test('nothing written since the last save, no save', async ($, on) => {
  const { clock, ran } = world(on)
  await begin($)
  const t = await typed($)
  await skill($, 'nk:load')
  await edit($)
  await skill($, 'nk:save')
  await reply($, t)
  await clock.advance(60 * MIN)
  expect(ran).toEqual([])
})

test('a new break after a typed prompt saves again', async ($, on) => {
  const { clock, ran } = world(on)
  await begin($)
  let t = await typed($)
  await skill($, 'nk:load')
  await edit($)
  await reply($, t)
  await clock.advance(30 * MIN)
  expect(ran.length).toBe(1)

  t = await typed($)
  await edit($)
  await reply($, t)
  await clock.advance(30 * MIN)
  expect(ran.length).toBe(2)
})

test(
  'promotion on and a shorter wait come from the settings',
  { options: { idle_save_minutes: 5, idle_save_promote: true } },
  async ($, on) => {
    const { clock, ran } = world(on)
    await begin($)
    const t = await typed($)
    await skill($, 'nk:load')
    await edit($)
    await reply($, t)
    await clock.advance(5 * MIN)
    expect(ran).toEqual(['nk:save --unattended'])
  },
)

test('a /clear forgets the old conversation', async ($, on) => {
  const { clock, ran } = world(on)
  await begin($)
  let t = await typed($)
  await skill($, 'nk:load')
  await edit($)
  await $.session.end({ reason: 'clear' } as never)
  t = await typed($)
  await edit($)
  await reply($, t)
  await clock.advance(60 * MIN)
  expect(ran).toEqual([])
})

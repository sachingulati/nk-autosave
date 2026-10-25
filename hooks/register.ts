import type { Register } from 'claude-code'

type Options = { idle_save_minutes?: number; idle_save_promote?: boolean }

// Tools whose call means the session may hold something a save would write.
const WRITES = new Set(['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell'])

export const register: Register = (on, options) => {
  const { idle_save_minutes = 30, idle_save_promote = false } = options as Options
  const idleMs = idle_save_minutes * 60_000
  const args = idle_save_promote ? '--unattended' : '--unattended --no-promote'

  // A Notekeeping skill ran in this session, so it has a work item in play.
  let notesInPlay = false
  // Something was written since the last save, by the user's or the idle one.
  let writtenSinceSave = false
  // The idle save ran this break; only a typed prompt starts a new break.
  let savedThisBreak = false
  let timer: { cancel: () => void } | undefined

  const cancel = () => {
    timer?.cancel()
    timer = undefined
  }

  const noteSkill = (name: string) => {
    if (!name.startsWith('nk:')) return
    notesInPlay = true
    if (name === 'nk:save') writtenSinceSave = false
  }

  // A skill the user typed (`/nk:load 0052`), or one the idle save itself ran.
  on('command.run', ($, e, next) => {
    noteSkill(e.command)
    return next(e)
  })

  // A skill the model called, and every write-type tool.
  on('tool.call', ($, e, next) => {
    if (e.tool === 'Skill') noteSkill(e.skill)
    else if (WRITES.has(e.tool)) writtenSinceSave = true
    return next(e)
  })

  // Typing anything cancels the timer and opens a new break.
  on('prompt.submit', ($, e, next) => {
    if (e.origin.kind !== 'plugin') {
      cancel()
      savedThisBreak = false
    }
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) cancel()
    return next(e)
  })

  // Arm on the end of a main-loop turn; the idle save's own turn re-arms nothing.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || idleMs <= 0 || savedThisBreak) return done
    cancel()
    timer = $.clock.after(idleMs, () => {
      timer = undefined
      if (!notesInPlay || !writtenSinceSave) return
      savedThisBreak = true
      $.command.run({ command: 'nk:save', args }).catch(() => {
        savedThisBreak = false
      })
    })
    return done
  })

  // A /clear starts a new conversation: nothing from the old one is in play.
  on('session.end', ($, e, next) => {
    cancel()
    notesInPlay = false
    writtenSinceSave = false
    savedThisBreak = false
    return next(e)
  })
}

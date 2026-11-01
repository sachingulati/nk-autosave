# nk-autosave

Saves your [Notekeeping](https://github.com/sachingulati/notekeeping) work when you step away from a
Claude Code session. After the session has sat idle for a set time, it runs `/nk:save --unattended`
for you, so what the session did is in the work item's record before the prompt cache expires or the
conversation is compacted.

It is a companion to the `nk` plugin and needs it installed. On its own it does nothing.

## Install

```
/plugin marketplace add https://github.com/sachingulati/claude-plugins.git
/plugin install nk-autosave@sachingulati
```

Installing asks for the two settings below, filled in with their defaults.

## What it does

When Claude finishes a reply, nk-autosave starts a timer. Typing anything cancels it. When the timer
runs out, it saves if both of these hold:

- **A Notekeeping skill ran in this session** (`/nk:load`, `/nk:work`, a save), so there is a work item
  in play.
- **Something was written since the last save** - an Edit, Write or NotebookEdit outside the notes,
  or a Bash or PowerShell command that was not read-only. A save's own writes - to a `.notekeeping`
  store or Claude Code's memory folder - do not count, so a save you run is not followed by another.

The save runs as a turn of its own, as if you had typed `/nk:save --unattended --no-promote`. It runs
at most once per break: its own reply does not start the timer again, and the next prompt you type
does.

An unattended save asks no questions. Where a normal save would ask - which work item some work
belongs to, an id that does not resolve - it leaves that work out and lists the question at the end
of its report. The report's last line says whether `/clear` is safe. Every line it adds to a session
record ends with `- unattended`.

## Settings

Set at install, and changed later in `/config`. They are kept in your user settings under
`pluginConfigs`, and apply to every session.

| Setting | Default | What it does |
|---|---|---|
| `idle_save_minutes` | `30` | Minutes idle after Claude's last reply before the save. `0` turns idle saves off. Under 55 keeps the save on a warm prompt cache, which costs far less. |
| `idle_save_promote` | off | Off: the save writes the work item's record and sets lasting facts aside in its `pending.md` (`--no-promote`); your next save promotes them. On: the idle save promotes as a normal save does. |

Changing a setting reloads the plugin and drops a running timer; your next prompt starts a new one.

## Permission modes

nk-autosave is meant for sessions in auto mode, where the save's writes go through while you are
away. It acts in every session, because a plugin cannot see the permission mode: in manual mode the
save starts and each write shows its usual permission prompt, waiting for you.

## Cost

Each idle save is a normal paid turn. A save with nothing new to record is short; one that writes the
record reads the Notekeeping rules first and costs about as much as a save you run yourself. A file
write is enough to start a save, so a break after work that decided nothing can still run one that
ends in *nothing saved*.

## Limits

- Settings are per user, not per project or workspace.
- A Notekeeping store takes one writer at a time. Two sessions saving the same store at once can
  lose a change: on different work items only the index, which the next save rebuilds.
- It reads tool calls and skill names as they happen in the session, and nothing else: no
  transcripts, no files, no network.

## License

MIT

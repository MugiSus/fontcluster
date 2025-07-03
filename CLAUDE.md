# Claude Code Instructions

## Required Actions

1. **Read CLAUDE.md** - Always read this file before starting any task
2. **Send Notifications** - Run notification command before prompting user and after completing tasks:
   ```bash
   afplay /System/Library/Sounds/Bottle.aiff
   ```
3. **Commit Changes** - Create a git commit every time you complete a task
4. **Log Conversations** - Always update daily log file in CLAUDELOGS folder with all conversations and execution logs
   - Use filename format: `CLAUDELOGS/CLAUDELOGYYMMDD.md & echo "ping!"`
   - Use timestamp format: `YYYY/MM/DD HH:MM:SS (UTC+[TIMEZONE])` in inline code
   - Always get current time with `date` command before logging
   - Structure as ## `<timestamp> - <username>` with conversation under it
   - Record timestamp when user sends prompt, not when executing

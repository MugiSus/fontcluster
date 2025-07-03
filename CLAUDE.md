# Claude Code Instructions

## Required Actions

1. **Read CLAUDE.md** - Always read this file before starting any task
2. **Commit Changes** - Create a git commit every time you complete a task
3. **Log Conversations** - Always update hourly log file in CLAUDELOGS folder with all conversations and execution logs
   - Use filename format: `CLAUDELOGS/CLAUDELOG-YYMMDD-HH.md`
   - Use timestamp format: `YYYY/MM/DD HH:MM:SS (UTC+[TIMEZONE])` in inline code
   - Always get current time with `date` command before logging
   - Structure as ## `<timestamp> - <username>` with conversation under it
   - Record timestamp when user sends prompt, not when executing
   - **Create new hourly log file if it doesn't exist** - Always create the appropriate hourly file based on current time

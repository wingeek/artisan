Output docs/demo.gif

Set FontSize 14
Set Width 1200
Set Height 640
Set Padding 20
Set Theme "Dracula"

# --- sandbox setup (off-screen; git commit fires hook but capture is off) ---
Hide
Type "rm -rf ~/.artisan/worklog ~/demo-project && mkdir -p ~/demo-project && cd ~/demo-project"
Enter
Sleep 800ms
Type "git init -q && git config user.email demo@wingeek.dev && git config user.name demo"
Enter
Sleep 600ms
Type "git remote add origin https://github.com/wingeek/my-saas.git"
Enter
Sleep 500ms
Type "echo '# my-saas' > README.md && git add -A && git commit -qm 'feat: scaffold project skeleton'"
Enter
Sleep 1s
Type "artisan worklog init"
Enter
Sleep 800ms
Type "echo '- OAuth module' >> README.md && git commit -am 'feat: add oauth login flow' -q"
Enter
Sleep 800ms
Type "echo '- guard clause' >> README.md && git commit -am 'fix: crash on empty user input' -q"
Enter
Sleep 800ms
Type "cd ~/cli"
Enter
Sleep 300ms
Type "clear"
Enter
Sleep 400ms
Show

# --- 1. what is artisan ---
Type "artisan --help"
Sleep 400ms
Enter
Sleep 2500ms

# --- 2. BYOK config ready ---
Type "artisan auth status"
Sleep 400ms
Enter
Sleep 2500ms

# --- 3. captured commits (no need to show commits being made) ---
Type "artisan worklog status"
Sleep 400ms
Enter
Sleep 2500ms

# --- 4. hero: AI-generated worklog from raw commits ---
Type "artisan worklog generate --ai"
Sleep 400ms
Enter
Sleep 8s

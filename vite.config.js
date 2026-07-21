import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// Build stamp for the title screen's WHAT'S NEW panel. Reads the git log at
// build time (or dev-server start) and inlines it, so the shipped page needs no
// network call. Shows everything from the last 24 hours; if the repo has been
// quiet longer than that, it falls back to just the most recent commit.
function buildInfo() {
  const run = (cmd) => {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return ''; // no git, shallow clone, or not a repo - degrade quietly
    }
  };

  // %x1f/%x1e are ASCII unit/record separators: safe against | in commit subjects
  const FORMAT = '--pretty=format:%h%x1f%ad%x1f%s%x1e';
  const parse = (raw) => raw
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, date, subject] = r.split('\x1f');
      return { sha, date, subject };
    });

  let commits = parse(run(`git log --since="24 hours ago" --date=short ${FORMAT}`));
  const fresh = commits.length > 0;
  if (!fresh) commits = parse(run(`git log -1 --date=short ${FORMAT}`));

  const count = run('git rev-list --count HEAD') || '0';
  return {
    version: `v1.0.${count}`,
    fresh,                       // true = last 24h, false = falling back to latest commit
    commits: commits.slice(0, 12),
  };
}

// base must match the GitHub Pages project path: davidgscott.github.io/fowl_play/
export default defineConfig({
  base: '/fowl_play/',
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo()),
  },
});

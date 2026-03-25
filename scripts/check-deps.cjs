const { execSync } = require('child_process');

const deps = [
  { cmd: 'gh', check: 'gh --version', install: 'brew install gh && gh auth login' },
  { cmd: 'openclaw', check: 'openclaw --version', install: '参见 https://openclaw.dev/install' },
];

for (const dep of deps) {
  try {
    execSync(dep.check, { stdio: 'ignore' });
  } catch {
    console.warn(`⚠️  未检测到 ${dep.cmd}。安装方式: ${dep.install}`);
  }
}

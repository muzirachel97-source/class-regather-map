import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
const args = process.argv.slice(2);
const at = args.indexOf('--port');
const port = at >= 0 ? args[at + 1] : process.env.PORT || '3000';
const python = process.env.PYTHON || (existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3');
const child = spawn(python, ['manage.py', 'runserver', `0.0.0.0:${port}`, '--noreload'], {
  stdio: 'inherit', env: {...process.env, DEBUG: '1', ALLOWED_HOSTS: process.env.ALLOWED_HOSTS || '*'},
});
child.on('exit', code => process.exit(code ?? 1));
child.on('error', error => {console.error(error.message); process.exit(1);});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

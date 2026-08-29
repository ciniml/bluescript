// Minimal `process` for code shared with the CLI.
export const process = {
  env: {} as { [k: string]: string | undefined },
  platform: 'browser',
  cwd: () => '/',
  execPath: '',
  exit: (code?: number) => { throw new Error(`process.exit(${code})`); },
};

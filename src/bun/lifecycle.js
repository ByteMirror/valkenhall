export function registerDesktopCleanup(processRef, cleanup) {
  processRef.on('beforeExit', cleanup);
  processRef.on('exit', cleanup);
  processRef.on('SIGINT', cleanup);
  processRef.on('SIGTERM', cleanup);
  processRef.on('SIGHUP', cleanup);
}

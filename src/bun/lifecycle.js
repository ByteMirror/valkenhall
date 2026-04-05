export function registerDesktopCleanup(processRef, cleanup) {
  processRef.on('exit', cleanup);
  processRef.on('SIGINT', cleanup);
  processRef.on('SIGTERM', cleanup);
}

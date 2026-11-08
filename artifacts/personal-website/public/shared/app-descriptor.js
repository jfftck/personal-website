export function defineAppDescriptor({
  type,
  title,
  iconSvg,
  launcherIconSvg = iconSvg,
  modulePath,
  entryUrl,
  styles = [],
  buildExport,
  build,
  state = {},
  modules = [],
  launcher = true,
  window = true,
  group = 'apps',
}) {
  if (!type || !title || !iconSvg || !modulePath || !entryUrl) {
    throw new TypeError('App descriptors need a type, title, icon, and entry module.');
  }
  if (window && typeof build !== 'function' && typeof buildExport !== 'string') {
    throw new TypeError(`Window app "${type}" needs a builder export.`);
  }

  const stateInterface = Object.freeze({
    persistence: state.persistence || 'local',
    restoreArgument: state.restoreArgument || null,
    snapshotMethod: state.snapshotMethod || null,
    disposeMethod: state.disposeMethod === null ? null : (state.disposeMethod || 'destroy'),
    commands: Object.freeze([...(state.commands || [])]),
  });

  return Object.freeze({
    type,
    title,
    iconSvg,
    launcherIconSvg,
    modulePath,
    entryUrl,
    styles: Object.freeze([...styles]),
    modules: Object.freeze([...modules]),
    state: stateInterface,
    launcher,
    window,
    group,
    loadModule(attempt, loadId) {
      const moduleUrl = new URL(entryUrl);
      if (attempt > 0) moduleUrl.searchParams.set('retry', `${loadId}-${attempt}`);
      return import(/* @vite-ignore */ moduleUrl.href);
    },
    build: window
      ? build || ((module, id, initialState, ctx) => {
        const builder = module[buildExport];
        if (typeof builder !== 'function') {
          throw new TypeError(`App "${type}" does not export ${buildExport}.`);
        }
        return builder(id, ctx, initialState);
      })
      : null,
  });
}

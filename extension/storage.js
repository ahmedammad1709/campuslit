(function () {
  'use strict';
  const api = globalThis.browser || globalThis.chrome;
  const key = 'bahriaStudioPreferences';
  const isExtension = Boolean(api?.runtime?.id);
  globalThis.StudioStorage = {
    isExtension,
    async read() {
      if (isExtension) return BahriaStudio.normalize((await api.storage.local.get(key))[key]);
      return BahriaStudio.normalize(JSON.parse(localStorage.getItem(key) || 'null'));
    },
    async write(value) {
      const settings = BahriaStudio.normalize(value);
      if (isExtension) await api.storage.local.set({ [key]: settings });
      else localStorage.setItem(key, JSON.stringify(settings));
      return settings;
    },
    async clear() {
      if (isExtension) await api.storage.local.remove(key);
      else localStorage.removeItem(key);
    },
    subscribe(callback) {
      if (isExtension) api.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[key]) callback(BahriaStudio.normalize(changes[key].newValue));
      });
      else addEventListener('storage', e => { if (e.key === key) callback(BahriaStudio.normalize(JSON.parse(e.newValue || 'null'))); });
    },
    openOptions() { if (isExtension) api.runtime.openOptionsPage(); else location.href = 'options.html'; }
  };
})();

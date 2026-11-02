(function () {
  'use strict';
  const api = globalThis.browser || globalThis.chrome;
  const key = 'bahriaStudioPreferences';
  const guideKey = BahriaGuide.KEY;   // which tips have been shown (a few yes/no facts)
  const remindersKey = 'bahriaStudioReminders';   // the short note behind the assignment reminder (course, title, deadline)
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
      if (isExtension) await api.storage.local.remove([key, remindersKey, guideKey]);
      else { localStorage.removeItem(key); localStorage.removeItem(remindersKey); localStorage.removeItem(guideKey); }
    },
    async remembered() {
      const raw = isExtension ? (await api.storage.local.get(remindersKey))[remindersKey] : JSON.parse(localStorage.getItem(remindersKey) || 'null');
      return globalThis.BahriaDeadlines ? BahriaDeadlines.count(raw) : { courses: 0, items: 0 };
    },
    async forgetReminders() {
      if (isExtension) await api.storage.local.remove(remindersKey);
      else localStorage.removeItem(remindersKey);
    },
    async guide() {
      const raw = isExtension ? (await api.storage.local.get(guideKey))[guideKey] : JSON.parse(localStorage.getItem(guideKey) || 'null');
      return BahriaGuide.sanitize(raw);
    },
    // change: a function from the current record to the next one (BahriaGuide.mark, BahriaGuide.markWelcome, ...)
    async updateGuide(change) {
      const next = BahriaGuide.sanitize(change(await this.guide()));
      if (isExtension) await api.storage.local.set({ [guideKey]: next }); else localStorage.setItem(guideKey, JSON.stringify(next));
      return next;
    },
    async resetGuide() {
      if (isExtension) await api.storage.local.remove(guideKey); else localStorage.removeItem(guideKey);
    },
    subscribeGuide(callback) {
      if (isExtension) api.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[guideKey]) callback(BahriaGuide.sanitize(changes[guideKey].newValue)); });
      else addEventListener('storage', e => { if (e.key === guideKey) callback(BahriaGuide.sanitize(JSON.parse(e.newValue || 'null'))); });
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

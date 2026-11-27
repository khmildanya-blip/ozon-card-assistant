const LEGACY_KEY = 'ozon-assistant-draft-v1';
export const ACCOUNT_NAME_KEY = 'aisellercards.username';

function draftKey() {
  const username = localStorage.getItem('access_token') && localStorage.getItem(ACCOUNT_NAME_KEY);
  return username ? `account:${username}` : 'guest';
}

async function accessDraft(mode, operation) {
  const opening = indexedDB.open('aisellercards', 1);
  const database = await new Promise((resolve, reject) => {
    opening.onupgradeneeded = () => opening.result.createObjectStore('drafts');
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('drafts', mode);
      const request = operation(transaction.objectStore('drafts'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || request.error);
    });
  } finally {
    database.close();
  }
}

export async function storeDraft(draft) {
  const key = draftKey();
  if (!globalThis.indexedDB) {
    if (draft.photos.length) throw new Error('Браузер не разрешил сохранить фотографии.');
    localStorage.setItem(`${LEGACY_KEY}:${key}`, JSON.stringify(draft));
    return;
  }
  await accessDraft('readwrite', (store) => store.put(draft, key));
}

export async function readDraft() {
  const key = draftKey();
  const draft = globalThis.indexedDB
    ? await accessDraft('readonly', (store) => store.get(key))
    : undefined;
  if (draft) return draft;
  const local = localStorage.getItem(`${LEGACY_KEY}:${key}`);
  return JSON.parse(local ?? (key === 'guest' ? localStorage.getItem(LEGACY_KEY) : null));
}

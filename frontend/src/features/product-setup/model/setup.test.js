import test from 'node:test';
import assert from 'node:assert/strict';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { setupReducer, setupActions as actions } from './slice.js';
import { setupSaga } from './sagas.js';
import { flattenCategories } from '../../../entities/product/model/category.js';
import { cardAttributes, validMeasurement } from '../../../entities/product/model/card-details.js';

function setup(t, fetcher) {
  const previous = globalThis.fetch;
  globalThis.fetch = fetcher;
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: { productSetup: setupReducer },
    middleware: (get) => get({ serializableCheck: false }).concat(saga),
  });
  const task = saga.run(setupSaga);
  t.after(() => {
    task.cancel();
    globalThis.fetch = previous;
  });
  return store;
}
const reply = (data) => ({ ok: true, json: async () => data });

test('printed books reject stationery and keep the edition from the catalogue', async (t) => {
  const stationery = {
    description_category_id: 1,
    type_id: 2,
    category_name: 'Канцелярские товары → Бумажная продукция → Книга учета',
  };
  const modern = {
    description_category_id: 3,
    type_id: 4,
    category_name: 'Книги → Современные печатные издания → Печатная книга',
  };
  const old = {
    ...modern,
    description_category_id: 5,
    category_name: 'Книги → Букинистические издания → Печатная книга',
  };
  const store = setup(t, async (url, options) => {
    if (url.endsWith('generate-content')) return reply({ extracted_fields: { title: 'Идиот' } });
    assert.equal(JSON.parse(options.body).query, 'печатная книга');
    return reply({ categories: [stationery, old, modern], source: 'catalogue' });
  });
  store.dispatch(actions.recognized({ rag_keyword: 'Идиот', category: stationery }));
  store.dispatch(actions.contentRequested({ file: new File(['photo'], 'book.jpg') }));
  await until(store, (s) => s.contentAttempted && !s.busy);
  assert.deepEqual(store.getState().productSetup.category, modern);
  assert.deepEqual(store.getState().productSetup.categories, [modern, old]);
  assert.deepEqual(
    cardAttributes([{ name: 'Бренд', is_required: true }, { name: 'Автор' }], modern),
    [{ name: 'Автор' }],
  );
});

test('legacy drafts missing valid dimensions resume on the characteristics step', () => {
  assert.equal(validMeasurement('2,5'), true);
  for (const value of ['', '0', '-1', 'неизвестно', '1e2']) {
    assert.equal(validMeasurement(value), false);
  }
  const restored = setupReducer(undefined, actions.draftRestored({ step: 3, values: {} }));
  assert.equal(restored.step, 2);
});
function until(store, predicate) {
  if (predicate(store.getState().productSetup)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('Saga did not complete'));
    }, 1000);
    const unsubscribe = store.subscribe(() => {
      if (predicate(store.getState().productSetup)) {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  });
}

test('category tree retains parent ID and skips disabled nodes', () => {
  assert.deepEqual(
    flattenCategories([
      {
        description_category_id: 1,
        category_name: 'Дом',
        children: [
          {
            description_category_id: 2,
            category_name: 'Хранение',
            children: [
              { type_id: 3, type_name: 'Коробка' },
              { type_id: 4, type_name: 'Архив', disabled: true },
            ],
          },
        ],
      },
    ]),
    [{ description_category_id: 2, type_id: 3, category_name: 'Дом → Хранение → Коробка' }],
  );
});

test('recognition saga uploads photo then uses recognized name in RAG request', async (t) => {
  const calls = [];
  const store = setup(t, async (url, options) => {
    calls.push([url, options]);
    return reply(
      url.endsWith('recognize-product')
        ? { rag_keyword: 'Органайзер' }
        : { description_category_id: 2, type_id: 3, category_name: 'Хранение' },
    );
  });
  store.dispatch(
    actions.recognizeRequested(new File(['photo'], 'photo.png', { type: 'image/png' })),
  );
  await until(store, (s) => !s.busy && s.category);
  assert.ok(calls[0][1].body instanceof FormData);
  assert.equal(JSON.parse(calls[1][1].body).product_name, 'Органайзер');
  assert.equal(store.getState().productSetup.step, 1);
});

test('RAG failure preserves recognized product and permits manual category selection', async (t) => {
  const store = setup(t, async (url) =>
    reply(
      url.endsWith('recognize-product')
        ? { rag_keyword: 'Коробка' }
        : { error: 'Категория не найдена' },
    ),
  );
  store.dispatch(actions.recognizeRequested(new File(['photo'], 'photo.jpg')));
  await until(store, (s) => !s.busy && Boolean(s.error));
  assert.equal(store.getState().productSetup.product, 'Коробка');
  assert.equal(store.getState().productSetup.step, 1);
  assert.equal(store.getState().productSetup.error, 'Категория не найдена');
});

test('attribute load retains optional fields and dictionary metadata', async (t) => {
  const attributes = [
    { id: 8, is_required: false, dictionary_id: 12, group_name: 'Цвет', max_value_count: 3 },
  ];
  const store = setup(t, async () => reply({ attributes }));
  store.dispatch(actions.setCategory({ description_category_id: 2, type_id: 3 }));
  store.dispatch(actions.attributesRequested());
  await until(store, (s) => !s.busy && s.step === 2);
  assert.deepEqual(store.getState().productSetup.attributes, attributes);
});

test('dictionary pagination uses last ID and deduplicates entries', async (t) => {
  const cursors = [];
  const store = setup(t, async (_, options) => {
    cursors.push(JSON.parse(options.body).last_value_id);
    return reply({ result: [{ id: 10, value: 'Белый' }], has_next: cursors.length < 2 });
  });
  store.dispatch(actions.setCategory({ description_category_id: 2, type_id: 3 }));
  store.dispatch(actions.dictionaryRequested({ key: '0:8', attributeId: 8 }));
  await until(store, (s) => s.dictionaries['0:8']?.busy === false);
  store.dispatch(actions.dictionaryRequested({ key: '0:8', attributeId: 8 }));
  await until(store, (s) => s.dictionaries['0:8']?.more === false);
  assert.deepEqual(cursors, [0, 10]);
  assert.equal(store.getState().productSetup.dictionaries['0:8'].options.length, 1);
});

test('draft save and restore keep dictionary labels and manually entered values', async (t) => {
  const original = globalThis.localStorage;
  const memory = new Map();
  globalThis.localStorage = {
    setItem: (key, value) => memory.set(key, value),
    getItem: (key) => memory.get(key) || null,
  };
  t.after(() => {
    globalThis.localStorage = original;
  });
  const store = setup(t, async () => reply({}));
  store.dispatch(actions.setCategory({ description_category_id: 2, type_id: 3 }));
  store.dispatch(actions.attributesLoaded([{ id: 8, dictionary_id: 10 }]));
  store.dispatch(actions.valueChanged({ key: '0:8', value: '10' }));
  store.dispatch(actions.dictionaryStarted('0:8'));
  store.dispatch(
    actions.dictionaryLoaded({ key: '0:8', options: [{ id: 10, value: 'Белый' }], more: false }),
  );
  store.dispatch(actions.saveRequested());
  await until(store, (s) => s.notice.includes('сохранён'));
  store.dispatch(actions.photoChanged());
  store.dispatch(actions.restoreRequested());
  await until(store, (s) => s.notice.includes('восстановлен'));
  assert.equal(store.getState().productSetup.values['0:8'], '10');
  assert.equal(store.getState().productSetup.dictionaries['0:8'].options[0].value, 'Белый');
});

test('draft restore returns ordered photos outside Redux and separates the account draft', async (t) => {
  const globals = { indexedDB: globalThis.indexedDB, localStorage: globalThis.localStorage };
  t.after(() => Object.assign(globalThis, globals));
  const browser = new Map();
  const drafts = new Map();
  globalThis.localStorage = { getItem: (key) => browser.get(key) ?? null };
  globalThis.indexedDB = {
    open() {
      const request = {
        result: {
          close() {},
          transaction() {
            const finish = (result) => {
              queueMicrotask(() => transaction.oncomplete());
              return { result };
            };
            const transaction = {
              objectStore: () => ({
                put: (record, key) => finish(drafts.set(key, record)),
                get: (key) => finish(drafts.get(key)),
              }),
            };
            return transaction;
          },
        },
      };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
  const store = setup(t, async () => {
    throw new Error('Draft storage should be local');
  });
  store.dispatch(actions.setCategory({ description_category_id: 2, type_id: 3 }));
  store.dispatch(actions.attributesLoaded([{ id: 8 }]));
  const photo = (name, main) => ({ file: new File([name], name), main });
  const guest = [photo('cover.jpg', false), photo('spine.jpg', true)];
  const save = async (photos) => {
    store.dispatch(actions.saveRequested({ photos }));
    await until(store, (state) => !state.busy && state.notice.includes('сохранён'));
  };
  await save(guest);
  browser.set('access_token', 'test-token');
  browser.set('aisellercards.username', 'seller');
  await save([photo('account.jpg', true)]);

  const restore = async () => {
    let photos;
    store.dispatch(
      actions.restoreRequested({
        onPhotos: (files) => {
          photos = files;
        },
      }),
    );
    await until(store, (state) => !state.busy && state.notice.includes('восстановлен'));
    return photos;
  };
  assert.equal((await restore())[0].file.name, 'account.jpg');
  browser.delete('access_token');
  assert.deepEqual(await restore(), guest);
  assert.equal(store.getState().productSetup.photos, undefined);
});

test('manual name search is available without a photo and calls the backend search endpoint', async (t) => {
  const calls = [];
  const category = { description_category_id: 2, type_id: 3, category_name: 'Компьютерная мышь' };
  const store = setup(t, async (url, options) => {
    calls.push([url, JSON.parse(options.body)]);
    return reply({ categories: [category], source: 'rag', notice: '' });
  });
  store.dispatch(actions.manualSelectionStarted());
  store.dispatch(actions.categorySearchRequested({ query: 'компьютерная мышь' }));
  await until(store, (s) => !s.busy && s.categorySearchPerformed);
  assert.equal(calls[0][0], '/api/search-categories');
  assert.deepEqual(calls[0][1], { query: 'компьютерная мышь', limit: 20 });
  assert.equal(store.getState().productSetup.step, 1);
  assert.deepEqual(store.getState().productSetup.categories, [category]);
  store.dispatch(actions.setCategory(category));
  assert.equal(store.getState().productSetup.category.type_id, 3);
});

test('recognition request failure opens category selection and does not issue a RAG request', async (t) => {
  let calls = 0;
  const store = setup(t, async () => {
    calls++;
    return {
      ok: false,
      status: 503,
      json: async () => ({ detail: 'Распознавание фото не настроено' }),
    };
  });
  store.dispatch(actions.recognizeRequested(new File(['photo'], 'photo.png')));
  await until(store, (s) => !s.busy && Boolean(s.error));
  assert.equal(store.getState().productSetup.step, 1);
  assert.equal(store.getState().productSetup.error, 'Распознавание фото не настроено');
  assert.equal(calls, 1);
});

test('catalogue fallback remains visible and an empty search result is recoverable', async (t) => {
  const store = setup(t, async () =>
    reply({ categories: [], source: 'catalogue', notice: 'Поиск по сохранённому каталогу' }),
  );
  store.dispatch(actions.manualSelectionStarted());
  store.dispatch(actions.categorySearchRequested({ query: 'неизвестный товар' }));
  await until(store, (s) => !s.busy && s.categorySearchPerformed);
  assert.deepEqual(store.getState().productSetup.categories, []);
  assert.equal(store.getState().productSetup.categorySource, 'catalogue');
  assert.equal(store.getState().productSetup.notice, 'Поиск по сохранённому каталогу');
});

test('an HTML response from the wrong server is reported instead of treated as recognition success', async (t) => {
  const store = setup(t, async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError('Unexpected HTML');
    },
  }));
  store.dispatch(actions.recognizeRequested(new File(['photo'], 'photo.png')));
  await until(store, (s) => !s.busy && Boolean(s.error));
  assert.match(store.getState().productSetup.error, /некорректный ответ/);
  assert.equal(store.getState().productSetup.step, 1);
});

test('photo pipeline preserves backend category and sends exactly its two IDs for attributes', async (t) => {
  const category = {
    description_category_id: 17028715,
    type_id: 96250,
    category_name: 'Горшок для цветов',
  };
  const calls = [];
  const store = setup(t, async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith('recognize-product'))
      return reply({
        rag_keyword: 'Горшок для цветов',
        category,
        category_source: 'rag',
        category_notice: 'Проверьте категорию',
        candidates: [category],
      });
    if (url.endsWith('get-category-attributes'))
      return reply({ attributes: [{ id: 8, name: 'Материал', is_required: true }] });
    throw new Error('Duplicate or unexpected category request');
  });
  store.dispatch(actions.recognizeRequested(new File(['photo'], 'pot.jpg')));
  await until(store, (s) => !s.busy && s.category);
  assert.equal(calls.length, 1);
  assert.deepEqual(store.getState().productSetup.category, category);
  assert.equal(store.getState().productSetup.notice, 'Проверьте категорию');
  store.dispatch(actions.attributesRequested());
  await until(store, (s) => !s.busy && s.step === 2);
  assert.deepEqual(JSON.parse(calls[1][1].body), {
    description_category_id: 17028715,
    type_id: 96250,
  });
  assert.equal(store.getState().productSetup.attributes[0].name, 'Материал');
});

test('partial photo response retains recognized name, candidates and exact RAG error', async (t) => {
  const candidate = {
    description_category_id: 17028715,
    type_id: 96250,
    category_name: 'Горшок для цветов',
  };
  const store = setup(t, async () =>
    reply({
      rag_keyword: 'Горшок для цветов',
      category: null,
      category_error: 'Индекс RAG ещё строится',
      candidates: [candidate],
    }),
  );
  store.dispatch(actions.recognizeRequested(new File(['photo'], 'pot.jpg')));
  await until(store, (s) => !s.busy && Boolean(s.error));
  const state = store.getState().productSetup;
  assert.equal(state.product, 'Горшок для цветов');
  assert.equal(state.step, 1);
  assert.equal(state.error, 'Индекс RAG ещё строится');
  assert.deepEqual(state.categories, [candidate]);
});

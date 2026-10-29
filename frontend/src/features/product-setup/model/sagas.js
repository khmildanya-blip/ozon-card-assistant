import { all, call, put, select, takeEvery, takeLeading } from 'redux-saga/effects';
import { request } from '../../../shared/api/client.js';
import { categoryPayload } from '../../../entities/product/model/category.js';
import { setupActions as actions } from './slice.js';

const state = (root) => root.productSetup;
const DRAFT_KEY = 'ozon-assistant-draft-v1';

function* task(label, work, action) {
  yield put(actions.started(label));
  try {
    yield* work(action);
  } catch (error) {
    yield put(actions.setError(error.message || 'Не удалось выполнить запрос.'));
  } finally {
    yield put(actions.finished());
  }
}
function* suggestCategory() {
  const { product } = yield select(state);
  const found = yield call(request, 'generate-description', {
    product_name: product,
    key_features: [],
  });
  if (!found.description_category_id || !found.type_id)
    throw new Error('Категория не найдена. Выберите её вручную.');
  yield put(actions.setCategory(found));
  if (found.notice) yield put(actions.setNotice(found.notice));
}
function* recognize({ payload: file }) {
  let result;
  try {
    const form = new FormData();
    form.append('file', file);
    result = yield call(request, 'recognize-product', form);
    if (!result.rag_keyword)
      throw new Error(
        'Не удалось распознать товар. Попробуйте другое фото или найдите категорию по названию.',
      );
    yield put(actions.recognized(result.rag_keyword));
  } catch (error) {
    yield put(actions.manualSelectionStarted());
    throw error;
  }
  if (result.candidates?.length) {
    yield put(
      actions.categorySearchCompleted({
        categories: result.candidates,
        source: result.category_source || 'catalogue',
        notice: '',
      }),
    );
  }
  const category = result.category || result;
  if (category.description_category_id && category.type_id) {
    // The backend already resolved both IDs. Do not discard this result or run RAG again.
    yield put(actions.setCategory(category));
    if (result.category_notice || result.notice)
      yield put(actions.setNotice(result.category_notice || result.notice));
    return;
  }
  if (result.category_error) throw new Error(result.category_error);
  // Compatibility with a backend returning only recognition keywords.
  yield* suggestCategory();
}
function* searchCategory({ payload }) {
  const current = yield select(state);
  const query = (payload?.query ?? current.product).trim();
  if (query.length < 2) throw new Error('Введите хотя бы два символа для поиска категории.');
  yield put(actions.categorySearchStarted());
  const data = yield call(request, 'search-categories', { query, limit: 20 });
  yield put(actions.categorySearchCompleted(data));
}
function* attributes() {
  const { category } = yield select(state);
  if (!category) throw new Error('Сначала выберите категорию.');
  const data = yield call(request, 'get-category-attributes', categoryPayload(category));
  yield put(actions.attributesLoaded(data.attributes || []));
}
function* dictionary({ payload: { key, attributeId } }) {
  const { category, dictionaries } = yield select(state);
  const entry = dictionaries[key];
  if (!category || entry?.busy || entry?.more === false) return;
  yield put(actions.dictionaryStarted(key));
  try {
    const data = yield call(request, 'attribute-values', {
      ...categoryPayload(category),
      attribute_id: attributeId,
      last_value_id: entry?.options.at(-1)?.id || 0,
      limit: 100,
    });
    const current = yield select(state);
    // Ignore replies for a category that the user has already changed.
    if (
      current.category?.type_id !== category.type_id ||
      current.category?.description_category_id !== category.description_category_id
    )
      return;
    yield put(
      actions.dictionaryLoaded({ key, options: data.result || [], more: Boolean(data.has_next) }),
    );
  } catch (error) {
    yield put(actions.dictionaryFailed({ key, error: error.message }));
  }
}
function* save() {
  try {
    const { product, category, attributes, values, dictionaries } = yield select(state);
    yield call(
      [localStorage, 'setItem'],
      DRAFT_KEY,
      JSON.stringify({
        version: 1,
        product,
        category,
        attributes,
        values,
        dictionaries: Object.fromEntries(
          Object.entries(dictionaries).map(([key, entry]) => [
            key,
            { options: entry.options, more: entry.more, busy: false, error: '' },
          ]),
        ),
        savedAt: new Date().toISOString(),
      }),
    );
    yield put(
      actions.setNotice('Черновик сохранён в этом браузере. Фото нужно будет выбрать заново.'),
    );
  } catch {
    yield put(
      actions.setError(
        'Не удалось сохранить черновик: хранилище браузера недоступно или заполнено.',
      ),
    );
  }
}
function* restore() {
  try {
    const raw = yield call([localStorage, 'getItem'], DRAFT_KEY);
    const draft = JSON.parse(raw);
    if (
      !draft ||
      draft.version !== 1 ||
      typeof draft.product !== 'string' ||
      !draft.category?.type_id ||
      !draft.category?.description_category_id ||
      !Array.isArray(draft.attributes) ||
      !draft.values ||
      typeof draft.values !== 'object'
    )
      throw new Error();
    yield put(actions.draftRestored(draft));
  } catch {
    yield put(actions.setError('Сохранённого черновика нет или он повреждён.'));
  }
}
export function* setupSaga() {
  yield all([
    takeLeading(
      actions.recognizeRequested.type,
      task,
      'Распознаём товар и подбираем категорию Ozon…',
      recognize,
    ),
    takeLeading(actions.categorySearchRequested.type, task, 'Ищем категории…', searchCategory),
    takeLeading(
      actions.attributesRequested.type,
      task,
      'Получаем характеристики из Ozon…',
      attributes,
    ),
    takeEvery(actions.dictionaryRequested.type, dictionary),
    takeLeading(actions.saveRequested.type, save),
    takeLeading(actions.restoreRequested.type, restore),
  ]);
}

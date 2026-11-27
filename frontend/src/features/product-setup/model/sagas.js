import { all, call, put, select, takeEvery, takeLeading } from 'redux-saga/effects';
import { request } from '../../../shared/api/client.js';
import { categoryPayload } from '../../../entities/product/model/category.js';
import { printedBookCategories } from '../../../entities/product/model/card-details.js';
import { readDraft, storeDraft } from '../../../shared/lib/draft-storage.js';
import { setupActions as actions } from './slice.js';

const state = (root) => root.productSetup;

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
  const primaryFile = file?.file || file;
  let result;
  try {
    const form = new FormData();
    form.append('file', primaryFile);
    try {
      result = yield call(request, 'recognize-product', form);
    } catch (error) {
      // Older backend revisions expose the same flow as recognize-category.
      if (!/нужного метода API|404|405/u.test(error.message || '')) throw error;
      const legacy = yield call(request, 'recognize-category', form);
      result = {
        ...legacy,
        rag_keyword: legacy.detected_keyword,
        category: legacy.category,
      };
    }
    if (!result.rag_keyword)
      throw new Error(
        'Не удалось распознать товар. Попробуйте другое фото или найдите категорию по названию.',
      );
    yield put(actions.recognized(result));
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
function* enrichContent({ payload }) {
  const file = payload?.file || payload;
  if (!file) return;
  const current = yield select(state);
  if (current.contentAttempted) return;
  yield put(actions.started('Дополняем распознанные данные…'));
  try {
    const files = payload?.files?.length ? payload.files : [file];
    // One bad/unsupported extra image must not discard the description obtained
    // from the other images. Process them independently and merge successful
    // responses below.
    const results = [];
    for (const image of files) {
      try {
        const form = new FormData();
        form.append(
          'request',
          JSON.stringify({ product_name: current.product || '', key_features: [] }),
        );
        form.append('file', image);
        results.push(yield call(request, 'generate-content', form));
      } catch {
        // Continue with the next photo. The primary photo can still provide
        // all content even if an additional image is not readable by AI.
      }
    }
    if (!results.length) throw new Error('Не удалось получить данные по фото.');
    const colors = results.map((item) => item.color).filter(Boolean);
    const color = colors.sort(
      (a, b) =>
        colors.filter((value) => value === b).length - colors.filter((value) => value === a).length,
    )[0];
    const merged = results.reduce(
      (acc, item) => ({
        ...acc,
        ...item,
        // Do not let a secondary photo with no readable text erase the
        // description/title returned for the primary photo.
        ozon_description: item.ozon_description || acc.ozon_description,
        raw_text: item.raw_text || acc.raw_text,
        color: color || acc.color || item.color,
        extracted_fields: {
          ...(acc.extracted_fields || {}),
          ...(item.extracted_fields || {}),
          dimensions: {
            ...(acc.extracted_fields?.dimensions || {}),
            ...(item.extracted_fields?.dimensions || {}),
          },
        },
      }),
      {},
    );
    yield put(actions.contentLoaded(merged));

    // If the recognizer saw a book but the semantic category was unrelated,
    // correct it through the existing category-search API. This keeps the
    // backend contract unchanged and prevents book fields from being loaded
    // for an apparel/electronics category.
    const latest = yield select(state);
    const fields = merged.extracted_fields;
    const isBook = Boolean(fields?.title || fields?.author || fields?.publisher);
    if (isBook && !printedBookCategories([latest.category]).length) {
      yield put(actions.setCategory(null));
      yield put(actions.categorySearchStarted());
      try {
        const bookCategories = yield call(request, 'search-categories', {
          query: 'печатная книга',
          limit: 20,
        });
        const categories = printedBookCategories(bookCategories.categories || [], fields?.year);
        yield put(actions.categorySearchCompleted({ ...bookCategories, categories }));
        if (categories.length) yield put(actions.setCategory(categories[0]));
      } catch {
        // Manual category selection stays available if the search fails.
      }
      yield put(actions.setNotice('Проверьте категорию по году выпуска вашего издания.'));
    }
  } catch (error) {
    // Enrichment is optional: category recognition must remain usable when the LLM is unavailable.
    yield put(actions.contentFailed());
    yield put(actions.setNotice('Категория определена. Автозаполнение временно недоступно.'));
  } finally {
    yield put(actions.finished());
  }
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
function* save({ payload }) {
  try {
    const { product, category, attributes, values, dictionaries, recognition, content, step } =
      yield select(state);

    const photos = payload?.photos || [];
    yield call(storeDraft, {
      version: 1,
      product,
      category,
      step,
      recognition,
      content,
      attributes,
      values,
      dictionaries: Object.fromEntries(
        Object.entries(dictionaries).map(([key, entry]) => [
          key,
          { options: entry.options, more: entry.more, busy: false, error: '' },
        ]),
      ),
      photos,
      savedAt: new Date().toISOString(),
    });
    yield put(
      actions.setNotice(
        photos.length
          ? 'Черновик с фотографиями сохранён в этом браузере.'
          : 'Черновик сохранён в этом браузере.',
      ),
    );
  } catch (error) {
    yield put(
      actions.setError(
        error?.name === 'QuotaExceededError'
          ? 'Недостаточно места для черновика. Удалите лишние фотографии и повторите сохранение.'
          : 'Не удалось сохранить черновик. Проверьте, разрешено ли браузеру сохранять данные сайта.',
      ),
    );
  }
}
function* restore({ payload }) {
  try {
    const draft = yield call(readDraft);
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
    const { photos = [], ...data } = draft;
    if (payload?.onPhotos) yield call(payload.onPhotos, photos);
    yield put(actions.draftRestored(data));
  } catch {
    yield put(actions.setError('Сохранённого черновика нет или он повреждён.'));
  }
}
export function* setupSaga() {
  yield all([
    takeLeading(
      actions.recognizeRequested.type,
      task,
      'Распознаём товар и подбираем категорию…',
      recognize,
    ),
    takeLeading(actions.contentRequested.type, enrichContent),
    takeLeading(actions.categorySearchRequested.type, task, 'Ищем категории…', searchCategory),
    takeLeading(
      actions.attributesRequested.type,
      task,
      'Загружаем характеристики категории…',
      attributes,
    ),
    takeEvery(actions.dictionaryRequested.type, dictionary),
    takeLeading(actions.saveRequested.type, task, 'Сохраняем черновик…', save),
    takeLeading(actions.restoreRequested.type, task, 'Открываем черновик…', restore),
  ]);
}

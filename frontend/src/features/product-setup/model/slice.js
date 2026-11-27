import { createSlice } from '@reduxjs/toolkit';
import {
  cardMeasurements,
  validMeasurement,
} from '../../../entities/product/model/card-details.js';

export const initialState = {
  step: 0,
  busy: '',
  error: '',
  notice: '',
  product: '',
  recognition: null,
  content: null,
  contentAttempted: false,
  category: null,
  categories: [],
  categorySearchPerformed: false,
  categorySource: '',
  attributes: [],
  values: {},
  dictionaries: {},
};
const slice = createSlice({
  name: 'productSetup',
  initialState,
  reducers: {
    setStep(state, { payload }) {
      state.step = payload;
    },
    setProduct(state, { payload }) {
      state.product = payload;
      if (state.recognition) state.recognition.rag_keyword = payload;
    },
    setCategory(state, { payload }) {
      const previous = state.category;
      state.category = payload;
      if (
        previous &&
        previous.type_id === payload?.type_id &&
        previous.description_category_id === payload?.description_category_id
      )
        return;
      state.attributes = [];
      state.values = Object.fromEntries(
        cardMeasurements
          .filter(([key]) => Object.hasOwn(state.values, key))
          .map(([key]) => [key, state.values[key]]),
      );
      state.dictionaries = {};
    },
    setError(state, { payload }) {
      state.error = payload;
    },
    setNotice(state, { payload }) {
      state.notice = payload;
    },
    started(state, { payload }) {
      state.busy = payload;
      state.error = '';
      state.notice = '';
    },
    finished(state) {
      state.busy = '';
    },
    photoChanged(state) {
      state.product = '';
      state.category = null;
      state.categories = [];
      state.categorySearchPerformed = false;
      state.attributes = [];
      state.values = {};
      state.dictionaries = {};
      state.notice = '';
      state.recognition = null;
      state.content = null;
      state.contentAttempted = false;
    },
    recognized(state, { payload }) {
      const result = typeof payload === 'string' ? { rag_keyword: payload } : payload || {};
      state.recognition = result;
      state.product = result.rag_keyword || result.title || '';
      state.content =
        result.color || result.extracted_fields || result.ozon_description ? result : null;
      state.contentAttempted = Boolean(
        result.color || result.extracted_fields || result.ozon_description,
      );
      state.step = 1;
      state.category = result.category || null;
      state.categories = result.candidates || [];
      state.categorySearchPerformed = Boolean(result.candidates?.length);
      state.categorySource = result.category_source || '';
      state.notice = result.category_notice || '';
    },
    contentRequested() {},
    contentLoaded(state, { payload }) {
      state.content = payload;
      state.contentAttempted = true;
      state.recognition = { ...(state.recognition || {}), ...payload };
      state.product = payload.extracted_fields?.title || payload.title || state.product;
      state.notice = payload.color
        ? `Цвет определён автоматически: ${payload.color}`
        : state.notice;
    },
    contentFailed(state) {
      state.contentAttempted = true;
    },
    contentEdited(state, { payload }) {
      state.content = { ...(state.content || {}), ...(payload || {}) };
      state.recognition = { ...(state.recognition || {}), ...(payload || {}) };
      state.notice = '';
    },
    manualSelectionStarted(state) {
      state.step = 1;
      state.error = '';
      state.notice = '';
    },
    categorySearchStarted(state) {
      state.categories = [];
      state.categorySearchPerformed = false;
    },
    categorySearchCompleted(state, { payload }) {
      state.categories = payload.categories;
      state.categorySearchPerformed = true;
      state.categorySource = payload.source;
      state.notice = (payload.notice || '').replace(
        'по сохранённому каталогу Ozon',
        'по сохранённому каталогу',
      );
    },
    attributesLoaded(state, { payload }) {
      state.attributes = payload;
      state.values = state.values || {};
      state.dictionaries = {};
      state.step = 2;
    },
    valueChanged(state, { payload }) {
      state.values[payload.key] = payload.value;
      state.notice = '';
    },
    valuesPatched(state, { payload }) {
      Object.assign(state.values, payload || {});
    },
    dictionaryStarted(state, { payload }) {
      const entry = (state.dictionaries[payload] ||= { options: [], more: true });
      entry.busy = true;
      entry.error = '';
    },
    dictionaryLoaded(state, { payload }) {
      const entry = state.dictionaries[payload.key];
      if (!entry) return;
      entry.options = [
        ...new Map([...entry.options, ...payload.options].map((o) => [o.id, o])).values(),
      ];
      entry.more = payload.more;
      entry.busy = false;
    },
    dictionaryFailed(state, { payload }) {
      if (state.dictionaries[payload.key]) {
        state.dictionaries[payload.key].error = payload.error;
        state.dictionaries[payload.key].busy = false;
      }
    },
    draftRestored(state, { payload }) {
      const previewAllowed = cardMeasurements.every(([key]) =>
        validMeasurement(payload.values[key]),
      );
      Object.assign(state, {
        product: payload.product,
        category: payload.category,
        attributes: payload.attributes,
        values: payload.values,
        dictionaries: payload.dictionaries || {},
        step: Math.min(Number(payload.step) || 2, previewAllowed ? 3 : 2),
        recognition: payload.recognition || null,
        content: payload.content || null,
        contentAttempted: true,
        error: '',
        notice: 'Локальный черновик восстановлен.',
      });
    },
    recognizeRequested() {},
    categorySearchRequested() {},
    attributesRequested() {},
    dictionaryRequested() {},
    saveRequested() {},
    restoreRequested() {},
  },
});
export const setupActions = slice.actions;
export const setupReducer = slice.reducer;

import { createSlice } from '@reduxjs/toolkit';

export const initialState = {
  step: 0,
  busy: '',
  error: '',
  notice: '',
  product: '',
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
    },
    setCategory(state, { payload }) {
      state.category = payload;
      state.attributes = [];
      state.values = {};
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
    },
    recognized(state, { payload }) {
      state.product = payload;
      state.step = 1;
      state.category = null;
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
      state.notice = payload.notice || '';
    },
    attributesLoaded(state, { payload }) {
      state.attributes = payload;
      state.values = {};
      state.dictionaries = {};
      state.step = 2;
    },
    valueChanged(state, { payload }) {
      state.values[payload.key] = payload.value;
      state.notice = '';
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
      Object.assign(state, {
        product: payload.product,
        category: payload.category,
        attributes: payload.attributes,
        values: payload.values,
        dictionaries: payload.dictionaries || {},
        step: 2,
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

import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { setupReducer, setupSaga } from '../../features/product-setup';

const saga = createSagaMiddleware();
export const store = configureStore({
  reducer: { productSetup: setupReducer },
  middleware: (getDefault) =>
    getDefault({
      // File is passed to Saga as a command; it is never stored in Redux state.
      serializableCheck: { ignoredActions: ['productSetup/recognizeRequested'] },
    }).concat(saga),
});
saga.run(setupSaga);

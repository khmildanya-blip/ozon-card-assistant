import React from 'react';
import { Provider } from 'react-redux';
import { store } from './providers/store';
import { CreateProductPage } from '../pages/create-product';
import '../shared/styles/global.css';

export function App() {
  return (
    <Provider store={store}>
      <CreateProductPage />
    </Provider>
  );
}

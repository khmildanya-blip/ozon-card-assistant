import React from 'react';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { X } from 'lucide-react';
import { attributeKey as identity, getAttributeLabel } from '../../../entities/product';
import { setupActions } from '../model/slice';

const EMPTY_DICTIONARY = {};

export function AttributeField({ attribute: a, value, onChange }) {
  const dispatch = useDispatch();
  const key = identity(a);
  const {
    options = [],
    busy = false,
    error: loadError = '',
    more = true,
  } = useSelector((state) => state.productSetup.dictionaries[key] || EMPTY_DICTIONARY);
  const [validationError, setError] = useState('');
  const error = validationError || loadError;
  const dictionary = Boolean(a.dictionary_id);
  const multiple = a.is_collection || a.complex_is_collection;
  const load = () => dispatch(setupActions.dictionaryRequested({ key, attributeId: a.id }));
  const values = multiple ? value || [] : (value ?? '');
  const updateMultiple = (next) => {
    if (a.max_value_count > 0 && next.length > a.max_value_count) {
      setError(`Можно выбрать не более ${a.max_value_count} значений`);
      return;
    }
    setError('');
    onChange(next);
  };
  return (
    <div className="field">
      <label htmlFor={`attr-${identity(a)}`}>
        {getAttributeLabel(a)}
        {a.is_required && <span className="required"> *</span>}
      </label>
      {a.description && (
        <details className="field-help">
          <summary>Подсказка</summary>
          <p className="hint">{a.description}</p>
        </details>
      )}
      {dictionary ? (
        <>
          <select
            id={`attr-${identity(a)}`}
            multiple={multiple}
            value={values}
            onFocus={() => {
              if (!options.length && !busy) load();
            }}
            onChange={(e) =>
              multiple
                ? updateMultiple([...e.target.selectedOptions].map((o) => o.value))
                : onChange(e.target.value)
            }
          >
            {!multiple && <option value="">Выберите значение</option>}
            {options.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.value}
              </option>
            ))}
          </select>
          <button type="button" className="text-button" disabled={busy || !more} onClick={load}>
            {busy
              ? 'Загружаем…'
              : options.length
                ? more
                  ? 'Показать ещё варианты'
                  : 'Все значения загружены'
                : 'Показать варианты'}
          </button>
          {multiple && <small>Для выбора нескольких значений удерживайте Ctrl / ⌘.</small>}
        </>
      ) : multiple ? (
        <div className="collection">
          {(value?.length ? value : ['']).map((v, i) => (
            <div className="inline" key={i}>
              <input
                id={i === 0 ? `attr-${identity(a)}` : undefined}
                type={['Integer', 'Decimal'].includes(a.type) ? 'number' : 'text'}
                step={a.type === 'Integer' ? '1' : 'any'}
                value={v}
                onChange={(e) => {
                  const next = [...(value?.length ? value : [''])];
                  next[i] = e.target.value;
                  onChange(next);
                }}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="Удалить значение"
                onClick={() => onChange((value || []).filter((_, j) => i !== j))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            disabled={a.max_value_count > 0 && (value?.length || 1) >= a.max_value_count}
            onClick={() => onChange([...(value?.length ? value : ['']), ''])}
          >
            + Добавить значение
          </button>
        </div>
      ) : a.type === 'Boolean' ? (
        <select
          id={`attr-${identity(a)}`}
          value={values}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Выберите значение</option>
          <option value="true">Да</option>
          <option value="false">Нет</option>
        </select>
      ) : (
        <input
          id={`attr-${identity(a)}`}
          type={
            ['Integer', 'Decimal'].includes(a.type) ? 'number' : a.type === 'Date' ? 'date' : 'text'
          }
          step={a.type === 'Integer' ? '1' : 'any'}
          value={values}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Введите значение"
        />
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

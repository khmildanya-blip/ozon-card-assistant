import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Check, ChevronDown, LoaderCircle, Plus, Search, X } from 'lucide-react';
import { attributeKey as identity, getAttributeLabel } from '../../../entities/product';
import { setupActions } from '../model/slice';

const EMPTY_DICTIONARY = {};
const LONG_TEXT = /описан|аннотац|характеристик|состав|комплектац|текст|преимуществ|условия/iu;

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
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const error = validationError || loadError;
  const dictionary = Boolean(a.dictionary_id);
  const multiple = a.is_collection || a.complex_is_collection;
  const freeText = /цвет/iu.test(a.name || '');
  const values = multiple ? value || [] : (value ?? '');
  const filteredOptions = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('ru-RU');
    return search
      ? options.filter((option) => String(option.value).toLocaleLowerCase('ru-RU').includes(search))
      : options;
  }, [options, query]);
  const load = () => dispatch(setupActions.dictionaryRequested({ key, attributeId: a.id }));
  const updateMultiple = (next) => {
    if (a.max_value_count > 0 && next.length > a.max_value_count) {
      setError(`Можно выбрать не более ${a.max_value_count} значений`);
      return;
    }
    setError('');
    onChange(next);
  };
  const choose = (option) => {
    const id = String(option.id);
    if (multiple) {
      const next = values.includes(id) ? values.filter((item) => item !== id) : [...values, id];
      updateMultiple(next);
    } else {
      onChange(id);
      setQuery(String(option.value || ''));
      setOpen(false);
    }
  };
  const label = getAttributeLabel(a);
  const longText = LONG_TEXT.test(label || '') || LONG_TEXT.test(a.group_name || '');

  useEffect(() => {
    if (!open) return undefined;
    const onDocumentPointerDown = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      className={`field ${longText ? 'field--long' : ''} ${dictionary ? 'field--dictionary' : ''}`}
    >
      <div className="field-title-row">
        <label htmlFor={`attr-${key}`}>
          {label}
          {a.is_required && (
            <>
              <span className="required"> *</span>
              <span className="required-badge">обязательно</span>
            </>
          )}
        </label>
        {a.dictionary_id && <span className="field-type-badge">список</span>}
      </div>
      {a.description && (
        <details className="field-help">
          <summary>Как заполнить</summary>
          <p className="hint">{a.description}</p>
        </details>
      )}
      {dictionary && !freeText ? (
        <div
          ref={pickerRef}
          className={`dictionary-picker ${open ? 'dictionary-picker--open' : ''}`}
        >
          <div className="dictionary-search">
            <Search size={15} />
            <input
              id={`attr-${key}`}
              value={query}
              onFocus={() => {
                setOpen(true);
                if (!options.length && !busy) load();
              }}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={busy ? 'Загружаем варианты…' : 'Начните вводить для поиска'}
            />
            <ChevronDown size={16} className={open ? 'rotate-180' : ''} />
          </div>
          {open && (
            <div className="dictionary-options" role="listbox" aria-label={label}>
              {filteredOptions.length ? (
                filteredOptions.slice(0, 80).map((option) => {
                  const selected = multiple
                    ? values.includes(String(option.id))
                    : values === String(option.id);
                  return (
                    <button
                      type="button"
                      key={option.id}
                      className={selected ? 'is-selected' : ''}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(option)}
                    >
                      <span>{option.value}</span>
                      {selected && <Check size={15} />}
                    </button>
                  );
                })
              ) : (
                <p className="dictionary-empty">Введите запрос или загрузите варианты.</p>
              )}
              {filteredOptions.length > 80 && (
                <small className="dictionary-limit">
                  Уточните поиск, чтобы увидеть больше вариантов.
                </small>
              )}
            </div>
          )}
          <div className="dictionary-actions">
            <button
              type="button"
              className="dictionary-load"
              disabled={busy || !more}
              onClick={load}
            >
              {busy ? (
                <>
                  <LoaderCircle size={13} className="spin" /> Загружаем варианты…
                </>
              ) : options.length && more ? (
                'Загрузить ещё варианты'
              ) : options.length ? (
                'Все варианты загружены'
              ) : (
                'Загрузить варианты'
              )}
            </button>
            {multiple && <span>Можно выбрать несколько</span>}
          </div>
          {multiple && values.length > 0 && (
            <div className="selected-values">
              {values.map((selected) => {
                const option = options.find((item) => String(item.id) === selected);
                return (
                  <span key={selected}>
                    {option?.value || selected}
                    <button
                      type="button"
                      onClick={() => choose({ id: selected })}
                      aria-label="Удалить"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ) : multiple ? (
        <div className="collection">
          {(value?.length ? value : ['']).map((item, index) => (
            <div className="collection-row" key={index}>
              <input
                id={index === 0 ? `attr-${key}` : undefined}
                type={['Integer', 'Decimal'].includes(a.type) ? 'number' : 'text'}
                step={a.type === 'Integer' ? '1' : 'any'}
                value={item}
                onChange={(event) => {
                  const next = [...(value?.length ? value : [''])];
                  next[index] = event.target.value;
                  onChange(next);
                }}
              />
              <button
                type="button"
                className="remove-value"
                aria-label="Удалить значение"
                onClick={() =>
                  onChange((value || []).filter((_, itemIndex) => itemIndex !== index))
                }
              >
                <X size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="add-value"
            disabled={a.max_value_count > 0 && (value?.length || 1) >= a.max_value_count}
            onClick={() => onChange([...(value?.length ? value : ['']), ''])}
          >
            <Plus size={14} /> Добавить ещё значение
          </button>
        </div>
      ) : a.type === 'Boolean' ? (
        <select
          id={`attr-${key}`}
          value={values}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Выберите значение</option>
          <option value="true">Да</option>
          <option value="false">Нет</option>
        </select>
      ) : longText ? (
        <textarea
          id={`attr-${key}`}
          rows={6}
          value={values}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Опишите товар понятными словами…"
        />
      ) : (
        <input
          id={`attr-${key}`}
          type={
            ['Integer', 'Decimal'].includes(a.type) ? 'number' : a.type === 'Date' ? 'date' : 'text'
          }
          step={a.type === 'Integer' ? '1' : 'any'}
          value={values}
          onChange={(event) => onChange(event.target.value)}
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

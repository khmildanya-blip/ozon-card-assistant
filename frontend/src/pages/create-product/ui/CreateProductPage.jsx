import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  UploadCloud,
  ImagePlus,
  Check,
  X,
  Zap,
  ShieldCheck,
  Layers,
  LoaderCircle,
  Save,
  Package,
  Search,
  RotateCcw,
} from 'lucide-react';
import React from 'react';
import { attributeKey as identity } from '../../../entities/product';
import { setupActions, AttributeForm } from '../../../features/product-setup';

export function CreateProductPage() {
  const dispatch = useDispatch();
  const {
    step,
    busy,
    error,
    product,
    category,
    categories,
    categorySearchPerformed,
    attributes,
    values,
    notice,
  } = useSelector((state) => state.productSetup);
  const [file, setFile] = useState(null),
    [preview, setPreview] = useState(''),
    [drag, setDrag] = useState(false);
  const [search, setSearch] = useState('');
  const input = useRef(null);
  const setError = (value) => dispatch(setupActions.setError(value));
  const setStep = (value) => dispatch(setupActions.setStep(value));
  const setProduct = (value) => dispatch(setupActions.setProduct(value));
  const setCategory = (value) => dispatch(setupActions.setCategory(value));
  const setNotice = (value) => dispatch(setupActions.setNotice(value));
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const selectFile = (f) => {
    setError('');
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('Выберите фото в формате JPG, PNG или WebP.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('Фото слишком большое. Максимальный размер — 10 МБ.');
      return;
    }
    setFile(f);
    dispatch(setupActions.photoChanged());
  };
  const recognize = () => dispatch(setupActions.recognizeRequested(file));
  const openCategories = () => {
    dispatch(setupActions.manualSelectionStarted());
  };
  const findCategory = (event) => {
    event.preventDefault();
    dispatch(setupActions.categorySearchRequested({ query: search || product }));
  };
  const fetchAttributes = () => dispatch(setupActions.attributesRequested());
  const save = () => dispatch(setupActions.saveRequested());
  const restore = () => dispatch(setupActions.restoreRequested());
  const filled = (a) =>
    Array.isArray(values[identity(a)])
      ? values[identity(a)].some((v) => String(v).trim())
      : String(values[identity(a)] ?? '').trim() !== '';
  const required = attributes.filter((a) => a.is_required),
    count = required.filter(filled).length;
  return (
    <div className="app">
      <header>
        <span className="header-note">Помощник продавца</span>
        <span className="demo-badge">
          <span /> Первое демо
        </span>
      </header>
      <main>
        <div className="intro">
          <span className="eyebrow">ОТ ФОТО — К ХАРАКТЕРИСТИКАМ</span>
          <h1>
            Ваш товар.
            <br />
            <span>Меньше рутины.</span>
          </h1>
          <p>
            Загрузите фото — поможем найти категорию Ozon
            <br className="desktop" /> и подготовим поля для заполнения.
          </p>
        </div>
        <nav className="steps" aria-label="Этапы создания">
          {['Фото товара', 'Категория', 'Характеристики'].map((name, i) => (
            <React.Fragment key={name}>
              {i > 0 && <div className={`step-line ${step >= i ? 'done' : ''}`} />}
              <div
                className={`step ${step === i ? 'active' : ''} ${step > i ? 'complete' : ''}`}
                aria-current={step === i ? 'step' : undefined}
              >
                <span>{step > i ? <Check size={15} /> : `0${i + 1}`}</span>
                <b>{name}</b>
              </div>
            </React.Fragment>
          ))}
        </nav>
        <section className={`workspace${step < 2 ? ' workspace--single' : ''}`}>
          <div className="workspace-main">
            <div className="section-heading">
              <div className="section-icon">
                {step === 0 ? (
                  <ImagePlus size={22} />
                ) : step === 1 ? (
                  <Package size={22} />
                ) : (
                  <Layers size={22} />
                )}
              </div>
              <span>ШАГ {step + 1} ИЗ 3</span>
            </div>
            <h2>
              {['Начнём с фотографии', 'Проверим категорию', 'Заполним характеристики'][step]}
            </h2>
            <p className="section-description">
              {
                [
                  'Одно хорошее фото — и мы уже знаем, с чего начать.',
                  'Проверьте результат или найдите подходящую категорию вручную.',
                  'Поля получены из Ozon. Значения вы заполняете самостоятельно.',
                ][step]
              }
            </p>
            {error && (
              <div className="alert" role="alert">
                {error}
                <button
                  className="icon-button"
                  aria-label="Закрыть ошибку"
                  onClick={() => setError('')}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {notice && (
              <div className="notice" role="status">
                <Check size={18} />
                {notice}
              </div>
            )}
            {busy && (
              <div className="loading" role="status">
                <LoaderCircle className="spin" size={22} />
                <span>
                  {busy}
                  <small>Это может занять несколько минут</small>
                </span>
              </div>
            )}
            {step === 0 && (
              <>
                <input
                  ref={input}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="visually-hidden"
                  onChange={(e) => {
                    selectFile(e.target.files[0]);
                    e.target.value = '';
                  }}
                  disabled={Boolean(busy)}
                />
                <div
                  className={`dropzone ${drag ? 'dragging' : ''} ${preview ? 'has-image' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!busy) setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    if (!busy) selectFile(e.dataTransfer.files[0]);
                  }}
                >
                  {preview ? (
                    <>
                      <img src={preview} alt="Выбранное фото товара" />
                      <div className="image-actions">
                        <span>{file.name}</span>
                        <button
                          className="icon-button"
                          disabled={Boolean(busy)}
                          onClick={() => setFile(null)}
                          aria-label="Удалить фото"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="upload-icon">
                        <UploadCloud size={32} />
                      </div>
                      <h3>Перетащите фото сюда</h3>
                      <p>или выберите файл на устройстве</p>
                    </>
                  )}
                  <button
                    className="secondary"
                    disabled={Boolean(busy)}
                    onClick={() => input.current.click()}
                  >
                    <ImagePlus size={17} />
                    {file ? 'Заменить фото' : 'Выбрать фото'}
                  </button>
                  <small>JPG, PNG или WebP · до 10 МБ</small>
                </div>
                <div className="tip">
                  <Sparkles size={17} />
                  <span>Лучше всего подойдёт фото одного товара на простом фоне.</span>
                </div>
                <button
                  className="text-button manual-entry"
                  disabled={Boolean(busy)}
                  onClick={openCategories}
                >
                  <Search size={16} /> Найти категорию по названию без фото
                </button>
                <div className="actions">
                  <button className="text-button muted" disabled={Boolean(busy)} onClick={restore}>
                    <RotateCcw size={15} />
                    Открыть черновик
                  </button>
                  <button className="primary" onClick={recognize} disabled={!file || Boolean(busy)}>
                    Определить товар <ArrowRight size={18} />
                  </button>
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <div className="product-result">
                  {preview && <img src={preview} alt="Товар" />}
                  <div>
                    <span className="eyebrow">ПРЕДПОЛОЖИТЕЛЬНО ЭТО</span>
                    <label htmlFor="product-name" className="visually-hidden">
                      Название товара
                    </label>
                    <input
                      id="product-name"
                      value={product}
                      placeholder="Название товара, если известно"
                      disabled={Boolean(busy)}
                      onChange={(e) => setProduct(e.target.value)}
                    />
                  </div>
                </div>
                {category && (
                  <div className="category-result">
                    <span className="eyebrow">КАТЕГОРИЯ OZON</span>
                    <h3>{category.category_name || 'Выбранная категория'}</h3>
                    <small>
                      Категория {category.description_category_id} · тип {category.type_id}
                    </small>
                  </div>
                )}
                <form className="category-search" onSubmit={findCategory}>
                  <label htmlFor="category-query">Найти категорию по названию товара</label>
                  <div className="inline">
                    <input
                      id="category-query"
                      placeholder="Например, компьютерная мышь или органайзер"
                      value={search}
                      disabled={Boolean(busy)}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <button
                      className="secondary"
                      type="submit"
                      disabled={Boolean(busy) || (search || product).trim().length < 2}
                    >
                      <Search size={16} /> Найти
                    </button>
                  </div>
                  <div className="category-list" aria-live="polite">
                    {categories.map((c) => (
                      <button
                        type="button"
                        key={`${c.description_category_id}-${c.type_id}`}
                        disabled={Boolean(busy)}
                        onClick={() => {
                          setCategory(c);
                          setError('');
                          setNotice('');
                        }}
                      >
                        {c.category_name}
                        <ArrowRight size={16} />
                      </button>
                    ))}
                    {categorySearchPerformed && !categories.length && (
                      <p>Категории не найдены. Попробуйте другое название товара.</p>
                    )}
                  </div>
                </form>
                <div className="actions">
                  <button
                    className="text-button muted"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      setStep(0);
                      setError('');
                    }}
                  >
                    <ArrowLeft size={16} />К фото
                  </button>
                  <button
                    className="primary"
                    disabled={!category || Boolean(busy)}
                    onClick={fetchAttributes}
                  >
                    Подтвердить категорию
                    <ArrowRight size={17} />
                  </button>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <div className="category-result">
                  <span className="eyebrow">{product}</span>
                  <h3>{category?.category_name}</h3>
                  <small>
                    Обязательных заполнено: {count} из {required.length}
                  </small>
                </div>
                {!attributes.length && (
                  <div className="empty">
                    <Layers size={30} />
                    <h3>Ozon не вернул характеристики</h3>
                    <p>Повторите запрос или выберите другую категорию.</p>
                    <button
                      className="secondary"
                      disabled={Boolean(busy)}
                      onClick={fetchAttributes}
                    >
                      Повторить запрос
                    </button>
                  </div>
                )}
                {attributes.length > 0 && (
                  <AttributeForm
                    attributes={attributes}
                    category={category}
                    values={values}
                    onChange={(key, value) => {
                      dispatch(setupActions.valueChanged({ key, value }));
                      setNotice('');
                    }}
                  />
                )}
                <div className="actions">
                  <button
                    className="text-button muted"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      setStep(1);
                      setError('');
                      setNotice('');
                    }}
                  >
                    <ArrowLeft size={16} />К категории
                  </button>
                  <button className="primary" onClick={save}>
                    <Save size={17} />
                    Сохранить черновик
                  </button>
                </div>
                <p className="local-note">
                  Черновик хранится только в этом браузере. Публикация на Ozon не выполняется.
                </p>
              </>
            )}
          </div>
          {step === 2 && (
            <aside>
              <div className="aside-top">
                <span className="eyebrow">ПРОСТОЙ СТАРТ</span>
                <div className="illustration">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <Sparkles className="floating-spark" size={23} />
                  <div className="mini-card">
                    <div className="mini-card-top">
                      <span>OZON</span>
                      <span className="mini-dot" />
                    </div>
                    <div className="package-art">
                      <Package size={68} strokeWidth={1} />
                    </div>
                    <div className="skeleton long" />
                    <div className="skeleton" />
                    <div className="mini-tags">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="mini-check">
                      <Check size={17} />
                    </div>
                  </div>
                  <span className="float-label">
                    <Sparkles size={14} />
                    Меньше ручной работы
                  </span>
                </div>
                <h3>
                  Всё начинается
                  <br />с одного фото
                </h3>
                <p>
                  Мы найдём категорию,
                  <br />
                  вы добавите детали.
                </p>
              </div>
              <div className="benefits">
                <div>
                  <Zap size={19} />
                  <span>
                    <b>Без лишних шагов</b>
                    <small>Один товар, один понятный сценарий</small>
                  </span>
                </div>
                <div>
                  <Layers size={19} />
                  <span>
                    <b>Поля из Ozon</b>
                    <small>Актуальные характеристики категории</small>
                  </span>
                </div>
                <div>
                  <ShieldCheck size={19} />
                  <span>
                    <b>Всё под вашим контролем</b>
                    <small>Проверьте категорию и заполните поля</small>
                  </span>
                </div>
              </div>
              <div className="aside-note">Создано, чтобы упростить вашу работу</div>
            </aside>
          )}
        </section>
        <footer>
          <span>Помощник для подготовки товаров</span>
          <span>Первое демо — без публикации на маркетплейсе</span>
        </footer>
      </main>
    </div>
  );
}

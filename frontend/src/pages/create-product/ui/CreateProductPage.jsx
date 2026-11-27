import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CircleAlert,
  CloudUpload,
  GripVertical,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { attributeKey as identity } from '../../../entities/product';
import {
  cardAttributes,
  cardMeasurements,
  validMeasurement,
} from '../../../entities/product/model/card-details';
import { AccountControl } from '../../../features/account/ui/AccountControl';
import { setupActions, AttributeForm } from '../../../features/product-setup';

const MAX_SIZE = 10 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const STEPS = ['Фото товара', 'Распознавание', 'Характеристики', 'Предпросмотр'];

function makePhoto(file, main = false) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    url: URL.createObjectURL(file),
    main,
  };
}

function normalise(value) {
  return String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function detectedText(key, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const parts = [value.width, value.height, value.depth].filter(
      (item) => item !== undefined && item !== null && String(item).trim() && Number(item) > 0,
    );
    return parts.length ? `Габариты: ${parts.join(' × ')}` : '';
  }
  const labels = {
    title: 'Название',
    author: 'Автор',
    author_on_cover: 'Автор на обложке',
    publisher: 'Издательство',
    model: 'Модель',
    brand: 'Бренд',
    color: 'Цвет',
    weight: 'Вес',
    year: 'Год издания',
    isbn: 'ISBN',
    pages_count: 'Количество страниц',
    cover_type: 'Тип переплёта',
    paper_type: 'Тип бумаги',
    language: 'Язык',
    condition: 'Состояние',
  };
  const text = String(value ?? '').trim();
  if (!text || text === '0' || text === 'undefined' || text === 'null') return '';
  if (!labels[key]) return '';
  return `${labels[key]}: ${text}`;
}

function hasColorSwatch(value) {
  return /^(#[0-9a-f]{3,8}|rgb\(|hsl\(|red$|blue$|green$|black$|white$)/iu.test(
    String(value || '').trim(),
  );
}

function generatedDescription(data) {
  const content = data?.content || {};
  const recognition = data?.recognition || {};
  const fields = { ...recognition, ...content, ...(content.extracted_fields || {}) };
  if (String(content.ozon_description || fields.ozon_description || '').trim())
    return content.ozon_description || fields.ozon_description;

  const title = fields.title || data?.product;
  const author = fields.author || fields.author_on_cover;
  const publisher = fields.publisher;
  const pages = Number(fields.pages_count) > 0 ? fields.pages_count : null;
  if (!fields.title && !author && !publisher) return '';
  if (!title && !author) return '';
  const parts = [`Книга «${title || 'Без названия'}».`];
  if (author) parts.push(`Автор — ${author}.`);
  if (publisher) parts.push(`Издательство — ${publisher}.`);
  if (Number(fields.year) > 0) parts.push(`Год выпуска издания — ${fields.year}.`);
  if (fields.cover_type && fields.cover_type !== '0')
    parts.push(`Переплёт — ${fields.cover_type}.`);
  if (pages) parts.push(`В издании ${pages} страниц.`);
  return parts.join(' ');
}

function recognisedValue(attribute, data) {
  const name = normalise(attribute.name);
  const fields = {
    ...(data?.recognition || {}),
    ...(data?.content || {}),
    ...(data?.content?.extracted_fields || {}),
  };
  if (/модел/.test(name)) return fields.model;
  if (/цвет/.test(name)) {
    const color = fields.color;
    if (!color || normalise(color) === normalise(data.product)) return undefined;
    return color;
  }
  if (/^бренд$|бренд товара/.test(name)) return fields.brand;
  if (/назван|наименован|заголовок/.test(name)) return fields.title || data.product;
  if (/автор/.test(name)) return fields.author || fields.author_on_cover;
  if (/издател/.test(name)) return fields.publisher;
  if (/год/.test(name)) return fields.year;
  if (/страниц/.test(name)) return fields.pages_count;
  if (/isbn/.test(name)) return fields.isbn;
  if (/переплет|обложк/.test(name)) return fields.cover_type;
  if (/язык/.test(name)) return fields.language;
  if (/описан|аннотац/.test(name)) return fields.ozon_description || generatedDescription(data);
  const dimensions = fields.dimensions || {};
  const knownNumber = (value) =>
    value !== undefined && value !== null && String(value).trim() && Number(value) > 0
      ? value
      : undefined;
  if (/ширин/.test(name)) return knownNumber(dimensions.width);
  if (/высот/.test(name)) return knownNumber(dimensions.height);
  if (/глубин|длин/.test(name)) return knownNumber(dimensions.depth);
  if (/диаметр/.test(name)) return knownNumber(dimensions.diameter);
  if (/об[ъе]м/.test(name)) return knownNumber(dimensions.volume);
  if (/^габарит|размер/.test(name)) {
    const values = [dimensions.width, dimensions.height, dimensions.depth].filter(
      (value) => value !== undefined && value !== null && String(value).trim() && Number(value) > 0,
    );
    return values.length ? values.join(' × ') : undefined;
  }
  if (/вес|масса/.test(name)) return knownNumber(fields.weight);
  return undefined;
}

function CameraModal({ onClose, onCapture, onSystemCamera }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    let active = true;
    const open = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('Камера недоступна в этом браузере.');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (!active) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
      } catch (error) {
        setCameraError(error.message || 'Не удалось открыть камеру.');
      }
    };
    open();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    const side = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = side;
    canvas.height = side;
    canvas
      .getContext('2d')
      .drawImage(
        video,
        (video.videoWidth - side) / 2,
        (video.videoHeight - side) / 2,
        side,
        side,
        0,
        0,
        side,
        side,
      );
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <div className="camera-modal" role="dialog" aria-modal="true" aria-label="Камера">
      <div className="camera-dialog">
        <div className="camera-head">
          <span>
            <span className="camera-dot" /> Основная камера
          </span>
          <button
            className="round-button round-button--dark"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={19} />
          </button>
        </div>
        <div className="camera-view">
          {cameraError ? (
            <div className="camera-empty">
              <Camera size={42} />
              <strong>Камера недоступна</strong>
              <p>{cameraError}</p>
            </div>
          ) : (
            <video ref={videoRef} autoPlay playsInline muted />
          )}
          <div className="camera-frame" />
        </div>
        <div className="camera-actions">
          <button className="camera-secondary" onClick={onSystemCamera}>
            Системная камера
          </button>
          <button
            className="shutter"
            onClick={capture}
            disabled={Boolean(cameraError)}
            aria-label="Сделать снимок"
          >
            <span />
          </button>
          <button className="camera-secondary" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

export function CreateProductPage() {
  const dispatch = useDispatch();
  const setup = useSelector((state) => state.productSetup);
  const {
    step,
    busy,
    error,
    notice,
    product,
    recognition,
    content,
    contentAttempted,
    category,
    categories,
    categorySearchPerformed,
    categorySource,
    attributes: categoryAttributes,
    values,
  } = setup;
  const attributes = useMemo(
    () => cardAttributes(categoryAttributes, category),
    [categoryAttributes, category],
  );
  const [photos, setPhotos] = useState([]);
  const [drag, setDrag] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [direction, setDirection] = useState('forward');
  const [draggedPhoto, setDraggedPhoto] = useState(null);
  const inputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const extraInputRef = useRef(null);
  const autoFillKey = useRef('');
  const photosRef = useRef([]);

  const mainPhoto = photos.find((photo) => photo.main) || photos[0];
  const recognisedDescription = useMemo(
    () => generatedDescription({ content, recognition, product }),
    [content, recognition, product],
  );

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  useEffect(() => {
    if (step === 1 && mainPhoto?.file && recognition && !contentAttempted && !busy) {
      dispatch(
        setupActions.contentRequested({
          file: mainPhoto.file,
          files: photos.map((photo) => photo.file),
        }),
      );
    }
  }, [step, mainPhoto?.file, recognition, contentAttempted, busy, photos, dispatch]);

  useEffect(() => {
    if (step !== 2 || !attributes.length) return;
    const key = `${category?.description_category_id}:${category?.type_id}:${attributes.length}:${product}:${content?.color || ''}`;
    if (autoFillKey.current === key) return;
    const patch = {};
    attributes.forEach((attribute) => {
      if (
        (attribute.dictionary_id && !/цвет/iu.test(attribute.name || '')) ||
        attribute.is_collection ||
        values[identity(attribute)]
      )
        return;
      const value = recognisedValue(attribute, { recognition, content, product });
      if (value !== undefined && value !== null && String(value).trim())
        patch[identity(attribute)] = String(value);
    });
    if (Object.keys(patch).length) dispatch(setupActions.valuesPatched(patch));
    autoFillKey.current = key;
  }, [step, attributes, category, product, recognition, content, values, dispatch]);

  const selectFile = (file, replace = false) => {
    dispatch(setupActions.setError(''));
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type))
      return dispatch(setupActions.setError('Поддерживаются JPG, PNG и WebP.'));
    if (file.size > MAX_SIZE)
      return dispatch(setupActions.setError('Размер изображения не должен превышать 10 МБ.'));
    const record = makePhoto(file, true);
    setPhotos((current) => {
      current.filter((photo) => photo.main).forEach((photo) => URL.revokeObjectURL(photo.url));
      const rest = current.filter((photo) => !photo.main);
      if (replace || !current.length) return [record, ...rest];
      return current.length ? current : [record];
    });
    dispatch(setupActions.photoChanged());
  };

  const addExtraFiles = (fileList) => {
    const selected = Array.from(fileList || []);
    const valid = selected.filter(
      (file) => IMAGE_TYPES.includes(file.type) && file.size <= MAX_SIZE,
    );
    if (selected.length !== valid.length) {
      dispatch(
        setupActions.setError('Некоторые файлы пропущены: нужны JPG, PNG или WebP до 10 МБ.'),
      );
    }
    if (!valid.length)
      return dispatch(setupActions.setError('Выберите изображения JPG, PNG или WebP до 10 МБ.'));
    setPhotos((current) => [...current, ...valid.map((file) => makePhoto(file, !current.length))]);
  };

  const moveTo = (next) => {
    if (next === step || next < 0 || next > 3) return;
    setDirection(next > step ? 'forward' : 'backward');
    dispatch(setupActions.setError(''));
    dispatch(setupActions.setNotice(''));
    dispatch(setupActions.setStep(next));
  };

  const startRecognition = () => {
    if (mainPhoto?.file)
      dispatch(
        setupActions.recognizeRequested({
          file: mainPhoto.file,
          files: photos.map((photo) => photo.file),
        }),
      );
  };
  const findCategory = (event) => {
    event.preventDefault();
    dispatch(setupActions.categorySearchRequested({ query: (search || product).trim() }));
  };
  const required = attributes.filter((attribute) => attribute.is_required);
  const isFilled = (attribute) => {
    const value = values[identity(attribute)];
    return Array.isArray(value)
      ? value.some((item) => String(item).trim())
      : String(value ?? '').trim() !== '';
  };
  const requiredTotal = required.length + cardMeasurements.length;
  const requiredCount =
    required.filter(isFilled).length +
    cardMeasurements.filter(([key]) => validMeasurement(values[key])).length;
  const canContinueSpecs = attributes.length > 0 && requiredCount === requiredTotal;
  const previewFields = useMemo(() => {
    const get = (pattern) => {
      const attribute = attributes.find((item) => pattern.test(normalise(item.name)));
      return attribute ? values[identity(attribute)] : '';
    };
    return {
      title: product || content?.extracted_fields?.title || 'Название товара',
      brand: get(/^бренд(?:\s|$)/u),
      color: content?.color || get(/цвет/) || 'Не указан',
      material: get(/материал/) || 'Не указан',
      description:
        get(/описан|аннотац/) ||
        recognisedDescription ||
        'Описание будет сформировано из заполненных характеристик.',
    };
  }, [attributes, values, product, content, recognisedDescription]);

  const saveDraft = () =>
    dispatch(
      setupActions.saveRequested({ photos: photos.map(({ file, main }) => ({ file, main })) }),
    );
  const restoreDraft = () =>
    dispatch(
      setupActions.restoreRequested({
        onPhotos: (savedPhotos) => {
          const restored = savedPhotos.map(({ file, main }) => makePhoto(file, main));
          photosRef.current.forEach(({ url }) => URL.revokeObjectURL(url));
          photosRef.current = restored;
          setPhotos(restored);
          setSearch('');
          setEditing(false);
          autoFillKey.current = '';
        },
      }),
    );
  const removePhoto = (id) =>
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.url);
      const next = current.filter((photo) => photo.id !== id);
      if (target?.main && next[0]) next[0] = { ...next[0], main: true };
      return next;
    });
  const setMainPhoto = (id) =>
    setPhotos((current) => current.map((photo) => ({ ...photo, main: photo.id === id })));
  const reorderPhotos = (targetId) => {
    if (!draggedPhoto || draggedPhoto === targetId) return;
    setPhotos((current) => {
      const sourceIndex = current.findIndex((photo) => photo.id === draggedPhoto);
      const targetIndex = current.findIndex((photo) => photo.id === targetId);
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggedPhoto(null);
  };

  const renderAlert = () => (
    <>
      {error && (
        <div className="alert alert--error" role="alert">
          <CircleAlert size={18} />
          <span>{error}</span>
          <button onClick={() => dispatch(setupActions.setError(''))} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="alert alert--notice" role="status">
          <Check size={18} />
          <span>{notice}</span>
        </div>
      )}
      {busy && (
        <div className="busy" role="status">
          <LoaderCircle className="spin" size={20} />
          <span>
            {busy}
            <small>Не закрывайте страницу во время обработки</small>
          </span>
        </div>
      )}
    </>
  );

  const photoStage = (
    <div className="stage-content">
      <StageHeading
        icon={<Camera size={19} />}
        eyebrow="ЭТАП 1 ИЗ 4"
        title="Давайте познакомимся с товаром"
        subtitle="Сфотографируйте товар или загрузите готовое изображение."
      />
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept={IMAGE_TYPES.join(',')}
        multiple
        onChange={(event) => {
          const selected = Array.from(event.target.files || []);
          if (selected[0]) selectFile(selected[0], true);
          if (selected.length > 1) addExtraFiles(selected.slice(1));
          event.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            if (mainPhoto) addExtraFiles([file]);
            else selectFile(file, true);
          }
          event.target.value = '';
        }}
      />
      <input
        ref={extraInputRef}
        className="visually-hidden"
        type="file"
        accept={IMAGE_TYPES.join(',')}
        multiple
        onChange={(event) => {
          addExtraFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <div
        className={`photo-drop ${drag ? 'photo-drop--drag' : ''} ${mainPhoto ? 'photo-drop--filled' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          const dropped = Array.from(event.dataTransfer.files || []);
          if (dropped[0]) selectFile(dropped[0], true);
          if (dropped.length > 1) addExtraFiles(dropped.slice(1));
        }}
      >
        {mainPhoto ? (
          <img src={mainPhoto.url} alt="Предпросмотр товара" />
        ) : (
          <div className="photo-empty">
            <div className="photo-empty-icon">
              <ImagePlus size={30} />
            </div>
            <strong>Добавьте фото товара</strong>
            <p>Одно хорошее фото — и мы уже знаем, с чего начать.</p>
          </div>
        )}
        {mainPhoto && (
          <div className="photo-file">
            <span>{mainPhoto.file.name}</span>
            <button onClick={() => removePhoto(mainPhoto.id)} aria-label="Удалить фото">
              <Trash2 size={16} />
            </button>
          </div>
        )}
        <div className="photo-actions">
          <button className="button button--secondary" onClick={() => setCameraOpen(true)}>
            <Camera size={17} /> {mainPhoto ? 'Сфотографировать ещё' : 'Сфотографировать'}
          </button>
          <button className="button button--secondary" onClick={() => inputRef.current?.click()}>
            <CloudUpload size={17} /> {mainPhoto ? 'Заменить фото' : 'Загрузить из галереи'}
          </button>
        </div>
        <small className="format-note">JPG, PNG или WebP · до 10 МБ</small>
      </div>
      {photos.length > 0 && (
        <div className="photo-strip" aria-label="Добавленные фотографии">
          {photos.map((photo, index) => (
            <div className={`photo-strip-item ${photo.main ? 'is-main' : ''}`} key={photo.id}>
              <img src={photo.url} alt={`Фото товара ${index + 1}`} />
              {photo.main && <span>Главное</span>}
              <button type="button" onClick={() => removePhoto(photo.id)} aria-label="Удалить фото">
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="photo-strip-add"
            onClick={() => extraInputRef.current?.click()}
            disabled={Boolean(busy)}
          >
            <Plus size={17} />
            <span>Добавить ещё</span>
          </button>
        </div>
      )}
      <div className="soft-note">
        <Sparkles size={16} />
        <span>Фотографии сохраняются в этом браузере вместе с черновиком.</span>
      </div>
      <form
        className="manual-start-search"
        onSubmit={(event) => {
          event.preventDefault();
          dispatch(setupActions.manualSelectionStarted());
          dispatch(setupActions.categorySearchRequested({ query: search.trim() }));
        }}
      >
        <span>Нет фото под рукой?</span>
        <div className="manual-start-line">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найдите категорию по названию"
          />
          <button
            className="button button--ghost"
            type="submit"
            disabled={search.trim().length < 2 || Boolean(busy)}
          >
            Искать <Search size={15} />
          </button>
        </div>
      </form>
      <div className="stage-footer">
        <button className="button button--ghost" onClick={restoreDraft} disabled={Boolean(busy)}>
          <RotateCcw size={16} /> Открыть черновик
        </button>
        <button
          className="button button--primary button--large"
          onClick={startRecognition}
          disabled={!mainPhoto || Boolean(busy)}
        >
          Продолжить <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );

  const recognitionStage = (
    <div className="stage-content">
      <StageHeading
        icon={<Sparkles size={19} />}
        eyebrow="ЭТАП 2 ИЗ 4"
        title={mainPhoto ? 'Мы правильно поняли, что это?' : 'Найдите категорию товара'}
        subtitle={
          mainPhoto
            ? 'Нейросеть проанализировала фотографию. Проверьте результат.'
            : 'Выберите подходящую категорию по названию товара.'
        }
      />
      <div className="recognition-layout">
        <div className="recognition-photo">
          {mainPhoto ? (
            <img src={mainPhoto.url} alt="Распознанный товар" />
          ) : (
            <div className="recognition-placeholder">
              <Search size={34} />
              <span>Поиск по названию</span>
            </div>
          )}
          <span className="ai-badge">
            <Sparkles size={14} /> {mainPhoto ? 'AI-анализ' : 'Ручной выбор'}
          </span>
        </div>
        <div className="recognition-result">
          <label className="field-label" htmlFor="recognised-name">
            Название товара
          </label>
          <input
            id="recognised-name"
            className="input input--large"
            value={product}
            onChange={(event) => dispatch(setupActions.setProduct(event.target.value))}
            disabled={Boolean(busy) || !editing}
          />
          <div className="result-row">
            <div>
              <span className="result-caption">ТИП ТОВАРА</span>
              <strong>
                {recognition?.category === 'book' || content?.extracted_fields?.author
                  ? 'Книга'
                  : 'Товар'}
              </strong>
            </div>
            <div>
              <span className="result-caption">ЦВЕТ</span>
              {editing ? (
                <div className="color-edit">
                  {hasColorSwatch(content?.color) && <i style={{ background: content.color }} />}
                  <input
                    className="input"
                    value={content?.color || ''}
                    onChange={(event) =>
                      dispatch(setupActions.contentEdited({ color: event.target.value }))
                    }
                    placeholder="Например, тёмно-синий"
                  />
                </div>
              ) : (
                <strong className="color-value">
                  {hasColorSwatch(content?.color) && <i style={{ background: content.color }} />}
                  {content?.color || 'Определяется…'}
                </strong>
              )}
            </div>
          </div>
          <div className="category-card">
            <span className="result-caption">Предполагаемая категория</span>
            <strong>{category?.category_name || 'Выберите категорию ниже'}</strong>
            {category && (
              <small>
                ID категории {category.description_category_id} · тип {category.type_id}
              </small>
            )}
          </div>
          {recognisedDescription && (
            <div className="recognition-description">
              <span className="result-caption">ПРЕДЛОЖЕННОЕ ОПИСАНИЕ</span>
              {editing ? (
                <textarea
                  value={recognisedDescription}
                  onChange={(event) =>
                    dispatch(setupActions.contentEdited({ ozon_description: event.target.value }))
                  }
                  rows={6}
                />
              ) : (
                <p>{recognisedDescription}</p>
              )}
            </div>
          )}
          {content?.extracted_fields && (
            <div className="detected-fields">
              <span className="result-caption">РАСПОЗНАННЫЕ ДАННЫЕ</span>
              <div className="tag-list">
                {Object.entries(content.extracted_fields)
                  .map(([key, value]) => detectedText(key, value))
                  .filter(Boolean)
                  .slice(0, 7)
                  .map((value) => (
                    <span key={value} className="tag">
                      <Check size={13} />
                      {value}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <form className="category-search-card" onSubmit={findCategory}>
        <div>
          <span className="result-caption">ЕСЛИ НУЖНО ИСПРАВИТЬ</span>
          <strong>Найдите другую категорию</strong>
        </div>
        <div className="search-line">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Например, книга или органайзер"
          />
          <button
            className="button button--secondary"
            type="submit"
            disabled={Boolean(busy) || (search || product).trim().length < 2}
          >
            Найти
          </button>
        </div>
        {categories.length > 0 && (
          <div className="category-results">
            {categories.map((item) => (
              <button
                key={`${item.description_category_id}-${item.type_id}`}
                type="button"
                onClick={() => dispatch(setupActions.setCategory(item))}
              >
                <span>{item.category_name}</span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        )}
        {categorySearchPerformed && !categories.length && (
          <p className="empty-inline">Категории не найдены. Попробуйте другое название.</p>
        )}
        {categorySource && (
          <small className="source-note">
            Источник: {categorySource === 'rag' ? 'семантический поиск RAG' : 'сохранённый каталог'}
          </small>
        )}
      </form>
      <div className="stage-footer">
        <button className="button button--ghost" onClick={() => moveTo(0)} disabled={Boolean(busy)}>
          <ArrowLeft size={16} /> Назад к фото
        </button>
        <div className="footer-actions">
          <button
            className={`button button--secondary ${editing ? 'button--selected' : ''}`}
            onClick={() => setEditing((value) => !value)}
            disabled={Boolean(busy)}
          >
            <Pencil size={16} /> {editing ? 'Готово' : 'Исправить'}
          </button>
          <button
            className="button button--primary button--large"
            onClick={() => dispatch(setupActions.attributesRequested())}
            disabled={!category || Boolean(busy)}
          >
            Всё верно <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  const specsStage = (
    <div className="stage-content">
      <StageHeading
        icon={<Layers3 size={19} />}
        eyebrow="ЭТАП 3 ИЗ 4"
        title="Расскажите о товаре подробнее"
        subtitle="Заполните характеристики, чтобы покупатели могли найти ваш товар."
      />
      <div className="completion">
        <div>
          <strong>Заполненность карточки</strong>
          <span>
            {requiredCount} из {requiredTotal} обязательных полей
          </span>
        </div>
        <div className="completion-bar">
          <i style={{ width: `${(requiredCount / requiredTotal) * 100}%` }} />
        </div>
      </div>
      {category && (
        <div className="selected-category">
          <div>
            <span className="result-caption">Категория</span>
            <strong>{category.category_name}</strong>
          </div>
          <button className="button button--ghost" onClick={() => moveTo(1)}>
            <Pencil size={15} /> Изменить
          </button>
        </div>
      )}
      {!attributes.length ? (
        <div className="empty-state">
          <Layers3 size={32} />
          <strong>Характеристики ещё не загружены</strong>
          <p>Подтвердите категорию, чтобы загрузить характеристики.</p>
          <button className="button button--secondary" onClick={() => moveTo(1)}>
            Вернуться к категории
          </button>
        </div>
      ) : (
        <AttributeForm
          attributes={attributes}
          category={category}
          values={values}
          onChange={(key, value) => dispatch(setupActions.valueChanged({ key, value }))}
        />
      )}
      <div className="stage-footer">
        <button className="button button--ghost" onClick={() => moveTo(1)} disabled={Boolean(busy)}>
          <ArrowLeft size={16} /> К категории
        </button>
        <div className="footer-actions">
          <button className="button button--secondary" onClick={saveDraft} disabled={Boolean(busy)}>
            <Save size={16} /> Сохранить черновик
          </button>
          <button
            className="button button--primary button--large"
            onClick={() => canContinueSpecs && moveTo(3)}
            disabled={!canContinueSpecs || Boolean(busy)}
          >
            Продолжить <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  const previewStage = (
    <div className="stage-content">
      <StageHeading
        icon={<Check size={19} />}
        eyebrow="ЭТАП 4 ИЗ 4"
        title="Предпросмотр карточки"
        subtitle="Проверьте данные и сохраните черновик."
      />
      <div className="preview-grid">
        <div className="market-card">
          <div className="market-image">
            {mainPhoto && <img src={mainPhoto.url} alt="Главное фото товара" />}
          </div>
          <div className="market-body">
            <span className="market-category">
              {category?.category_name || 'Категория не выбрана'}
            </span>
            <h3>{previewFields.title}</h3>
            <div className="market-meta">
              <span>{previewFields.color}</span>
              <span>{previewFields.material}</span>
              {previewFields.brand && <span>{previewFields.brand}</span>}
              {cardMeasurements.every(([key]) => validMeasurement(values[key])) && (
                <span>{cardMeasurements.map(([key]) => values[key]).join(' × ')} см</span>
              )}
            </div>
            <p>{previewFields.description}</p>
          </div>
        </div>
        <div className="photo-manager">
          <div className="manager-heading">
            <div>
              <strong>Дополнительные фотографии</strong>
              <span>{photos.length} фото · перетащите, чтобы изменить порядок</span>
            </div>
            <button
              className="button button--secondary"
              onClick={() => extraInputRef.current?.click()}
            >
              <Plus size={16} /> Добавить
            </button>
          </div>
          <input
            ref={extraInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              addExtraFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <div className="photo-grid">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className={`photo-tile ${photo.main ? 'photo-tile--main' : ''}`}
                draggable
                onDragStart={() => setDraggedPhoto(photo.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorderPhotos(photo.id)}
              >
                <img src={photo.url} alt={`Фото ${index + 1}`} />
                <div className="tile-actions">
                  <button
                    onClick={() => setMainPhoto(photo.id)}
                    className={photo.main ? 'is-active' : ''}
                    title="Сделать главным"
                  >
                    <Check size={13} />
                  </button>
                  <button onClick={() => removePhoto(photo.id)} title="Удалить">
                    <Trash2 size={13} />
                  </button>
                </div>
                <GripVertical className="drag-icon" size={17} />
                {photo.main && <span className="main-chip">Главное</span>}
              </div>
            ))}
            <button className="photo-add-tile" onClick={() => extraInputRef.current?.click()}>
              <ImagePlus size={22} />
              <span>Добавить фото</span>
            </button>
          </div>
        </div>
      </div>
      <div className="stage-footer">
        <button className="button button--ghost" onClick={() => moveTo(2)} disabled={Boolean(busy)}>
          <ArrowLeft size={16} /> К характеристикам
        </button>
        <div className="footer-actions">
          <button className="button button--secondary" onClick={saveDraft} disabled={Boolean(busy)}>
            <Save size={16} /> Сохранить черновик
          </button>
          <button
            className="button button--primary"
            type="button"
            disabled
            aria-describedby="send-note"
          >
            <Send size={16} /> Отправить на Ozon
          </button>
        </div>
      </div>
      <p id="send-note" className="soft-note">
        Отправка пока недоступна. Готовую карточку можно сохранить как черновик.
      </p>
    </div>
  );

  const stage = [photoStage, recognitionStage, specsStage, previewStage][step];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={17} />
          </div>
          <div>
            <strong>AI Seller Cards</strong>
            <span>AI-помощник продавца</span>
          </div>
        </div>
        <AccountControl />
      </header>
      <div className="progress-track" aria-label="Прогресс создания карточки">
        {STEPS.map((name, index) => (
          <div className="progress-segment" key={name}>
            <i className={index <= step ? 'is-done' : ''} />
            <span className={index === step ? 'is-current' : ''}>{name}</span>
          </div>
        ))}
      </div>
      <main className={`card-deck card-deck--${direction}`}>
        <div className="deck-shadow deck-shadow--back" />
        <div className="deck-shadow deck-shadow--front" />
        <section className="work-card" key={step}>
          {renderAlert()}
          {stage}
        </section>
      </main>
      {cameraOpen && (
        <CameraModal
          onClose={() => setCameraOpen(false)}
          onSystemCamera={() => {
            setCameraOpen(false);
            cameraInputRef.current?.click();
          }}
          onCapture={(file) => {
            setCameraOpen(false);
            if (mainPhoto) addExtraFiles([file]);
            else selectFile(file, true);
          }}
        />
      )}
    </div>
  );
}

function StageHeading({ icon, eyebrow, title, subtitle }) {
  return (
    <div className="stage-heading">
      <div className="stage-heading-icon">{icon}</div>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

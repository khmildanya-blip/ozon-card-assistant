import React from 'react';
import { attributeKey, getAttributeLayout } from '../../../entities/product';
import { cardMeasurements, validMeasurement } from '../../../entities/product/model/card-details';
import { AttributeField } from './AttributeField';

export function AttributeForm({ attributes, category, values, onChange }) {
  const { groups, additional } = getAttributeLayout(attributes, category);
  const corePattern =
    /цвет|модель|бренд|назван|наименован|описан|аннотац|габарит|размер|вес|высот|ширин|длин|глубин|диаметр|об[ъе]м/iu;
  const corePriority = [
    /цвет/iu,
    /модель/iu,
    /бренд/iu,
    /назван|наименован/iu,
    /описан|аннотац/iu,
    /габарит|размер|вес|высот|ширин|длин|глубин|диаметр|об[ъе]м/iu,
  ];
  const core = [...groups.flatMap((group) => group.attributes), ...additional].filter((attribute) =>
    corePattern.test(attribute.name || ''),
  );
  const coreKeys = new Set(core.map(attributeKey));
  const remainingAdditional = additional.filter(
    (attribute) => !coreKeys.has(attributeKey(attribute)),
  );
  const orderedCore = [...core].sort((a, b) => {
    const priority = (attribute) => {
      const index = corePriority.findIndex((pattern) => pattern.test(attribute.name || ''));
      return index < 0 ? corePriority.length : index;
    };
    return (
      priority(a) - priority(b) || Number(Boolean(b.is_required)) - Number(Boolean(a.is_required))
    );
  });
  const renderField = (attribute) => (
    <AttributeField
      key={attributeKey(attribute)}
      attribute={attribute}
      value={values[attributeKey(attribute)]}
      onChange={(value) => onChange(attributeKey(attribute), value)}
    />
  );
  return (
    <div className="attribute-form">
      <p className="attribute-form-note">
        Поля с пометкой «обязательно» нужны для завершения карточки. Значения, которые удалось
        распознать по фото, уже подставлены — их можно изменить.
      </p>
      <fieldset className="card-measurements">
        <legend>Габариты товара</legend>
        <p className="attribute-group-description">
          Укажите размеры самого товара в сантиметрах. Для книги глубина — это толщина.
        </p>
        {cardMeasurements.map(([key, label]) => {
          const value = values[key] ?? '';
          const invalid = value !== '' && !validMeasurement(value);
          return (
            <div className="field" key={key}>
              <label htmlFor={key}>
                {label} <span className="required-badge">обязательно</span>
              </label>
              <input
                id={key}
                className="input"
                inputMode="decimal"
                required
                value={value}
                aria-invalid={invalid}
                aria-describedby={invalid ? `${key}-error` : undefined}
                onChange={(event) => onChange(key, event.target.value)}
              />
              {invalid && (
                <p id={`${key}-error`} className="field-error">
                  Введите число больше нуля.
                </p>
              )}
            </div>
          );
        })}
      </fieldset>
      {orderedCore.length > 0 && (
        <fieldset className="core-fields">
          <legend>
            Главное для карточки <span>{orderedCore.length}</span>
          </legend>
          <p className="attribute-group-description">Проверьте основные сведения о товаре.</p>
          {orderedCore.map(renderField)}
        </fieldset>
      )}
      {groups.map((group) => {
        const groupAttributes = group.attributes.filter(
          (attribute) => !coreKeys.has(attributeKey(attribute)),
        );
        if (!groupAttributes.length) return null;
        return (
          <fieldset key={group.id}>
            <legend>
              {group.title}
              <span>{groupAttributes.length}</span>
            </legend>
            <p className="attribute-group-description">{group.description}</p>
            {groupAttributes.map(renderField)}
          </fieldset>
        );
      })}
      {remainingAdditional.length > 0 && (
        <details className="additional-attributes">
          <summary>
            Другие характеристики <span>{remainingAdditional.length}</span>
          </summary>
          <p className="attribute-group-description">
            Необязательные сведения, если они важны для вашего товара.
          </p>
          {remainingAdditional.map(renderField)}
        </details>
      )}
    </div>
  );
}

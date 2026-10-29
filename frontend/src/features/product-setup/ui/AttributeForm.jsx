import React from 'react';
import { attributeKey, getAttributeLayout } from '../../../entities/product';
import { AttributeField } from './AttributeField';

export function AttributeForm({ attributes, category, values, onChange }) {
  const { groups, additional } = getAttributeLayout(attributes, category);
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
        Заполните основные сведения. Звёздочкой отмечены обязательные поля.
      </p>
      {groups.map((group) => (
        <fieldset key={group.id}>
          <legend>
            {group.title}
            <span>{group.attributes.length}</span>
          </legend>
          <p className="attribute-group-description">{group.description}</p>
          {group.attributes.map(renderField)}
        </fieldset>
      ))}
      {additional.length > 0 && (
        <details className="additional-attributes">
          <summary>
            Другие характеристики <span>{additional.length}</span>
          </summary>
          <p className="attribute-group-description">
            Необязательные сведения, если они важны для вашего товара.
          </p>
          {additional.map(renderField)}
        </details>
      )}
    </div>
  );
}

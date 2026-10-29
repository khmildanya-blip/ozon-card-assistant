import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getAttributeLayout } from './attribute-layout.js';

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../../data/attributes_17028715_96250.json', import.meta.url),
    'utf8',
  ),
).result;
const mainFields = (layout) => layout.groups.flatMap((group) => group.attributes);

test('flower pot form shows its useful properties and hides optional content integrations', () => {
  const layout = getAttributeLayout(fixture, {
    category_name: 'Дом и сад → Аксессуары для цветов → Горшок для цветов',
  });
  const ids = mainFields(layout).map((a) => a.id);
  for (const id of [6383, 7326, 6378, 10096, 8414, 21725])
    assert.ok(ids.includes(id), `Missing important field ${id}`);
  for (const id of [11254, 8789, 8790, 21841, 21845]) {
    assert.ok(layout.hidden.some((a) => a.id === id));
    assert.ok(!layout.additional.some((a) => a.id === id));
  }
  for (const required of fixture.filter((a) => a.is_required)) assert.ok(ids.includes(required.id));
  assert.deepEqual(
    layout.groups.map((g) => g.title),
    ['О товаре', 'Основные свойства', 'Размеры и вес', 'Комплектация', 'Требования Ozon'],
  );
});

test('required fields are never hidden, including unknown and technical attributes', () => {
  const attributes = [
    { id: 1, name: 'Обязательный документ PDF', is_required: true },
    { id: 2, name: 'Новый обязательный атрибут', is_required: true },
  ];
  const layout = getAttributeLayout(attributes, { category_name: 'Новая категория' });
  assert.equal(mainFields(layout).length, 2);
  assert.equal(layout.hidden.length, 0);
  assert.equal(layout.additional.length, 0);
});

test('importance depends on the product category and supports new Ozon aspects', () => {
  const fields = [
    { id: 1, name: 'Совместимость' },
    { id: 2, name: 'Гарантия' },
    { id: 3, name: 'Особенность нового типа', is_aspect: true },
    { id: 4, name: 'Редкая дополнительная характеристика' },
  ];
  assert.deepEqual(
    mainFields(getAttributeLayout(fields, { category_name: 'Электроника → Мышь' })).map(
      (a) => a.id,
    ),
    [1, 2, 3],
  );
  assert.deepEqual(
    mainFields(getAttributeLayout(fields, { category_name: 'Дом и сад → Горшок' })).map(
      (a) => a.id,
    ),
    [3],
  );
  assert.ok(getAttributeLayout(fields, {}).additional.some((a) => a.id === 4));
});

test('layout preserves the full schema, field references and input ordering', () => {
  const before = JSON.stringify(fixture);
  const layout = getAttributeLayout(fixture, { category_name: 'Горшок' });
  const all = [...mainFields(layout), ...layout.additional, ...layout.hidden];
  assert.equal(all.length, fixture.length);
  assert.equal(new Set(all.map((a) => a.id)).size, fixture.length);
  assert.ok(all.every((a) => fixture.includes(a)));
  assert.equal(JSON.stringify(fixture), before);
});

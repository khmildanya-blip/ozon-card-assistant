export const cardMeasurements = [
  ['card:width', 'Ширина, см'],
  ['card:height', 'Высота, см'],
  ['card:depth', 'Глубина, см'],
];

export function validMeasurement(value) {
  const text = String(value ?? '')
    .trim()
    .replace(',', '.');
  return /^\d+(?:\.\d+)?$/u.test(text) && Number.isFinite(Number(text)) && Number(text) > 0;
}

export function isBookCategory(category) {
  return /^книги(?:\s*→|\s*$)/iu.test(category?.category_name?.trim() || '');
}

export function printedBookCategories(categories, year) {
  const books = categories.filter(
    (category) => isBookCategory(category) && /→\s*печатная книга$/iu.test(category.category_name),
  );
  const edition = Number(year) >= 1942 && Number(year) <= 2010 ? /букинист/iu : /современн/iu;
  return [...books].sort(
    (a, b) => Number(edition.test(b.category_name)) - Number(edition.test(a.category_name)),
  );
}

export function cardAttributes(attributes, category) {
  if (!isBookCategory(category)) return attributes;
  return attributes.filter(({ name }) => !/^бренд(?:\s|$)/iu.test(name?.trim() || ''));
}

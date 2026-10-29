// This controls presentation only. Fields, values, types and requirements still come from Ozon.
const technical =
  /\bpdf\b|\bjson\b|\bhtml\b|rich[\s-]*контент|рич[\s-]*контент|видео|название файла|х[еэ]штег|объединить в похожие/iu;
const logistics =
  /вес с упаковкой|код продавца|заводских упаковок|минимальное количество оптом|в нескольких упаковках|количество товара в уеи|вид выпуска товара/iu;
const requirements =
  /маркировк|тн\s*вэд|сертификат|деклараци|лицензи|регистрационн.*удостоверени/iu;
const identity =
  /^(название|наименование|бренд|тип|модель)(\b|\s|$)|название модели|аннотация|описание товара/iu;
const dimensions = /размер|высот|ширин|длин|глубин|диаметр|объ[её]м|^вместимост|^вес|масса/iu;
const contents = /комплектаци|количество в упаковке|единиц в одном товаре|количество предметов/iu;
const basicProperties = /материал|цвет товара|^цвет$|назначение/iu;

const profiles = [
  {
    category: /цвет|горш|кашпо|растени/iu,
    properties: /форма|размещени|вид цветочного|дренаж|автополив|поддон|место эксплуатации/iu,
  },
  {
    category: /электрон|компьютер|телефон|бытовая техника/iu,
    properties:
      /мощност|напряжени|питани|аккумулятор|емкост.*батареи|[её]мкост.*аккумулятор|совместимост|интерфейс|подключени|разрешени|памят|процессор|частот|диагонал|гарантия/iu,
  },
  {
    category: /одежд|обув|текстил/iu,
    properties: /размер|пол$|сезон|состав|ткан|фасон|посадк|заст[её]жк|рисунок/iu,
  },
  {
    category: /продукт.*питани|продукты|напит|корм|бакале/iu,
    properties:
      /состав|срок годности|условия хранения|пищев|энергетическ|вкус|возраст|назначение/iu,
  },
  {
    category: /косметик|красот|парфюм|гигиен/iu,
    properties:
      /состав|тип кожи|тип волос|эффект|аромат|срок годности|возраст|область применения/iu,
  },
  {
    category: /дом|сад|мебель|посуда|хранени/iu,
    properties:
      /форм|размещени|назначени|способ установки|число отделений|количество отделений|место эксплуатации/iu,
  },
];

const sections = [
  {
    id: 'identity',
    title: 'О товаре',
    description: 'Как называется товар и к какому типу относится.',
  },
  {
    id: 'properties',
    title: 'Основные свойства',
    description: 'Особенности, которые помогают покупателю выбрать товар.',
  },
  { id: 'dimensions', title: 'Размеры и вес', description: 'Габариты, объём и вес товара.' },
  {
    id: 'contents',
    title: 'Комплектация',
    description: 'Что входит в комплект и сколько единиц в упаковке.',
  },
  {
    id: 'requirements',
    title: 'Требования Ozon',
    description: 'Обязательные сведения для выбранной категории.',
  },
];

function sectionFor(attribute) {
  const name = attribute.name || '';
  if (requirements.test(name)) return 'requirements';
  if (identity.test(name)) return 'identity';
  if (contents.test(name)) return 'contents';
  if (dimensions.test(name)) return 'dimensions';
  return 'properties';
}

export function getAttributeLayout(attributes, category) {
  const categoryName = category?.category_name || '';
  const activeProfiles = profiles.filter((profile) => profile.category.test(categoryName));
  const grouped = new Map(sections.map((section) => [section.id, []]));
  const additional = [];
  const hidden = [];
  for (const attribute of attributes) {
    const name = attribute.name || '';
    // Required metadata always wins, even for an unfamiliar or technical attribute.
    if (!attribute.is_required && technical.test(`${name} ${attribute.group_name || ''}`)) {
      hidden.push(attribute);
      continue;
    }
    const important =
      attribute.is_required ||
      (!logistics.test(name) &&
        (identity.test(name) ||
          dimensions.test(name) ||
          contents.test(name) ||
          basicProperties.test(name) ||
          attribute.is_aspect ||
          /^(основные|основные характеристики)$/iu.test(attribute.group_name || '') ||
          activeProfiles.some((profile) => profile.properties.test(name))));
    if (important) grouped.get(sectionFor(attribute)).push(attribute);
    else additional.push(attribute);
  }
  const requiredFirst = (a, b) => Number(Boolean(b.is_required)) - Number(Boolean(a.is_required));
  return {
    groups: sections
      .map((section) => ({ ...section, attributes: grouped.get(section.id).sort(requiredFirst) }))
      .filter((section) => section.attributes.length),
    additional,
    hidden,
  };
}

export function getAttributeLabel(attribute) {
  if (attribute.name === 'Аннотация') return 'Короткое описание';
  if (attribute.name === 'Тип') return 'Тип товара';
  if (/^Название модели \(/u.test(attribute.name || '')) return 'Название модели';
  return attribute.name;
}

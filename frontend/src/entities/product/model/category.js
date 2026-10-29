export function flattenCategories(nodes, parent = null, path = []) {
  return nodes.flatMap((node) => {
    if (node.disabled) return [];
    const names = [...path, node.category_name || node.type_name].filter(Boolean);
    if (node.type_id)
      return [
        {
          description_category_id: parent,
          type_id: node.type_id,
          category_name: names.join(' → '),
        },
      ];
    return flattenCategories(node.children || [], node.description_category_id || parent, names);
  });
}

export const attributeKey = (a) => `${a.attribute_complex_id || 0}:${a.id}`;
export const categoryPayload = (c) => ({
  description_category_id: c.description_category_id,
  type_id: c.type_id,
});

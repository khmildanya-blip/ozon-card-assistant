const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
export async function request(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(`${base}/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers:
        body instanceof FormData || body === undefined
          ? {}
          : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        'API вернул некорректный ответ. Проверьте адрес backend и перезапустите серверы разработки.',
      );
    }
    if (response.status === 404 || response.status === 405) {
      throw new Error(
        'Подключён backend без нужного метода API. Перезапустите FastAPI из текущего проекта и проверьте /api/health.',
      );
    }
    if (!response.ok || data.error)
      throw new Error(
        typeof (data.detail || data.error) === 'string'
          ? data.detail || data.error
          : `Ошибка API (${response.status}). Повторите запрос.`,
      );
    return data;
  } catch (error) {
    if (error.name === 'AbortError')
      throw new Error('Сервис не ответил за 3 минуты. Повторите запрос.');
    if (error instanceof TypeError)
      throw new Error(
        'Нет связи с backend. Запустите npm run dev из корня проекта или проверьте адрес API.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

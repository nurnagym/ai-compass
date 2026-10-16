export const aiErrorMessages = {
  AI_DISABLED: 'AI не настроен или выключен. Проверьте ключ и включение AI в настройках проекта.',
  AI_LIMITER_UNAVAILABLE:
    'Подключение AI настроено не полностью: недоступен ограничитель запросов.',
  AI_RATE_LIMITED: 'Слишком много запросов. Подождите минуту и попробуйте снова.',
  AI_AUTH_FAILED: 'OpenAI отклонил API-ключ. Проверьте действующий ключ в настройках проекта.',
  AI_ACCESS_DENIED: 'OpenAI запретил доступ. Проверьте разрешения ключа и проекта.',
  AI_MODEL_UNAVAILABLE:
    'Выбранная модель недоступна. Проверьте её название и доступ проекта к модели в OpenAI.',
  AI_QUOTA_EXCEEDED:
    'В проекте OpenAI закончился доступный баланс или достигнут лимит расходов. Проверьте оплату API.',
  AI_PROVIDER_RATE_LIMITED:
    'OpenAI временно ограничил частоту запросов. Подождите немного и попробуйте снова.',
  AI_REQUEST_REJECTED:
    'OpenAI отклонил параметры запроса. Нужно проверить совместимость настроек с выбранной моделью.',
  AI_TIMEOUT: 'OpenAI не успел ответить. Ваш ответ сохранён в этой вкладке; попробуйте ещё раз.',
  AI_RESPONSE_INCOMPLETE:
    'Модель не завершила ответ в пределах лимита. Нужно проверить настройки длины ответа.',
  AI_RESPONSE_INVALID: 'Ответ модели не подошёл для следующего шага. Попробуйте ещё раз.',
  AI_PROVIDER_UNAVAILABLE:
    'Не удалось связаться с OpenAI. Ваш ответ сохранён в этой вкладке; попробуйте позже.',
} as const

export type AIErrorCode = keyof typeof aiErrorMessages

// Display only our own messages. Provider messages may contain input or credentials.
export function apiErrorMessage(code: unknown, status: number): string {
  if (typeof code === 'string' && Object.hasOwn(aiErrorMessages, code))
    return aiErrorMessages[code as AIErrorCode]
  if (status === 429) return aiErrorMessages.AI_RATE_LIMITED
  if (status === 503) return 'AI сейчас недоступен. Попробуйте позже или начните демо.'
  return 'Не удалось получить следующий вопрос. Ваш ответ остался в этой вкладке.'
}

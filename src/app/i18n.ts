/**
 * UI strings. RU now; EN later goes into a second dictionary of the same `Messages` shape.
 * Components read strings via `t` — never hard-code user-visible text.
 */

const ru = {
  app: {
    name: 'SwagToVideo',
    tagline: 'Трек + текст → видео',
  },
  track: {
    title: 'Трек',
    dropTitle: 'Перетащите трек сюда',
    dropHint: 'MP3, WAV, FLAC, OGG, M4A — файл не покидает ваш компьютер',
    choose: 'Выбрать файл',
    replace: 'Заменить',
    dropActive: 'Отпустите, чтобы загрузить',
    rejected: (name: string) => `«${name}» не похож на аудиофайл`,
    duration: 'Длительность',
    size: 'Размер',
  },
  analysis: {
    idle: 'Нет трека',
    decoding: 'Декодирование…',
    analyzing: 'Анализ аудио…',
    ready: 'Готово к превью',
    error: 'Не удалось прочитать файл',
  },
  player: {
    play: 'Воспроизвести',
    pause: 'Пауза',
    seek: 'Позиция',
    volume: 'Громкость',
    mute: 'Без звука',
    unmute: 'Включить звук',
    shortcuts: 'Пробел — пуск/пауза, ← → — 5 секунд',
  },
  preview: {
    empty: 'Превью появится после загрузки трека',
    canvas: 'Превью видео',
  },
  sidebar: {
    label: 'Настройки',
    output: 'Формат',
    style: 'Стиль',
    accents: 'Акценты',
    soon: 'Появится на следующих вехах',
  },
  output: {
    aspect: 'Соотношение сторон',
    aspects: {
      '9:16': 'Вертикальное — Reels, Shorts, TikTok',
      '16:9': 'Горизонтальное — YouTube',
      '1:1': 'Квадрат',
      '4:5': 'Портрет — лента Instagram',
    },
    resolution: 'Разрешение',
    fps: 'Кадров в секунду',
    container: 'Контейнер',
    summary: 'Итог',
    frames: (count: number) => `${count.toLocaleString('ru-RU')} кадров`,
  },
  export: {
    title: 'Экспорт',
    start: 'Экспортировать видео',
    cancel: 'Отменить',
    running: (percent: number) => `Рендер… ${percent}%`,
    done: 'Готово',
    doneSaved: 'Файл сохранён в загрузки браузера',
    cancelled: 'Экспорт отменён',
    error: 'Ошибка экспорта',
    needTrack: 'Сначала загрузите трек',
    again: 'Ещё раз',
  },
  compat: {
    title: 'Браузер поддерживает не всё',
    webCodecs: 'Нет WebCodecs — экспорт видео не заработает. Нужен Chrome или Edge.',
    webGpu: 'Нет WebGPU — распознавание текста будет медленнее (через WASM).',
    isolation: 'Нет cross-origin isolation — многопоточный WASM недоступен, ML будет медленнее.',
    dismiss: 'Скрыть',
  },
}

export type Messages = typeof ru

export const t: Messages = ru

# Model scripts

Owned by the "ML-модели и Hugging Face" session — see `docs/sessions/ml-models.md`.
Scripts here are run locally by the repo owner; tokens come only from `.env` (see `.env.example`).

## publish_models.py — зеркалирование моделей на наш Hugging Face

Скрипт берёт файлы, перечисленные в [`sources.json`](sources.json), из исходных репозиториев
(`onnx-community/...`, закреплённых по хэшу коммита), проверяет их SHA-256 против LFS-метаданных HF,
заливает в наши репозитории (`DarumOrt/...`) и пишет `models.json` в корень проекта:
для каждого файла — размер, SHA-256 и URL, закреплённый на хэше коммита (`revision`).

Неизменённые файлы повторно не заливаются. Файлы в целевом репозитории, которых нет в `sources.json`,
удаляются (кроме `README.md` и `.gitattributes`). `README.md` (карточка модели с лицензией и источником)
перезаписывается.

### Один раз: окружение

Нужен Python 3.10+. Зависимости ставятся в локальное окружение `.venv` (оно в `.gitignore`),
не глобально:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r scripts/models/requirements.txt
```

### Один раз: токен

1. https://huggingface.co/settings/tokens → **Create new token** → **Fine-grained**.
2. Права: _Repositories → Write_ только на `DarumOrt/whisper-small-timestamped-onnx`,
   `DarumOrt/htdemucs-onnx`, `DarumOrt/aligner-onnx`.
3. Скопируйте `.env.example` в `.env` и впишите `HF_TOKEN=hf_...`. `.env` не коммитится.

### Запуск

```powershell
# Проверка без заливки: скачать, сверить хэши (~1,3 ГБ в scripts/models/.cache/)
.venv\Scripts\python scripts/models/publish_models.py --dry-run

# Заливка и генерация models.json
.venv\Scripts\python scripts/models/publish_models.py

# Только одна модель
.venv\Scripts\python scripts/models/publish_models.py --only whisper-small-timestamped
```

После заливки появится/обновится `models.json` — его нужно закоммитить (это делает главная сессия).
Кэш скачанных файлов `scripts/models/.cache/` можно удалить.

### Как добавить или сменить модель/файлы

Отредактируйте `sources.json` (`files` — пути внутри исходного репозитория, `sourceRevision` —
полный хэш коммита источника) и запустите скрипт снова.

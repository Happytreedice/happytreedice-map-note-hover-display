const MODULE_NAME = "map-note-hover-display";

// Используем деструктуризацию для доступа к API v2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class MapNoteHoverDisplay extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor() {
    super();
    this.currentNote = null;
    this.hoverTimeout = null;
    this.content = { title: "", body: "" };
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    id: "map-note-hover-display",
    classes: ["map-note-hover-display"],
    // Отключаем стандартную рамку окна, так как это тултип
    window: {
      frame: false,
      title: "Map Note Hover",
      controls: []
    },
    position: {
      width: "auto",
      height: "auto"
    }
  };

  /** @override */
  static PARTS = {
    content: {
      template: "modules/map-note-hover-display/template.html", // Убедитесь, что путь совпадает с вашей структурой папок
    },
  };

  /** @override */
  async _prepareContext(_options) {
    // Передаем данные в шаблон
    return {
      title: this.content.title,
      body: this.content.body,
      classes: "" // Можно добавить дополнительные классы если нужно
    };
  }

  /**
   * Показывает тултип для заметки
   * @param {Note} note 
   */
  async show(note) {
    if (!note?.document?.entryId) return;
    this.currentNote = note;

    try {
      const entry = await fromUuid(note.document.entry.uuid);

      if (!entry) {
        this.setContent(note.document.label || "Unknown", "<em>No content available</em>");
      } else {
        // Получаем содержимое журнала (совместимо с v10+)
        const page = entry.pages.contents[0];
        let bodyContent = "";

        if (page) {
          if (page.type === "text") {
            bodyContent = await TextEditor.enrichHTML(page.text.content, {
              async: true,
              secrets: entry.isOwner,
              relativeTo: entry
            });
          } else if (page.type === "image") {
            bodyContent = `<img src="${page.src}" title="${page.image.caption || ''}"/>`;
          } else {
            bodyContent = "<em>Page type not supported for preview</em>";
          }
        } else {
          bodyContent = "<em>No pages in this journal</em>";
        }

        this.setContent(entry.name, bodyContent);
      }

      // Рендерим приложение
      await this.render({ force: true });

      // Позиционируем после рендера (чтобы знать размеры)
      this.updatePosition();

    } catch (error) {
      console.error("MapNoteHoverDisplay | Error loading journal entry:", error);
      this.setContent("Error", "Error loading content");
      this.render({ force: true });
    }
  }

  setContent(title, body) {
    this.content = { title, body };
  }

  hide() {
    this.currentNote = null;
    this.close();
  }

  delayedHide() {
    this.hoverTimeout = setTimeout(() => {
      this.hide();
    }, 100);
  }

  clearDelayedHide() {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
  }

  updatePosition() {
    if (!this.currentNote || !this.element) return;

    const note = this.currentNote;
    // Получаем глобальные координаты заметки на экране
    // worldTransform трансформирует координаты канваса в координаты экрана (viewport)
    const t = note.worldTransform;
    const noteX = t.tx;
    const noteY = t.ty;

    // Размеры элемента
    const elWidth = this.element.offsetWidth || 300;
    const elHeight = this.element.offsetHeight || 200;

    // Отступы
    const offset = 20;
    let left = noteX + offset;
    let top = noteY + offset;

    // Проверка границ экрана
    if (left + elWidth > window.innerWidth) {
      left = noteX - elWidth - offset;
    }
    if (top + elHeight > window.innerHeight) {
      top = noteY - elHeight - offset;
    }

    // Установка позиции
    // ApplicationV2 использует this.setPosition, но для hover-элементов без рамки
    // надежнее и плавнее менять стиль напрямую, чтобы не триггерить полный пересчет окна
    this.element.style.left = `${Math.max(10, left)}px`;
    this.element.style.top = `${Math.max(10, top)}px`;

    // Применяем настройки ширины
    const maxWidth = game.settings.get(MODULE_NAME, "maxWidth");
    this.element.style.maxWidth = `${maxWidth}px`;

    // Применяем настройки шрифта
    const fontSize = game.settings.get(MODULE_NAME, "fontSize");
    this.element.style.fontSize = fontSize;
  }
}

function registerSettings() {
  game.settings.register(MODULE_NAME, "enabled", {
    name: "Enable Hover Display", // Исправлено для корректного отображения
    hint: "Show journal contents when hovering over map notes.",
    scope: "client",
    type: Boolean,
    default: true,
    config: true,
  });

  game.settings.register(MODULE_NAME, "fontSize", {
    name: "Text Size",
    hint: "CSS font size value (e.g. 14px, 1rem).",
    scope: "client",
    type: String,
    default: "14px",
    config: true,
  });

  game.settings.register(MODULE_NAME, "maxWidth", {
    name: "Maximum Width (px)",
    hint: "Maximum width of the popup window.",
    scope: "client",
    type: Number,
    default: 400,
    config: true,
  });

  game.settings.register(MODULE_NAME, "delay", {
    name: "Hover Delay (ms)",
    hint: "Time in milliseconds before the popup appears.",
    scope: "client",
    type: Number,
    default: 300,
    range: { min: 0, max: 2000, step: 100 },
    config: true,
  });
}

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  canvas.hud.mapNoteHoverDisplay = new MapNoteHoverDisplay();
});

Hooks.on("hoverNote", (note, hovered) => {
  if (!game.settings.get(MODULE_NAME, "enabled")) return;

  const display = canvas.hud.mapNoteHoverDisplay;
  if (!display) return;

  if (hovered) {
    display.clearDelayedHide();
    setTimeout(() => {
      // Проверяем, что мышь все еще над объектом (state 1 = HOVER)
      if (note.hover) {
        display.show(note);
      }
    }, game.settings.get(MODULE_NAME, "delay"));
  } else {
    display.delayedHide();
  }
});

// Обновление позиции при зуме/панорамировании
Hooks.on("canvasPan", () => {
  const display = canvas.hud.mapNoteHoverDisplay;
  if (display && display.rendered) {
    display.updatePosition();
  }
});
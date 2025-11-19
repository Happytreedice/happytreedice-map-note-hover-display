const MODULE_NAME = "map-note-hover-display"
const ELEMENT_ID = "map-note-hover-display"

class MapNoteHoverDisplay {
  constructor() {
    this.note = null;
    this.element = null;
    this.timeout = null;
  }

  createElement() {
    if (this.element) return;
    
    this.element = document.createElement('div');
    this.element.id = ELEMENT_ID;
    this.element.className = 'map-note-hover-display';
    
    // Применяем базовые стили
    this.applyStyles();
    
    document.body.appendChild(this.element);
  }

  applyStyles() {
    const fontSize = game.settings.get(MODULE_NAME, "fontSize") || "14px";
    const darkMode = game.settings.get(MODULE_NAME, "darkMode");
    const maxWidth = game.settings.get(MODULE_NAME, "maxWidth") || 400;

    this.element.style.cssText = `
      position: fixed;
      z-index: 1000;
      background: ${darkMode ? 'rgba(0, 0, 0, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
      border: 2px solid ${darkMode ? '#7a7971' : '#c9c7b8'};
      border-radius: 5px;
      padding: 15px;
      max-width: ${maxWidth}px;
      max-height: 500px;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      pointer-events: none;
      font-family: "Signika", sans-serif;
      font-size: ${fontSize};
      color: ${darkMode ? '#f0f0e0' : '#191813'};
      line-height: 1.4;
      display: none;
      backdrop-filter: blur(5px);
    `;
  }

  async show(note) {
    if (!note?.entry) return;
    
    this.note = note;
    this.createElement();
    
    try {
      const entry = note.entry;
      
      // Получаем содержимое журнала - правильный способ
      let content = await this.getJournalContent(entry);
      
      if (!content) {
        this.element.innerHTML = `
          <div class="hover-display-title" style="
            font-weight: bold;
            font-size: 1.2em;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 1px solid ${game.settings.get(MODULE_NAME, "darkMode") ? '#7a7971' : '#c9c7b8'};
            color: ${game.settings.get(MODULE_NAME, "darkMode") ? '#ffd700' : '#825000'};
          ">${entry.name}</div>
          <div class="hover-display-content"><em>No content available</em></div>
        `;
      } else {
        // Обрабатываем HTML
        const enrichedContent = await TextEditor.enrichHTML(content, {
          async: true,
          secrets: entry.isOwner,
          relativeTo: entry
        });
        
        // Создаем HTML содержимое
        this.element.innerHTML = `
          <div class="hover-display-title" style="
            font-weight: bold;
            font-size: 1.2em;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 1px solid ${game.settings.get(MODULE_NAME, "darkMode") ? '#7a7971' : '#c9c7b8'};
            color: ${game.settings.get(MODULE_NAME, "darkMode") ? '#ffd700' : '#825000'};
          ">${entry.name}</div>
          <div class="hover-display-content">${enrichedContent}</div>
        `;
      }
      
      // Показываем и позиционируем
      this.positionElement();
      this.element.style.display = 'block';
      
    } catch (error) {
      console.error("MapNoteHoverDisplay | Error loading journal entry:", error);
      this.showError("Error loading content");
    }
  }

  async getJournalContent(entry) {
    try {
      // Для Foundry VTT version 10 и выше
      if (game.release?.generation >= 10) {
        // Если запись уже загружена, используем ее
        if (entry.pages && entry.pages.size > 0) {
          const firstPage = Array.from(entry.pages.values())[0];
          return firstPage.text?.content || firstPage.text?.markdown || "";
        }
        
        // Если нет, пытаемся получить содержимое через sheets
        const sheet = entry.sheet;
        if (sheet && sheet._getSheetData) {
          const data = await sheet._getSheetData();
          if (data.pages && data.pages.length > 0) {
            return data.pages[0].text?.content || data.pages[0].text?.markdown || "";
          }
        }
      } 
      // Для Foundry VTT version 9 и ниже
      else {
        // Пытаемся получить содержимое через данные записи
        if (entry.data.pages && entry.data.pages.length > 0) {
          const firstPage = entry.data.pages[0];
          return firstPage.text?.content || firstPage.text?.markdown || firstPage.text || "";
        }
        
        // Альтернативный метод - используем sheet для получения данных
        if (entry.sheet) {
          const content = entry.sheet.element?.find('.journal-page-content')?.html();
          if (content) return content;
        }
      }
      
      // Если ничего не сработало, возвращаем пустую строку
      return "";
      
    } catch (error) {
      console.error("MapNoteHoverDisplay | Error getting journal content:", error);
      return "";
    }
  }

  showError(message) {
    this.element.innerHTML = `
      <div class="hover-display-title" style="
        font-weight: bold;
        font-size: 1.2em;
        margin-bottom: 10px;
        padding-bottom: 5px;
        border-bottom: 1px solid #ff4444;
        color: #ff4444;
      ">Error</div>
      <div class="hover-display-content">${message}</div>
    `;
    this.positionElement();
    this.element.style.display = 'block';
  }

  positionElement() {
    if (!this.note || !this.element) return;
    
    try {
      // Получаем позицию заметки на экране
      const position = this.note.getGlobalPosition();
      const iconWidth = this.note.icon?.width || 40;
      const iconHeight = this.note.icon?.height || 40;
      
      const mouseX = position.x;
      const mouseY = position.y;
      
      // Временно показываем элемент для вычисления размеров
      const wasVisible = this.element.style.display !== 'none';
      if (!wasVisible) {
        this.element.style.display = 'block';
        this.element.style.visibility = 'hidden';
      }
      
      const elementWidth = this.element.offsetWidth;
      const elementHeight = this.element.offsetHeight;
      
      if (!wasVisible) {
        this.element.style.display = 'none';
        this.element.style.visibility = 'visible';
      }
      
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // Определяем позицию (справа или слева от курсора)
      let left = mouseX + 20;
      let top = mouseY + 20;
      
      // Проверяем, чтобы не выходить за границы экрана
      if (left + elementWidth > windowWidth) {
        left = mouseX - elementWidth - 20;
      }
      
      if (top + elementHeight > windowHeight) {
        top = mouseY - elementHeight - 20;
      }
      
      // Убеждаемся, что элемент не выходит за верхнюю/левую границу
      left = Math.max(10, left);
      top = Math.max(10, top);
      
      this.element.style.left = left + 'px';
      this.element.style.top = top + 'px';
      
    } catch (error) {
      console.error("MapNoteHoverDisplay | Error positioning element:", error);
    }
  }

  hide() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    
    if (this.element) {
      this.element.style.display = 'none';
      this.element.innerHTML = '';
    }
    
    this.note = null;
  }

  delayedHide() {
    // Небольшая задержка перед скрытием для плавности
    this.timeout = setTimeout(() => {
      this.hide();
    }, 100);
  }

  clearDelayedHide() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

function registerSettings() {
  game.settings.register(MODULE_NAME, "enabled", {
    name: "Show map note hover display",
    hint: "Display the journal entry for a map note when it's hovered",
    scope: "client",
    type: Boolean,
    default: true,
    config: true,
  });
  
  game.settings.register(MODULE_NAME, "darkMode", {
    name: "Dark Mode",
    hint: "Show with light text on a dark background",
    scope: "client",
    type: Boolean,
    default: true,
    config: true,
  });
  
  game.settings.register(MODULE_NAME, "fontSize", {
    name: "Text size",
    hint: "Text size for the display (e.g., 14px, 1.2rem)",
    scope: "client",
    type: String,
    default: "14px",
    config: true,
  });
  
  game.settings.register(MODULE_NAME, "maxWidth", {
    name: "Maximum Width",
    hint: "The maximum width the entry display can grow to before it'll force wrapping.",
    scope: "client",
    type: Number,
    default: 400,
    config: true,
  });
  
  game.settings.register(MODULE_NAME, "delay", {
    name: "Display Delay",
    hint: "Delay before showing the display (milliseconds)",
    scope: "client",
    type: Number,
    default: 300,
    range: {
      min: 0,
      max: 2000,
      step: 100
    },
    config: true,
  });
}

Hooks.on("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  // Инициализируем дисплей
  if (!canvas.hud.mapNoteHoverDisplay) {
    canvas.hud.mapNoteHoverDisplay = new MapNoteHoverDisplay();
  }
});

Hooks.on("hoverNote", (note, hovered) => {
  if (!game.settings.get(MODULE_NAME, "enabled")) return;
  
  const display = canvas.hud.mapNoteHoverDisplay;
  if (!display) return;
  
  if (hovered) {
    display.clearDelayedHide();
    
    // Задержка перед показом
    setTimeout(() => {
      if (note.mouseInteractionManager?.state === 1) { // HOVERED state
        display.show(note);
      }
    }, game.settings.get(MODULE_NAME, "delay"));
    
  } else {
    display.delayedHide();
  }
});

// Дополнительный обработчик для движения мыши
Hooks.on("refreshNote", (note) => {
  const display = canvas.hud.mapNoteHoverDisplay;
  if (!display || !display.element || display.element.style.display === 'none') return;
  
  if (display.note === note && note.mouseInteractionManager?.state === 1) {
    display.positionElement();
  }
});

// Очистка при изменении сцены
Hooks.on("canvasPan", () => {
  const display = canvas.hud.mapNoteHoverDisplay;
  if (display) {
    display.hide();
  }
});

// Очистка при закрытии приложения
Hooks.on("closeApplication", () => {
  const display = canvas.hud.mapNoteHoverDisplay;
  if (display) {
    display.hide();
  }
});
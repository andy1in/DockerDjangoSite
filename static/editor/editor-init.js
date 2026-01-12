document.addEventListener("DOMContentLoaded", async () => {
  const [
    { Editor },
    { default: StarterKit },
    { default: Image },
    { default: Link },
    { default: Placeholder },
    { Node }
  ] = await Promise.all([
    import("https://esm.sh/@tiptap/core"),
    import("https://esm.sh/@tiptap/starter-kit"),
    import("https://esm.sh/@tiptap/extension-image"),
    import("https://esm.sh/@tiptap/extension-link"),
    import("https://esm.sh/@tiptap/extension-placeholder"),
    import("https://esm.sh/@tiptap/core")
  ]);

  // Кастомное расширение для видео
  const Video = Node.create({
    name: "video",
    group: "block",
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        src: { default: null },
        controls: { default: true },
        preload: { default: 'metadata' },
        playsinline: { default: true },
        crossorigin: { default: 'anonymous' },
        style: { default: "max-width:100%; border-radius: 4px;" },
      };
    },
    parseHTML() {
      return [{ tag: "video" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["video", {
        ...HTMLAttributes,
        controls: true,
        preload: 'metadata',
        playsinline: true,
        crossorigin: 'anonymous'
      }];
    },
    addCommands() {
      return {
        setVideo: (options) => ({ commands }) => {
          return commands.insertContent({ 
            type: this.name, 
            attrs: {
              ...options,
              preload: 'metadata',
              playsinline: true,
              crossorigin: 'anonymous'
            }
          });
        },
      };
    },
  });

  // Получение CSRF токена
  function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== "") {
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith(name + "=")) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }

  /**
   * Получает presigned URL для прямой загрузки на S3
   */
  async function getPresignedUrl(filename, contentType, fileSize) {
    const response = await fetch('/get-presigned-url/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken')
      },
      body: JSON.stringify({
        filename: filename,
        content_type: contentType,
        file_size: fileSize
      })
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Ошибка получения URL для загрузки');
    }

    return data;
  }

  /**
   * Загружает файл напрямую на S3 через presigned URL
   * Минует Django сервер, nginx и Cloudflare лимиты
   */
  async function uploadDirectToS3(file, onProgress) {
    // 1. Получаем presigned URL от Django
    onProgress(0, 'preparing');
    
    const { upload_url, file_url } = await getPresignedUrl(
      file.name, 
      file.type, 
      file.size
    );

    // 2. Загружаем файл напрямую на S3
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent, 'uploading');
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100, 'complete');
          resolve({ success: true, url: file_url });
        } else {
          reject(new Error(`Ошибка загрузки на S3: ${xhr.status} ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Ошибка сети при загрузке на S3'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Загрузка отменена'));
      });

      // Отправляем PUT запрос напрямую на S3
      xhr.open('PUT', upload_url);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  }

  // Создание кнопки toolbar
  function createButton(icon, tooltip, command, name) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = tooltip || name;
    button.innerHTML = `<img src="${icon}" alt="${name}" style="width:18px;height:18px;">`;
    button.dataset.command = name;
    button.addEventListener("click", command);
    return button;
  }

  // Инициализация каждого редактора
  document.querySelectorAll("textarea.editor").forEach((textarea, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "tiptap-editor";
    wrapper.dataset.editorId = index;

    const toolbarWrapper = document.createElement("div");
    toolbarWrapper.className = "tiptap-toolbar-wrapper";

    const toolbar = document.createElement("div");
    toolbar.className = "tiptap-toolbar";

    textarea.parentNode.insertBefore(toolbarWrapper, textarea);
    toolbarWrapper.appendChild(toolbar);
    textarea.parentNode.insertBefore(wrapper, textarea);
    textarea.style.display = "none";

    const editor = new Editor({
      element: wrapper,
      content: textarea.value || "",
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3, 4, 5] }
        }),
        Image.configure({ inline: false, allowBase64: true }),
        Video,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' }
        }),
        Placeholder.configure({
          placeholder: "Начните писать или перетащите изображение/видео..."
        })
      ],
      onUpdate({ editor }) {
        textarea.value = editor.getHTML();
        updateActiveButtons();
      },
      onSelectionUpdate() {
        updateActiveButtons();
      }
    });

    // Кнопки toolbar
    const buttons = [
      { icon: "/static/editor/icons/bold.svg", tooltip: "Жирный (Ctrl+B)", command: () => editor.chain().focus().toggleBold().run(), name: "bold" },
      { icon: "/static/editor/icons/italic.svg", tooltip: "Курсив (Ctrl+I)", command: () => editor.chain().focus().toggleItalic().run(), name: "italic" },
      { type: "separator" },
      { icon: "/static/editor/icons/h2.svg", tooltip: "Заголовок 2", command: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), name: "h2" },
      { icon: "/static/editor/icons/h3.svg", tooltip: "Заголовок 3", command: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), name: "h3" },
      { icon: "/static/editor/icons/h4.svg", tooltip: "Заголовок 4", command: () => editor.chain().focus().toggleHeading({ level: 4 }).run(), name: "h4" },
      { icon: "/static/editor/icons/h5.svg", tooltip: "Заголовок 5", command: () => editor.chain().focus().toggleHeading({ level: 5 }).run(), name: "h5" },
      { type: "separator" },
      { icon: "/static/editor/icons/ul.svg", tooltip: "Маркированный список", command: () => editor.chain().focus().toggleBulletList().run(), name: "ul" },
      { icon: "/static/editor/icons/ol.svg", tooltip: "Нумерованный список", command: () => editor.chain().focus().toggleOrderedList().run(), name: "ol" },
      { type: "separator" },
      { icon: "/static/editor/icons/link.svg", tooltip: "Вставить ссылку", command: () => {
          const url = prompt("Введите URL:");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }, name: "link"
      },
      { icon: "/static/editor/icons/image.svg", tooltip: "Вставить изображение", command: () => {
          const url = prompt("Вставьте URL изображения:");
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }, name: "img" 
      },
      { icon: "/static/editor/icons/video.svg", tooltip: "Вставить видео", command: () => {
          const url = prompt("Вставьте URL видео (mp4/webm):");
          if (url) editor.commands.setVideo({ src: url });
        }, name: "vid"
      },
      { type: "separator" },
      { icon: "/static/editor/icons/undo.svg", tooltip: "Отменить (Ctrl+Z)", command: () => editor.chain().focus().undo().run(), name: "undo" },
      { icon: "/static/editor/icons/redo.svg", tooltip: "Повторить (Ctrl+Shift+Z)", command: () => editor.chain().focus().redo().run(), name: "redo" },
      { type: "separator" },
      { icon: "/static/editor/icons/fullscreen.svg", tooltip: "Полноэкранный режим", command: () => toggleFullscreen(), name: "fullscreen" }
    ];

    buttons.forEach(btn => {
      if (btn.type === "separator") {
        const separator = document.createElement("div");
        separator.className = "tiptap-toolbar-separator";
        toolbar.appendChild(separator);
      } else {
        toolbar.appendChild(createButton(btn.icon, btn.tooltip, btn.command, btn.name));
      }
    });

    function toggleFullscreen() {
      const isFullscreen = wrapper.classList.toggle("fullscreen");
      toolbar.classList.toggle("fullscreen", isFullscreen);
      
      if (isFullscreen) {
        document.documentElement.classList.add("editor-fullscreen");
        document.body.classList.add("editor-fullscreen");
        wrapper.insertBefore(toolbarWrapper, wrapper.firstChild);
      } else {
        document.documentElement.classList.remove("editor-fullscreen");
        document.body.classList.remove("editor-fullscreen");
        textarea.parentNode.insertBefore(toolbarWrapper, wrapper);
      }
    }

    function updateActiveButtons() {
      toolbar.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
      
      const activeMap = {
        'bold': () => editor.isActive('bold'),
        'italic': () => editor.isActive('italic'),
        'h2': () => editor.isActive('heading', { level: 2 }),
        'h3': () => editor.isActive('heading', { level: 3 }),
        'h4': () => editor.isActive('heading', { level: 4 }),
        'h5': () => editor.isActive('heading', { level: 5 }),
        'ul': () => editor.isActive('bulletList'),
        'ol': () => editor.isActive('orderedList'),
        'link': () => editor.isActive('link')
      };

      Object.entries(activeMap).forEach(([cmd, checkFn]) => {
        if (checkFn()) {
          toolbar.querySelector(`[data-command="${cmd}"]`)?.classList.add('active');
        }
      });

      const undoBtn = toolbar.querySelector('[data-command="undo"]');
      const redoBtn = toolbar.querySelector('[data-command="redo"]');
      if (undoBtn) undoBtn.disabled = !editor.can().undo();
      if (redoBtn) redoBtn.disabled = !editor.can().redo();
    }

    /**
     * Модальное окно с прогресс-баром для прямой загрузки на S3
     */
    function createProgressModal(fileName, fileSize) {
      const overlay = document.createElement("div");
      overlay.className = "upload-modal-overlay";
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
        animation: fadeIn 0.2s ease;
      `;

      const modal = document.createElement("div");
      modal.className = "upload-modal";
      modal.style.cssText = `
        background: var(--color-base-900, #1a1a2e);
        border: 1px solid var(--color-base-600, #404040);
        border-radius: 12px;
        padding: 30px;
        min-width: 400px;
        max-width: 500px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        animation: slideIn 0.3s ease;
      `;

      const title = document.createElement("div");
      title.textContent = "Загрузка на S3";
      title.style.cssText = `
        color: var(--color-font-important-dark, #fff);
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 20px;
      `;

      const fileNameEl = document.createElement("div");
      fileNameEl.textContent = fileName;
      fileNameEl.style.cssText = `
        color: var(--color-font-default-dark, #ccc);
        margin-bottom: 5px;
        font-size: 14px;
        word-break: break-all;
      `;

      // Размер файла
      const fileSizeEl = document.createElement("div");
      const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
      fileSizeEl.textContent = `Размер: ${sizeMB} MB`;
      fileSizeEl.style.cssText = `
        color: var(--color-font-subtle-dark, #888);
        margin-bottom: 15px;
        font-size: 12px;
      `;

      // Прогресс-бар
      const progressBarBg = document.createElement("div");
      progressBarBg.style.cssText = `
        width: 100%;
        height: 12px;
        background: var(--color-base-700, #333);
        border-radius: 6px;
        overflow: hidden;
        margin-bottom: 12px;
      `;

      const progressBarFill = document.createElement("div");
      progressBarFill.style.cssText = `
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #4f46e5, #6366f1);
        border-radius: 6px;
        transition: width 0.15s ease;
      `;
      progressBarBg.appendChild(progressBarFill);

      // Статус
      const statusContainer = document.createElement("div");
      statusContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      `;

      const statusText = document.createElement("div");
      statusText.textContent = "Подготовка...";
      statusText.style.cssText = `
        color: var(--color-font-subtle-dark, #888);
        font-size: 12px;
      `;

      const percentText = document.createElement("div");
      percentText.textContent = "0%";
      percentText.style.cssText = `
        color: var(--color-font-subtle-dark, #888);
        font-size: 14px;
        font-weight: 600;
      `;

      statusContainer.appendChild(statusText);
      statusContainer.appendChild(percentText);

      // Предупреждение
      const warningEl = document.createElement("div");
      warningEl.style.cssText = `
        padding: 12px 15px;
        background: rgba(234, 179, 8, 0.1);
        border: 1px solid rgba(234, 179, 8, 0.3);
        border-radius: 8px;
        display: flex;
        align-items: flex-start;
        gap: 10px;
      `;
      
      const warningIcon = document.createElement("div");
      warningIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      warningIcon.style.cssText = `flex-shrink: 0; margin-top: 2px;`;
      
      const warningText = document.createElement("div");
      warningText.innerHTML = `
        <div style="color: #eab308; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Не закрывайте это окно!</div>
        <div style="color: #a3a3a3; font-size: 12px; line-height: 1.4;">Загрузка может занять до 5 минут в зависимости от размера файла и скорости соединения.</div>
      `;
      
      warningEl.appendChild(warningIcon);
      warningEl.appendChild(warningText);

      modal.appendChild(title);
      modal.appendChild(fileNameEl);
      modal.appendChild(fileSizeEl);
      modal.appendChild(progressBarBg);
      modal.appendChild(statusContainer);
      modal.appendChild(warningEl);
      overlay.appendChild(modal);

      // Стили анимации
      if (!document.getElementById('upload-modal-styles')) {
        const style = document.createElement("style");
        style.id = 'upload-modal-styles';
        style.textContent = `
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideIn {
            from { opacity: 0; transform: translateY(-20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `;
        document.head.appendChild(style);
      }

      return {
        element: overlay,
        updateProgress: (percent, stage) => {
          progressBarFill.style.width = `${percent}%`;
          percentText.textContent = `${percent}%`;

          switch (stage) {
            case 'preparing':
              statusText.textContent = 'Подготовка...';
              progressBarFill.style.background = 'linear-gradient(90deg, #4f46e5, #6366f1)';
              break;
            case 'uploading':
              statusText.textContent = 'Загрузка на S3...';
              progressBarFill.style.background = 'linear-gradient(90deg, #4f46e5, #6366f1)';
              break;
            case 'complete':
              statusText.textContent = 'Загрузка завершена!';
              progressBarFill.style.background = '#22c55e';
              break;
          }
        },
        remove: () => {
          overlay.style.animation = "fadeIn 0.2s ease reverse";
          setTimeout(() => overlay.remove(), 200);
        }
      };
    }

    // Drag & Drop
    let dragCounter = 0;

    wrapper.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) wrapper.classList.add("drag-over");
    });

    wrapper.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) wrapper.classList.remove("drag-over");
    });

    wrapper.addEventListener("dragover", (e) => e.preventDefault());

    wrapper.addEventListener("drop", async (e) => {
      e.preventDefault();
      dragCounter = 0;
      wrapper.classList.remove("drag-over");

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      for (const file of files) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
          alert(`Файл ${file.name} не поддерживается. Загружайте только изображения и видео.`);
          continue;
        }

        const progressModal = createProgressModal(file.name, file.size);
        document.body.appendChild(progressModal.element);

        try {
          const data = await uploadDirectToS3(file, (percent, stage) => {
            progressModal.updateProgress(percent, stage);
          });

          await new Promise(resolve => setTimeout(resolve, 500));
          progressModal.remove();

          if (data.success) {
            if (file.type.startsWith("image/")) {
              editor.chain().focus().setImage({ src: data.url }).run();
            } else {
              editor.commands.setVideo({ src: data.url });
            }
          } else {
            alert(`Ошибка загрузки: ${data.error || "неизвестная ошибка"}`);
          }
        } catch (error) {
          progressModal.remove();
          alert(`Ошибка загрузки файла ${file.name}: ${error.message}`);
        }
      }
    });

    // Esc для выхода из fullscreen
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && wrapper.classList.contains("fullscreen")) {
        wrapper.classList.remove("fullscreen");
        toolbar.classList.remove("fullscreen");
        document.documentElement.classList.remove("editor-fullscreen");
        document.body.classList.remove("editor-fullscreen");
        textarea.parentNode.insertBefore(toolbarWrapper, wrapper);
      }
    });

    // Ctrl+S
    wrapper.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        console.log("Автосохранение...");
      }
    });

    updateActiveButtons();
    textarea.tiptapEditor = editor;
  });
});
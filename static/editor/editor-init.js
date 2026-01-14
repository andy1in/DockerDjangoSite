document.addEventListener("DOMContentLoaded", async () => {
  const [
    { Editor },
    { default: StarterKit },
    { default: Image },
    { default: Link },
    { default: Placeholder },
    { default: Youtube },
    { Node }
  ] = await Promise.all([
    import("https://esm.sh/@tiptap/core"),
    import("https://esm.sh/@tiptap/starter-kit"),
    import("https://esm.sh/@tiptap/extension-image"),
    import("https://esm.sh/@tiptap/extension-link"),
    import("https://esm.sh/@tiptap/extension-placeholder"),
    import("https://esm.sh/@tiptap/extension-youtube"),
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
        style: { default: "max-width:100%; border-radius: 8px;" },
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
        playsinline: true
      }];
    },
    addCommands() {
      return {
        setVideo: (options) => ({ commands }) => {
          return commands.insertContent({ 
            type: this.name, 
            attrs: options
          });
        },
      };
    },
  });

  // CSRF токен
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
   * Получает presigned URL для загрузки через nginx прокси (с retry)
   */
  async function getPresignedUrl(filename, contentType, fileSize, retryCount = 0) {
    const MAX_RETRIES = 2;
    
    try {
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
    } catch (error) {
      // Retry для Safari
      if (retryCount < MAX_RETRIES) {
        console.log(`getPresignedUrl failed, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, 500)); // Пауза 500ms
        return getPresignedUrl(filename, contentType, fileSize, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Загружает файл на S3 через nginx прокси с retry для Safari
   */
  async function uploadToS3ViaProxy(file, onProgress, abortController, retryCount = 0) {
    const MAX_RETRIES = 2;
    
    onProgress(0, 'preparing');
    
    const { upload_url, file_url, key } = await getPresignedUrl(
      file.name, 
      file.type, 
      file.size
    );

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Сохраняем xhr для возможности отмены
      if (abortController) {
        abortController.xhr = xhr;
      }

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
          reject(new Error(`Ошибка загрузки: ${xhr.status} ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', async () => {
        // Retry для Safari "Load failed"
        if (retryCount < MAX_RETRIES && !abortController?.aborted) {
          console.log(`Upload failed, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
          try {
            const result = await uploadToS3ViaProxy(file, onProgress, abortController, retryCount + 1);
            resolve(result);
          } catch (retryError) {
            reject(retryError);
          }
        } else {
          reject(new Error('Ошибка сети при загрузке'));
        }
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Загрузка отменена'));
      });

      // Таймаут для Safari
      xhr.timeout = 60000; // 60 секунд
      xhr.addEventListener('timeout', async () => {
        if (retryCount < MAX_RETRIES && !abortController?.aborted) {
          console.log(`Upload timeout, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
          try {
            const result = await uploadToS3ViaProxy(file, onProgress, abortController, retryCount + 1);
            resolve(result);
          } catch (retryError) {
            reject(retryError);
          }
        } else {
          reject(new Error('Превышено время ожидания'));
        }
      });

      xhr.open('PUT', upload_url);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  }

  // Создание кнопки
  function createButton(icon, tooltip, command, name) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = tooltip || name;
    button.innerHTML = `<img src="${icon}" alt="${name}" style="width:18px;height:18px;">`;
    button.dataset.command = name;
    button.addEventListener("click", command);
    return button;
  }

  // Создание кнопки загрузки файла (с input)
  function createUploadButton(icon, tooltip, name, accept, onFileSelect) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = tooltip;
    button.innerHTML = `<img src="${icon}" alt="${name}" style="width:18px;height:18px;">`;
    button.dataset.command = name;
    
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        onFileSelect(e.target.files[0]);
        e.target.value = "";
      }
    });
    
    button.appendChild(input);
    button.addEventListener("click", (e) => {
      if (e.target === button || e.target.tagName === "IMG") {
        input.click();
      }
    });
    
    return button;
  }

  // Инициализация редакторов
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
          placeholder: "Начните писать или перетащите файл..."
        }),
        Youtube.configure({
          width: 640,
          height: 360,
          nocookie: true
        })
      ],
      onUpdate({ editor }) {
        textarea.value = editor.getHTML();
        updateActiveButtons();
        if (wrapper.classList.contains('fullscreen')) {
          updateToc();
        }
      },
      onSelectionUpdate() {
        updateActiveButtons();
      }
    });

    // Функция загрузки файла
    async function uploadFile(file) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        alert(`Файл ${file.name} не поддерживается. Загружайте только изображения и видео.`);
        return;
      }

      const abortController = { xhr: null, aborted: false };
      const progressModal = createProgressModal(file.name, file.size, () => {
        abortController.aborted = true;
        if (abortController.xhr) {
          abortController.xhr.abort();
        }
      });
      document.body.appendChild(progressModal.element);

      try {
        const data = await uploadToS3ViaProxy(file, (percent, stage) => {
          progressModal.updateProgress(percent, stage);
        }, abortController);

        if (abortController.aborted) return;

        await new Promise(resolve => setTimeout(resolve, 400));
        progressModal.remove();

        if (data.success) {
          if (file.type.startsWith("image/")) {
            editor.chain().focus().setImage({ src: data.url }).run();
          } else {
            editor.commands.setVideo({ src: data.url });
          }
        }
      } catch (error) {
        progressModal.remove();
        if (!abortController.aborted) {
          alert(`Ошибка загрузки: ${error.message}`);
        }
      }
    }

    // Кнопки toolbar
    const buttons = [
      { icon: "/static/editor/icons/bold.svg", tooltip: "Жирный (Ctrl+B)", command: () => editor.chain().focus().toggleBold().run(), name: "bold" },
      { icon: "/static/editor/icons/italic.svg", tooltip: "Курсив (Ctrl+I)", command: () => editor.chain().focus().toggleItalic().run(), name: "italic" },
      { icon: "/static/editor/icons/strike.svg", tooltip: "Зачёркнутый", command: () => editor.chain().focus().toggleStrike().run(), name: "strike" },
      { type: "separator" },
      { icon: "/static/editor/icons/h2.svg", tooltip: "Заголовок 2", command: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), name: "h2" },
      { icon: "/static/editor/icons/h3.svg", tooltip: "Заголовок 3", command: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), name: "h3" },
      { icon: "/static/editor/icons/h4.svg", tooltip: "Заголовок 4", command: () => editor.chain().focus().toggleHeading({ level: 4 }).run(), name: "h4" },
      { type: "separator" },
      { icon: "/static/editor/icons/ul.svg", tooltip: "Маркированный список", command: () => editor.chain().focus().toggleBulletList().run(), name: "ul" },
      { icon: "/static/editor/icons/ol.svg", tooltip: "Нумерованный список", command: () => editor.chain().focus().toggleOrderedList().run(), name: "ol" },
      { type: "separator" },
      { icon: "/static/editor/icons/quote.svg", tooltip: "Цитата", command: () => editor.chain().focus().toggleBlockquote().run(), name: "quote" },
      { icon: "/static/editor/icons/code.svg", tooltip: "Блок кода", command: () => editor.chain().focus().toggleCodeBlock().run(), name: "code" },
      { icon: "/static/editor/icons/hr.svg", tooltip: "Горизонтальная линия", command: () => editor.chain().focus().setHorizontalRule().run(), name: "hr" },
      { type: "separator" },

      { icon: "/static/editor/icons/image.svg", tooltip: "Загрузить изображение", type: "upload", accept: "image/*", name: "img" },
      { icon: "/static/editor/icons/video.svg", tooltip: "Загрузить видео", type: "upload", accept: "video/*", name: "vid" },
      { icon: "/static/editor/icons/youtube.svg", tooltip: "Вставить YouTube видео", command: () => {
          const url = prompt("Вставьте ссылку на YouTube видео:");
          if (url) {
            editor.commands.setYoutubeVideo({ src: url });
          }
        }, name: "youtube"
      },
      { type: "separator" },
      { icon: "/static/editor/icons/undo.svg", tooltip: "Отменить (Ctrl+Z)", command: () => editor.chain().focus().undo().run(), name: "undo" },
      { icon: "/static/editor/icons/redo.svg", tooltip: "Повторить (Ctrl+Y)", command: () => editor.chain().focus().redo().run(), name: "redo" },
      { type: "separator" },
      { icon: "/static/editor/icons/fullscreen.svg", tooltip: "Полноэкранный режим", command: () => toggleFullscreen(), name: "fullscreen" }
    ];

    buttons.forEach(btn => {
      if (btn.type === "separator") {
        const separator = document.createElement("div");
        separator.className = "tiptap-toolbar-separator";
        toolbar.appendChild(separator);
      } else if (btn.type === "upload") {
        toolbar.appendChild(createUploadButton(btn.icon, btn.tooltip, btn.name, btn.accept, uploadFile));
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
        createTocPanel();
        updateToc();
      } else {
        document.documentElement.classList.remove("editor-fullscreen");
        document.body.classList.remove("editor-fullscreen");
        textarea.parentNode.insertBefore(toolbarWrapper, wrapper);
        const tocPanel = wrapper.querySelector('.editor-toc-panel');
        if (tocPanel) tocPanel.remove();
      }
    }

    function createTocPanel() {
      const tocPanel = document.createElement('div');
      tocPanel.className = 'editor-toc-panel';
      tocPanel.innerHTML = '<div class="editor-toc-header"><span>Навигация</span></div><div class="editor-toc-content"></div>';
      wrapper.appendChild(tocPanel);
      
      // Один обработчик на весь контейнер (делегирование)
      const tocContent = tocPanel.querySelector('.editor-toc-content');
      tocContent.addEventListener('click', function(e) {
        const link = e.target.closest('.editor-toc-item');
        if (!link) return;
        
        e.preventDefault();
        const idx = parseInt(link.dataset.idx);
        const proseMirror = wrapper.querySelector('.ProseMirror');
        if (!proseMirror) return;
        
        const headings = proseMirror.querySelectorAll('h2, h3, h4, h5');
        const heading = headings[idx];
        
        if (heading) {
          const scrollTop = wrapper.scrollTop;
          const headingTop = heading.getBoundingClientRect().top;
          const wrapperTop = wrapper.getBoundingClientRect().top;
          wrapper.scrollTo({ top: scrollTop + headingTop - wrapperTop - 100, behavior: 'smooth' });
          heading.classList.add('toc-highlight');
          setTimeout(function() { heading.classList.remove('toc-highlight'); }, 1500);
        }
      });
    }

    function updateToc() {
      const tocContent = wrapper.querySelector('.editor-toc-content');
      if (!tocContent) return;
      const proseMirror = wrapper.querySelector('.ProseMirror');
      if (!proseMirror) return;
      
      const headings = [];
      let idx = 0;
      proseMirror.querySelectorAll('h2, h3, h4, h5').forEach((heading) => {
        const level = parseInt(heading.tagName[1]);
        const text = heading.textContent.trim();
        if (text) {
          headings.push({ level, text, idx: idx });
        }
        idx++;
      });
      
      if (headings.length === 0) {
        tocContent.innerHTML = '<div class="editor-toc-empty">Нет заголовков</div>';
        return;
      }
      
      tocContent.innerHTML = headings.map((h) => 
        '<a href="javascript:void(0)" class="editor-toc-item level-' + h.level + '" data-idx="' + h.idx + '">' + h.text + '</a>'
      ).join('');
    }

    function updateActiveButtons() {
      toolbar.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
      
      const activeMap = {
        'bold': () => editor.isActive('bold'),
        'italic': () => editor.isActive('italic'),
        'strike': () => editor.isActive('strike'),
        'h2': () => editor.isActive('heading', { level: 2 }),
        'h3': () => editor.isActive('heading', { level: 3 }),
        'h4': () => editor.isActive('heading', { level: 4 }),
        'ul': () => editor.isActive('bulletList'),
        'ol': () => editor.isActive('orderedList'),
        'quote': () => editor.isActive('blockquote'),
        'code': () => editor.isActive('codeBlock')
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
     * Модальное окно с прогресс-баром и кнопкой отмены
     */
    function createProgressModal(fileName, fileSize, onCancel) {
      const overlay = document.createElement("div");
      overlay.className = "upload-modal-overlay";

      const modal = document.createElement("div");
      modal.className = "upload-modal";

      const title = document.createElement("div");
      title.className = "upload-modal-title";
      title.textContent = "Загрузка файла";

      const fileNameEl = document.createElement("div");
      fileNameEl.className = "upload-modal-filename";
      fileNameEl.textContent = fileName;

      const fileSizeEl = document.createElement("div");
      fileSizeEl.className = "upload-modal-filesize";
      const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
      fileSizeEl.textContent = `Размер: ${sizeMB} MB`;

      const progressBarBg = document.createElement("div");
      progressBarBg.className = "upload-modal-progress-bg";

      const progressBarFill = document.createElement("div");
      progressBarFill.className = "upload-modal-progress-fill";
      progressBarBg.appendChild(progressBarFill);

      const statusContainer = document.createElement("div");
      statusContainer.className = "upload-modal-status";

      const statusText = document.createElement("div");
      statusText.className = "upload-modal-status-text";
      statusText.textContent = "Подготовка...";

      const percentText = document.createElement("div");
      percentText.className = "upload-modal-percent";
      percentText.textContent = "0%";

      statusContainer.appendChild(statusText);
      statusContainer.appendChild(percentText);

      const warningEl = document.createElement("div");
      warningEl.className = "upload-modal-warning";
      warningEl.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div>
          <div class="upload-modal-warning-title">Не закрывайте окно</div>
          <div class="upload-modal-warning-text">Загрузка может занять несколько минут</div>
        </div>
      `;

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "upload-modal-cancel";
      cancelBtn.textContent = "Отменить загрузку";
      cancelBtn.addEventListener("click", () => {
        onCancel();
        overlay.remove();
      });

      modal.appendChild(title);
      modal.appendChild(fileNameEl);
      modal.appendChild(fileSizeEl);
      modal.appendChild(progressBarBg);
      modal.appendChild(statusContainer);
      modal.appendChild(warningEl);
      modal.appendChild(cancelBtn);
      overlay.appendChild(modal);

      return {
        element: overlay,
        updateProgress: (percent, stage) => {
          progressBarFill.style.width = `${percent}%`;
          percentText.textContent = `${percent}%`;

          if (stage === 'preparing') {
            statusText.textContent = 'Подготовка...';
          } else if (stage === 'uploading') {
            statusText.textContent = 'Загрузка...';
            cancelBtn.style.display = 'block';
          } else if (stage === 'complete') {
            statusText.textContent = 'Готово!';
            progressBarFill.classList.add('complete');
            cancelBtn.style.display = 'none';
          }
        },
        remove: () => overlay.remove()
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
        await uploadFile(file);
      }
    });

    // Вставка из буфера обмена (Ctrl+V)
    wrapper.addEventListener("paste", async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await uploadFile(file);
          }
          break;
        }
      }
    });

    // Esc для выхода из fullscreen
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && wrapper.classList.contains("fullscreen")) {
        toggleFullscreen();
      }
    });

    updateActiveButtons();
    textarea.tiptapEditor = editor;
  });
});
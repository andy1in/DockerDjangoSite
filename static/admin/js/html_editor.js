document.addEventListener('DOMContentLoaded', function () {
    // Находим элемент с id="trix-toolbar-2"
    const toolbar = document.getElementById('trix-toolbar-1');

    if (!toolbar) {
        console.error('Toolbar not found');
        return;
    }

    // Создаем модальное окно с формой
    const modal = document.createElement('div');
    modal.id = 'modal';
    modal.classList.add('modal', 'hidden', 'inset-0', 'bg-gray-500', 'bg-opacity-50', 'flex', 'justify-center', 'items-center', 'w-full');
    modal.innerHTML = `
        <div class="modal-content p-2 pl-4 rounded-lg shadow-lg w-full" style="background-color: #151d2b; border: 1px solid #374254 !important;">
            <h2 class="text-sm font-semibold mb-2">Enter HTML Code</h2>
            <form id="htmlForm" class="flex items-center space-x-2">
                <textarea
                    id="htmlCode"
                    class="p-2 rounded-md w-full sm:w-auto"
                    style="background-color: #151d2b; border: 1px solid #374254 !important;"
                    placeholder="Enter HTML code here"
                    required
                ></textarea>
                <div class="flex justify-end space-x-2">
                    <button
                        type="submit"
                        class="text-sm bg-[#980ffa] text-white p-2 mr-2 ml-2 rounded-md hover:bg-[#b44affff]"
                    >
                        Insert HTML
                    </button>
                    <button
                        type="button"
                        id="closeModalHTML"
                        class="bg-gray-300 text-black p-2 rounded-md hover:bg-gray-400"
                        style="background-color: #151d2b; border: 1px solid #374254"
                    >
                        Close
                    </button>
                </div>
            </form>
        </div>
    `;

    // Вставляем модальное окно в toolbar
    toolbar.appendChild(modal);

    // Находим первый дочерний div внутри toolbar
    const firstDiv = toolbar.querySelector('div');
    
    // Находим третий дочерний div внутри этого div
    const thirdDiv = firstDiv.querySelectorAll('div')[2];

    // Создаем кнопку
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-trix-action', 'decreaseNestingLevel');
    button.setAttribute('title', 'Insert HTML');
    button.setAttribute('tabindex', '-1');
    button.classList.add('cursor-pointer', 'flex', 'items-center', 'h-8', 'justify-center', 'transition-colors', 'w-8', 'hover:text-primary-600');
    button.disabled = false;  // Активируем кнопку

    // Добавляем иконку в кнопку
    const icon = document.createElement('img');
    icon.src = '/static/icons/html-48.png'; // Путь к вашей иконке
    icon.alt = 'Insert HTML Icon'; // Описание для доступности
    icon.classList.add('w-5', 'h-5'); // Устанавливаем размер иконки

    button.appendChild(icon);

    // Добавляем стиль для границы
    button.style.borderLeft = '1px solid #374254'; 

    // Добавляем кнопку в третий div
    thirdDiv.appendChild(button);

    // Обработчик клика по кнопке
    button.addEventListener('click', function () {
        // Показываем модальное окно
        modal.classList.remove('hidden');
    });

    // Закрытие модального окна 
    const closeModalHTMLButton = document.getElementById('closeModalHTML');
    closeModalHTMLButton.addEventListener('click', function () {
        modal.classList.add('hidden');
    });

    // Обработчик отправки формы
    const htmlForm = document.getElementById('htmlForm');
    htmlForm.addEventListener('submit', function (event) {
        event.preventDefault();  // Предотвращаем стандартную отправку формы

        // Получаем HTML-код
        const htmlCode = document.getElementById('htmlCode').value;
        
        if (htmlCode) {
            // Вставляем HTML-код в редактор
            const trixEditor = document.querySelector('trix-editor[id="id_content"]');
            if (trixEditor) {
                const editor = trixEditor.editor;
                if (editor) {
                    // Печатаем в консоль для проверки
                    console.log("HTML inserted:", htmlCode);
                    
                    // Вставляем HTML-код в редактор
                    editor.insertHTML(htmlCode);
                    
                    // Закрываем модальное окно после вставки
                    modal.classList.add('hidden');
                }
            }
        }
    });

    

});

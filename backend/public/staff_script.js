// backend/public/staff_script.js
const staffApp = {
    API_BASE_URL: '', // Lasciato vuoto, il frontend è servito dallo stesso server
    queueRefreshIntervalId: null, // ID per l'intervallo di aggiornamento automatico della coda
    QUEUE_REFRESH_INTERVAL_MS: 1000, // Aggiorna ogni 1 secondi
    editingMenuItemId: null, // Per tenere traccia dell'ID MongoDB (_id) dell'articolo in modifica
    editingCategoryId: null, // Per tenere traccia dell'ID MongoDB (_id) della categoria in modifica

    // Costanti per gli stati degli ordini e classi CSS associate
    ORDER_STATUSES: {
        RICEVUTO: 'Ricevuto',
        IN_PREPARAZIONE: 'In Preparazione',
        PRONTO: 'Pronto per il Ritiro/Consegna',
        SERVITO: 'Servito/Consegnato',
        ANNULLATO: 'Annullato'
    },
    ORDER_STATUS_CLASSES: {
        RICEVUTO: 'status-ricevuto',
        IN_PREPARAZIONE: 'status-in-preparazione',
        PRONTO: 'status-pronto',
        SERVITO: 'status-servito',
        ANNULLATO: 'status-annullato'
    },

    /**
     * Inizializza l'applicazione staff:
     * - Imposta gli event listener per la navigazione a schede e i pulsanti.
     * - Carica i dati iniziali (coda ordini e menu).
     * - Avvia l'aggiornamento automatico per la sezione attiva di default.
     */
    init: async function () {
        // Navigazione a Schede
        document.getElementById('nav-tab-orders').addEventListener('click', () => staffApp.showStaffSection('staff-orders-view'));
        document.getElementById('nav-tab-menu').addEventListener('click', () => staffApp.showStaffSection('staff-menu-view'));
        document.getElementById('nav-tab-categories').addEventListener('click', () => staffApp.showStaffSection('staff-categories-view'));


        // Gestione Coda Ordini
        document.getElementById('refresh-queue-btn').addEventListener('click', staffApp.renderOrderQueue);

        // Gestione Menu
        document.getElementById('toggle-add-menu-item-form-btn').addEventListener('click', staffApp.toggleMenuItemForm);
        document.getElementById('menu-item-form').addEventListener('submit', staffApp.handleSaveMenuItem);
        document.getElementById('cancel-edit-menu-item-btn').addEventListener('click', staffApp.resetMenuItemForm);
        document.getElementById('show-quick-add-category-btn').addEventListener('click', staffApp.showQuickAddCategoryFormFromMenu);


        // Gestione Categorie
        document.getElementById('toggle-add-category-form-btn').addEventListener('click', staffApp.toggleCategoryForm);
        document.getElementById('category-form').addEventListener('submit', staffApp.handleSaveCategory);
        document.getElementById('cancel-edit-category-btn').addEventListener('click', staffApp.resetCategoryForm);

        // Mostra la sezione ordini di default e avvia il suo refresh
        staffApp.showStaffSection('staff-orders-view');
        // Carica anche gli articoli del menu e le categorie in background o quando la scheda viene attivata la prima volta
        staffApp.loadAndRenderMenuItems();
        staffApp.loadAndRenderCategories(); // Carica le categorie per la gestione e per il select
    },

    /**
     * Mostra la sezione specificata e gestisce la logica associata (es. refresh automatico).
     * @param {string} sectionId - L'ID della sezione da visualizzare.
     */
    showStaffSection: function (sectionId) {
        document.querySelectorAll('.staff-nav-tab').forEach(tab => tab.classList.remove('active'));
        if (sectionId === 'staff-orders-view') {
            document.getElementById('nav-tab-orders').classList.add('active');
        } else if (sectionId === 'staff-menu-view') {
            document.getElementById('nav-tab-menu').classList.add('active');
        } else if (sectionId === 'staff-categories-view') {
            document.getElementById('nav-tab-categories').classList.add('active');
        }

        document.querySelectorAll('.staff-view-section').forEach(section => section.classList.remove('active'));
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
        } else {
            console.error("Sezione non trovata:", sectionId);
            return;
        }

        if (sectionId === 'staff-orders-view') {
            staffApp.renderOrderQueue();
            if (!staffApp.queueRefreshIntervalId) {
                staffApp.queueRefreshIntervalId = setInterval(staffApp.renderOrderQueue, staffApp.QUEUE_REFRESH_INTERVAL_MS);
            }
        } else {
            if (staffApp.queueRefreshIntervalId) {
                clearInterval(staffApp.queueRefreshIntervalId);
                staffApp.queueRefreshIntervalId = null;
            }
        }

        if (sectionId === 'staff-menu-view') {
            const menuTableBody = document.getElementById('menu-items-table-body');
            if (menuTableBody && (!menuTableBody.hasChildNodes() || (menuTableBody.firstElementChild && menuTableBody.firstElementChild.tagName === 'TR' && menuTableBody.firstElementChild.firstElementChild.colSpan > 1))) {
                staffApp.loadAndRenderMenuItems(); // Ricarica gli item se la tabella è vuota o ha il messaggio "no items"
            }
            staffApp.populateCategorySelect(); // Assicura che il select sia popolato
        }

        if (sectionId === 'staff-categories-view') {
            const categoriesTableBody = document.getElementById('categories-table-body');
            if (categoriesTableBody && (!categoriesTableBody.hasChildNodes() || (categoriesTableBody.firstElementChild && categoriesTableBody.firstElementChild.tagName === 'TR' && categoriesTableBody.firstElementChild.firstElementChild.colSpan > 1))) {
                staffApp.loadAndRenderCategories();
            }
        }
    },

    // --- Funzioni Gestione Categorie ---

    toggleCategoryForm: function () {
        const formContainer = document.getElementById('category-form-container');
        const formTitle = document.getElementById('category-form-title');
        const toggleButton = document.getElementById('toggle-add-category-form-btn');

        if (formContainer.style.display === 'none' || formContainer.style.display === '') {
            staffApp.resetCategoryForm();
            formTitle.textContent = 'Aggiungi Nuova Categoria';
            formContainer.style.display = 'block';
            toggleButton.textContent = 'Nascondi Form Categoria';
            toggleButton.classList.replace('btn-green', 'btn-outline-secondary');
        } else {
            formContainer.style.display = 'none';
            toggleButton.textContent = 'Aggiungi Nuova Categoria';
            toggleButton.classList.replace('btn-outline-secondary', 'btn-green');
            staffApp.resetCategoryForm();
        }
    },

    resetCategoryForm: function() {
        const form = document.getElementById('category-form');
        if (form) form.reset();
        document.getElementById('edit-category-id').value = '';
        document.getElementById('category-form-title').textContent = 'Aggiungi Nuova Categoria';
        document.getElementById('save-category-btn').textContent = 'Salva Categoria';
        document.getElementById('cancel-edit-category-btn').style.display = 'none';
        staffApp.editingCategoryId = null;
    },

    loadAndRenderCategories: async function (selectAfterLoadId = null) {
        const tableBody = document.getElementById('categories-table-body');
        const noCategoriesMsg = document.getElementById('no-categories-staff');

        if (!tableBody || !noCategoriesMsg) {
            console.error("Elementi UI per la tabella categorie non trovati.");
            return;
        }
        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/categories`);
            if (!response.ok) throw new Error(`Errore HTTP: ${response.status} - ${await response.text()}`);
            const categories = await response.json();

            tableBody.innerHTML = '';
            noCategoriesMsg.style.display = 'none';

            if (categories.length === 0) {
                noCategoriesMsg.style.display = 'block';
                return;
            }

            categories.forEach(cat => {
                const row = tableBody.insertRow();
                row.innerHTML = `
                    <td class="px-4 py-3">${cat.name}</td>
                    <td class="px-4 py-3">${cat.description || 'N/D'}</td>
                    <td class="px-4 py-3 text-center space-x-1 whitespace-nowrap">
                        <button class="btn btn-yellow btn-sm p-2 edit-category-btn" data-id="${cat._id}" title="Modifica">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg>
                        </button>
                        <button class="btn btn-red btn-sm p-2 delete-category-btn" data-id="${cat._id}" title="Elimina">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" /></svg>
                        </button>
                    </td>
                `;
            });

            document.querySelectorAll('.edit-category-btn').forEach(btn => btn.addEventListener('click', staffApp.handleEditCategory));
            document.querySelectorAll('.delete-category-btn').forEach(btn => btn.addEventListener('click', staffApp.handleDeleteCategory));
            
            // Aggiorna anche il select nel form menu items
            staffApp.populateCategorySelect(selectAfterLoadId);

        } catch (error) {
            console.error("Errore caricamento categorie:", error);
            staffApp.displayMessage(`Errore caricamento categorie: ${error.message}`, 'error', document.getElementById('message-area-staff'));
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="3" class="text-center text-red-500 py-4">Errore caricamento categorie.</td></tr>`;
            if (noCategoriesMsg) noCategoriesMsg.style.display = 'none';
        }
    },

    handleSaveCategory: async function(event) {
        event.preventDefault();
        const form = document.getElementById('category-form');
        const categoryId = document.getElementById('edit-category-id').value;
        const name = document.getElementById('category-name').value;
        const description = document.getElementById('category-description').value;

        if (!name.trim()) {
            staffApp.displayMessage('Il nome della categoria è obbligatorio.', 'error', document.getElementById('message-area-staff'));
            return;
        }

        const url = categoryId
            ? `${staffApp.API_BASE_URL}/api/categories/${categoryId}`
            : `${staffApp.API_BASE_URL}/api/categories`;
        const method = categoryId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description })
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Errore HTTP: ${response.status}`);
            }
            staffApp.displayMessage(`Categoria ${categoryId ? 'modificata' : 'aggiunta'} con successo!`, 'success', document.getElementById('message-area-staff'));
            
            const wasQuickAdd = form.dataset.quickAdd === 'true';
            
            staffApp.resetCategoryForm();
            if (document.getElementById('category-form-container').style.display === 'block' && !wasQuickAdd) {
                 staffApp.toggleCategoryForm(); // Chiude il form principale se era aperto
            } else if (wasQuickAdd) {
                 document.getElementById('category-form-container').style.display = 'none'; // Chiude il form se era per quick-add
                 delete form.dataset.quickAdd;
            }
            
            staffApp.loadAndRenderCategories(result._id); // Ricarica la lista e seleziona la nuova categoria nel form menu
            // staffApp.populateCategorySelect(result._id); // Assicura che il select sia aggiornato e selezionato

        } catch (error) {
            console.error("Errore salvataggio categoria:", error);
            staffApp.displayMessage(`Errore salvataggio categoria: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },

    handleEditCategory: async function(event) {
        const button = event.currentTarget;
        const categoryId = button.dataset.id;
        staffApp.editingCategoryId = categoryId;

        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/categories`);
            if (!response.ok) throw new Error('Impossibile recuperare i dettagli della categoria.');
            const allCategories = await response.json();
            const categoryToEdit = allCategories.find(cat => cat._id === categoryId);

            if (!categoryToEdit) {
                staffApp.displayMessage('Categoria non trovata per la modifica.', 'error', document.getElementById('message-area-staff'));
                return;
            }

            const formContainer = document.getElementById('category-form-container');
            const formTitle = document.getElementById('category-form-title');
            const toggleButton = document.getElementById('toggle-add-category-form-btn');

            formTitle.textContent = 'Modifica Categoria';
            document.getElementById('edit-category-id').value = categoryToEdit._id;
            document.getElementById('category-name').value = categoryToEdit.name;
            document.getElementById('category-description').value = categoryToEdit.description || '';
            document.getElementById('save-category-btn').textContent = 'Salva Modifiche';
            document.getElementById('cancel-edit-category-btn').style.display = 'inline-block';

            if (formContainer.style.display === 'none' || formContainer.style.display === '') {
                formContainer.style.display = 'block';
                if (toggleButton.textContent.toLowerCase().includes('aggiungi')) { // Solo se il form principale era chiuso
                     toggleButton.textContent = 'Nascondi Form Categoria';
                     toggleButton.classList.replace('btn-green', 'btn-outline-secondary');
                }
            }
            formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (error) {
            console.error("Errore preparazione modifica categoria:", error);
            staffApp.displayMessage(`Errore: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },

    handleDeleteCategory: async function(event) {
        const button = event.currentTarget;
        const categoryId = button.dataset.id;
        const categoryName = button.closest('tr').querySelector('td:nth-child(1)').textContent;

        if (!confirm(`Sei sicuro di voler eliminare la categoria "${categoryName}"? Questo potrebbe non essere possibile se ci sono articoli del menu associati.`)) {
            return;
        }

        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/categories/${categoryId}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Errore HTTP: ${response.status}`);
            }
            staffApp.displayMessage(`Categoria "${result.deletedCategory.name}" eliminata con successo.`, 'success', document.getElementById('message-area-staff'));
            await staffApp.loadAndRenderCategories();
            await staffApp.loadAndRenderMenuItems(); // Ricarica menu per riflettere eventuali cambi
        } catch (error) {
            console.error("Errore eliminazione categoria:", error);
            staffApp.displayMessage(`Errore eliminazione categoria: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },

    showQuickAddCategoryFormFromMenu: function() {
        const categoryFormContainer = document.getElementById('category-form-container');
        const menuItemFormContainer = document.getElementById('menu-item-form-container');
        
        staffApp.resetCategoryForm(); // Prepara il form per una nuova categoria
        document.getElementById('category-form-title').textContent = 'Aggiungi Nuova Categoria (Veloce)';
        document.getElementById('category-form').dataset.quickAdd = 'true'; // Segna come quick-add
        
        // Posiziona il form delle categorie vicino a quello del menu o aprilo come modal
        // Per semplicità, lo mostriamo sopra o sotto il form menu se esiste.
        // Qui assumiamo che sia già in pagina e lo rendiamo visibile.
        if(menuItemFormContainer) {
             menuItemFormContainer.parentNode.insertBefore(categoryFormContainer, menuItemFormContainer.nextSibling);
        }
        categoryFormContainer.style.display = 'block';
        document.getElementById('category-name').focus();
        categoryFormContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },


    // --- Funzioni Gestione Menu (Modificate) ---

    populateCategorySelect: async function(selectedCategoryId = null) {
        const selectElement = document.getElementById('menu-item-category-select');
        if (!selectElement) return;

        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/categories`);
            if (!response.ok) throw new Error('Errore caricamento categorie per select');
            const categories = await response.json();

            const previousValue = selectElement.value;
            selectElement.innerHTML = '<option value="">Seleziona una categoria...</option>';
            
            if (categories.length === 0) {
                 selectElement.innerHTML = '<option value="">Nessuna categoria disponibile. Aggiungine una!</option>';
            } else {
                categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat._id;
                    option.textContent = cat.name;
                    selectElement.appendChild(option);
                });
            }
            // Ripristina la selezione precedente se ancora valida o seleziona quella passata
            if (selectedCategoryId) {
                selectElement.value = selectedCategoryId;
            } else if (categories.find(c => c._id === previousValue)) {
                selectElement.value = previousValue;
            }


        } catch (error) {
            console.error("Errore popolamento select categorie:", error);
            selectElement.innerHTML = '<option value="">Errore caricamento</option>';
        }
    },

    toggleMenuItemForm: function () {
        const formContainer = document.getElementById('menu-item-form-container');
        const formTitle = document.getElementById('menu-item-form-title');
        const toggleButton = document.getElementById('toggle-add-menu-item-form-btn');
        const buttonTextSpan = toggleButton.querySelector('.button-text'); // Seleziona lo span
        
        // Definisci gli SVG come stringhe
        const svgPlusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 inline-block mr-1 align-middle">
                                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                             </svg>`;
        const svgMinusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 inline-block mr-1 align-middle">
                                 <path fill-rule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clip-rule="evenodd" />
                              </svg>`;

        // Funzione helper per sostituire l'SVG esistente o aggiungerlo se non c'è
        const setButtonSvg = (svgString) => {
            let currentSvg = toggleButton.querySelector('svg');
            if (currentSvg) {
                currentSvg.remove(); // Rimuovi l'SVG vecchio
            }
            // Inserisci il nuovo SVG all'inizio del pulsante
            toggleButton.insertAdjacentHTML('afterbegin', svgString);
        };

        if (formContainer.style.display === 'none' || formContainer.style.display === '') {
            staffApp.resetMenuItemForm();
            formTitle.textContent = 'Aggiungi Nuovo Articolo';
            formContainer.style.display = 'block';
            if (buttonTextSpan) buttonTextSpan.textContent = 'Nascondi Form Articolo';
            setButtonSvg(svgMinusIcon); // Imposta l'icona "-"
            toggleButton.classList.replace('btn-green', 'btn-outline-secondary');
        } else {
            formContainer.style.display = 'none';
            if (buttonTextSpan) buttonTextSpan.textContent = 'Aggiungi Nuovo Articolo';
            setButtonSvg(svgPlusIcon); // Imposta l'icona "+"
            toggleButton.classList.replace('btn-outline-secondary', 'btn-green');
            // staffApp.resetMenuItemForm(); // Potrebbe non essere necessario qui se il form viene solo nascosto
        }
    },

    resetMenuItemForm: function() {
        const form = document.getElementById('menu-item-form');
        if (form) form.reset();
        
        document.getElementById('edit-menu-item-id').value = '';
        document.getElementById('menu-item-form-title').textContent = 'Aggiungi Nuovo Articolo';
        document.getElementById('save-menu-item-btn').textContent = 'Salva Articolo';
        document.getElementById('cancel-edit-menu-item-btn').style.display = 'none';
        document.getElementById('menu-item-itemId').disabled = false;
        
        const imagePreviewContainer = document.getElementById('current-image-preview-container');
        const imagePreview = document.getElementById('current-image-preview');
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imagePreview) imagePreview.src = '#';
        
        const imageUrlInput = document.getElementById('menu-item-image-url');
        if(imageUrlInput) imageUrlInput.value = '';
        
        staffApp.editingMenuItemId = null;
        staffApp.populateCategorySelect(); // Popola il select delle categorie
    },

    loadAndRenderMenuItems: async function () {
        const tableBody = document.getElementById('menu-items-table-body');
        const noMenuItemsMsg = document.getElementById('no-menu-items-staff');

        if (!tableBody || !noMenuItemsMsg) {
            console.error("Elementi UI per la tabella menu non trovati.");
            return;
        }

        try {
            // Per visualizzare il nome della categoria, abbiamo bisogno delle categorie
            const [menuResponse, categoriesResponse] = await Promise.all([
                fetch(`${staffApp.API_BASE_URL}/api/menu/all-items`),
                fetch(`${staffApp.API_BASE_URL}/api/categories`)
            ]);

            if (!menuResponse.ok) throw new Error(`Errore HTTP menu: ${menuResponse.status} - ${await menuResponse.text()}`);
            if (!categoriesResponse.ok) throw new Error(`Errore HTTP categorie: ${categoriesResponse.status} - ${await categoriesResponse.text()}`);
            
            const menuItems = await menuResponse.json();
            const categories = await categoriesResponse.json();
            const categoryMap = new Map(categories.map(cat => [cat._id, cat.name]));


            tableBody.innerHTML = '';
            noMenuItemsMsg.style.display = 'none';

            if (menuItems.length === 0) {
                noMenuItemsMsg.style.display = 'block';
                return;
            }

            menuItems.forEach(item => {
                const row = tableBody.insertRow();
                const categoryName = categoryMap.get(item.category) || 'N/D (ID: ' + item.category + ')';
                row.innerHTML = `
                    <td class="px-4 py-3">${item.itemId}</td>
                    <td class="px-4 py-3">${item.name}</td>
                    <td class="px-4 py-3">${categoryName}</td> 
                    <td class="px-4 py-3 text-right">€ ${item.price.toFixed(2)}</td>
                    <td class="px-4 py-3 text-center">
                        <label class="inline-flex items-center cursor-pointer">
                            <input type="checkbox" class="toggle-availability-cb form-checkbox" data-id="${item._id}" ${item.available ? 'checked' : ''}>
                            <span class="ml-2 text-sm">${item.available ? 'Sì' : 'No'}</span>
                        </label>
                    </td>
                    <td class="px-4 py-3 text-center space-x-1 whitespace-nowrap">
                        <button class="btn btn-yellow btn-sm p-1 edit-menu-item-btn" data-id="${item._id}" title="Modifica">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                            </svg>
                        </button>
                        <button class="btn btn-red btn-sm p-1 delete-menu-item-btn" data-id="${item._id}" title="Elimina">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                                <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
                            </svg>
                        </button>
                    </td>
                `; // SVG per bottoni omessi per brevità qui
            });

            document.querySelectorAll('.edit-menu-item-btn').forEach(btn => btn.addEventListener('click', staffApp.handleEditMenuItem));
            document.querySelectorAll('.delete-menu-item-btn').forEach(btn => btn.addEventListener('click', staffApp.handleDeleteMenuItem));
            document.querySelectorAll('.toggle-availability-cb').forEach(cb => cb.addEventListener('change', staffApp.handleToggleAvailability));

        } catch (error) {
            console.error("Errore caricamento articoli menu:", error);
            staffApp.displayMessage(`Errore caricamento menu: ${error.message}`, 'error', document.getElementById('message-area-staff'));
            // ... gestione errore UI
        }
    },

    handleSaveMenuItem: async function(event) {
        event.preventDefault();
        const form = document.getElementById('menu-item-form');
        const mongoId = document.getElementById('edit-menu-item-id').value;
        
        const formData = new FormData(form);
        // 'category' sarà l'ID dal select: formData.get('category')

        if (!formData.get('category')) {
             staffApp.displayMessage('Seleziona una categoria per l\'articolo.', 'error', document.getElementById('message-area-staff'));
             return;
        }

        if (!document.getElementById('menu-item-available').checked) {
            formData.set('available', 'false');
        } else {
            formData.set('available', 'true');
        }

        const imageFileInput = document.getElementById('menu-item-image-file');
        if (imageFileInput.files.length === 0) {
            formData.delete('imageFile');
        }
        
        const url = mongoId 
            ? `${staffApp.API_BASE_URL}/api/menu/items/${mongoId}` 
            : `${staffApp.API_BASE_URL}/api/menu/items`;
        const method = mongoId ? 'POST' : 'PUT'; // ERRORE QUI: DOVREBBE ESSERE PUT SE mongoId esiste

        try {
            const response = await fetch(url, {
                method: mongoId ? 'PUT' : 'POST', // CORRETTO
                body: formData 
            });
            // ... gestione risposta come prima ...
            const result = await response.json(); // Assumiamo JSON
            if (!response.ok) {
                const errorMessage = Array.isArray(result.errors) 
                    ? result.errors.map(err => err.msg || JSON.stringify(err)).join(', ') 
                    : (result.message || `Errore HTTP: ${response.status}`);
                throw new Error(errorMessage);
            }
            
            staffApp.displayMessage(`Articolo menu ${mongoId ? 'modificato' : 'aggiunto'} con successo!`, 'success', document.getElementById('message-area-staff'));
            staffApp.toggleMenuItemForm(); 
            await staffApp.loadAndRenderMenuItems();
        } catch (error) {
            console.error("Errore salvataggio articolo menu:", error);
            staffApp.displayMessage(`Errore salvataggio: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },

    handleEditMenuItem: async function(event) {
        const button = event.currentTarget;
        const mongoId = button.dataset.id;
        staffApp.editingMenuItemId = mongoId;

        try {
            // Fetch l'item specifico per avere i dati più aggiornati
            const response = await fetch(`${staffApp.API_BASE_URL}/api/menu/all-items`); // Potrebbe essere /api/menu/items/:mongoId se esistesse
            if (!response.ok) throw new Error('Impossibile recuperare i dettagli dell\'articolo.');
            const allItems = await response.json();
            const itemToEdit = allItems.find(item => item._id === mongoId);


            if (!itemToEdit) {
                staffApp.displayMessage('Articolo non trovato per la modifica.', 'error', document.getElementById('message-area-staff'));
                return;
            }
            
            const formContainer = document.getElementById('menu-item-form-container');
            const formTitle = document.getElementById('menu-item-form-title');

            formTitle.textContent = 'Modifica Articolo Menu';
            document.getElementById('edit-menu-item-id').value = itemToEdit._id;
            document.getElementById('menu-item-itemId').value = itemToEdit.itemId;
            document.getElementById('menu-item-itemId').disabled = false; // Era true, ma se vuoi permettere modifica ID... altrimenti lascialo disabilitato per la modifica.
            document.getElementById('menu-item-name').value = itemToEdit.name;
            // Categoria: Popola il select e seleziona l'ID corretto
            await staffApp.populateCategorySelect(itemToEdit.category); // itemToEdit.category ora è l'ID

            document.getElementById('menu-item-price').value = itemToEdit.price.toFixed(2);
            document.getElementById('menu-item-description').value = itemToEdit.description || '';
            document.getElementById('menu-item-image-url').value = itemToEdit.image || '';
            document.getElementById('menu-item-image-file').value = '';

            const imagePreviewContainer = document.getElementById('current-image-preview-container');
            const imagePreview = document.getElementById('current-image-preview');
            if (itemToEdit.image) {
                imagePreview.src = itemToEdit.image.startsWith('http') ? itemToEdit.image : `${staffApp.API_BASE_URL}${itemToEdit.image}`;
                imagePreviewContainer.style.display = 'block';
            } else {
                imagePreviewContainer.style.display = 'none';
            }

            document.getElementById('menu-item-available').checked = itemToEdit.available;
            document.getElementById('save-menu-item-btn').textContent = 'Salva Modifiche';
            document.getElementById('cancel-edit-menu-item-btn').style.display = 'inline-block';
            
            if (formContainer.style.display === 'none') {
                formContainer.style.display = 'block';
                const toggleButton = document.getElementById('toggle-add-menu-item-form-btn');
                toggleButton.innerHTML = `... Nascondi Form Articolo`;
                toggleButton.classList.replace('btn-green', 'btn-outline-secondary');
            }
            formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (error) {
            console.error("Errore preparazione modifica articolo:", error);
            staffApp.displayMessage(`Errore: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },

    handleToggleAvailability: async function (event) {
        const checkbox = event.currentTarget;
        const mongoId = checkbox.dataset.id;
        const isChecked = checkbox.checked;
        try {
            // Per l'aggiornamento della disponibilità, non è strettamente necessario l'intero item,
            // ma il backend attuale (PUT /api/menu/items/:id) si aspetta tutti i campi.
            // Sarebbe meglio un endpoint PATCH dedicato per aggiornare solo 'available'.
            // Per ora, facciamo una GET per recuperare i dati e poi PUT.
            const itemResponse = await fetch(`${staffApp.API_BASE_URL}/api/menu/all-items`); // Assumendo che non ci sia un endpoint GET singolo per item by _id
            if(!itemResponse.ok) throw new Error('Dettagli articolo non trovati per toggle disponibilità');
            const allItems = await itemResponse.json();
            const itemToUpdate = allItems.find(item => item._id === mongoId);

            if (!itemToUpdate) throw new Error('Articolo non trovato per aggiornare disponibilità.');

            // Creare un FormData per inviare i dati, perché il backend si aspetta multipart/form-data a causa di imageFile
            const formData = new FormData();
            formData.append('itemId', itemToUpdate.itemId);
            formData.append('name', itemToUpdate.name);
            formData.append('category', itemToUpdate.category); // Questo è l'ID
            formData.append('price', itemToUpdate.price);
            formData.append('description', itemToUpdate.description || '');
            formData.append('image', itemToUpdate.image || ''); // URL immagine esistente
            formData.append('available', isChecked.toString()); // 'true' o 'false' come stringa

            const response = await fetch(`${staffApp.API_BASE_URL}/api/menu/items/${mongoId}`, {
                method: 'PUT',
                body: formData // Non impostare Content-Type, FormData lo fa automaticamente
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Errore HTTP: ${response.status}`);
            }
            staffApp.displayMessage(`Disponibilità di '${result.name}' aggiornata.`, 'success', document.getElementById('message-area-staff'));
            const labelSpan = checkbox.closest('label').querySelector('span');
            if (labelSpan) labelSpan.textContent = isChecked ? 'Sì' : 'No';
            
            // Aggiorniamo la tabella per coerenza, specialmente se la categoria fosse visualizzata in modo diverso
            // await staffApp.loadAndRenderMenuItems(); // Scommenta se necessario

        } catch (error) {
            console.error("Errore aggiornamento disponibilità:", error);
            staffApp.displayMessage(`Errore aggiornamento disponibilità: ${error.message}`, 'error', document.getElementById('message-area-staff'));
            checkbox.checked = !isChecked;
        }
    },

    handleDeleteMenuItem: async function (event) {
        // ... (come prima, nessuna modifica diretta per la categoria qui, ma loadAndRenderMenuItems gestirà la visualizzazione)
        const button = event.currentTarget;
        const mongoId = button.dataset.id;
        const itemName = button.closest('tr').querySelector('td:nth-child(2)').textContent;

        if (!confirm(`Sei sicuro di voler eliminare l'articolo "${itemName}"?`)) {
            return;
        }

        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/menu/items/${mongoId}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Errore HTTP: ${response.status}`);
            }
            staffApp.displayMessage(`Articolo "${result.deletedItem.name}" eliminato con successo.`, 'success', document.getElementById('message-area-staff'));
            await staffApp.loadAndRenderMenuItems();
        } catch (error) {
            console.error("Errore eliminazione articolo menu:", error);
            staffApp.displayMessage(`Errore eliminazione: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },


    // --- Funzioni Gestione Coda Ordini (invariate) ---
    renderOrderQueue: async function () {
        // ... (codice esistente)
        const queueContainer = document.getElementById('order-queue-section');
        const noOrdersStaffMsg = document.getElementById('no-orders-staff');

        if (!queueContainer || !noOrdersStaffMsg) {
            console.error("Elementi UI per la coda ordini non trovati.");
            return;
        }

        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/orders/queue`);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Errore HTTP: ${response.status} - ${errorText}`);
            }
            const activeOrders = await response.json();
            queueContainer.innerHTML = '';
            if (activeOrders.length === 0) {
                noOrdersStaffMsg.textContent = 'Nessun ordine attivo al momento.';
                noOrdersStaffMsg.className = 'text-gray-500 text-center mb-4 py-4';
                noOrdersStaffMsg.style.display = 'block';
                return;
            }
            noOrdersStaffMsg.style.display = 'none';
            activeOrders.forEach(order => {
                const orderCard = document.createElement('div');
                orderCard.className = 'card p-5 space-y-3';
                let itemsHtml = '<ul class="list-disc list-inside text-sm text-gray-700">';
                let totalOrderPrice = 0;
                order.items.forEach(item => {
                    itemsHtml += `<li>${item.name} (x${item.quantity}) - € ${(item.price * item.quantity).toFixed(2)}</li>`;
                    totalOrderPrice += item.price * item.quantity;
                });
                itemsHtml += '</ul>';
                const statusClass = staffApp.ORDER_STATUS_CLASSES[Object.keys(staffApp.ORDER_STATUSES).find(key => staffApp.ORDER_STATUSES[key] === order.status)] || 'bg-gray-200 text-gray-800';
                orderCard.innerHTML = `
                    <div class="flex justify-between items-center">
                        <h3 class="text-xl font-semibold text-gray-800">${order.orderId}</h3>
                        <span class="badge ${statusClass}">${order.status}</span>
                    </div>
                    <p class="text-gray-700">Cliente: <span class="font-medium">${order.customerName}</span></p>
                    <p class="text-gray-700">Ordinato alle: <span class="font-medium">${new Date(order.orderTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span></p>
                    <p class="text-gray-700">Stima Pronta: <span class="font-medium">${new Date(order.estimatedReadyTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span></p>
                    <div class="text-gray-700">Articoli: ${itemsHtml}</div>
                    <p class="text-lg font-bold text-gray-900 mt-2">Totale Ordine: € ${totalOrderPrice.toFixed(2)}</p>
                    <div class="mt-4 space-x-2 text-right">
                        ${order.status === staffApp.ORDER_STATUSES.RICEVUTO ? `<button class="btn btn-yellow text-sm update-status-btn" data-id="${order.orderId}" data-status="${staffApp.ORDER_STATUSES.IN_PREPARAZIONE}">In Preparazione</button>` : ''}
                        ${order.status === staffApp.ORDER_STATUSES.IN_PREPARAZIONE ? `<button class="btn btn-green text-sm update-status-btn" data-id="${order.orderId}" data-status="${staffApp.ORDER_STATUSES.PRONTO}">Pronto</button>` : ''}
                        ${order.status === staffApp.ORDER_STATUSES.PRONTO ? `<button class="btn btn-primary text-sm update-status-btn" data-id="${order.orderId}" data-status="${staffApp.ORDER_STATUSES.SERVITO}">Servito</button>` : ''}
                        ${(order.status !== staffApp.ORDER_STATUSES.SERVITO && order.status !== staffApp.ORDER_STATUSES.ANNULLATO) ? `<button class="btn btn-secondary text-sm update-status-btn" data-id="${order.orderId}" data-status="${staffApp.ORDER_STATUSES.ANNULLATO}">Annulla</button>` : ''}
                    </div>
                `;
                queueContainer.appendChild(orderCard);
            });
            document.querySelectorAll('.update-status-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    staffApp.updateOrderStatus(e.target.dataset.id, e.target.dataset.status);
                });
            });
        } catch (error) {
            console.error('Errore caricamento coda ordini:', error);
            if (queueContainer) queueContainer.innerHTML = '';
            if (noOrdersStaffMsg) {
                noOrdersStaffMsg.textContent = `Errore nel caricamento della coda ordini. L'aggiornamento automatico continuerà a provare.`;
                noOrdersStaffMsg.className = 'text-red-500 text-center mb-4 py-4';
                noOrdersStaffMsg.style.display = 'block';
            }
        }
    },
    updateOrderStatus: async function (orderId, newStatus) {
        // ... (codice esistente)
        const messageArea = document.getElementById('message-area-staff');
        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/orders/${orderId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Errore HTTP: ${response.status}` }));
                throw new Error(errorData.message || `Errore HTTP: ${response.status}`);
            }
            await staffApp.renderOrderQueue();
            // console.log(`Stato ordine ${orderId} aggiornato a ${newStatus}.`); 
        } catch (error) {
            console.error('Errore aggiornamento stato ordine:', error);
            if (messageArea) staffApp.displayMessage(`Errore aggiornamento stato: ${error.message}`, 'error', messageArea);
        }
    },

    /**
     * Visualizza un messaggio temporaneo nell'area designata.
     */
    displayMessage: function (message, type = 'info', areaElement, duration = 4000) {
        // ... (codice esistente)
        if (!areaElement) {
            console.warn("Area messaggi non fornita per displayMessage. Messaggio:", message);
            return;
        }
        areaElement.textContent = message;
        areaElement.className = 'mb-6 text-center p-3 rounded-md border ';
        if (type === 'success') areaElement.classList.add('bg-green-100', 'text-green-700', 'border-green-300');
        else if (type === 'error') areaElement.classList.add('bg-red-100', 'text-red-700', 'border-red-300');
        else areaElement.classList.add('bg-blue-100', 'text-blue-700', 'border-blue-300');

        setTimeout(() => {
            areaElement.textContent = '';
            areaElement.className = 'mb-6 text-center'; 
        }, duration);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    staffApp.init();
});
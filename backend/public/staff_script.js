// backend/public/staff_script.js
const staffApp = {
    API_BASE_URL: '', // Lasciato vuoto, il frontend è servito dallo stesso server
    queueRefreshIntervalId: null, // ID per l'intervallo di aggiornamento automatico della coda
    QUEUE_REFRESH_INTERVAL_MS: 1000, // Aggiorna ogni 1 secondi
    editingMenuItemId: null, // MongoDB _id
    editingCategoryId: null, // Per la modifica delle categorie
    allCategories: [], // Per tenere traccia delle categorie caricate


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

    init: async function () {
        // Listener per la navigazione principale a schede
        document.getElementById('nav-tab-orders').addEventListener('click', () => staffApp.showStaffSection('staff-orders-view'));
        document.getElementById('nav-tab-menu').addEventListener('click', () => staffApp.showStaffSection('staff-menu-view'));

        // Mostra la vista di default e inizializza i suoi listener
        staffApp.showStaffSection('staff-orders-view');

        try {
            await staffApp.loadAndRenderCategories(); // Carica prima le categorie
            // Non carichiamo loadAndRenderMenuItems qui, lo faremo quando la vista menu è attivata
        } catch (error) {
            console.error("Errore durante il caricamento iniziale delle categorie:", error);
            staffApp.displayMessage("Errore nel caricamento categorie iniziali.", "error", document.getElementById('message-area-staff'));
        }
    },

    // MANTENERE SOLO QUESTA DEFINIZIONE DI showStaffSection (la prima, quella asincrona)
    showStaffSection: async function (sectionId) {
        document.querySelectorAll('.staff-nav-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.staff-view-section').forEach(section => section.classList.remove('active'));

        const targetNavTab = document.getElementById(sectionId === 'staff-orders-view' ? 'nav-tab-orders' : 'nav-tab-menu');
        if(targetNavTab) targetNavTab.classList.add('active');

        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
        } else {
            console.error("Sezione non trovata:", sectionId);
            return;
        }

        if (sectionId !== 'staff-orders-view' && staffApp.queueRefreshIntervalId) {
            clearInterval(staffApp.queueRefreshIntervalId);
            staffApp.queueRefreshIntervalId = null;
            console.log("Aggiornamento automatico coda staff fermato.");
        }

        if (sectionId === 'staff-orders-view') {
            const refreshBtn = document.getElementById('refresh-queue-btn');
            if (refreshBtn && !refreshBtn.hasAttribute('data-listener-set')) {
                refreshBtn.addEventListener('click', staffApp.renderOrderQueue);
                refreshBtn.setAttribute('data-listener-set', 'true');
            }
            staffApp.renderOrderQueue();
            if (!staffApp.queueRefreshIntervalId) {
                staffApp.queueRefreshIntervalId = setInterval(staffApp.renderOrderQueue, staffApp.QUEUE_REFRESH_INTERVAL_MS);
                console.log("Aggiornamento automatico coda staff (ri)avviato.");
            }
        } else if (sectionId === 'staff-menu-view') {
            const toggleMenuItemBtn = document.getElementById('toggle-add-menu-item-form-btn');
            if (toggleMenuItemBtn && !toggleMenuItemBtn.hasAttribute('data-listener-set')) {
                toggleMenuItemBtn.addEventListener('click', staffApp.toggleMenuItemForm);
                toggleMenuItemBtn.setAttribute('data-listener-set', 'true');
            }

            const menuItemForm = document.getElementById('menu-item-form');
            if (menuItemForm && !menuItemForm.hasAttribute('data-listener-set')) {
                menuItemForm.addEventListener('submit', staffApp.handleSaveMenuItem);
                menuItemForm.setAttribute('data-listener-set', 'true');
            }

            const cancelMenuItemBtn = document.getElementById('cancel-edit-menu-item-btn');
            if (cancelMenuItemBtn && !cancelMenuItemBtn.hasAttribute('data-listener-set')) {
                cancelMenuItemBtn.addEventListener('click', staffApp.resetMenuItemForm);
                cancelMenuItemBtn.setAttribute('data-listener-set', 'true');
            }

            const manageCatBtn = document.getElementById('manage-categories-btn');
            if (manageCatBtn && !manageCatBtn.hasAttribute('data-listener-set')) {
                manageCatBtn.addEventListener('click', staffApp.openCategoryModal);
                manageCatBtn.setAttribute('data-listener-set', 'true');
            }

            const closeCatModalBtn = document.getElementById('close-category-modal-btn');
            if (closeCatModalBtn && !closeCatModalBtn.hasAttribute('data-listener-set')) {
                closeCatModalBtn.addEventListener('click', staffApp.closeCategoryModal);
                closeCatModalBtn.setAttribute('data-listener-set', 'true');
            }

            const newCatForm = document.getElementById('new-category-form');
            if (newCatForm && !newCatForm.hasAttribute('data-listener-set')) {
                newCatForm.addEventListener('submit', staffApp.handleAddCategory);
                newCatForm.setAttribute('data-listener-set', 'true');
            }

            // Carica/Ricarica dati specifici della vista menu
            if (staffApp.allCategories.length === 0) {
                await staffApp.loadAndRenderCategories();
            } else {
                staffApp.populateCategorySelect();
            }
            const menuTableBody = document.getElementById('menu-items-table-body');
            if(menuTableBody && (!menuTableBody.hasChildNodes() || menuTableBody.children.length === 0 || (menuTableBody.firstElementChild && menuTableBody.firstElementChild.textContent.includes("Errore")))){
               await staffApp.loadAndRenderMenuItems();
           }
        }
    },

    // --- Funzioni Gestione Menu ---

    // --- Funzioni Gestione Menu ---

    toggleMenuItemForm: function () {
        const formContainer = document.getElementById('menu-item-form-container');
        const formTitle = document.getElementById('menu-item-form-title');
        const toggleButton = document.getElementById('toggle-add-menu-item-form-btn');

        if (formContainer.style.display === 'none' || formContainer.style.display === '') {
            staffApp.resetMenuItemForm(); // Resetta e popola categorie
            formTitle.textContent = 'Aggiungi Nuovo Articolo';
            formContainer.style.display = 'block';
            toggleButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 inline-block mr-1">
                  <path fill-rule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clip-rule="evenodd" />
                </svg>
                Nascondi Form Articolo`;
            toggleButton.classList.replace('btn-green', 'btn-outline-secondary');
        } else {
            formContainer.style.display = 'none';
            toggleButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 inline-block mr-1">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
                Aggiungi Nuovo Articolo`;
            toggleButton.classList.replace('btn-outline-secondary', 'btn-green');
            staffApp.resetMenuItemForm();
        }
    },

    resetMenuItemForm: function () {
        const form = document.getElementById('menu-item-form');
        if (form) form.reset();

        document.getElementById('edit-menu-item-id').value = '';
        document.getElementById('menu-item-form-title').textContent = 'Aggiungi Nuovo Articolo';

        const imagePreviewContainer = document.getElementById('current-image-preview-container');
        const imagePreview = document.getElementById('current-image-preview');
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imagePreview) imagePreview.src = '#';
        document.getElementById('menu-item-image-url').value = '';


        document.getElementById('save-menu-item-btn').textContent = 'Salva Articolo';
        document.getElementById('cancel-edit-menu-item-btn').style.display = 'none';
        staffApp.editingMenuItemId = null;
        staffApp.populateCategorySelect(); // Popola e resetta la selezione categorie
    },

    loadAndRenderMenuItems: async function () {
        const tableBody = document.getElementById('menu-items-table-body');
        const noMenuItemsMsg = document.getElementById('no-menu-items-staff');

        if (!tableBody || !noMenuItemsMsg) {
            console.error("Elementi UI per la tabella menu non trovati.");
            return;
        }

        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/menu/all-items`);
            if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
            const menuItems = await response.json();

            tableBody.innerHTML = '';
            noMenuItemsMsg.style.display = menuItems.length === 0 ? 'block' : 'none';

            menuItems.forEach(item => {
                const row = tableBody.insertRow();
                row.innerHTML = `
                    <td class="px-4 py-3">${item.name}</td>
                    <td class="px-4 py-3">${item.category ? item.category.name : 'N/D'}</td>
                    <td class="px-4 py-3 text-right">€ ${item.price.toFixed(2)}</td>
                    <td class="px-4 py-3 text-center">
                        <label class="inline-flex items-center cursor-pointer">
                            <input type="checkbox" class="toggle-availability-cb form-checkbox" data-id="${item._id}" ${item.available ? 'checked' : ''}>
                            <span class="ml-2 text-sm">${item.available ? 'Sì' : 'No'}</span>
                        </label>
                    </td>
                    <td class="px-4 py-3 text-center space-x-1 whitespace-nowrap">
                        <button class="btn btn-yellow btn-sm p-1 edit-menu-item-btn" data-id="${item._id}" title="Modifica">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg>
                        </button>
                        <button class="btn btn-red btn-sm p-1 delete-menu-item-btn" data-id="${item._id}" title="Elimina">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" /></svg>
                        </button>
                    </td>
                `;
            });
            document.querySelectorAll('.edit-menu-item-btn').forEach(btn => btn.addEventListener('click', staffApp.handleEditMenuItem));
            document.querySelectorAll('.delete-menu-item-btn').forEach(btn => btn.addEventListener('click', staffApp.handleDeleteMenuItem));
            document.querySelectorAll('.toggle-availability-cb').forEach(cb => cb.addEventListener('change', staffApp.handleToggleAvailability));

        } catch (error) {
            console.error("Errore caricamento articoli menu:", error);
            staffApp.displayMessage(`Errore caricamento menu: ${error.message}`, 'error', document.getElementById('message-area-staff'));
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500 py-4">Errore caricamento menu.</td></tr>`; // colspan a 5
            if (noMenuItemsMsg) noMenuItemsMsg.style.display = 'none';
        }
    },
    
    handleSaveMenuItem: async function (event) { // Assicurati che questa sia l'unica definizione o quella corretta
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const editingId = staffApp.editingMenuItemId; // Usare la variabile di stato

        // Per FormData con file, non impostare Content-Type, il browser lo fa.
        // Ma se invii JSON, devi convertirlo e impostare Content-Type.
        // Il tuo backend con Multer si aspetta multipart/form-data se c'è imageFile.

        // Se non c'è imageFile e c'è image (URL), devi decidere come inviare.
        // Per semplicità, il backend gestisce o file o URL.

        // Validazione Frontend Base (opzionale, il backend valida comunque)
        if (!formData.get('name') || !formData.get('category') || !formData.get('price')) {
            staffApp.displayMessage("Nome, categoria e prezzo sono obbligatori.", "error", document.getElementById('message-area-staff'));
            return;
        }
        
        // Se il campo file è vuoto e stai modificando, non vuoi inviare `imageFile`
        // Ma FormData lo invierà come un file vuoto. Il backend deve gestirlo.
        // Potresti rimuoverlo da formData se è vuoto E stai modificando:
        const imageFile = formData.get('imageFile');
        if (editingId && imageFile && imageFile.name === '' && imageFile.size === 0) {
            formData.delete('imageFile');
        }


        const url = editingId ? `${staffApp.API_BASE_URL}/api/menu/items/${editingId}` : `${staffApp.API_BASE_URL}/api/menu/items`;
        const method = editingId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                body: formData // Invia FormData direttamente
                // Non impostare 'Content-Type': 'multipart/form-data', il browser lo fa per te con il boundary corretto
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || (result.errors ? result.errors.map(e => e.msg).join(', ') : `Errore HTTP: ${response.status}`));
            }
            staffApp.displayMessage(`Articolo '${result.name}' ${editingId ? 'modificato' : 'aggiunto'}!`, 'success', document.getElementById('message-area-staff'));
            staffApp.resetMenuItemForm();
            staffApp.toggleMenuItemForm(); // Nascondi il form dopo il successo
            await staffApp.loadAndRenderMenuItems(); // Ricarica la lista
            staffApp.editingMenuItemId = null; // Resetta ID dopo il salvataggio
        } catch (error) {
            console.error("Errore salvataggio articolo menu:", error);
            staffApp.displayMessage(`Errore: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },


    handleEditMenuItem: async function (event) {
        const button = event.currentTarget;
        const mongoId = button.dataset.id;
        staffApp.editingMenuItemId = mongoId;

        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/menu/all-items`); // Assicurati che questa API esista e restituisca tutti i dettagli
            if (!response.ok) throw new Error('Impossibile recuperare i dettagli dell\'articolo.');
            const allItems = await response.json();
            const itemToEdit = allItems.find(item => item._id === mongoId);

            if (!itemToEdit) {
                staffApp.displayMessage('Articolo non trovato per la modifica.', 'error', document.getElementById('message-area-staff'));
                return;
            }

            const formContainer = document.getElementById('menu-item-form-container');
            const formTitle = document.getElementById('menu-item-form-title');
            const toggleButton = document.getElementById('toggle-add-menu-item-form-btn');

            formTitle.textContent = 'Modifica Articolo Menu';
            document.getElementById('edit-menu-item-id').value = itemToEdit._id; // ID MongoDB nascosto
            
            // Rimuovi riferimenti a 'menu-item-itemId'
            // document.getElementById('menu-item-itemId').value = itemToEdit.itemId; // RIMOSSO
            // document.getElementById('menu-item-itemId').disabled = false; // RIMOSSO

            document.getElementById('menu-item-name').value = itemToEdit.name;

            // Popola e seleziona la categoria
            // Assicurati che le categorie siano caricate (potrebbe essere già fatto in showStaffSection)
            if (staffApp.allCategories.length === 0) {
                await staffApp.loadAndRenderCategories(itemToEdit.category ? itemToEdit.category._id : null);
            } else {
                staffApp.populateCategorySelect(itemToEdit.category ? itemToEdit.category._id : null);
            }

            document.getElementById('menu-item-price').value = itemToEdit.price.toFixed(2);
            document.getElementById('menu-item-description').value = itemToEdit.description || '';
            
            document.getElementById('menu-item-image-url').value = itemToEdit.image || ''; // Mantiene URL se presente
            document.getElementById('menu-item-image-file').value = ''; // Resetta il campo file

            const imagePreviewContainer = document.getElementById('current-image-preview-container');
            const imagePreview = document.getElementById('current-image-preview');
            if (itemToEdit.image) {
                // Assumendo che item.image sia il percorso completo o un URL assoluto
                imagePreview.src = itemToEdit.image; 
                imagePreviewContainer.style.display = 'block';
            } else {
                imagePreviewContainer.style.display = 'none';
            }

            document.getElementById('menu-item-available').checked = itemToEdit.available;
            
            document.getElementById('save-menu-item-btn').textContent = 'Salva Modifiche';
            document.getElementById('cancel-edit-menu-item-btn').style.display = 'inline-block';
            
            if (formContainer.style.display === 'none' || formContainer.style.display === '') {
                formContainer.style.display = 'block';
                 toggleButton.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 inline-block mr-1">
                      <path fill-rule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clip-rule="evenodd" />
                    </svg>
                    Nascondi Form Articolo`;
                toggleButton.classList.replace('btn-green', 'btn-outline-secondary');
            }
            formContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });

        } catch (error) {
             console.error("Errore preparazione modifica articolo:", error); // Questo è il log dell'utente
            staffApp.displayMessage(`Errore preparazione modifica: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },

    loadAndRenderCategories: async function (selectCategoryId = null) {
        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/categories`);
            if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
            staffApp.allCategories = await response.json();

            staffApp.populateCategorySelect(selectCategoryId); // Popola il <select> nel form degli articoli
            staffApp.renderCategoryList(); // Popola la lista nel modal di gestione categorie
        } catch (error) {
            console.error("Errore caricamento categorie:", error);
            staffApp.displayMessage(`Errore caricamento categorie: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },

    populateCategorySelect: function (selectedCategoryId = null) {
        const selectElement = document.getElementById('menu-item-category-select');
        if (!selectElement) return;

        const currentSelectedValue = selectElement.value; // Salva il valore selezionato se presente
        selectElement.innerHTML = '<option value="">Seleziona una categoria...</option>'; // Opzione default

        staffApp.allCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat._id;
            option.textContent = cat.name;
            if (selectedCategoryId && cat._id === selectedCategoryId) {
                option.selected = true;
            } else if (!selectedCategoryId && currentSelectedValue && cat._id === currentSelectedValue) {
                // Mantiene la selezione precedente se non viene fornito un ID specifico (es. dopo aggiunta nuova categoria)
                option.selected = true;
            }
            selectElement.appendChild(option);
        });
    },

    loadAndRenderCategories: async function (selectCategoryId = null) {
        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/categories`);
            if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
            staffApp.allCategories = await response.json();

            staffApp.populateCategorySelect(selectCategoryId);
            staffApp.renderCategoryList();
        } catch (error) {
            console.error("Errore caricamento categorie:", error);
            staffApp.displayMessage(`Errore caricamento categorie: ${error.message}`, 'error', document.getElementById('message-area-staff'));
            // Pulisci select e lista in caso di errore
             const selectElement = document.getElementById('menu-item-category-select');
             if(selectElement) selectElement.innerHTML = '<option value="">Errore caricamento categorie</option>';
             const listElement = document.getElementById('existing-categories-list');
             if(listElement) listElement.innerHTML = '<li>Errore caricamento categorie.</li>';
        }
    },

    populateCategorySelect: function (selectedCategoryId = null) {
        const selectElement = document.getElementById('menu-item-category-select');
        if (!selectElement) {
            console.warn("Elemento select 'menu-item-category-select' non trovato per popolare le categorie.");
            return;
        }

        const currentSelectedValueWhileEditing = selectedCategoryId; // Usiamo direttamente il parametro per la modifica
        const previousSelectionOnForm = selectElement.value; // Per mantenere la selezione dopo un'aggiunta di categoria
        selectElement.innerHTML = '<option value="">Seleziona una categoria...</option>';

        staffApp.allCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat._id;
            option.textContent = cat.name;
            if (currentSelectedValueWhileEditing && cat._id === currentSelectedValueWhileEditing) {
                option.selected = true;
            } else if (!currentSelectedValueWhileEditing && previousSelectionOnForm && cat._id === previousSelectionOnForm) {
                option.selected = true;
            }
            selectElement.appendChild(option);
        });
    },

    renderCategoryList: function () {
        const listElement = document.getElementById('existing-categories-list');
        if (!listElement) return;
        listElement.innerHTML = '';

        if (staffApp.allCategories.length === 0) {
            listElement.innerHTML = '<li class="text-gray-500">Nessuna categoria trovata. Aggiungine una!</li>';
            return;
        }

        staffApp.allCategories.forEach(cat => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center py-2 px-3 bg-white even:bg-gray-50 rounded shadow-sm';
            li.innerHTML = `
                <span data-id="${cat._id}">${cat.name} ${cat.description ? '<span class="text-xs text-gray-500 ml-1">(' + cat.description + ')</span>' : ''}</span>
                <div class="space-x-2">
                    <button class="text-blue-500 hover:text-blue-700 edit-category-btn" data-id="${cat._id}" title="Modifica">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg>
                    </button>
                    <button class="text-red-500 hover:text-red-700 delete-category-btn" data-id="${cat._id}" title="Elimina">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" /></svg>
                    </button>
                </div>
            `;
            listElement.appendChild(li);
        });
        document.querySelectorAll('.edit-category-btn').forEach(btn => btn.addEventListener('click', staffApp.handleEditCategoryPrompt));
        document.querySelectorAll('.delete-category-btn').forEach(btn => btn.addEventListener('click', staffApp.handleDeleteCategory));
    },

    openCategoryModal: function () {
        const modal = document.getElementById('category-management-modal');
        modal.style.display = 'flex'; // Tailwind usa flex per centrare
        setTimeout(() => modal.classList.remove('hidden'), 10); // Per transizione
        staffApp.loadAndRenderCategories();
        document.getElementById('new-category-name').value = '';
        document.getElementById('new-category-form').querySelector('button[type="submit"]').textContent = 'Aggiungi';
        staffApp.editingCategoryId = null;
    },

    closeCategoryModal: function () {
        const modal = document.getElementById('category-management-modal');
        modal.classList.add('hidden');
        setTimeout(() => modal.style.display = 'none', 300); // Dopo la transizione
    },

    handleAddCategory: async function (event) {
        event.preventDefault();
        const nameInput = document.getElementById('new-category-name');
        const categoryName = nameInput.value.trim();
        const descriptionInput = document.getElementById('new-category-description'); // Se hai un campo descrizione
        const categoryDescription = descriptionInput ? descriptionInput.value.trim() : '';


        if (!categoryName) {
            staffApp.displayMessage('Il nome della categoria non può essere vuoto.', 'error', document.getElementById('message-area-staff')); // Usa message-area-staff
            return;
        }

        const url = staffApp.editingCategoryId
            ? `${staffApp.API_BASE_URL}/api/categories/${staffApp.editingCategoryId}`
            : `${staffApp.API_BASE_URL}/api/categories`;
        const method = staffApp.editingCategoryId ? 'PUT' : 'POST';
        const body = { name: categoryName };
        if (descriptionInput) body.description = categoryDescription;


        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `Errore HTTP ${response.status}`);

            staffApp.displayMessage(`Categoria '${result.name}' ${staffApp.editingCategoryId ? 'modificata' : 'aggiunta'}!`, 'success', document.getElementById('message-area-staff'));
            nameInput.value = '';
            if (descriptionInput) descriptionInput.value = '';
            staffApp.editingCategoryId = null;
            document.getElementById('new-category-form').querySelector('button[type="submit"]').textContent = 'Aggiungi';
            await staffApp.loadAndRenderCategories(); // Ricarica e renderizza lista categorie e select articoli
        } catch (error) {
            console.error("Errore salvataggio categoria:", error);
            staffApp.displayMessage(`Errore salvataggio categoria: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },

    handleEditCategoryPrompt: function (event) {
        const button = event.currentTarget;
        const categoryId = button.dataset.id;
        const category = staffApp.allCategories.find(cat => cat._id === categoryId);
        if (!category) return;

        document.getElementById('new-category-name').value = category.name;
        const descriptionInput = document.getElementById('new-category-description');
        if (descriptionInput) descriptionInput.value = category.description || '';

        staffApp.editingCategoryId = categoryId;
        document.getElementById('new-category-form').querySelector('button[type="submit"]').textContent = 'Salva Modifiche';
        document.getElementById('new-category-name').focus();
    },

    handleDeleteCategory: async function (event) {
        const button = event.currentTarget;
        const categoryId = button.dataset.id;
        const category = staffApp.allCategories.find(cat => cat._id === categoryId);
        if (!category) return;

        if (!confirm(`Sei sicuro di voler eliminare la categoria "${category.name}"? Gli articoli che usano questa categoria potrebbero rimanere senza categoria o dovrai aggiornarli.`)) {
            return;
        }

        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/categories/${categoryId}`, { method: 'DELETE' });
            if (!response.ok) {
                 const result = await response.json().catch(() => ({message: `Errore HTTP ${response.status}`})); // Prova a parsare l'errore JSON
                throw new Error(result.message || `Errore HTTP ${response.status}`);
            }
            // Non c'è result.deletedCategory se la risposta è 204 No Content o un semplice {message: "..."}
            staffApp.displayMessage(`Categoria "${category.name}" eliminata.`, 'success', document.getElementById('message-area-staff'));
            await staffApp.loadAndRenderCategories();
        } catch (error) {
            console.error("Errore eliminazione categoria:", error);
            staffApp.displayMessage(`Errore eliminazione categoria: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },
    
    handleToggleAvailability: async function (event) {
        const checkbox = event.currentTarget;
        const mongoId = checkbox.dataset.id;
        const isChecked = checkbox.checked;
        
        // Dobbiamo inviare l'intero oggetto o solo il campo 'available'.
        // Se il backend accetta un aggiornamento parziale (PATCH o PUT che aggiorna solo i campi forniti):
        const updatedData = { available: isChecked };

        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/menu/items/${mongoId}`, { // Assumendo che questa rotta esista per PUT/PATCH
                method: 'PUT', // o 'PATCH' se il backend lo supporta per aggiornamenti parziali
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData) // Invia solo il campo da aggiornare, MA il backend DEVE supportarlo
                                                  // O invia tutti i campi recuperati + 'available' modificato
            });
            const result = await response.json(); // Il backend dovrebbe restituire l'item aggiornato
            if (!response.ok) {
                throw new Error(result.message || `Errore HTTP: ${response.status}`);
            }
            staffApp.displayMessage(`Disponibilità di '${result.name}' aggiornata.`, 'success', document.getElementById('message-area-staff'));
            const labelSpan = checkbox.closest('label').querySelector('span');
            if (labelSpan) labelSpan.textContent = isChecked ? 'Sì' : 'No';
            // Non è necessario ricaricare tutta la tabella, ma potresti aggiornare l'item in un array locale se lo usi
        } catch (error) {
            console.error("Errore aggiornamento disponibilità:", error);
            staffApp.displayMessage(`Errore aggiornamento disponibilità: ${error.message}`, 'error', document.getElementById('message-area-staff'));
            checkbox.checked = !isChecked; // Ripristina in caso di errore
        }
    },

    handleDeleteMenuItem: async function (event) {
        const button = event.currentTarget;
        const mongoId = button.dataset.id;
        const itemNameElement = button.closest('tr').querySelector('td:first-child'); // Il primo td è il nome
        const itemName = itemNameElement ? itemNameElement.textContent : "l'articolo selezionato";


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
            staffApp.displayMessage(`Articolo "${result.deletedItem ? result.deletedItem.name : itemName}" eliminato.`, 'success', document.getElementById('message-area-staff'));
            await staffApp.loadAndRenderMenuItems();
        } catch (error) {
            console.error("Errore eliminazione articolo menu:", error);
            staffApp.displayMessage(`Errore eliminazione: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },

    // --- Funzioni Gestione Coda Ordini (invariate dalla versione precedente) ---
    /**
     * Carica e visualizza la coda degli ordini attivi.
     */
    renderOrderQueue: async function () {
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
                noOrdersStaffMsg.className = 'text-gray-500 text-center py-8 card'; // Aggiunto card per coerenza
                noOrdersStaffMsg.style.display = 'block';
                return;
            }
            noOrdersStaffMsg.style.display = 'none';
            activeOrders.forEach(order => {
                const orderCard = document.createElement('div');
                orderCard.className = 'card p-5 space-y-3'; // Rimosso responsive grid qui, gestito da parent
                let itemsHtml = '<ul class="list-disc list-inside text-sm text-gray-700">';
                let totalOrderPrice = 0;
                order.items.forEach(item => {
                    itemsHtml += `<li>${item.name} (x${item.quantity}) - € ${(item.price * item.quantity).toFixed(2)}</li>`;
                    totalOrderPrice += item.price * item.quantity;
                });
                itemsHtml += '</ul>';
                const statusKey = Object.keys(staffApp.ORDER_STATUSES).find(key => staffApp.ORDER_STATUSES[key] === order.status);
                const statusClass = staffApp.ORDER_STATUS_CLASSES[statusKey] || 'bg-gray-200 text-gray-800';
                
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
                        ${order.status === staffApp.ORDER_STATUSES.PRONTO ? `<button class="btn btn-primary text-sm update-status-btn" data-id="${order.orderId}" data-status="${staffApp.ORDER_STATUSES.SERVITO}">Servito/Consegnato</button>` : ''}
                        ${(order.status !== staffApp.ORDER_STATUSES.SERVITO && order.status !== staffApp.ORDER_STATUSES.ANNULLATO) ? `<button class="btn btn-outline-secondary text-sm update-status-btn" data-id="${order.orderId}" data-status="${staffApp.ORDER_STATUSES.ANNULLATO}">Annulla</button>` : ''}
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
                noOrdersStaffMsg.textContent = `Errore nel caricamento della coda ordini. L'aggiornamento automatico continuerà a provare. Dettagli: ${error.message}`;
                noOrdersStaffMsg.className = 'text-red-500 text-center py-8 card'; // Aggiunto card per coerenza
                noOrdersStaffMsg.style.display = 'block';
            }
        }
    },

    updateOrderStatus: async function (orderId, newStatus) {
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
            await staffApp.renderOrderQueue(); // Aggiorna la vista della coda
            // Non mostrare messaggio di successo per ogni cambio stato per non essere troppo invasivo
            console.log(`Stato ordine ${orderId} aggiornato a ${newStatus}.`);
        } catch (error) {
            console.error('Errore aggiornamento stato ordine:', error);
            if (messageArea) staffApp.displayMessage(`Errore aggiornamento stato: ${error.message}`, 'error', messageArea);
        }
    },

    displayMessage: function (message, type = 'info', areaElement, duration = 4000) {
        if (!areaElement) {
            console.warn("Area messaggi non fornita per displayMessage. Messaggio:", message);
            return;
        }
        
        areaElement.textContent = message;
        areaElement.className = 'mb-4 text-center p-3 rounded-md border transition-opacity duration-300 ease-out opacity-100'; // Rimuovi mb-6, classi colore verranno aggiunte
        
        if (type === 'success') areaElement.classList.add('bg-green-100', 'text-green-700', 'border-green-300');
        else if (type === 'error') areaElement.classList.add('bg-red-100', 'text-red-700', 'border-red-300');
        else areaElement.classList.add('bg-blue-100', 'text-blue-700', 'border-blue-300'); // Info o default

        // Clear previous timeout if any
        const existingTimeoutId = areaElement.dataset.timeoutId;
        if (existingTimeoutId) {
            clearTimeout(parseInt(existingTimeoutId));
        }

        const timeoutId = setTimeout(() => {
            areaElement.classList.remove('opacity-100');
            areaElement.classList.add('opacity-0');
             setTimeout(() => { // Svuota dopo che la transizione è finita
                areaElement.textContent = '';
                areaElement.className = 'mb-4 text-center transition-opacity duration-300 ease-out'; // Rimuovi classi colore e bordo
             }, 300); // Deve corrispondere alla durata della transizione opacity
        }, duration);
        areaElement.dataset.timeoutId = timeoutId;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    staffApp.init();
});

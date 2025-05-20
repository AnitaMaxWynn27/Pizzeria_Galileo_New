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

    /**
     * Inizializza l'applicazione staff:
     * - Imposta gli event listener per la navigazione a schede e i pulsanti.
     * - Carica i dati iniziali (coda ordini e menu).
     * - Avvia l'aggiornamento automatico per la sezione attiva di default.
     */
    init: async function () {
        // Navigazione a Schede
        document.getElementById('nav-tab-orders').addEventListener('click', () => staffApp.showStaffSection('staff-orders-view'));
        document.getElementById('nav-tab-menu').addEventListener('click', async () => {
            staffApp.showStaffSection('staff-menu-view');
            // Carica categorie quando si va alla vista menu, se non già fatto
            if (staffApp.allCategories.length === 0) {
                await staffApp.loadAndRenderCategories();
            }
        });

        // Gestione Coda Ordini
        document.getElementById('refresh-queue-btn').addEventListener('click', staffApp.renderOrderQueue);

        // Gestione Menu (Articoli)
        document.getElementById('toggle-add-menu-item-form-btn').addEventListener('click', staffApp.toggleMenuItemForm);
        document.getElementById('menu-item-form').addEventListener('submit', staffApp.handleSaveMenuItem);
        document.getElementById('cancel-edit-menu-item-btn').addEventListener('click', staffApp.resetMenuItemForm);

        // Gestione Categorie
        document.getElementById('manage-categories-btn').addEventListener('click', staffApp.openCategoryModal);
        document.getElementById('close-category-modal-btn').addEventListener('click', staffApp.closeCategoryModal);
        document.getElementById('new-category-form').addEventListener('submit', staffApp.handleAddCategory);

        staffApp.showStaffSection('staff-orders-view');
        await staffApp.loadAndRenderMenuItems(); // Carica gli articoli
        await staffApp.loadAndRenderCategories(); // Carica le categorie all'avvio
    },

    /**
     * Mostra la sezione specificata e gestisce la logica associata (es. refresh automatico).
     * @param {string} sectionId - L'ID della sezione da visualizzare ('staff-orders-view' o 'staff-menu-view').
     */
    showStaffSection: function (sectionId) {
        // ... (logica esistente per nascondere/mostrare sezioni e gestire refresh ordini)
        document.querySelectorAll('.staff-nav-tab').forEach(tab => tab.classList.remove('active'));
        if (sectionId === 'staff-orders-view') {
            document.getElementById('nav-tab-orders').classList.add('active');
        } else if (sectionId === 'staff-menu-view') {
            document.getElementById('nav-tab-menu').classList.add('active');
        }

        document.querySelectorAll('.staff-view-section').forEach(section => section.classList.remove('active'));
        document.getElementById(sectionId)?.classList.add('active');

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
            // Assicurati che le categorie siano popolate nel form se la vista menu è attiva
            if (sectionId === 'staff-menu-view') {
                staffApp.populateCategorySelect(); // Popola il select nel form articoli
            }
        }
    },

    // --- Funzioni Gestione Menu ---

    /**
     * Mostra o nasconde il form per aggiungere/modificare un articolo del menu.
     * Aggiorna anche il testo e l'icona del pulsante toggle.
     */
    toggleMenuItemForm: function () {
        const formContainer = document.getElementById('menu-item-form-container');
        const formTitle = document.getElementById('menu-item-form-title');
        const toggleButton = document.getElementById('toggle-add-menu-item-form-btn');

        if (formContainer.style.display === 'none') {
            staffApp.resetMenuItemForm();
            formTitle.textContent = 'Aggiungi Nuovo Articolo';
            formContainer.style.display = 'block';
            toggleButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 inline-block mr-1">
                  <path fill-rule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clip-rule="evenodd" />
                </svg>
                Nascondi Form Articolo`;
            toggleButton.classList.replace('btn-green', 'btn-outline-secondary');
            staffApp.populateCategorySelect(); // Popola le categorie quando il form si apre
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

    /**
     * Resetta il form di gestione menu al suo stato iniziale (per aggiunta).
     */
    resetMenuItemForm: function() {
        const form = document.getElementById('menu-item-form');
        if (form) form.reset();
        
        document.getElementById('edit-menu-item-id').value = ''; // Questo è il MongoDB _id
        document.getElementById('menu-item-form-title').textContent = 'Aggiungi Nuovo Articolo';
        // Il campo itemId non esiste più nel form
        
        const imagePreviewContainer = document.getElementById('current-image-preview-container');
        const imagePreview = document.getElementById('current-image-preview');
        const imageUrlInput = document.getElementById('menu-item-image-url'); // Mantenuto per URL

        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imagePreview) imagePreview.src = '#';
        if (imageUrlInput) imageUrlInput.value = '';

        document.getElementById('save-menu-item-btn').textContent = 'Salva Articolo';
        document.getElementById('cancel-edit-menu-item-btn').style.display = 'none';
        staffApp.editingMenuItemId = null;
        staffApp.populateCategorySelect(); // Ripopola e resetta la selezione
    },


    /**
     * Carica tutti gli articoli del menu dal backend e li visualizza nella tabella.
     */
    loadAndRenderMenuItems: async function () {
        const tableBody = document.getElementById('menu-items-table-body');
        const noMenuItemsMsg = document.getElementById('no-menu-items-staff');

        if (!tableBody || !noMenuItemsMsg) {
            console.error("Elementi UI per la tabella menu non trovati.");
            return;
        }

         try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/menu/all-items`); // Questa API ora popola la categoria
            if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
            const menuItems = await response.json();
            
            tableBody.innerHTML = ''; 
            noMenuItemsMsg.style.display = menuItems.length === 0 ? 'block' : 'none';

            menuItems.forEach(item => {
                const row = tableBody.insertRow();
                // Colonna itemId rimossa, item.slug potrebbe essere usata se volessi mostrarla, ma non è nel design attuale
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
                        <button class="btn btn-yellow btn-sm p-2 edit-menu-item-btn" data-id="${item._id}" title="Modifica">...</button>
                        <button class="btn btn-red btn-sm p-2 delete-menu-item-btn" data-id="${item._id}" title="Elimina">...</button>
                    </td>
                `;
            });
            // ... (aggiungi event listener ai bottoni edit/delete/toggle come prima)
            document.querySelectorAll('.edit-menu-item-btn').forEach(btn => btn.addEventListener('click', staffApp.handleEditMenuItem));
            document.querySelectorAll('.delete-menu-item-btn').forEach(btn => btn.addEventListener('click', staffApp.handleDeleteMenuItem));
            document.querySelectorAll('.toggle-availability-cb').forEach(cb => cb.addEventListener('change', staffApp.handleToggleAvailability));

        }catch (error) {
            console.error("Errore caricamento articoli menu:", error);
            staffApp.displayMessage(`Errore caricamento menu: ${error.message}`, 'error', document.getElementById('message-area-staff'));
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-red-500 py-4">Errore caricamento menu.</td></tr>`;
            if (noMenuItemsMsg) noMenuItemsMsg.style.display = 'none'; // Nascondi se c'è un errore specifico nella tabella
        }
    },

    /**
     * Gestisce il salvataggio (aggiunta o modifica) di un articolo del menu.
     * @param {Event} event - L'evento di submit del form.
     */
    handleEditMenuItem: async function(event) {
        const button = event.currentTarget;
        const mongoId = button.dataset.id; // MongoDB _id
        staffApp.editingMenuItemId = mongoId;

        try {
            // Potremmo ottimizzare recuperando l'item direttamente dalla tabella se tutti i dati sono lì,
            // ma una fetch assicura dati aggiornati.
            const response = await fetch(`${staffApp.API_BASE_URL}/api/menu/all-items`); // Questa API ora popola 'category'
            if (!response.ok) throw new Error('Impossibile recuperare dettagli articolo.');
            const allItems = await response.json();
            const itemToEdit = allItems.find(item => item._id === mongoId);

            if (!itemToEdit) { /* ... (errore articolo non trovato) ... */ return; }
            
            // ... (mostra form, imposta titolo "Modifica Articolo Menu") ...
            document.getElementById('edit-menu-item-id').value = itemToEdit._id;
            document.getElementById('menu-item-name').value = itemToEdit.name;
            // La categoria ora è un ObjectId, quindi selezioniamo l'opzione corretta nel <select>
            await staffApp.loadAndRenderCategories(itemToEdit.category ? itemToEdit.category._id : null); // Carica e seleziona
            // staffApp.populateCategorySelect(itemToEdit.category ? itemToEdit.category._id : null); // Se le categorie sono già caricate

            document.getElementById('menu-item-price').value = itemToEdit.price.toFixed(2);
            document.getElementById('menu-item-description').value = itemToEdit.description || '';
            
            // Gestione immagine (come nella versione precedente con upload e URL)
            document.getElementById('menu-item-image-url').value = itemToEdit.image || '';
            document.getElementById('menu-item-image-file').value = ''; // Resetta campo file
            const imagePreviewContainer = document.getElementById('current-image-preview-container');
            const imagePreview = document.getElementById('current-image-preview');
            if (itemToEdit.image) {
                imagePreview.src = itemToEdit.image.startsWith('http') ? itemToEdit.image : itemToEdit.image; // Percorso già corretto dal backend
                imagePreviewContainer.style.display = 'block';
            } else {
                imagePreviewContainer.style.display = 'none';
            }

            document.getElementById('menu-item-available').checked = itemToEdit.available;
            // ... (mostra/nascondi bottoni Salva Modifiche/Annulla) ...
             document.getElementById('menu-item-form-title').textContent = 'Modifica Articolo Menu';
            document.getElementById('save-menu-item-btn').textContent = 'Salva Modifiche';
            document.getElementById('cancel-edit-menu-item-btn').style.display = 'inline-block';
            document.getElementById('menu-item-form-container').style.display = 'block'; // Assicura che il form sia visibile
             document.getElementById('toggle-add-menu-item-form-btn').innerHTML = `... Nascondi Form ...`; // Aggiorna bottone toggle


        } catch (error) { /* ... (gestione errori come prima) ... */ }
    },


    /**
     * Pre-compila il form per la modifica di un articolo esistente.
     * @param {Event} event - L'evento click sul pulsante "Modifica".
     */
    handleEditMenuItem: async function (event) {
        const button = event.currentTarget;
        const mongoId = button.dataset.id;
        staffApp.editingMenuItemId = mongoId;

        try {
            // Non è necessario fare una fetch qui se la tabella è già popolata con tutti i dati necessari,
            // inclusi _id e image. Se `loadAndRenderMenuItems` già carica tutto, possiamo prendere i dati dalla riga.
            // Per ora, manteniamo la fetch per coerenza con il codice precedente, ma potrebbe essere ottimizzata.
            const response = await fetch(`${staffApp.API_BASE_URL}/api/menu/all-items`);
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

            // Popola il form
            formTitle.textContent = 'Modifica Articolo Menu';
            document.getElementById('edit-menu-item-id').value = itemToEdit._id;
            document.getElementById('menu-item-itemId').value = itemToEdit.itemId;
            document.getElementById('menu-item-itemId').disabled = false;
            document.getElementById('menu-item-name').value = itemToEdit.name;
            document.getElementById('menu-item-category').value = itemToEdit.category;
            document.getElementById('menu-item-price').value = itemToEdit.price.toFixed(2);
            document.getElementById('menu-item-description').value = itemToEdit.description || '';

            // Gestione immagine per la modifica
            document.getElementById('menu-item-image-url').value = itemToEdit.image || ''; // Mostra l'URL/percorso esistente
            document.getElementById('menu-item-image-file').value = ''; // Resetta il campo file

            const imagePreviewContainer = document.getElementById('current-image-preview-container');
            const imagePreview = document.getElementById('current-image-preview');
            if (itemToEdit.image) {
                imagePreview.src = itemToEdit.image.startsWith('http') ? itemToEdit.image : `${staffApp.API_BASE_URL}${itemToEdit.image}`; // Assumendo API_BASE_URL sia vuoto o il dominio
                imagePreviewContainer.style.display = 'block';
            } else {
                imagePreviewContainer.style.display = 'none';
            }

            document.getElementById('menu-item-available').checked = itemToEdit.available;

            document.getElementById('save-menu-item-btn').textContent = 'Salva Modifiche';
            document.getElementById('cancel-edit-menu-item-btn').style.display = 'inline-block';

            if (formContainer.style.display === 'none') {
                formContainer.style.display = 'block';
                toggleButton.innerHTML = `Nascondi Form Articolo`;
                toggleButton.classList.replace('btn-green', 'btn-outline-secondary');
            }
            formContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });

        } catch (error) {
            console.error("Errore preparazione modifica articolo:", error);
            staffApp.displayMessage(`Errore: ${error.message}`, 'error', document.getElementById('message-area-staff'));
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

    renderCategoryList: function () { // Per il modal di gestione
        const listElement = document.getElementById('existing-categories-list');
        if (!listElement) return;
        listElement.innerHTML = ''; // Pulisci lista

        if (staffApp.allCategories.length === 0) {
            listElement.innerHTML = '<li>Nessuna categoria trovata.</li>';
            return;
        }

        staffApp.allCategories.forEach(cat => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center py-1';
            li.innerHTML = `
                <span data-id="${cat._id}">${cat.name} ${cat.description ? '(' + cat.description + ')' : ''}</span>
                <div>
                    <button class="text-blue-500 hover:text-blue-700 mr-2 edit-category-btn" data-id="${cat._id}" title="Modifica">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg>
                    </button>
                    <button class="text-red-500 hover:text-red-700 delete-category-btn" data-id="${cat._id}" title="Elimina">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" /></svg>
                    </button>
                </div>
            `;
            listElement.appendChild(li);
        });
        // Aggiungi event listener ai nuovi bottoni
        document.querySelectorAll('.edit-category-btn').forEach(btn => btn.addEventListener('click', staffApp.handleEditCategoryPrompt));
        document.querySelectorAll('.delete-category-btn').forEach(btn => btn.addEventListener('click', staffApp.handleDeleteCategory));
    },

    openCategoryModal: function () {
        document.getElementById('category-management-modal').style.display = 'block';
        staffApp.loadAndRenderCategories(); // Ricarica e renderizza la lista aggiornata
    },

    closeCategoryModal: function () {
        document.getElementById('category-management-modal').style.display = 'none';
        document.getElementById('new-category-name').value = ''; // Pulisci input
        staffApp.editingCategoryId = null; // Resetta ID modifica categoria
    },

    handleAddCategory: async function (event) {
        event.preventDefault();
        const nameInput = document.getElementById('new-category-name');
        const categoryName = nameInput.value.trim();
        if (!categoryName) {
            staffApp.displayMessage('Il nome della categoria non può essere vuoto.', 'error', document.getElementById('message-area-staff'));
            return;
        }

        const url = staffApp.editingCategoryId
            ? `${staffApp.API_BASE_URL}/api/categories/${staffApp.editingCategoryId}`
            : `${staffApp.API_BASE_URL}/api/categories`;
        const method = staffApp.editingCategoryId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: categoryName /* , description: '' se vuoi aggiungerlo */ })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `Errore HTTP ${response.status}`);

            staffApp.displayMessage(`Categoria '${result.name}' ${staffApp.editingCategoryId ? 'modificata' : 'aggiunta'}!`, 'success', document.getElementById('message-area-staff'));
            nameInput.value = ''; // Pulisci input
            staffApp.editingCategoryId = null; // Resetta ID modifica
            document.getElementById('new-category-form').querySelector('button[type="submit"]').textContent = 'Aggiungi'; // Ripristina testo bottone
            await staffApp.loadAndRenderCategories(); // Ricarica e renderizza tutto
        } catch (error) {
            console.error("Errore salvataggio categoria:", error);
            staffApp.displayMessage(`Errore: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },

    handleEditCategoryPrompt: function (event) {
        const button = event.currentTarget;
        const categoryId = button.dataset.id;
        const category = staffApp.allCategories.find(cat => cat._id === categoryId);
        if (!category) return;

        document.getElementById('new-category-name').value = category.name;
        // document.getElementById('new-category-description').value = category.description || ''; // Se avessi un campo descrizione
        staffApp.editingCategoryId = categoryId;
        document.getElementById('new-category-form').querySelector('button[type="submit"]').textContent = 'Salva Modifiche';
        document.getElementById('new-category-name').focus();
    },

    handleDeleteCategory: async function (event) {
        const button = event.currentTarget;
        const categoryId = button.dataset.id;
        const category = staffApp.allCategories.find(cat => cat._id === categoryId);
        if (!category) return;

        if (!confirm(`Sei sicuro di voler eliminare la categoria "${category.name}"? Questa azione non può essere annullata.`)) {
            return;
        }

        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/categories/${categoryId}`, { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `Errore HTTP ${response.status}`);

            staffApp.displayMessage(`Categoria "${result.deletedCategory.name}" eliminata.`, 'success', document.getElementById('message-area-staff'));
            await staffApp.loadAndRenderCategories(); // Ricarica e renderizza tutto
        } catch (error) {
            console.error("Errore eliminazione categoria:", error);
            staffApp.displayMessage(`Errore eliminazione: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },
    /**
     * Gestisce il cambio di disponibilità di un articolo del menu.
     * @param {Event} event - L'evento change sulla checkbox di disponibilità.
     */
    handleToggleAvailability: async function (event) {
        const checkbox = event.currentTarget; // Usa currentTarget
        const mongoId = checkbox.dataset.id;
        const isChecked = checkbox.checked;
        try {
            // Per aggiornare solo la disponibilità, è meglio avere un'API dedicata
            // o recuperare l'item completo prima di inviare l'update.
            // Qui recuperiamo l'item per assicurarci di non sovrascrivere altri campi accidentalmente.
            const allItemsResponse = await fetch(`${staffApp.API_BASE_URL}/api/menu/all-items`);
            if (!allItemsResponse.ok) throw new Error('Impossibile recuperare i dettagli dell\'articolo.');
            const allItems = await allItemsResponse.json();
            const itemToUpdate = allItems.find(item => item._id === mongoId);

            if (!itemToUpdate) throw new Error('Articolo non trovato.');

            const updatedData = {
                // Manteniamo tutti i campi esistenti e aggiorniamo solo 'available'
                itemId: itemToUpdate.itemId,
                name: itemToUpdate.name,
                category: itemToUpdate.category,
                price: itemToUpdate.price,
                description: itemToUpdate.description,
                image: itemToUpdate.image,
                available: isChecked
            };

            const response = await fetch(`${staffApp.API_BASE_URL}/api/menu/items/${mongoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData) // Invia l'oggetto completo con 'available' modificato
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Errore HTTP: ${response.status}`);
            }
            staffApp.displayMessage(`Disponibilità di '${result.name}' aggiornata.`, 'success', document.getElementById('message-area-staff'));
            // Aggiorna solo il testo "Sì/No" per un feedback più rapido
            const labelSpan = checkbox.closest('label').querySelector('span');
            if (labelSpan) labelSpan.textContent = isChecked ? 'Sì' : 'No';
            // Non è strettamente necessario ricaricare tutta la tabella qui,
            // ma se ci fossero altri dati derivati da 'available', sarebbe meglio farlo.
            // await staffApp.loadAndRenderMenuItems(); 
        } catch (error) {
            console.error("Errore aggiornamento disponibilità:", error);
            staffApp.displayMessage(`Errore: ${error.message}`, 'error', document.getElementById('message-area-staff'));
            checkbox.checked = !isChecked; // Ripristina lo stato della checkbox in caso di errore
        }
    },

    /**
     * Gestisce l'eliminazione di un articolo del menu.
     * @param {Event} event - L'evento click sul pulsante "Elimina".
     */
    handleDeleteMenuItem: async function (event) {
        const button = event.currentTarget; // Usa currentTarget
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

    /**
     * Aggiorna lo stato di un ordine specifico.
     * @param {string} orderId - L'ID dell'ordine da aggiornare.
     * @param {string} newStatus - Il nuovo stato dell'ordine.
     */
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
            await staffApp.renderOrderQueue();
            console.log(`Stato ordine ${orderId} aggiornato a ${newStatus}.`); // Log per conferma, nessun messaggio UI
        } catch (error) {
            console.error('Errore aggiornamento stato ordine:', error);
            if (messageArea) staffApp.displayMessage(`Errore aggiornamento stato: ${error.message}`, 'error', messageArea);
        }
    },

    /**
     * Visualizza un messaggio temporaneo nell'area designata.
     * @param {string} message - Il messaggio da visualizzare.
     * @param {string} type - Il tipo di messaggio ('info', 'success', 'error').
     * @param {HTMLElement} areaElement - L'elemento HTML dove visualizzare il messaggio.
     * @param {number} duration - La durata in millisecondi prima che il messaggio scompaia.
     */
    displayMessage: function (message, type = 'info', areaElement, duration = 4000) {
        if (!areaElement) {
            console.warn("Area messaggi non fornita per displayMessage. Messaggio:", message);
            return;
        }
        areaElement.textContent = message;
        // Aggiunte classi per bordi colorati ai messaggi
        areaElement.className = 'mb-6 text-center p-3 rounded-md border ';
        if (type === 'success') areaElement.classList.add('bg-green-100', 'text-green-700', 'border-green-300');
        else if (type === 'error') areaElement.classList.add('bg-red-100', 'text-red-700', 'border-red-300');
        else areaElement.classList.add('bg-blue-100', 'text-blue-700', 'border-blue-300');

        setTimeout(() => {
            areaElement.textContent = '';
            areaElement.className = 'mb-6 text-center'; // Rimuovi anche le classi di bordo
        }, duration);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    staffApp.init();
});

// backend/public/staff_script.js
const staffApp = {
    API_BASE_URL: '', // Lasciato vuoto, il frontend è servito dallo stesso server
    authToken: null,       // NUOVO: Per memorizzare il token JWT
    currentUser: null,     // NUOVO: Per memorizzare i dettagli dell'utente staff
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
        staffApp.loadTokenAndUser(); // Carica token e utente da localStorage

        // Controllo autenticazione e autorizzazione
        if (!staffApp.authToken || !staffApp.currentUser ||
            (staffApp.currentUser.role !== 'staff' && staffApp.currentUser.role !== 'admin')) {
            // Rimuovi l'alert per un reindirizzamento più pulito
            // alert('Accesso negato. Verrai reindirizzato al login.'); 
            window.location.href = '/'; // Reindirizza alla pagina principale
            return; // Interrompi l'inizializzazione del pannello staff
        }

        if (!staffApp.currentUser.isActive) {
            // Rimuovi l'alert
            // alert('Account staff non attivo. Contatta l\'amministrazione.');
            localStorage.removeItem('pizzeriaAuthToken'); // Pulisci token
            localStorage.removeItem('pizzeriaUser');    // Pulisci utente
            window.location.href = '/';
            return;
        }

        // Se tutti i controlli sono superati, rendi visibile il corpo della pagina
        document.body.style.display = 'block';

        // ---- IL RESTO DELLA FUNZIONE init() CONTINUA DA QUI ----
        // Navigazione a Schede
        document.getElementById('nav-tab-orders').addEventListener('click', () => staffApp.showStaffSection('staff-orders-view'));
        document.getElementById('nav-tab-menu').addEventListener('click', () => staffApp.showStaffSection('staff-menu-view'));
        document.getElementById('nav-tab-categories').addEventListener('click', () => staffApp.showStaffSection('staff-categories-view'));

        document.getElementById('refresh-queue-btn').addEventListener('click', staffApp.renderOrderQueue);

        document.getElementById('toggle-add-menu-item-form-btn').addEventListener('click', staffApp.toggleMenuItemForm);
        document.getElementById('menu-item-form').addEventListener('submit', staffApp.handleSaveMenuItem);
        document.getElementById('cancel-edit-menu-item-btn').addEventListener('click', staffApp.resetMenuItemForm);
        document.getElementById('show-quick-add-category-btn').addEventListener('click', staffApp.showQuickAddCategoryFormFromMenu);

        document.getElementById('toggle-add-category-form-btn').addEventListener('click', staffApp.toggleCategoryForm);
        document.getElementById('category-form').addEventListener('submit', staffApp.handleSaveCategory);
        document.getElementById('cancel-edit-category-btn').addEventListener('click', staffApp.resetCategoryForm);

        document.getElementById('save-category-order-btn').addEventListener('click', staffApp.handleSaveCategoryOrder);

        const logoutButton = document.getElementById('staff-logout-btn');
        if (logoutButton) {
            logoutButton.addEventListener('click', staffApp.logout);
        }
        const staffUsernameEl = document.getElementById('staff-username');
        if (staffUsernameEl && staffApp.currentUser) {
            staffUsernameEl.textContent = staffApp.currentUser.name;
        }

        // Carica i dati e mostra la sezione di default
        // Queste chiamate ora avvengono solo se l'utente è autorizzato e il body è visibile
        await staffApp.loadAndRenderMenuItems(); // Chiamata spostata per assicurare che il DOM sia pronto
        await staffApp.loadAndRenderCategories(); // Chiamata spostata
        staffApp.showStaffSection('staff-orders-view'); // Mostra la sezione ordini di default
    },

    // NUOVO: Funzioni per caricare/salvare/pulire token e utente (simili a quelle in script.js)
    loadTokenAndUser: function () { //
        const token = localStorage.getItem('pizzeriaAuthToken');
        const userString = localStorage.getItem('pizzeriaUser');
        if (token && userString) {
            staffApp.authToken = token;
            try {
                staffApp.currentUser = JSON.parse(userString);
            } catch (e) {
                console.error("Errore parsing utente staff da localStorage", e);
                staffApp.clearTokenAndUser();
            }
        }
    },

    clearTokenAndUser: function () {
        staffApp.authToken = null;
        staffApp.currentUser = null;
        localStorage.removeItem('pizzeriaAuthToken');
        localStorage.removeItem('pizzeriaUser');
    },

    logout: function () {
        staffApp.clearTokenAndUser();
        alert('Logout effettuato.');
        window.location.href = '/'; // Reindirizza alla pagina principale
    },

    fetchWithAuth: async function (url, options = {}) {
        const headers = {
            ...options.headers,
            'Content-Type': 'application/json', // Assumiamo JSON per la maggior parte, FormData lo gestirà da sé
        };
        if (staffApp.authToken) {
            headers['Authorization'] = `Bearer ${staffApp.authToken}`;
        }

        // Per FormData, non impostare Content-Type, il browser lo fa
        if (options.body instanceof FormData) {
            delete headers['Content-Type'];
        }

        try {
            const response = await fetch(url, { ...options, headers });
            if (response.status === 401 || response.status === 403) { // Non autorizzato o Accesso negato
                staffApp.logout(); // Effettua il logout se il token non è valido o i permessi sono insufficienti
                throw new Error('Sessione scaduta o permessi non validi. Effettuare nuovamente il login.');
            }
            return response;
        } catch (error) {
            // Se l'errore è dovuto al logout, non mostrare un altro messaggio
            if (!error.message.includes('Sessione scaduta')) {
                staffApp.displayMessage(`Errore di rete o server: ${error.message}`, 'error', document.getElementById('message-area-staff'));
            }
            throw error; // Rilancia l'errore per essere gestito dal chiamante
        }
    },

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
            if (!menuTableBody.hasChildNodes() || (menuTableBody.firstElementChild && menuTableBody.firstElementChild.tagName === 'TR' && menuTableBody.firstElementChild.textContent.includes("caricamento"))) {
                staffApp.loadAndRenderMenuItems();
            }
            staffApp.populateCategorySelect();
        }
        if (sectionId === 'staff-categories-view') {
            const categoriesTableBody = document.getElementById('categories-table-body');
            if (!categoriesTableBody.hasChildNodes() || (categoriesTableBody.firstElementChild && categoriesTableBody.firstElementChild.tagName === 'TR' && categoriesTableBody.firstElementChild.textContent.includes("caricamento"))) {
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

    resetCategoryForm: function () {
        const form = document.getElementById('category-form');
        if (form) form.reset();
        document.getElementById('edit-category-id').value = '';
        document.getElementById('category-form-title').textContent = 'Aggiungi Nuova Categoria';
        document.getElementById('save-category-btn').textContent = 'Salva Categoria';
        document.getElementById('cancel-edit-category-btn').style.display = 'none';
        staffApp.editingCategoryId = null;
    },

    // backend/public/staff_script.js

    loadAndRenderCategories: async function (selectAfterLoadId = null) {
        const tableBody = document.getElementById('categories-table-body');
        const noCategoriesMsg = document.getElementById('no-categories-staff');
        const saveOrderBtn = document.getElementById('save-category-order-btn');

        if (!tableBody || !noCategoriesMsg || !saveOrderBtn) {
            console.error("Elementi UI per la tabella categorie non trovati in loadAndRenderCategories.");
            return;
        }

        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4">Caricamento categorie...</td></tr>`; // Colspan aggiornato
        noCategoriesMsg.style.display = 'none';
        saveOrderBtn.style.display = 'none'; // Nascondi il pulsante durante il caricamento

        try {
            // Usa fetchWithAuth per includere il token JWT
            const response = await staffApp.fetchWithAuth(`${staffApp.API_BASE_URL}/api/categories`); //
            if (!response.ok) {
                // Prova a leggere il messaggio di errore dal JSON, altrimenti usa il testo di stato
                let errorMsg = `Errore HTTP: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.message || errorMsg;
                } catch (e) { /* Non fa niente se il corpo non è JSON */ }
                throw new Error(errorMsg);
            }
            const categories = await response.json(); // Le categorie sono già ordinate per 'order' dal backend

            tableBody.innerHTML = ''; // Pulisci il messaggio di caricamento

            if (categories.length === 0) {
                noCategoriesMsg.style.display = 'block';
                saveOrderBtn.style.display = 'none'; // Nessuna categoria, nessun ordine da salvare
                staffApp.populateCategorySelect(); // Popola il select nel form menu (sarà vuoto)
                return;
            }

            categories.forEach(cat => {
                const row = tableBody.insertRow();
                row.dataset.categoryId = cat._id; // Salva l'ID della categoria sulla riga per un facile accesso
                row.innerHTML = `
                <td class="px-4 py-3">${cat.name}</td>
                <td class="px-4 py-3">${cat.description || 'N/D'}</td>
                <td class="px-4 py-3 text-center">
                    <input type="number" value="${cat.order}" class="form-input category-order-input w-20 text-center" min="1" data-original-order="${cat.order}" aria-label="Ordine per ${cat.name}">
                </td>
                <td class="px-4 py-3 text-center space-x-1 whitespace-nowrap">
                    <button class="btn btn-yellow btn-sm p-2 edit-category-btn" data-id="${cat._id}" title="Modifica ${cat.name}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg>
                    </button>
                    <button class="btn btn-red btn-sm p-2 delete-category-btn" data-id="${cat._id}" title="Elimina ${cat.name}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" /></svg>
                    </button>
                </td>
            `;
            });

            // Aggiungi event listener ai pulsanti di modifica ed eliminazione
            document.querySelectorAll('.edit-category-btn').forEach(btn => btn.addEventListener('click', staffApp.handleEditCategory));
            document.querySelectorAll('.delete-category-btn').forEach(btn => btn.addEventListener('click', staffApp.handleDeleteCategory));

            // Mostra il pulsante "Salva Ordine Categorie" se ci sono categorie
            if (categories.length > 0) {
                saveOrderBtn.style.display = 'inline-block';
            }

            // Aggiorna anche il select nel form degli articoli del menu
            // e seleziona la categoria specificata da selectAfterLoadId se fornita (utile dopo aggiunta/modifica)
            staffApp.populateCategorySelect(selectAfterLoadId);

        } catch (error) {
            console.error("Errore caricamento categorie:", error);
            staffApp.displayMessage(`Errore caricamento categorie: ${error.message}`, 'error', document.getElementById('message-area-staff'));
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-red-500 py-4">Errore caricamento categorie.</td></tr>`; // Colspan aggiornato
            if (noCategoriesMsg) noCategoriesMsg.style.display = 'none'; // Nascondi se c'è l'errore in tabella
            if (saveOrderBtn) saveOrderBtn.style.display = 'none';
        }
    },

    handleSaveCategory: async function (event) {
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
            const response = await staffApp.fetchWithAuth(url, {
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

    handleSaveCategoryOrder: async function () {
        const tableBody = document.getElementById('categories-table-body');
        const rows = tableBody.querySelectorAll('tr');
        const updates = [];
        let hasChanges = false;
        const orderValues = []; // Per controllare valori duplicati

        try { // Aggiunto per gestire errori di validazione interni
            rows.forEach(row => {
                const categoryId = row.dataset.categoryId;
                const orderInput = row.querySelector('.category-order-input');
                const newOrder = parseInt(orderInput.value, 10);
                const originalOrder = parseInt(orderInput.dataset.originalOrder, 10);

                if (isNaN(newOrder) || newOrder <= 0) {
                    // Lancia un errore per interrompere e mostrare il messaggio
                    throw new Error(`Ordine non valido per la categoria "${row.cells[0].textContent}". L'ordine deve essere un numero positivo.`);
                }
                orderValues.push(newOrder);

                if (newOrder !== originalOrder) {
                    hasChanges = true;
                }
                updates.push({ id: categoryId, order: newOrder });
            });

            // Controllo opzionale per valori di ordinamento duplicati
            const uniqueOrderValues = new Set(orderValues);
            if (orderValues.length !== uniqueOrderValues.size) {
                throw new Error('I valori di ordinamento devono essere unici per ogni categoria.');
            }

            if (!hasChanges) {
                staffApp.displayMessage('Nessuna modifica all\'ordine rilevata.', 'info', document.getElementById('message-area-staff'));
                return;
            }
        } catch (validationError) { // Cattura errori di validazione (isNaN, duplicati, ecc.)
            staffApp.displayMessage(validationError.message, 'error', document.getElementById('message-area-staff'));
            return; // Interrompe l'esecuzione
        }


        try {
            const response = await staffApp.fetchWithAuth(`${staffApp.API_BASE_URL}/api/categories/reorder`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || 'Errore durante il salvataggio dell\'ordine.');
            }
            staffApp.displayMessage('Ordine delle categorie aggiornato con successo!', 'success', document.getElementById('message-area-staff'));
            await staffApp.loadAndRenderCategories(); // Ricarica per riflettere l'ordine
            await staffApp.loadAndRenderMenuItems();   // Gli item del menu potrebbero aver bisogno di essere ricaricati se il loro display dipende dall'ordine delle categorie
            await staffApp.populateCategorySelect(); // Aggiorna il dropdown nel form degli articoli del menu
        } catch (error) {
            console.error("Errore salvataggio ordine categorie:", error);
            staffApp.displayMessage(`Errore salvataggio ordine: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },

    handleEditCategory: async function (event) {
        const button = event.currentTarget;
        const categoryId = button.dataset.id;
        staffApp.editingCategoryId = categoryId;

        try {
            const response = await staffApp.fetchWithAuth(`${staffApp.API_BASE_URL}/api/categories`);
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

    handleDeleteCategory: async function (event) {
        const button = event.currentTarget;
        const categoryId = button.dataset.id;
        const categoryName = button.closest('tr').querySelector('td:nth-child(1)').textContent;

        if (!confirm(`Sei sicuro di voler eliminare la categoria "${categoryName}"? Questo potrebbe non essere possibile se ci sono articoli del menu associati.`)) {
            return;
        }

        try {
            const response = await staffApp.fetchWithAuth(`${staffApp.API_BASE_URL}/api/categories/${categoryId}`, {
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

    showQuickAddCategoryFormFromMenu: function () {
        const categoryFormContainer = document.getElementById('category-form-container');
        const menuItemFormContainer = document.getElementById('menu-item-form-container');

        staffApp.resetCategoryForm(); // Prepara il form per una nuova categoria
        document.getElementById('category-form-title').textContent = 'Aggiungi Nuova Categoria (Veloce)';
        document.getElementById('category-form').dataset.quickAdd = 'true'; // Segna come quick-add

        // Posiziona il form delle categorie vicino a quello del menu o aprilo come modal
        // Per semplicità, lo mostriamo sopra o sotto il form menu se esiste.
        // Qui assumiamo che sia già in pagina e lo rendiamo visibile.
        if (menuItemFormContainer) {
            menuItemFormContainer.parentNode.insertBefore(categoryFormContainer, menuItemFormContainer.nextSibling);
        }
        categoryFormContainer.style.display = 'block';
        document.getElementById('category-name').focus();
        categoryFormContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },


    // --- Funzioni Gestione Menu (Modificate) ---

    populateCategorySelect: async function (selectedCategoryId = null) {
        const selectElement = document.getElementById('menu-item-category-select');
        if (!selectElement) return;

        try {
            const response = await staffApp.fetchWithAuth(`${staffApp.API_BASE_URL}/api/categories`);
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
        const buttonTextSpan = toggleButton.querySelector('.button-text');

        const svgPlusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 inline-block mr-1 align-middle"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>`;
        const svgMinusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 inline-block mr-1 align-middle"><path fill-rule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clip-rule="evenodd" /></svg>`;

        const setButtonSvg = (svgString) => {
            let currentSvg = toggleButton.querySelector('svg');
            if (currentSvg) currentSvg.remove();
            toggleButton.insertAdjacentHTML('afterbegin', svgString);
        };

        if (formContainer.style.display === 'none' || formContainer.style.display === '') {
            staffApp.resetMenuItemForm();
            formTitle.textContent = 'Aggiungi Nuovo Articolo';
            formContainer.style.display = 'block';
            if (buttonTextSpan) buttonTextSpan.textContent = 'Nascondi Form Articolo'; else toggleButton.childNodes[toggleButton.childNodes.length - 1].nodeValue = ' Nascondi Form Articolo';
            setButtonSvg(svgMinusIcon);
            toggleButton.classList.replace('btn-green', 'btn-outline-secondary');
        } else {
            formContainer.style.display = 'none';
            if (buttonTextSpan) buttonTextSpan.textContent = 'Aggiungi Nuovo Articolo'; else toggleButton.childNodes[toggleButton.childNodes.length - 1].nodeValue = ' Aggiungi Nuovo Articolo';
            setButtonSvg(svgPlusIcon);
            toggleButton.classList.replace('btn-outline-secondary', 'btn-green');
        }
    },

    resetMenuItemForm: function () {
        const form = document.getElementById('menu-item-form');
        if (form) form.reset();

        document.getElementById('edit-menu-item-id').value = ''; // Questo è il MongoDB _id
        document.getElementById('menu-item-form-title').textContent = 'Aggiungi Nuovo Articolo';
        document.getElementById('save-menu-item-btn').textContent = 'Salva Articolo';
        document.getElementById('cancel-edit-menu-item-btn').style.display = 'none';
        // Il campo per 'itemId' (quello manuale) è stato rimosso dall'HTML

        const imagePreviewContainer = document.getElementById('current-image-preview-container');
        const imagePreview = document.getElementById('current-image-preview');
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imagePreview) imagePreview.src = '#';

        const imageUrlInput = document.getElementById('menu-item-image-url');
        if (imageUrlInput) imageUrlInput.value = '';

        staffApp.editingMenuItemId = null;
        staffApp.populateCategorySelect();
    },

    loadAndRenderMenuItems: async function () {
        const tableBody = document.getElementById('menu-items-table-body');
        const noMenuItemsMsg = document.getElementById('no-menu-items-staff');

        if (!tableBody || !noMenuItemsMsg) {
            console.error("Elementi UI per la tabella menu non trovati.");
            return;
        }
        // Aggiornato colspan a 5 dato che una colonna è stata rimossa
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4">Caricamento articoli menu...</td></tr>`;
        noMenuItemsMsg.style.display = 'none';

        try {
            const response = await staffApp.fetchWithAuth(`${staffApp.API_BASE_URL}/api/menu/all-items`);
            if (!response.ok) throw new Error(`Errore HTTP menu: ${response.status} - ${await response.text()}`);
            const menuItems = await response.json();

            tableBody.innerHTML = '';
            if (menuItems.length === 0) {
                noMenuItemsMsg.style.display = 'block';
                return;
            }

            menuItems.forEach(item => {
                const row = tableBody.insertRow();
                const categoryName = item.category && item.category.name ? item.category.name : 'N/D';

                // La colonna ID Art. è stata rimossa dalla tabella HTML, quindi non la aggiungiamo qui.
                // row.insertCell().innerHTML = `<span class="text-xs">${item._id}</span>`; // Rimosso

                let cellNome = row.insertCell();
                cellNome.className = "px-4 py-3"; // text-left è default per th/td
                cellNome.textContent = item.name;

                let cellCategoria = row.insertCell();
                cellCategoria.className = "px-4 py-3";
                cellCategoria.textContent = categoryName;

                let cellPrezzo = row.insertCell();
                cellPrezzo.className = "px-4 py-3 text-left";
                cellPrezzo.textContent = `€ ${parseFloat(item.price).toFixed(2)}`;

                let cellDisponibile = row.insertCell();
                cellDisponibile.className = "px-4 py-3 text-left";
                cellDisponibile.innerHTML = `
                    <label class="inline-flex items-left cursor-pointer">
                        <input type="checkbox" class="toggle-availability-cb form-checkbox" data-id="${item._id}" ${item.available ? 'checked' : ''}>
                        <span class="ml-2 text-sm">${item.available ? 'Sì' : 'No'}</span>
                    </label>`;
                const checkbox = cellDisponibile.querySelector('.toggle-availability-cb');
                if (checkbox) checkbox.addEventListener('change', staffApp.handleToggleAvailability);


                let cellAzioni = row.insertCell();
                cellAzioni.className = "px-4 py-3 text-center space-x-1 whitespace-nowrap td-actions";

                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-yellow btn-sm p-1 edit-menu-item-btn';
                editBtn.dataset.id = item._id;
                editBtn.title = "Modifica";
                editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg>`;
                editBtn.addEventListener('click', staffApp.handleEditMenuItem);
                cellAzioni.appendChild(editBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-red btn-sm p-1 delete-menu-item-btn ml-1';
                deleteBtn.dataset.id = item._id;
                deleteBtn.title = "Elimina";
                deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" /></svg>`;
                deleteBtn.addEventListener('click', staffApp.handleDeleteMenuItem);
                cellAzioni.appendChild(deleteBtn);
            });
        } catch (error) {
            console.error("Errore caricamento articoli menu:", error);
            staffApp.displayMessage(`Errore caricamento menu: ${error.message}`, 'error', document.getElementById('message-area-staff'));
            // Aggiornato colspan
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500 py-4">Errore caricamento articoli.</td></tr>`;
        }
    },

    handleSaveMenuItem: async function (event) {
        event.preventDefault();
        const form = document.getElementById('menu-item-form');
        const mongoId = document.getElementById('edit-menu-item-id').value; // Questo è _id

        const formData = new FormData(form);
        // Il campo 'itemId' (manuale) è stato rimosso dal form, quindi non sarà in formData

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
            formData.delete('imageFile'); // Non inviare imageFile se non selezionato
        }
        // L'URL immagine (formData.get('image')) sarà inviato se presente nel campo di testo

        const url = mongoId
            ? `${staffApp.API_BASE_URL}/api/menu/items/${mongoId}`
            : `${staffApp.API_BASE_URL}/api/menu/items`;
        const method = mongoId ? 'PUT' : 'POST';

        try {
            const response = await staffApp.fetchWithAuth(url, {
                method: method,
                body: formData
            });
            const result = await response.json();
            if (!response.ok) {
                const errorMessage = Array.isArray(result.errors)
                    ? result.errors.map(err => err.msg || JSON.stringify(err)).join(', ')
                    : (result.message || `Errore HTTP: ${response.status}`);
                throw new Error(errorMessage);
            }

            staffApp.displayMessage(`Articolo menu ${mongoId ? 'modificato' : 'aggiunto'} con successo!`, 'success', document.getElementById('message-area-staff'));
            staffApp.toggleMenuItemForm();
            await staffApp.loadAndRenderMenuItems();
            staffApp.resetMenuItemForm(); // Assicura che il form sia pulito
        } catch (error) {
            console.error("Errore salvataggio articolo menu:", error);
            staffApp.displayMessage(`Errore salvataggio: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },


    handleEditMenuItem: async function (event) {
        const button = event.currentTarget;
        const mongoId = button.dataset.id; // Questo è _id
        staffApp.editingMenuItemId = mongoId;

        try {
            // Fetch all items e trova quello corretto
            const response = await staffApp.fetchWithAuth(`${staffApp.API_BASE_URL}/api/menu/all-items`);
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
            const buttonTextSpan = toggleButton.querySelector('.button-text');


            formTitle.textContent = 'Modifica Articolo Menu';
            document.getElementById('edit-menu-item-id').value = itemToEdit._id;
            // Il campo per l'itemId manuale è stato rimosso dall'HTML
            document.getElementById('menu-item-name').value = itemToEdit.name;

            // Categoria: itemToEdit.category è l'ID o l'oggetto popolato. Il select si aspetta l'ID.
            const categoryIdToSelect = (itemToEdit.category && typeof itemToEdit.category === 'object') ? itemToEdit.category._id : itemToEdit.category;
            await staffApp.populateCategorySelect(categoryIdToSelect);

            document.getElementById('menu-item-price').value = parseFloat(itemToEdit.price).toFixed(2);
            document.getElementById('menu-item-description').value = itemToEdit.description || '';
            document.getElementById('menu-item-image-url').value = itemToEdit.image || '';
            document.getElementById('menu-item-image-file').value = ''; // Resetta il file input

            const imagePreviewContainer = document.getElementById('current-image-preview-container');
            const imagePreview = document.getElementById('current-image-preview');
            if (itemToEdit.image) {
                imagePreview.src = itemToEdit.image.startsWith('http') || itemToEdit.image.startsWith('/') ? itemToEdit.image : `${staffApp.API_BASE_URL}${itemToEdit.image}`;
                imagePreviewContainer.style.display = 'block';
            } else {
                imagePreviewContainer.style.display = 'none';
            }

            document.getElementById('menu-item-available').checked = itemToEdit.available;
            document.getElementById('save-menu-item-btn').textContent = 'Salva Modifiche';
            document.getElementById('cancel-edit-menu-item-btn').style.display = 'inline-block';

            if (formContainer.style.display === 'none' || formContainer.style.display === '') {
                formContainer.style.display = 'block';
                if (buttonTextSpan) buttonTextSpan.textContent = 'Nascondi Form Articolo'; else toggleButton.childNodes[toggleButton.childNodes.length - 1].nodeValue = ' Nascondi Form Articolo';
                const svgMinusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 inline-block mr-1 align-middle"><path fill-rule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clip-rule="evenodd" /></svg>`;
                let currentSvg = toggleButton.querySelector('svg');
                if (currentSvg) currentSvg.remove();
                toggleButton.insertAdjacentHTML('afterbegin', svgMinusIcon);
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
        const mongoId = checkbox.dataset.id; // _id
        const isChecked = checkbox.checked;
        try {
            const itemResponse = await staffApp.fetchWithAuth(`${staffApp.API_BASE_URL}/api/menu/all-items`);
            if (!itemResponse.ok) throw new Error('Dettagli articolo non trovati per toggle');
            const allItems = await itemResponse.json();
            const itemToUpdate = allItems.find(item => item._id === mongoId);

            if (!itemToUpdate) throw new Error('Articolo non trovato per aggiornare disponibilità.');

            const formData = new FormData();
            // Non aggiungere 'itemId' (manuale)
            formData.append('name', itemToUpdate.name);
            // itemToUpdate.category potrebbe essere un oggetto o un ID. Il backend si aspetta l'ID.
            const categoryId = (itemToUpdate.category && typeof itemToUpdate.category === 'object') ? itemToUpdate.category._id : itemToUpdate.category;
            formData.append('category', categoryId);
            formData.append('price', itemToUpdate.price);
            formData.append('description', itemToUpdate.description || '');
            formData.append('image', itemToUpdate.image || '');
            formData.append('available', isChecked.toString());
            // Invia customizableOptions se esistono e se il backend le gestisce per PUT
            if (itemToUpdate.customizableOptions) {
                formData.append('customizableOptions', JSON.stringify(itemToUpdate.customizableOptions));
            }


            const response = await staffApp.fetchWithAuth(`${staffApp.API_BASE_URL}/api/menu/items/${mongoId}`, {
                method: 'PUT',
                body: formData
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Errore HTTP: ${response.status}`);
            }
            staffApp.displayMessage(`Disponibilità di '${result.name}' aggiornata.`, 'success', document.getElementById('message-area-staff'));
            const labelSpan = checkbox.closest('label').querySelector('span');
            if (labelSpan) labelSpan.textContent = isChecked ? 'Sì' : 'No';

        } catch (error) {
            console.error("Errore aggiornamento disponibilità:", error);
            staffApp.displayMessage(`Errore aggiornamento disponibilità: ${error.message}`, 'error', document.getElementById('message-area-staff'));
            checkbox.checked = !isChecked; // Revert UI on error
        }
    },

    handleDeleteMenuItem: async function (event) {
        const button = event.currentTarget;
        const mongoId = button.dataset.id; // _id
        const itemName = button.closest('tr').querySelector('td:nth-child(2)').textContent;

        if (!confirm(`Sei sicuro di voler eliminare l'articolo "${itemName}"?`)) {
            return;
        }
        try {
            const response = await staffApp.fetchWithAuth(`${staffApp.API_BASE_URL}/api/menu/items/${mongoId}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Errore HTTP: ${response.status}`);
            }
            staffApp.displayMessage(`Articolo "${result.deletedItem.name}" eliminato.`, 'success', document.getElementById('message-area-staff'));
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
            const response = await staffApp.fetchWithAuth(`${staffApp.API_BASE_URL}/api/orders/queue`);
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
            const response = await staffApp.fetchWithAuth(`${staffApp.API_BASE_URL}/api/orders/${orderId}/status`, {
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
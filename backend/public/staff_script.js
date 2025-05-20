// backend/public/staff_script.js
const staffApp = {
    API_BASE_URL: '', // Lasciato vuoto, il frontend è servito dallo stesso server
    queueRefreshIntervalId: null, // ID per l'intervallo di aggiornamento automatico della coda
    QUEUE_REFRESH_INTERVAL_MS: 1000, // Aggiorna ogni 1 secondi
    editingMenuItemId: null, // Per tenere traccia dell'ID MongoDB (_id) dell'articolo in modifica

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

        // Gestione Coda Ordini
        document.getElementById('refresh-queue-btn').addEventListener('click', staffApp.renderOrderQueue);

        // Gestione Menu
        document.getElementById('toggle-add-menu-item-form-btn').addEventListener('click', staffApp.toggleMenuItemForm);
        document.getElementById('menu-item-form').addEventListener('submit', staffApp.handleSaveMenuItem);
        document.getElementById('cancel-edit-menu-item-btn').addEventListener('click', staffApp.resetMenuItemForm);

        // Mostra la sezione ordini di default e avvia il suo refresh
        staffApp.showStaffSection('staff-orders-view');
        // Carica anche gli articoli del menu in background o quando la scheda viene attivata la prima volta
        staffApp.loadAndRenderMenuItems();
    },

    /**
     * Mostra la sezione specificata e gestisce la logica associata (es. refresh automatico).
     * @param {string} sectionId - L'ID della sezione da visualizzare ('staff-orders-view' o 'staff-menu-view').
     */
    showStaffSection: function (sectionId) {
        // Gestione attivazione/disattivazione classi 'active' per i pulsanti delle schede
        document.querySelectorAll('.staff-nav-tab').forEach(tab => tab.classList.remove('active'));
        if (sectionId === 'staff-orders-view') {
            document.getElementById('nav-tab-orders').classList.add('active');
        } else if (sectionId === 'staff-menu-view') {
            document.getElementById('nav-tab-menu').classList.add('active');
        }

        // Gestione visibilità delle sezioni di contenuto
        document.querySelectorAll('.staff-view-section').forEach(section => section.classList.remove('active'));
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
        } else {
            console.error("Sezione non trovata:", sectionId);
            return;
        }

        // Logica specifica per la vista attivata/disattivata
        if (sectionId === 'staff-orders-view') {
            // Carica la coda ordini quando si attiva la scheda, se non già fatto o per refresh
            staffApp.renderOrderQueue();
            // Avvia/riavvia l'aggiornamento automatico della coda se non è già attivo
            if (!staffApp.queueRefreshIntervalId) {
                staffApp.queueRefreshIntervalId = setInterval(staffApp.renderOrderQueue, staffApp.QUEUE_REFRESH_INTERVAL_MS);
                console.log(`Aggiornamento automatico coda staff (ri)avviato (ogni ${staffApp.QUEUE_REFRESH_INTERVAL_MS / 1000}s).`);
            }
        } else {
            // Ferma l'aggiornamento della coda se non siamo nella vista ordini per risparmiare risorse
            if (staffApp.queueRefreshIntervalId) {
                clearInterval(staffApp.queueRefreshIntervalId);
                staffApp.queueRefreshIntervalId = null;
                console.log("Aggiornamento automatico coda staff fermato (altra vista attiva).");
            }
        }

        const menuTableBody = document.getElementById('menu-items-table-body');
        const noMenuItemsMsg = document.getElementById('no-menu-items-staff');
        if (sectionId === 'staff-menu-view') {
            // Se la tabella è vuota (o contiene solo il messaggio di "nessun item"), ricarica
            if (menuTableBody && (!menuTableBody.hasChildNodes() || (menuTableBody.firstElementChild && menuTableBody.firstElementChild.tagName === 'TR' && menuTableBody.firstElementChild.firstElementChild.colSpan === 6))) {
                staffApp.loadAndRenderMenuItems();
            }
        }
        // Assicura che il messaggio "no menu items" sia nascosto quando si cambia scheda,
        // sarà gestito da loadAndRenderMenuItems se necessario.
        if (noMenuItemsMsg) noMenuItemsMsg.style.display = 'none';
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
    resetMenuItemForm: function () {
        const form = document.getElementById('menu-item-form');
        if (form) form.reset();

        const editIdInput = document.getElementById('edit-menu-item-id');
        if (editIdInput) editIdInput.value = '';

        const formTitle = document.getElementById('menu-item-form-title');
        if (formTitle) formTitle.textContent = 'Aggiungi Nuovo Articolo';

        const saveButton = document.getElementById('save-menu-item-btn');
        if (saveButton) saveButton.textContent = 'Salva Articolo';

        const cancelButton = document.getElementById('cancel-edit-menu-item-btn');
        if (cancelButton) cancelButton.style.display = 'none';

        const itemIdInput = document.getElementById('menu-item-itemId');
        if (itemIdInput) itemIdInput.disabled = false;

        staffApp.editingMenuItemId = null;
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
            const response = await fetch(`${staffApp.API_BASE_URL}/api/menu/all-items`);
            if (!response.ok) throw new Error(`Errore HTTP: ${response.status} - ${await response.text()}`);
            const menuItems = await response.json();

            tableBody.innerHTML = '';
            noMenuItemsMsg.style.display = 'none'; // Nascondi il messaggio di default

            if (menuItems.length === 0) {
                // tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-4">Nessun articolo nel menu. Aggiungine uno!</td></tr>';
                noMenuItemsMsg.style.display = 'block'; // Mostra il messaggio se non ci sono item
                return;
            }

            menuItems.forEach(item => {
                const row = tableBody.insertRow();
                // Applica classi Tailwind direttamente alle celle per allineamento e padding
                row.innerHTML = `
                    <td class="px-4 py-3">${item.itemId}</td>
                    <td class="px-4 py-3">${item.name}</td>
                    <td class="px-4 py-3">${item.category}</td>
                    <td class="px-4 py-3 text-right">€ ${item.price.toFixed(2)}</td>
                    <td class="px-4 py-3 text-center">
                        <label class="inline-flex items-center cursor-pointer">
                            <input type="checkbox" class="toggle-availability-cb form-checkbox" data-id="${item._id}" ${item.available ? 'checked' : ''}>
                            <span class="ml-2 text-sm">${item.available ? 'Sì' : 'No'}</span>
                        </label>
                    </td>
                    <td class="px-4 py-3 text-center space-x-1 whitespace-nowrap">
                        <button class="btn btn-yellow btn-sm p-2 edit-menu-item-btn" data-id="${item._id}" title="Modifica">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg>
                        </button>
                        <button class="btn btn-red btn-sm p-2 delete-menu-item-btn" data-id="${item._id}" title="Elimina">
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
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-red-500 py-4">Errore caricamento menu.</td></tr>`;
            if (noMenuItemsMsg) noMenuItemsMsg.style.display = 'none'; // Nascondi se c'è un errore specifico nella tabella
        }
    },

    /**
     * Gestisce il salvataggio (aggiunta o modifica) di un articolo del menu.
     * @param {Event} event - L'evento di submit del form.
     */
    handleSaveMenuItem: async function (event) {
        event.preventDefault();
        const form = document.getElementById('menu-item-form');
        const mongoId = document.getElementById('edit-menu-item-id').value; // _id di MongoDB

        const formData = new FormData(form);
        const itemData = Object.fromEntries(formData.entries());
        itemData.price = parseFloat(itemData.price);
        itemData.available = document.getElementById('menu-item-available').checked;

        // ---> INIZIO MODIFICA CONSIGLIATA <---
        if (itemData.image && itemData.image.startsWith('images/')) {
            // Se l'utente scrive "images/nome.jpg" lo trasforma in "/images/nome.jpg"
            itemData.image = '/' + itemData.image;
        } else if (itemData.image && !itemData.image.startsWith('/')) {
            // Se l'utente scrive solo "nome.jpg" (improbabile dato il placeholder, ma per sicurezza)
            // e vuoi che vada in /images/, potresti fare:
            // itemData.image = '/images/' + itemData.image;
            // Tuttavia, dato il placeholder, è più probabile il caso sopra.
            // Se il placeholder è già "/images/...", questa normalizzazione potrebbe non essere strettamente necessaria
            // se gli utenti lo seguono, ma è una buona pratica per robustezza.
        }
        const url = mongoId
            ? `${staffApp.API_BASE_URL}/api/menu/items/${mongoId}`
            : `${staffApp.API_BASE_URL}/api/menu/items`;
        const method = mongoId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(itemData)
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Errore HTTP: ${response.status}`);
            }

            staffApp.displayMessage(`Articolo menu ${mongoId ? 'modificato' : 'aggiunto'} con successo!`, 'success', document.getElementById('message-area-staff'));
            staffApp.toggleMenuItemForm(); // Chiude e resetta il form
            await staffApp.loadAndRenderMenuItems(); // Ricarica la lista
        } catch (error) {
            console.error("Errore salvataggio articolo menu:", error);
            staffApp.displayMessage(`Errore salvataggio: ${error.message}`, 'error', document.getElementById('message-area-staff'));
        }
    },

    /**
     * Pre-compila il form per la modifica di un articolo esistente.
     * @param {Event} event - L'evento click sul pulsante "Modifica".
     */
    handleEditMenuItem: async function (event) {
        const button = event.currentTarget; // Usa currentTarget per l'elemento a cui è attaccato il listener
        const mongoId = button.dataset.id;
        staffApp.editingMenuItemId = mongoId;

        try {
            const response = await fetch(`${staffApp.API_BASE_URL}/api/menu/all-items`);
            if (!response.ok) throw new Error('Impossibile recuperare i dettagli dell\'articolo per la modifica.');
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
            document.getElementById('edit-menu-item-id').value = itemToEdit._id;
            document.getElementById('menu-item-itemId').value = itemToEdit.itemId;
            document.getElementById('menu-item-itemId').disabled = false; // Permetti modifica itemId, l'API ha controlli
            document.getElementById('menu-item-name').value = itemToEdit.name;
            document.getElementById('menu-item-category').value = itemToEdit.category;
            document.getElementById('menu-item-price').value = itemToEdit.price.toFixed(2);
            document.getElementById('menu-item-description').value = itemToEdit.description || '';
            document.getElementById('menu-item-image').value = itemToEdit.image || '';
            document.getElementById('menu-item-available').checked = itemToEdit.available;

            document.getElementById('save-menu-item-btn').textContent = 'Salva Modifiche';
            document.getElementById('cancel-edit-menu-item-btn').style.display = 'inline-block';

            if (formContainer.style.display === 'none') {
                formContainer.style.display = 'block';
                toggleButton.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 inline-block mr-1">
                      <path fill-rule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clip-rule="evenodd" />
                    </svg>
                    Nascondi Form Articolo`;
                toggleButton.classList.replace('btn-green', 'btn-outline-secondary');
            }
            // Scrolla al form per visibilità
            formContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });


        } catch (error) {
            console.error("Errore preparazione modifica articolo:", error);
            staffApp.displayMessage(`Errore: ${error.message}`, 'error', document.getElementById('message-area-staff'));
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
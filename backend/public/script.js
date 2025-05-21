// backend/public/script.js
const customerApp = {
    API_BASE_URL: '',
    cart: [],
    currentMenu: [],
    filteredMenu: [],
    currentCategoryFilter: 'All',
    currentUser: null,
    authToken: null,
    trackingIntervalId: null,
    TRACKING_INTERVAL_MS: 1000,
    currentConfirmedOrderDetails: null, // Per memorizzare i dettagli dell'ordine da salvare

    ORDER_STATUSES: { RICEVUTO: 'Ricevuto', IN_PREPARAZIONE: 'In Preparazione', PRONTO: 'Pronto per il Ritiro/Consegna', SERVITO: 'Servito/Consegnato', ANNULLATO: 'Annullato' },
    ORDER_STATUS_CLASSES: { RICEVUTO: 'status-ricevuto', IN_PREPARAZIONE: 'status-in-preparazione', PRONTO: 'status-pronto', SERVITO: 'status-servito', ANNULLATO: 'status-annullato' },
    ORDER_PROGRESS_MAP: { RICEVUTO: 25, IN_PREPARAZIONE: 50, PRONTO: 75, SERVITO: 100, ANNULLATO: 0 },

    init: async function () {
        customerApp.loadTokenAndUser();

        // Event Listeners Esistenti
        document.getElementById('nav-login').addEventListener('click', () => customerApp.showView('login-view'));
        document.getElementById('nav-register').addEventListener('click', () => customerApp.showView('register-view'));
        document.getElementById('nav-user-order-online').addEventListener('click', async () => {
            if (!customerApp.currentMenu || customerApp.currentMenu.length === 0) {
                await customerApp.loadMenu();
            } else {
                customerApp.applyFiltersAndRenderMenu();
            }
            customerApp.showView('customer-order-view');
        });
        document.getElementById('nav-my-orders').addEventListener('click', async () => {
            customerApp.showView('order-history-view');
            await customerApp.loadOrderHistory();
        });
        document.getElementById('nav-profile').addEventListener('click', () => {
            customerApp.showView('profile-view');
            customerApp.displayUserProfile();
        });
        document.getElementById('profile-logout-btn').addEventListener('click', customerApp.logout);
        document.getElementById('go-to-register-link').addEventListener('click', () => customerApp.showView('register-view'));
        document.getElementById('go-to-login-link').addEventListener('click', () => customerApp.showView('login-view'));
        document.getElementById('login-form').addEventListener('submit', customerApp.handleLogin);
        document.getElementById('register-form').addEventListener('submit', customerApp.handleRegister);
        document.getElementById('submit-order').addEventListener('click', customerApp.submitOrder);
        document.getElementById('new-order-button').addEventListener('click', () => {
            if (!customerApp.currentMenu || customerApp.currentMenu.length === 0) {
                customerApp.loadMenu().then(() => customerApp.showView('customer-order-view'));
            } else {
                customerApp.applyFiltersAndRenderMenu();
                customerApp.showView('customer-order-view');
            }
        });
        document.getElementById('go-to-track-from-conf').addEventListener('click', () => {
            const orderId = document.getElementById('conf-order-id').textContent;
            customerApp.navigateToTracking(orderId, 'order-confirmation-view');
        });

        const backToOrdersBtn = document.getElementById('back-to-my-orders-btn');
        if (backToOrdersBtn) {
            backToOrdersBtn.addEventListener('click', async () => {
                customerApp.showView('order-history-view');
                await customerApp.loadOrderHistory();
            });
        }

        const menuSearchInput = document.getElementById('menu-search-input');
        if (menuSearchInput) {
            menuSearchInput.addEventListener('input', (e) => {
                customerApp.applyFiltersAndRenderMenu();
            });
        }

        document.getElementById('nav-favorite-orders').addEventListener('click', async () => {
            customerApp.showView('favorite-orders-view');
            await customerApp.loadFavoriteOrders();
        });

        const saveAsFavoriteBtn = document.getElementById('save-as-favorite-btn');
        if (saveAsFavoriteBtn) {
            saveAsFavoriteBtn.addEventListener('click', customerApp.handleSaveAsFavorite);
        }

        // Event Listeners per Password Dimenticata
        const goToForgotPasswordLink = document.getElementById('go-to-forgot-password-link');
        if (goToForgotPasswordLink) { // Aggiungi un controllo se l'elemento esiste (dovrebbe essere in index.html)
            goToForgotPasswordLink.addEventListener('click', () => customerApp.showView('forgot-password-view'));
        }
        const forgotPasswordForm = document.getElementById('forgot-password-form');
        if (forgotPasswordForm) {
            forgotPasswordForm.addEventListener('submit', customerApp.handleForgotPasswordSubmit);
        }
        const backToLoginFromForgot = document.getElementById('back-to-login-from-forgot');
        if (backToLoginFromForgot) {
            backToLoginFromForgot.addEventListener('click', () => customerApp.showView('login-view'));
        }
        const resetPasswordForm = document.getElementById('reset-password-form');
        if (resetPasswordForm) {
            resetPasswordForm.addEventListener('submit', customerApp.handleResetPasswordSubmit);
        }


        const currentYearEl = document.getElementById('current-year');
        if (currentYearEl) currentYearEl.textContent = new Date().getFullYear();

        customerApp.updateNavUI();

        // Gestione Token di Reset Password dall'URL (DEVE AVVENIRE PRIMA DELLA SCELTA DELLA VISTA DI DEFAULT)
        const urlParams = new URLSearchParams(window.location.search);
        const resetToken = urlParams.get('token');
        const pathName = window.location.pathname; // es. "/", "/index.html", "/pizzeria/"

        // Controlla se il token è presente e se siamo sulla "pagina principale" (index.html o root)
        // Questo assume che il backend reindirizzi a /reset-password.html?token=TOKEN, che poi serve index.html
        if (resetToken && (pathName.endsWith('/') || pathName.endsWith('index.html') || pathName.includes('reset-password.html'))) {
            const resetTokenHiddenInput = document.getElementById('reset-token-hidden');
            if (resetTokenHiddenInput) {
                resetTokenHiddenInput.value = resetToken;
                // Rimuovi il token dall'URL per sicurezza dopo averlo letto
                // Usa il path corretto, potrebbe essere solo window.location.pathname se non ci sono altre parti dell'URL da preservare
                const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1) + (pathName.endsWith('index.html') ? 'index.html' : '');
                window.history.replaceState({}, document.title, basePath);
            } else {
                console.warn("Elemento 'reset-token-hidden' non trovato per memorizzare il token.");
            }
            customerApp.showView('reset-password-view'); // Mostra la vista di reset password
        } else if (customerApp.currentUser) {
            if ((customerApp.currentUser.role === 'staff' || customerApp.currentUser.role === 'admin') && customerApp.currentUser.isActive) {
                // Controlla che non siamo già in un tentativo di redirect infinito
                if (window.location.pathname !== '/staff' && window.location.pathname !== '/staff.html') {
                    console.log('Utente staff rilevato, reindirizzamento al pannello staff...');
                    window.location.href = '/staff'; // Reindirizza al pannello staff
                    return; // Interrompi l'init di customerApp se reindirizziamo
                }
            }
            // Se è un cliente o lo staff è già su /staff (non dovrebbe eseguire questo init), carica il menu
            await customerApp.loadMenu();
            customerApp.showView('customer-order-view');
        } else {
            customerApp.showView('login-view');
        }
    },

    clearFormErrors: function (formId) {
        const form = document.getElementById(formId);
        if (form) {
            form.querySelectorAll('.error-message').forEach(span => span.textContent = '');
            form.querySelectorAll('.form-input.invalid').forEach(input => input.classList.remove('invalid'));
        }
    },

    displayFieldError: function (fieldId, message) {
        const errorSpan = document.getElementById(`${fieldId}-error`);
        const fieldInput = document.getElementById(fieldId);
        if (errorSpan) errorSpan.textContent = message;
        if (fieldInput) fieldInput.classList.add('invalid');
    },

    validateRegistrationForm: function (name, email, password) {
        customerApp.clearFormErrors('register-form');
        let isValid = true;
        if (!name.trim()) {
            customerApp.displayFieldError('register-name', 'Il nome è obbligatorio.');
            isValid = false;
        }
        if (!email.trim()) {
            customerApp.displayFieldError('register-email', 'L\'email è obbligatoria.');
            isValid = false;
        } else if (!/^\S+@\S+\.\S+$/.test(email)) {
            customerApp.displayFieldError('register-email', 'Formato email non valido.');
            isValid = false;
        }
        if (!password) {
            customerApp.displayFieldError('register-password', 'La password è obbligatoria.');
            isValid = false;
        } else if (password.length < 6) {
            customerApp.displayFieldError('register-password', 'La password deve essere di almeno 6 caratteri.');
            isValid = false;
        }
        return isValid;
    },

    validateLoginForm: function (email, password) {
        customerApp.clearFormErrors('login-form');
        let isValid = true;
        if (!email.trim()) {
            customerApp.displayFieldError('login-email', 'L\'email è obbligatoria.');
            isValid = false;
        }
        if (!password) {
            customerApp.displayFieldError('login-password', 'La password è obbligatoria.');
            isValid = false;
        }
        return isValid;
    },

    validateCustomerName: function () {
        customerApp.clearFormErrors('cart-summary');
        const customerNameInput = document.getElementById('customer-name');
        let customerName = customerNameInput.value.trim();
        let isValid = true;
        if (!customerApp.currentUser && !customerName) {
            customerApp.displayFieldError('customer-name', 'Il nome è obbligatorio per l\'ordine.');
            customerNameInput.focus();
            isValid = false;
        }
        return isValid;
    },

    handleRegister: async function (event) {
        event.preventDefault();
        const form = event.target;
        const name = form.name.value;
        const email = form.email.value;
        const password = form.password.value;

        if (!customerApp.validateRegistrationForm(name, email, password)) {
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = `<svg class="animate-spin h-5 w-5 mr-3 inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Registrazione...`;


        try {
            const response = await fetch(`${customerApp.API_BASE_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            const data = await response.json();
            if (!response.ok) {
                if (data.errors && Array.isArray(data.errors)) {
                    data.errors.forEach(err => {
                        if (err.path === 'email') customerApp.displayFieldError('register-email', err.msg);
                    });
                    customerApp.displayMessage('Correggi gli errori nel modulo.', 'error');
                } else {
                    customerApp.displayMessage(data.message || 'Errore di registrazione', 'error');
                }
                throw new Error(data.message || 'Errore di registrazione');
            }
            customerApp.saveTokenAndUser(data.token, data.user);
            customerApp.updateNavUI();
            await customerApp.loadMenu();
            customerApp.showView('customer-order-view');
            customerApp.displayMessage(`Registrazione completata! Benvenuto, ${data.user.name}!`, 'success');
        } catch (error) {
            console.error("Errore registrazione:", error.message);
            // Non mostrare un altro displayMessage se già fatto per errori di campo
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
        }
    },

    handleLogin: async function (event) {
        event.preventDefault();
        const form = event.target;
        const email = form.email.value;
        const password = form.password.value;

        if (!customerApp.validateLoginForm(email, password)) {
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = `<svg class="animate-spin h-5 w-5 mr-3 inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Accesso...`;

        try {
            const response = await fetch(`${customerApp.API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (!response.ok) {
                customerApp.displayFieldError('login-email', ' ');
                customerApp.displayFieldError('login-password', data.message || 'Credenziali non valide.');
                throw new Error(data.message || 'Errore di login');
            }
            if (!data.user.isActive) { // Ulteriore controllo se il backend non l'ha già fatto
                customerApp.displayMessage('Account non attivo. Contatta l\'amministrazione.', 'error');
                return;
            }
            customerApp.saveTokenAndUser(data.token, data.user);
            customerApp.updateNavUI();
            if (data.user.role === 'staff' || data.user.role === 'admin') {
                // Se l'utente è staff o admin, reindirizza al pannello staff
                window.location.href = '/staff'; // Assumendo che /staff sia la route corretta
            } else {
                // Altrimenti, è un cliente, carica il menu e mostra la vista ordini
                await customerApp.loadMenu();
                customerApp.showView('customer-order-view');
                customerApp.displayMessage(`Login effettuato! Bentornato, ${data.user.name}!`, 'success');
            }
        } catch (error) {
            console.error("Errore login:", error.message);
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
        }
    },

    handleForgotPasswordSubmit: async function (event) {
        event.preventDefault();
        customerApp.clearFormErrors('forgot-password-form');
        const emailInput = document.getElementById('forgot-email');
        const email = emailInput.value.trim();

        if (!email) {
            customerApp.displayFieldError('forgot-email', 'L\'email è obbligatoria.');
            return;
        } else if (!/^\S+@\S+\.\S+$/.test(email)) {
            customerApp.displayFieldError('forgot-email', 'Formato email non valido.');
            return;
        }

        const submitButton = event.target.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.innerHTML = `<svg class="animate-spin h-5 w-5 mr-3 inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Invio...`;


        try {
            const response = await fetch(`${customerApp.API_BASE_URL}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await response.json();

            customerApp.displayMessage(data.message || 'Se l\'email è registrata, riceverai un link per il recupero.', 'success', 8000);
            event.target.reset();
            customerApp.showView('login-view');

        } catch (error) {
            console.error("Errore richiesta recupero password:", error);
            customerApp.displayMessage('Errore durante la richiesta. Riprova.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    },

    handleResetPasswordSubmit: async function (event) {
        event.preventDefault();
        customerApp.clearFormErrors('reset-password-form');
        const newPasswordInput = document.getElementById('reset-new-password');
        const confirmPasswordInput = document.getElementById('reset-confirm-password');
        const tokenInput = document.getElementById('reset-token-hidden'); // Assicurati che l'ID sia corretto
        const token = tokenInput ? tokenInput.value : null;


        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        let isValid = true;
        if (!newPassword || newPassword.length < 6) {
            customerApp.displayFieldError('reset-new-password', 'La password deve essere di almeno 6 caratteri.');
            isValid = false;
        }
        if (newPassword !== confirmPassword) {
            customerApp.displayFieldError('reset-confirm-password', 'Le password non coincidono.');
            isValid = false;
        }
        if (!token) {
            customerApp.displayMessage('Token di reset non valido o mancante. Richiedi un nuovo link.', 'error');
            customerApp.showView('login-view'); // O 'forgot-password-view'
            return;
        }
        if (!isValid) return;

        const submitButton = event.target.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.innerHTML = `<svg class="animate-spin h-5 w-5 mr-3 inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Reimpostazione...`;

        try {
            const response = await fetch(`${customerApp.API_BASE_URL}/api/auth/reset-password/${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: newPassword })
            });
            const data = await response.json();

            if (!response.ok) {
                if (data.errors && Array.isArray(data.errors)) {
                    data.errors.forEach(err => {
                        if (err.path === 'password') customerApp.displayFieldError('reset-new-password', err.msg);
                    });
                }
                throw new Error(data.message || 'Errore durante la reimpostazione della password.');
            }

            customerApp.displayMessage(data.message || 'Password reimpostata con successo! Ora puoi effettuare il login.', 'success');
            event.target.reset();
            if (tokenInput) tokenInput.value = '';
            customerApp.showView('login-view');

        } catch (error) {
            console.error("Errore reimpostazione password:", error);
            customerApp.displayMessage(error.message || 'Errore durante la reimpostazione. Riprova o richiedi un nuovo link.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    },

    logout: function () {
        customerApp.clearTokenAndUser();
        customerApp.updateNavUI();
        const menuContainer = document.getElementById('menu-categories');
        if (menuContainer) menuContainer.innerHTML = '';
        const noMenuItemsMessage = document.getElementById('no-menu-items-message');
        if (noMenuItemsMessage) noMenuItemsMessage.style.display = 'block';

        const categoryFiltersContainer = document.getElementById('menu-category-filters');
        if (categoryFiltersContainer) {
            categoryFiltersContainer.innerHTML = '';
        }

        customerApp.cart = [];
        customerApp.updateCartDisplay();

        customerApp.showView('login-view');
        customerApp.displayMessage('Logout effettuato con successo.', 'info');
    },

    submitOrder: async function () {
        if (customerApp.cart.length === 0) {
            customerApp.displayMessage('Il carrello è vuoto!', 'error'); return;
        }
        if (!customerApp.currentUser && !customerApp.validateCustomerName()) {
            return;
        }

        const customerNameInput = document.getElementById('customer-name');
        let customerName = customerApp.currentUser ? customerApp.currentUser.name : customerNameInput.value.trim();

        const headers = { 'Content-Type': 'application/json' };
        if (customerApp.authToken) {
            headers['Authorization'] = `Bearer ${customerApp.authToken}`;
        }
        const submitButton = document.getElementById('submit-order');
        const originalButtonHTML = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = `
            <svg class="animate-spin h-5 w-5 mr-3 inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            Invio in corso...`;

        try {
            const response = await fetch(`${customerApp.API_BASE_URL}/api/orders`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ customerName: customerName, cart: customerApp.cart })
            });
            const result = await response.json(); // result conterrà orderDetails
            if (!response.ok) {
                const errorMsg = result.errors ? result.errors.map(e => e.msg).join(', ') : (result.message || `Errore HTTP: ${response.status}`);
                throw new Error(errorMsg);
            }

            document.getElementById('conf-customer-name').textContent = result.orderDetails.customerName;
            document.getElementById('conf-order-id').textContent = result.orderId;
            document.getElementById('conf-wait-time').textContent = result.estimatedWaitTime;

            const confOrderSummaryEl = document.getElementById('conf-order-summary');
            if (confOrderSummaryEl) {
                confOrderSummaryEl.innerHTML = '<h4 class="font-semibold text-md mb-2 text-gray-800">Riepilogo Ordine:</h4>';
                let orderTotal = 0; // Calcoliamo il totale dal riepilogo se non fornito direttamente per currentConfirmedOrderDetails
                result.orderDetails.items.forEach(item => {
                    confOrderSummaryEl.innerHTML += `<p class="text-sm">${item.name} (x${item.quantity}) - € ${(item.price * item.quantity).toFixed(2)}</p>`;
                    if (item.customizations) {
                        confOrderSummaryEl.innerHTML += `<p class="text-xs pl-4 text-gray-500"><em>Personalizzazioni: ${item.customizations}</em></p>`;
                    }
                    orderTotal += item.price * item.quantity;
                });
                confOrderSummaryEl.innerHTML += `<p class="font-semibold mt-1">Totale: € ${orderTotal.toFixed(2)}</p>`;
            }

            customerApp.currentConfirmedOrderDetails = {
                items: result.orderDetails.items.map(item => ({
                    itemId: item.itemId, // Questo DEVE essere l'_id del MenuItem come restituito dal backend
                    originalItemId: item.originalItemId || item.itemId,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    customizations: item.customizations || ''
                })),
                // Usa il totalAmount dagli orderDetails se presente, altrimenti ricalcola
                totalAmount: typeof result.orderDetails.totalAmount !== 'undefined'
                    ? result.orderDetails.totalAmount
                    : result.orderDetails.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
            };

            const saveAsFavoriteBtn = document.getElementById('save-as-favorite-btn');
            if (customerApp.currentUser && saveAsFavoriteBtn) {
                saveAsFavoriteBtn.style.display = 'inline-block';
                saveAsFavoriteBtn.disabled = false; // Assicurati che sia abilitato
            } else if (saveAsFavoriteBtn) {
                saveAsFavoriteBtn.style.display = 'none';
            }
            // ***** FINE MODIFICHE CRUCIALI RIPRISTINATE/AGGIUNTE QUI *****

            customerApp.showView('order-confirmation-view');
            customerApp.cart = [];
            customerApp.updateCartDisplay();
            if (!customerApp.currentUser && customerNameInput) customerNameInput.value = '';

        } catch (error) {
            console.error('Errore invio ordine:', error);
            customerApp.displayMessage(`Errore invio ordine: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonHTML;
        }
    },


    loadMenu: async function () {
        const menuContainer = document.getElementById('menu-categories');
        const loadingPlaceholder = document.getElementById('menu-loading-placeholder');
        const noMenuItemsMessage = document.getElementById('no-menu-items-message');
        const categoryFiltersContainer = document.getElementById('menu-category-filters');

        if (loadingPlaceholder) loadingPlaceholder.style.display = 'block';
        if (menuContainer) menuContainer.innerHTML = ''; // Pulisci prima del caricamento
        if (noMenuItemsMessage) noMenuItemsMessage.style.display = 'none';
        if (categoryFiltersContainer) categoryFiltersContainer.innerHTML = '';


        try {
            const response = await fetch(`${customerApp.API_BASE_URL}/api/menu`);
            if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
            customerApp.currentMenu = await response.json(); // Backend now sends items with _id
            customerApp.renderCategoryFilters();
            customerApp.applyFiltersAndRenderMenu();
        } catch (error) {
            console.error('Errore caricamento menu:', error);
            customerApp.displayMessage('Impossibile caricare il menu. Riprova più tardi.', 'error');
            if (noMenuItemsMessage) noMenuItemsMessage.style.display = 'block';
            if (menuContainer) menuContainer.innerHTML = '<p class="text-red-500 text-center py-4">Errore nel caricamento del menu.</p>'; // Messaggio di errore nel contenitore
        } finally {
            if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';
        }
    },

    renderCategoryFilters: function () {
        const filtersContainer = document.getElementById('menu-category-filters');
        if (!filtersContainer || customerApp.currentMenu.length === 0) return;

        // Crea una mappa per ottenere categorie uniche con il loro ordine
        const uniqueCategoriesMap = new Map();
        customerApp.currentMenu.forEach(item => {
            if (!uniqueCategoriesMap.has(item.category)) { // item.category è il nome
                uniqueCategoriesMap.set(item.category, { name: item.category, order: item._categoryOrder });
            }
        });

        // Converti in array e ordina
        const sortedUniqueCategories = Array.from(uniqueCategoriesMap.values()).sort((a, b) => a.order - b.order);

        filtersContainer.innerHTML = ''; // Pulisci i filtri esistenti

        // Aggiungi il pulsante "All"
        const allButton = document.createElement('button');
        allButton.textContent = 'All';
        allButton.className = 'btn btn-filter';
        if ('All' === customerApp.currentCategoryFilter) {
            allButton.classList.add('active');
        }
        allButton.addEventListener('click', () => {
            customerApp.currentCategoryFilter = 'All';
            filtersContainer.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
            allButton.classList.add('active');
            customerApp.applyFiltersAndRenderMenu();
        });
        filtersContainer.appendChild(allButton);

        // Aggiungi i pulsanti per ogni categoria ordinata
        sortedUniqueCategories.forEach(catInfo => {
            const button = document.createElement('button');
            button.textContent = catInfo.name;
            button.className = 'btn btn-filter';
            if (catInfo.name === customerApp.currentCategoryFilter) {
                button.classList.add('active');
            }
            button.addEventListener('click', () => {
                customerApp.currentCategoryFilter = catInfo.name;
                filtersContainer.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                customerApp.applyFiltersAndRenderMenu();
            });
            filtersContainer.appendChild(button);
        });
    },

    // Dentro customerApp
    applyFiltersAndRenderMenu: function () {
        const menuSearchInput = document.getElementById('menu-search-input');
        const searchTerm = menuSearchInput ? menuSearchInput.value.toLowerCase().trim() : '';

        let tempFilteredMenu = [...customerApp.currentMenu];

        if (customerApp.currentCategoryFilter !== 'All') {
            // item.category è già il nome della categoria
            tempFilteredMenu = tempFilteredMenu.filter(item => item.category === customerApp.currentCategoryFilter);
        }

        if (searchTerm !== '') {
            tempFilteredMenu = tempFilteredMenu.filter(item =>
                item.name.toLowerCase().includes(searchTerm) ||
                (item.description && item.description.toLowerCase().includes(searchTerm))
            );
        }

        customerApp.filteredMenu = tempFilteredMenu;
        customerApp.renderMenu(searchTerm !== '' || customerApp.currentCategoryFilter !== 'All');
    },


    renderMenu: function (isFilteredRender = false) {
        const menuContainer = document.getElementById('menu-categories');
        const noMenuItemsMessage = document.getElementById('no-menu-items-message');
        if (!menuContainer || !noMenuItemsMessage) {
            console.error("Elementi UI per il menu non trovati in renderMenu");
            return;
        }

        menuContainer.innerHTML = ''; // Pulisci prima di renderizzare
        noMenuItemsMessage.style.display = 'none';

        // customerApp.filteredMenu è derivato da customerApp.currentMenu,
        // che è già ordinato per _categoryOrder dal backend (GET /api/menu)
        const itemsToRender = customerApp.filteredMenu;

        if (itemsToRender.length === 0) {
            if (isFilteredRender || document.getElementById('menu-search-input')?.value.trim() !== '') {
                noMenuItemsMessage.textContent = 'Nessun articolo trovato per i filtri selezionati.';
            } else {
                noMenuItemsMessage.textContent = 'Nessun articolo disponibile nel menu al momento.';
            }
            noMenuItemsMessage.style.display = 'block';
            return;
        }

        // Utilizza una Map per raggruppare gli articoli per categoria.
        // La Map preserverà l'ordine di inserimento delle chiavi (nomi delle categorie),
        // che riflette l'ordinamento ricevuto dal backend.
        const categoriesMap = new Map();
        itemsToRender.forEach(item => {
            // item.category è il nome della categoria
            if (!categoriesMap.has(item.category)) {
                categoriesMap.set(item.category, []);
            }
            categoriesMap.get(item.category).push(item);
        });

        // Itera sulla Map per creare le sezioni delle categorie nell'ordine corretto
        for (const [categoryName, itemsInCategory] of categoriesMap) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'mb-8'; // Spazio sotto ogni categoria

            // Mostra il titolo della categoria solo se il filtro non è specifico per una categoria
            // o se ci sono più categorie risultanti dal filtro.
            if (customerApp.currentCategoryFilter === 'All' || categoriesMap.size > 1) {
                categoryDiv.innerHTML = `<h3 class="text-3xl font-semibold mb-6 text-gray-800">${categoryName}</h3>`;
            }

            const itemsGrid = document.createElement('div');
            itemsGrid.className = 'grid md:grid-cols-2 xl:grid-cols-3 gap-6';

            itemsInCategory.forEach(item => { // item qui ha _id, name, price, ecc.
                const itemCard = document.createElement('div');
                itemCard.className = 'card menu-item-card p-5 flex flex-col justify-between'; //
                // L'immagine di placeholder o l'immagine effettiva
                const imageUrl = item.image || 'https://placehold.co/300x200/E2E8F0/4A5568?text=Pizza!';
                // Gestione errore caricamento immagine direttamente nell'HTML
                const imageErrorHandling = "this.onerror=null; this.src='https://placehold.co/300x200/E2E8F0/4A5568?text=Immagine+non+disponibile';";

                itemCard.innerHTML = `
                <div>
                    <img src="${imageUrl}" alt="${item.name}" class="w-full rounded-lg mb-4 shadow-md aspect-video object-cover" onerror="${imageErrorHandling}">
                    <h4 class="item-name mb-1">${item.name}</h4>
                    <p class="item-description mb-3">${item.description || ''}</p>
                </div>
                <div class="flex justify-between items-center mt-auto">
                    <p class="item-price">€ ${parseFloat(item.price).toFixed(2)}</p>
                    <button class="btn btn-primary btn-sm add-to-cart-btn" data-id="${item._id}" aria-label="Aggiungi ${item.name} al carrello">Aggiungi</button>
                </div>`;
                itemsGrid.appendChild(itemCard);
            });
            categoryDiv.appendChild(itemsGrid);
            menuContainer.appendChild(categoryDiv);
        }

        // Aggiungi event listener ai pulsanti "Aggiungi al carrello"
        document.querySelectorAll('.add-to-cart-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                // Passa l'_id dell'articolo e il pulsante stesso per il feedback visivo
                customerApp.addToCart(e.currentTarget.dataset.id, e.currentTarget);
            });
        });
    },

    loadTokenAndUser: function () {
        const token = localStorage.getItem('pizzeriaAuthToken');
        const user = localStorage.getItem('pizzeriaUser');
        if (token && user) {
            customerApp.authToken = token;
            try {
                customerApp.currentUser = JSON.parse(user);
            } catch (e) {
                console.error("Errore nel parsing dell'utente da localStorage", e);
                customerApp.clearTokenAndUser();
            }
        }
    },

    saveTokenAndUser: function (token, user) {
        customerApp.authToken = token;
        customerApp.currentUser = user;
        localStorage.setItem('pizzeriaAuthToken', token);
        localStorage.setItem('pizzeriaUser', JSON.stringify(user));
    },

    clearTokenAndUser: function () {
        customerApp.authToken = null;
        customerApp.currentUser = null;
        customerApp.currentMenu = [];
        customerApp.filteredMenu = [];
        customerApp.currentCategoryFilter = 'All';
        const menuSearchInput = document.getElementById('menu-search-input');
        if (menuSearchInput) menuSearchInput.value = '';

        localStorage.removeItem('pizzeriaAuthToken');
        localStorage.removeItem('pizzeriaUser');
    },

    updateNavUI: function () {
        const guestNavCenter = document.getElementById('guest-nav-center');
        const userNavCenter = document.getElementById('user-nav-center');
        const userNavRight = document.getElementById('user-nav-right');
        const navUsername = document.getElementById('nav-username');
        const customerNameInput = document.getElementById('customer-name');

        if (customerApp.currentUser) {
            if (guestNavCenter) guestNavCenter.style.display = 'none';
            if (userNavCenter) userNavCenter.style.display = 'flex';
            if (userNavRight) userNavRight.style.display = 'flex';
            if (navUsername) navUsername.textContent = customerApp.currentUser.name || 'Utente';
            if (customerNameInput) {
                customerNameInput.value = customerApp.currentUser.name || '';
                customerNameInput.disabled = true;
            }
        } else {
            if (guestNavCenter) guestNavCenter.style.display = 'flex';
            if (userNavCenter) userNavCenter.style.display = 'none';
            if (userNavRight) userNavRight.style.display = 'none';
            if (navUsername) navUsername.textContent = 'Utente';
            if (customerNameInput) {
                customerNameInput.value = '';
                customerNameInput.disabled = false;
            }
        }
    },

    showView: function (viewId) {
        if (customerApp.trackingIntervalId && viewId !== 'order-tracking-view') {
            clearInterval(customerApp.trackingIntervalId);
            customerApp.trackingIntervalId = null;
        }

        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.add('active');
        } else {
            console.error("Vista non trovata:", viewId);
        }

        // Pulisci errori form specifici
        if (viewId !== 'login-view') customerApp.clearFormErrors('login-form');
        if (viewId !== 'register-view') customerApp.clearFormErrors('register-form');
        if (viewId !== 'forgot-password-view') customerApp.clearFormErrors('forgot-password-form');
        if (viewId !== 'reset-password-view') customerApp.clearFormErrors('reset-password-form');

        if (viewId !== 'customer-order-view' && document.getElementById('customer-name') && !document.getElementById('customer-name').disabled) {
            customerApp.clearFormErrors('cart-summary');
        }


        if (viewId !== 'order-tracking-view') {
            const trackInput = document.getElementById('track-order-id-input');
            const trackResults = document.getElementById('tracking-results-area');
            if (trackInput) trackInput.value = '';
            if (trackResults) trackResults.innerHTML = '';
        }

        if (viewId !== 'order-confirmation-view') {
            const saveAsFavoriteBtn = document.getElementById('save-as-favorite-btn');
            if (saveAsFavoriteBtn) saveAsFavoriteBtn.style.display = 'none';
            customerApp.currentConfirmedOrderDetails = null;
        }
    },
    displayUserProfile: async function () {
        if (!customerApp.currentUser) {
            customerApp.showView('login-view');
            return;
        }
        try {
            // I dati base (nome, email) sono già in currentUser, carichiamo createdAt per completezza
            const userDetailsFromServerResponse = await fetch(`${customerApp.API_BASE_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${customerApp.authToken}` } });
            if (!userDetailsFromServerResponse.ok) throw new Error("Impossibile recuperare i dettagli dell'utente.");
            const userDetailsFromServer = await userDetailsFromServerResponse.json();

            document.getElementById('profile-name').textContent = userDetailsFromServer.name || customerApp.currentUser.name;
            document.getElementById('profile-email').textContent = userDetailsFromServer.email || customerApp.currentUser.email;

            if (userDetailsFromServer.createdAt) {
                document.getElementById('profile-created-at').textContent = new Date(userDetailsFromServer.createdAt).toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });
            } else {
                document.getElementById('profile-created-at').textContent = 'N/D';
            }
        } catch (error) {
            console.error("Errore caricamento dati profilo:", error);
            // Fallback ai dati già presenti in currentUser se il fetch fallisce
            document.getElementById('profile-name').textContent = customerApp.currentUser.name || 'N/D';
            document.getElementById('profile-email').textContent = customerApp.currentUser.email || 'N/D';
            document.getElementById('profile-created-at').textContent = 'Errore caricamento';
            customerApp.displayMessage('Errore nel caricamento dei dettagli del profilo.', 'error');
        }
    },

    loadOrderHistory: async function () {
        const historyList = document.getElementById('user-order-history-list');
        const loadingPlaceholder = document.getElementById('order-history-loading-placeholder');
        if (!historyList || !loadingPlaceholder) return;

        historyList.innerHTML = '';
        loadingPlaceholder.style.display = 'block';

        if (!customerApp.authToken) {
            historyList.innerHTML = '<p class="text-red-500 text-center py-4">Devi effettuare il login per vedere lo storico.</p>';
            loadingPlaceholder.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`${customerApp.API_BASE_URL}/api/orders/my-history`, {
                headers: { 'Authorization': `Bearer ${customerApp.authToken}` }
            });
            if (!response.ok) {
                throw new Error(`Errore caricamento storico: ${response.status}`);
            }
            const orders = await response.json();
            loadingPlaceholder.style.display = 'none';

            if (orders.length === 0) {
                historyList.innerHTML = '<p class="text-gray-500 text-center py-4">Non hai ancora effettuato ordini.</p>';
                return;
            }

            orders.forEach(order => {
                const orderCard = document.createElement('div');
                orderCard.className = 'card order-card p-4 mb-4 shadow-md';
                let itemsHtml = '<ul class="list-disc list-inside text-sm text-gray-600 mt-1 pl-1">';
                order.items.forEach(item => {
                    itemsHtml += `<li>${item.name} (x${item.quantity}) - €${(item.price * item.quantity).toFixed(2)}</li>`;
                });
                itemsHtml += '</ul>';

                const statusClass = customerApp.ORDER_STATUS_CLASSES[Object.keys(customerApp.ORDER_STATUSES).find(key => customerApp.ORDER_STATUSES[key] === order.status)] || 'bg-gray-200';

                orderCard.innerHTML = `
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-lg font-semibold text-red-700">${order.orderId}</h4>
                        <span class="badge ${statusClass}">${order.status}</span>
                    </div>
                    <p class="text-sm text-gray-500">Data: ${new Date(order.orderTime).toLocaleDateString('it-IT')} alle ${new Date(order.orderTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>
                    <p class="text-md font-semibold mt-1">Totale: €${order.totalAmount.toFixed(2)}</p>
                    <div class="mt-2"><strong>Articoli:</strong>${itemsHtml}</div>
                    <button class="btn btn-secondary btn-sm mt-4 py-2 px-3 track-this-order-btn" data-order-id="${order.orderId}" aria-label="Traccia ordine ${order.orderId}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 inline-block mr-1"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" /></svg>
                        Traccia
                    </button>
                `;
                historyList.appendChild(orderCard);
            });
            document.querySelectorAll('.track-this-order-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const orderId = e.currentTarget.dataset.orderId;
                    customerApp.navigateToTracking(orderId, 'order-history-view');
                });
            });

        } catch (error) {
            console.error('Errore caricamento storico ordini:', error);
            loadingPlaceholder.style.display = 'none';
            historyList.innerHTML = `<p class="text-red-500 text-center py-4">Impossibile caricare lo storico ordini: ${error.message}</p>`;
        }
    },

    navigateToTracking: function (orderId, originViewId) {
        const trackInput = document.getElementById('track-order-id-input');
        const backButton = document.getElementById('back-to-my-orders-btn');

        if (trackInput) trackInput.value = orderId;

        customerApp.showView('order-tracking-view');
        customerApp.trackOrder(false);

        if (backButton) {
            if (originViewId === 'order-history-view') {
                backButton.style.display = 'block';
            } else {
                backButton.style.display = 'none';
            }
        }
    },

    addToCart: function (idFromButton, buttonElement) {
        const menuItem = customerApp.currentMenu.find(item => item._id === idFromButton);
        if (!menuItem) {
            console.error("Articolo del menu non trovato con ID:", idFromButton);
            customerApp.displayMessage("Errore: articolo non trovato.", "error");
            return;
        }

        const cartItem = customerApp.cart.find(item => item.itemId === menuItem._id);
        if (cartItem) {
            cartItem.quantity++;
        } else {
            customerApp.cart.push({
                itemId: menuItem._id,
                name: menuItem.name,
                price: menuItem.price,
                quantity: 1,
                originalItemId: menuItem._id,
            });
        }
        customerApp.updateCartDisplay();

        // Feedback sul pulsante (già presente)
        if (buttonElement) {
            const originalText = "Aggiungi";
            buttonElement.innerHTML = `Aggiunto ✓`;
            buttonElement.classList.replace('btn-primary', 'btn-green');
            buttonElement.disabled = true;
            setTimeout(() => {
                buttonElement.innerHTML = originalText;
                buttonElement.classList.replace('btn-green', 'btn-primary');
                buttonElement.disabled = false;
            }, 1500);
        } else {
            customerApp.displayMessage(`${menuItem.name} aggiunto al carrello!`, 'success', 2000);
        }

        const cartSummaryEl = document.getElementById('cart-summary');
        if (cartSummaryEl) {
            cartSummaryEl.classList.remove('cart-pulse-animation'); // Rimuovi per riavviare l'animazione se cliccato rapidamente
            void cartSummaryEl.offsetWidth; // Forza il reflow del browser
            cartSummaryEl.classList.add('cart-pulse-animation');

            // Rimuovi la classe dopo che l'animazione è finita per permettere di ripeterla
            setTimeout(() => {
                cartSummaryEl.classList.remove('cart-pulse-animation');
            }, 600); // Durata dell'animazione (0.6s)
        }
    },
    removeFromCart: function (itemIdFromButton, removeAll = false) { // itemIdFromButton è _id
        const itemIndex = customerApp.cart.findIndex(item => item.itemId === itemIdFromButton);
        if (itemIndex > -1) {
            if (removeAll || customerApp.cart[itemIndex].quantity === 1) {
                customerApp.cart.splice(itemIndex, 1);
            } else {
                customerApp.cart[itemIndex].quantity--;
            }
        }
        customerApp.updateCartDisplay();
    },

    handleSaveAsFavorite: async function () {
        if (!customerApp.currentUser) {
            customerApp.displayMessage('Devi essere loggato per salvare un ordine come preferito.', 'error');
            return;
        }
        // currentConfirmedOrderDetails è già stato impostato in submitOrder
        if (!customerApp.currentConfirmedOrderDetails || !customerApp.currentConfirmedOrderDetails.items || customerApp.currentConfirmedOrderDetails.items.length === 0) {
            customerApp.displayMessage('Dettagli ordine non disponibili per il salvataggio.', 'error');
            // Questo potrebbe accadere se l'utente arriva a questa funzione senza passare da submitOrder
            // o se currentConfirmedOrderDetails non è stato popolato correttamente.
            console.error("currentConfirmedOrderDetails non è valido:", customerApp.currentConfirmedOrderDetails);
            return;
        }

        const favoriteOrderPayload = {
            items: customerApp.currentConfirmedOrderDetails.items.map(item => ({
                itemId: item.itemId,
                originalItemId: item.originalItemId || item.itemId,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                customizations: item.customizations || ''
            })),
            totalAmount: customerApp.currentConfirmedOrderDetails.totalAmount
        };

        const saveButton = document.getElementById('save-as-favorite-btn');
        const originalButtonText = saveButton.innerHTML; // Salva l'HTML intero
        saveButton.disabled = true;
        saveButton.innerHTML = `<svg class="animate-spin h-5 w-5 mr-3 inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Salvataggio...`;

        try {
            const response = await fetch(`${customerApp.API_BASE_URL}/api/users/me/favorites`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${customerApp.authToken}`
                },
                body: JSON.stringify(favoriteOrderPayload)
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || 'Errore nel salvataggio dell\'ordine preferito.');
            }
            customerApp.displayMessage('Ordine salvato nei preferiti con successo!', 'success');
            saveButton.style.display = 'none'; // Nascondi il pulsante dopo il salvataggio
        } catch (error) {
            console.error("Errore salvataggio ordine preferito:", error);
            customerApp.displayMessage(error.message || 'Impossibile salvare l\'ordine preferito.', 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = originalButtonText; // Ripristina l'HTML originale
        }
    },

    loadFavoriteOrders: async function () {
        const favList = document.getElementById('user-favorite-orders-list');
        const loadingPlaceholder = document.getElementById('favorite-orders-loading-placeholder');
        if (!favList || !loadingPlaceholder) return;

        favList.innerHTML = '';
        loadingPlaceholder.style.display = 'block';

        if (!customerApp.authToken) {
            favList.innerHTML = '<p class="text-red-500 text-center py-4">Devi effettuare il login per vedere i tuoi ordini preferiti.</p>';
            loadingPlaceholder.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`${customerApp.API_BASE_URL}/api/users/me/favorites`, {
                headers: { 'Authorization': `Bearer ${customerApp.authToken}` }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Errore caricamento preferiti: ${response.status}`);
            }
            const favorites = await response.json();
            loadingPlaceholder.style.display = 'none';

            if (favorites.length === 0) {
                favList.innerHTML = '<p class="text-gray-500 text-center py-4">Non hai ancora ordini preferiti.</p>';
                return;
            }

            favorites.forEach(favOrder => { // favOrder.items dovrebbe già avere l'ID corretto come 'itemId'
                const favCard = document.createElement('div');
                favCard.className = 'card order-card p-4 mb-4 shadow-md'; // Riusa classe simile
                let itemsHtml = '<ul class="list-disc list-inside text-sm text-gray-600 mt-1 pl-1">';
                favOrder.items.forEach(item => {
                    itemsHtml += `<li>${item.name} (x${item.quantity}) - €${(item.price * item.quantity).toFixed(2)}</li>`;
                    if (item.customizations) { // Mostra personalizzazioni se presenti
                        itemsHtml += `<li class="text-xs pl-4 text-gray-500"><em>Personalizzazioni: ${item.customizations}</em></li>`;
                    }
                });
                itemsHtml += '</ul>';

                favCard.innerHTML = `
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-lg font-semibold text-red-700">Preferito Salvato il ${new Date(favOrder.savedAt).toLocaleDateString('it-IT')}</h4>
                        <button class="btn btn-red btn-sm remove-favorite-btn" data-favorite-id="${favOrder._id}" aria-label="Rimuovi questo preferito">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd"></path></svg>
                        </button>
                    </div>
                    <div class="mt-2"><strong>Articoli:</strong>${itemsHtml}</div>
                    <p class="text-md font-semibold mt-2">Totale: €${favOrder.totalAmount.toFixed(2)}</p>
                    <button class="btn btn-primary btn-sm mt-4 reorder-favorite-btn" data-favorite-id="${favOrder._id}">Riordina Questo</button>
                `;
                favList.appendChild(favCard);
            });

            document.querySelectorAll('.reorder-favorite-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const favoriteId = e.currentTarget.dataset.favoriteId;
                    const favoriteOrder = favorites.find(fav => fav._id === favoriteId);
                    if (favoriteOrder) {
                        customerApp.reorderFavorite(favoriteOrder);
                    }
                });
            });

            document.querySelectorAll('.remove-favorite-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const favoriteId = e.currentTarget.dataset.favoriteId;
                    if (confirm('Sei sicuro di voler rimuovere questo ordine dai preferiti?')) {
                        await customerApp.removeFavoriteOrder(favoriteId);
                    }
                });
            });

        } catch (error) {
            console.error('Errore caricamento ordini preferiti:', error);
            loadingPlaceholder.style.display = 'none';
            favList.innerHTML = `<p class="text-red-500 text-center py-4">Impossibile caricare gli ordini preferiti: ${error.message}</p>`;
        }
    },

    reorderFavorite: async function (favoriteOrder) {
        console.log("Inizio Riordina Preferito. Dati Ordine Preferito:", JSON.parse(JSON.stringify(favoriteOrder)));

        if (!customerApp.currentMenu || customerApp.currentMenu.length === 0) {
            customerApp.displayMessage('Caricamento menu in corso, attendere e riprovare.', 'info');
            await customerApp.loadMenu();
            if (!customerApp.currentMenu || customerApp.currentMenu.length === 0) {
                customerApp.displayMessage('Impossibile caricare il menu per riordinare. Menu vuoto.', 'error');
                console.error("Menu ancora vuoto dopo il tentativo di caricamento in reorderFavorite.");
                return;
            }
        }
        // console.log("Menu Corrente Usato per il Riordino:", JSON.parse(JSON.stringify(customerApp.currentMenu.slice(0, 5))));

        if (customerApp.cart.length > 0) {
            if (!confirm("Il tuo carrello attuale non è vuoto. Svuotarlo per aggiungere gli articoli dell'ordine preferito?")) {
                return;
            }
        }
        customerApp.cart = [];

        let itemsSuccessfullyAdded = 0;
        let itemsNotFoundOrUnavailable = [];

        if (!favoriteOrder.items || favoriteOrder.items.length === 0) {
            customerApp.displayMessage('L\'ordine preferito selezionato non contiene articoli.', 'error');
            console.error("L'oggetto favoriteOrder non ha items o items è vuoto:", favoriteOrder);
            return;
        }

        for (const favItem of favoriteOrder.items) {
            // ***** MODIFICA CRUCIALE QUI: USA favItem.originalItemId *****
            console.log(`Processo l'articolo preferito: ${favItem.name}, ID salvato (originalItemId): ${favItem.originalItemId}`);
            const menuItem = customerApp.currentMenu.find(m => {
                return String(m._id) === String(favItem.originalItemId); // Confronta con originalItemId
            });

            if (menuItem) {
                console.log(`Articolo trovato nel menu: ${menuItem.name}, Disponibile: ${menuItem.available}`);
                if (menuItem.available) {
                    customerApp.cart.push({
                        itemId: menuItem._id, // L'itemId nel carrello è l'_id del prodotto nel menu
                        name: menuItem.name,
                        price: menuItem.price,
                        quantity: favItem.quantity,
                        originalItemId: menuItem._id, // Per coerenza, anche se preso da favItem.originalItemId
                        customizations: favItem.customizations || ''
                    });
                    itemsSuccessfullyAdded++;
                    console.log(`Aggiunto al carrello: ${menuItem.name}`);
                } else {
                    itemsNotFoundOrUnavailable.push(`${favItem.name} (non disponibile)`);
                    console.log(`Articolo Trovato ma NON DISPONIBILE: ${favItem.name}`);
                }
            } else {
                itemsNotFoundOrUnavailable.push(`${favItem.name} (non trovato nel menu attuale con ID: ${favItem.originalItemId})`);
                console.log(`Articolo NON TROVATO nel menu: ${favItem.name} con ID ${favItem.originalItemId}`);
            }
        }

        customerApp.updateCartDisplay();
        customerApp.showView('customer-order-view');
        const menuCategoriesElement = document.getElementById('menu-categories');
        if (menuCategoriesElement) {
            menuCategoriesElement.scrollIntoView({ behavior: "smooth" });
        }

        if (itemsSuccessfullyAdded > 0 && itemsNotFoundOrUnavailable.length === 0) {
            customerApp.displayMessage(`Articoli dall'ordine preferito aggiunti al carrello. Controlla e procedi!`, 'success');
        } else if (itemsSuccessfullyAdded > 0 && itemsNotFoundOrUnavailable.length > 0) {
            customerApp.displayMessage(`Alcuni articoli aggiunti. Altri non trovati/disponibili: ${itemsNotFoundOrUnavailable.join(', ')}`, 'warning', 6000);
        } else if (itemsSuccessfullyAdded === 0 && itemsNotFoundOrUnavailable.length > 0) {
            customerApp.displayMessage(`Nessun articolo dall'ordine preferito pudo essere aggiunto al carrello. Dettagli: ${itemsNotFoundOrUnavailable.join(', ')}`, 'error', 7000);
        } else if (itemsSuccessfullyAdded === 0 && itemsNotFoundOrUnavailable.length === 0 && favoriteOrder.items.length > 0) {
            customerApp.displayMessage(`Impossibile processare gli articoli dell'ordine preferito. Controllare la console per dettagli.`, 'error');
            console.error("Logica di riordino fallita in modo imprevisto.");
        } else if (itemsSuccessfullyAdded === 0 && itemsNotFoundOrUnavailable.length === 0 && favoriteOrder.items.length === 0) {
            customerApp.displayMessage(`L'ordine preferito era vuoto.`, 'warning');
        }
    },

    removeFavoriteOrder: async function (favoriteId) {
        if (!customerApp.authToken) return;
        try {
            const response = await fetch(`${customerApp.API_BASE_URL}/api/users/me/favorites/${favoriteId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${customerApp.authToken}` }
            });

            // Il resto della funzione per gestire la risposta
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.message || 'Errore rimozione ordine preferito.');
                }
                customerApp.displayMessage('Ordine preferito rimosso con successo!', 'success');
                await customerApp.loadFavoriteOrders(); // Ricarica la lista
            } else {
                // Se non è JSON, leggi come testo per vedere cosa è arrivato
                const textResponse = await response.text();
                console.error("Risposta non JSON dal server:", textResponse);
                throw new Error('Il server non ha risposto con JSON. Controlla la console del browser e del server.');
            }
        } catch (error) {
            console.error("Errore rimozione ordine preferito:", error);
            customerApp.displayMessage(error.message || 'Impossibile rimuovere l\'ordine preferito.', 'error');
        }
    },



    updateCartDisplay: function () {
        const cartItemsContainer = document.getElementById('cart-items');
        const cartTotalEl = document.getElementById('cart-total');
        if (!cartItemsContainer || !cartTotalEl) return;

        if (customerApp.cart.length === 0) {
            cartItemsContainer.innerHTML = '<p class="text-gray-500 italic">Il carrello è vuoto.</p>';
            cartTotalEl.textContent = '€ 0.00';
            return;
        }

        cartItemsContainer.innerHTML = ''; // Pulisci prima di ridisegnare
        let total = 0;
        customerApp.cart.forEach(item => { // item.itemId here is the _id
            const itemDiv = document.createElement('div');
            itemDiv.className = 'flex justify-between items-center border-b border-gray-100 py-3'; // Aggiunto py-3
            itemDiv.innerHTML = `
                <div class="flex-grow pr-2"> <p class="font-medium text-gray-700">${item.name} (x${item.quantity})</p>
                    <p class="text-sm text-gray-500">€ ${(item.price * item.quantity).toFixed(2)}</p>
                </div>
                <div class="flex items-center ml-2">
                    <button class="text-red-500 hover:text-red-700 font-bold p-1 change-quantity-btn" data-id="${item.itemId}" data-action="decrease" title="Riduci quantità" aria-label="Riduci quantità di ${item.name}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clip-rule="evenodd" /></svg>
                    </button>
                    <button class="text-sm text-gray-400 hover:text-red-600 font-semibold p-1 ml-1 change-quantity-btn" data-id="${item.itemId}" data-action="remove" title="Rimuovi articolo" aria-label="Rimuovi ${item.name} dal carrello">
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" /></svg>
                    </button>
                </div>`;
            cartItemsContainer.appendChild(itemDiv);
            total += item.price * item.quantity;
        });
        cartTotalEl.textContent = `€ ${total.toFixed(2)}`;

        document.querySelectorAll('.change-quantity-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const itemIdFromCartButton = e.currentTarget.dataset.id; // This is itemId (which holds _id)
                const action = e.currentTarget.dataset.action;
                if (action === 'decrease') customerApp.removeFromCart(itemIdFromCartButton, false);
                else if (action === 'remove') customerApp.removeFromCart(itemIdFromCartButton, true);
            });
        });
    },

    _updateTrackingUI: function (order) {
        const resultsArea = document.getElementById('tracking-results-area');
        if (!resultsArea) return;

        const statusSteps = [customerApp.ORDER_STATUSES.RICEVUTO, customerApp.ORDER_STATUSES.IN_PREPARAZIONE, customerApp.ORDER_STATUSES.PRONTO, customerApp.ORDER_STATUSES.SERVITO];
        let stepsHtml = '<div class="progress-steps">';
        let currentStatusFoundOnTrack = false;
        statusSteps.forEach(step => {
            let stepClass = 'progress-step';
            const historyEntry = order.statusHistory.find(h => h.status === step);
            if (historyEntry) stepClass += ' completed';
            if (order.status === step && !currentStatusFoundOnTrack) {
                if (step !== customerApp.ORDER_STATUSES.SERVITO || !order.statusHistory.find(h => h.status === customerApp.ORDER_STATUSES.SERVITO)) {
                    stepClass = stepClass.replace(' completed', '');
                    stepClass += ' active';
                    currentStatusFoundOnTrack = true;
                }
            }
            stepsHtml += `<div class="${stepClass}">${step}</div>`;
        });
        stepsHtml += '</div>';

        let progressBarWidth = customerApp.ORDER_PROGRESS_MAP[Object.keys(customerApp.ORDER_STATUSES).find(key => customerApp.ORDER_STATUSES[key] === order.status)] || 0;
        if (order.status === customerApp.ORDER_STATUSES.ANNULLATO) progressBarWidth = 0;

        let detailsHtml = `
            <h3 class="text-xl font-semibold mb-2 text-center text-gray-800">Stato Ordine: ${order.orderId}</h3>
            <p class="text-center text-lg mb-3 text-gray-600">Cliente: <span class="font-medium">${order.customerName}</span></p>
            ${stepsHtml}
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${progressBarWidth}%;">${progressBarWidth > 0 ? progressBarWidth + '%' : ''}</div>
            </div>
            <p class="text-center text-xl font-semibold mb-4 ${customerApp.ORDER_STATUS_CLASSES[Object.keys(customerApp.ORDER_STATUSES).find(key => customerApp.ORDER_STATUSES[key] === order.status)] || ''} p-3 rounded-md">
                Stato Attuale: ${order.status}
            </p>`;

        if (order.status === customerApp.ORDER_STATUSES.RICEVUTO || order.status === customerApp.ORDER_STATUSES.IN_PREPARAZIONE) {
            const now = new Date();
            const estimatedReady = new Date(order.estimatedReadyTime);
            let remainingMinutes = Math.round((estimatedReady - now) / 60000);
            if (remainingMinutes < 0) remainingMinutes = 0;
            detailsHtml += `<p class="text-center text-gray-700 mb-2">Tempo stimato rimanente: circa ${remainingMinutes} minuti.</p>`;
        } else if (order.status === customerApp.ORDER_STATUSES.PRONTO) {
            detailsHtml += `<p class="text-center text-green-600 font-semibold mb-2">Il tuo ordine è pronto!</p>`;
            if (order.actualReadyTime) detailsHtml += `<p class="text-center text-sm text-gray-500">Pronto alle: ${new Date(order.actualReadyTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>`;
        } else if (order.status === customerApp.ORDER_STATUSES.SERVITO) {
            detailsHtml += `<p class="text-center text-blue-600 font-semibold mb-2">Ordine ritirato/consegnato. Grazie!</p>`;
            if (order.servedTime) detailsHtml += `<p class="text-center text-sm text-gray-500">Servito alle: ${new Date(order.servedTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>`;
        } else if (order.status === customerApp.ORDER_STATUSES.ANNULLATO) {
            detailsHtml += `<p class="text-center text-red-600 font-semibold mb-2">Questo ordine è stato annullato.</p>`;
        }

        detailsHtml += '<h4 class="font-semibold mt-6 mb-2 text-gray-700">Riepilogo Articoli:</h4><ul class="list-disc list-inside text-sm text-gray-600 mb-4 pl-1">';
        let totalTrackedOrderPrice = 0;
        order.items.forEach(item => {
            detailsHtml += `<li>${item.name} (x${item.quantity}) - € ${(item.price * item.quantity).toFixed(2)}</li>`;
            totalTrackedOrderPrice += item.price * item.quantity;
        });
        detailsHtml += `</ul><p class="font-semibold text-right text-lg mt-2">Totale Ordine: € ${totalTrackedOrderPrice.toFixed(2)}</p>`;

        resultsArea.innerHTML = detailsHtml;

        if (order.status === customerApp.ORDER_STATUSES.SERVITO || order.status === customerApp.ORDER_STATUSES.ANNULLATO) {
            if (customerApp.trackingIntervalId) {
                clearInterval(customerApp.trackingIntervalId);
                customerApp.trackingIntervalId = null;
            }
        }
    },

    trackOrder: async function (isManualSearch = true) {
        const orderIdToTrackInput = document.getElementById('track-order-id-input');
        const resultsArea = document.getElementById('tracking-results-area');
        if (!orderIdToTrackInput || !resultsArea) return;

        const orderIdToTrack = orderIdToTrackInput.value.trim().toUpperCase();

        if (isManualSearch && customerApp.trackingIntervalId) {
            clearInterval(customerApp.trackingIntervalId);
            customerApp.trackingIntervalId = null;
        }

        if (!orderIdToTrack) {
            if (isManualSearch) resultsArea.innerHTML = '<p class="text-red-600 text-center">Inserisci un ID Ordine.</p>';
            if (customerApp.trackingIntervalId) {
                clearInterval(customerApp.trackingIntervalId);
                customerApp.trackingIntervalId = null;
            }
            return;
        }
        if (isManualSearch || !resultsArea.innerHTML.includes(orderIdToTrack)) {
            resultsArea.innerHTML = '<div class="spinner"></div><p class="text-center text-gray-600">Ricerca ordine in corso...</p>';
        }

        try {
            const response = await fetch(`${customerApp.API_BASE_URL}/api/orders/track/${orderIdToTrack}`);
            if (!response.ok) {
                if (response.status === 404) {
                    resultsArea.innerHTML = `<p class="text-red-600 text-center">Ordine ID "${orderIdToTrack}" non trovato.</p>`;
                } else {
                    const errorData = await response.json().catch(() => ({ message: `Errore HTTP: ${response.status}` }));
                    throw new Error(errorData.message || `Errore HTTP: ${response.status}`);
                }
                if (customerApp.trackingIntervalId) {
                    clearInterval(customerApp.trackingIntervalId);
                    customerApp.trackingIntervalId = null;
                }
                return;
            }
            const order = await response.json();
            customerApp._updateTrackingUI(order);

            if (order.status !== customerApp.ORDER_STATUSES.SERVITO &&
                order.status !== customerApp.ORDER_STATUSES.ANNULLATO) {
                if (isManualSearch || !customerApp.trackingIntervalId) {
                    if (customerApp.trackingIntervalId) clearInterval(customerApp.trackingIntervalId);

                    customerApp.trackingIntervalId = setInterval(async () => {
                        const currentInputIdEl = document.getElementById('track-order-id-input');
                        const currentInputId = currentInputIdEl ? currentInputIdEl.value.trim().toUpperCase() : "";

                        if (currentInputId !== orderIdToTrack && customerApp.trackingIntervalId) {
                            clearInterval(customerApp.trackingIntervalId);
                            customerApp.trackingIntervalId = null;
                            return;
                        }
                        try {
                            const refreshResponse = await fetch(`${customerApp.API_BASE_URL}/api/orders/track/${orderIdToTrack}`);
                            if (!refreshResponse.ok) {
                                clearInterval(customerApp.trackingIntervalId);
                                customerApp.trackingIntervalId = null;
                                return;
                            }
                            const refreshedOrder = await refreshResponse.json();
                            customerApp._updateTrackingUI(refreshedOrder);
                        } catch (refreshError) {
                            console.error("Errore durante l'aggiornamento automatico:", refreshError);
                        }
                    }, customerApp.TRACKING_INTERVAL_MS);
                }
            } else {
                if (customerApp.trackingIntervalId) {
                    clearInterval(customerApp.trackingIntervalId);
                    customerApp.trackingIntervalId = null;
                }
            }
        } catch (error) {
            console.error('Errore tracciamento ordine:', error);
            resultsArea.innerHTML = `<p class="text-red-600 text-center">Errore nel tracciamento: ${error.message}</p>`;
            if (customerApp.trackingIntervalId) {
                clearInterval(customerApp.trackingIntervalId);
                customerApp.trackingIntervalId = null;
            }
        }
    },

    displayMessage: function (message, type = 'info', duration = 4000) {
        const messageArea = document.getElementById('message-area-customer');
        if (!messageArea) return;

        // Rimuovi classi di animazione precedenti se presenti
        messageArea.classList.remove('message-enter', 'message-enter-active', 'message-exit', 'message-exit-active');
        void messageArea.offsetWidth; // Forza reflow

        messageArea.textContent = message;
        // Applica classi di stile base + tipo
        messageArea.className = 'mb-6 text-center p-3 rounded-md border '; // Classi base
        if (type === 'success') messageArea.classList.add('bg-green-100', 'text-green-700', 'border-green-300');
        else if (type === 'error') messageArea.classList.add('bg-red-100', 'text-red-700', 'border-red-300');
        else messageArea.classList.add('bg-blue-100', 'text-blue-700', 'border-blue-300'); // Default a info

        // Animazione di entrata
        messageArea.classList.add('message-enter');
        requestAnimationFrame(() => { // Permette al browser di registrare la classe prima di aggiungere quella attiva
            messageArea.classList.add('message-enter-active');
        });

        // Pulisci timeout precedente se esiste
        const existingTimeoutId = messageArea.dataset.timeoutId;
        if (existingTimeoutId) {
            clearTimeout(parseInt(existingTimeoutId));
        }
        const existingExitTimeoutId = messageArea.dataset.exitTimeoutId;
        if (existingExitTimeoutId) {
            clearTimeout(parseInt(existingExitTimeoutId));
        }

        // Timeout per far scomparire il messaggio
        const timeoutId = setTimeout(() => {
            messageArea.classList.remove('message-enter', 'message-enter-active');
            messageArea.classList.add('message-exit');
            requestAnimationFrame(() => {
                messageArea.classList.add('message-exit-active');
            });

            // Pulisci completamente dopo l'animazione di uscita
            const exitTimeoutId = setTimeout(() => {
                messageArea.textContent = '';
                messageArea.className = 'mb-6 text-center'; // Resetta classi
                messageArea.removeAttribute('data-timeout-id');
                messageArea.removeAttribute('data-exit-timeout-id');
            }, 300); // Durata dell'animazione di uscita
            messageArea.dataset.exitTimeoutId = exitTimeoutId.toString();

        }, duration);
        messageArea.dataset.timeoutId = timeoutId.toString();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    customerApp.init();
});
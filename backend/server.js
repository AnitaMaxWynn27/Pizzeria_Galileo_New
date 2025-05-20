// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult, param } = require('express-validator');
const crypto = require('crypto'); // Per generare token di reset password
const multer = require('multer'); // <--- AGGIUNGI MULTER
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://andrea:Nmpl152IoExZy8a7@pizzeria.5ptphrj.mongodb.net/?retryWrites=true&w=majority&appName=Pizzeria';
const JWT_SECRET = process.env.JWT_SECRET;
console.log("JWT_SECRET in server.js:", JWT_SECRET ? "Definito" : "NON DEFINITO!!!"); // Aggiungi questo
if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET non è definito. Impostalo nelle variabili d'ambiente.");
    process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Nuova rotta per servire le immagini caricate
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // <--- NUOVA RIGA

// --- Configurazione Multer ---
const UPLOADS_MENU_ITEMS_DIR = path.join(__dirname, 'uploads', 'menu_items');
// Crea la cartella se non esiste
if (!fs.existsSync(UPLOADS_MENU_ITEMS_DIR)) {
    fs.mkdirSync(UPLOADS_MENU_ITEMS_DIR, { recursive: true });
}

const menuItemsStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_MENU_ITEMS_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const imageFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Solo file immagine sono permessi!'), false);
    }
};

const uploadMenuItemImage = multer({
    storage: menuItemsStorage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // Limite di 5MB
});

// --- Connessione a MongoDB ---
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Connesso a MongoDB con successo!');
        seedDatabase();
    })
    .catch(err => {
        console.error('Errore di connessione a MongoDB:', err);
        process.exit(1);
    });

// --- Schemi e Modelli Mongoose ---

// Schema Utente Aggiornato
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ['customer', 'staff', 'admin'], // Ruoli possibili
        default: 'customer' // Ruolo di default per nuovi utenti
    },
    isActive: { type: Boolean, default: true }, // Per disattivare account
    createdAt: { type: Date, default: Date.now },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    favoriteOrders: [{
        savedAt: { type: Date, default: Date.now },
        items: [{
            originalItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }, // Corrected
            name: String,
            price: Number,
            quantity: Number,
            customizations: String
        }],
        totalAmount: Number
    }]
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};
const User = mongoose.model('User', userSchema);

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true, default: '' }, // Descrizione opzionale
    // Potresti aggiungere altri campi se necessario, es: order (per l'ordinamento)
    createdAt: { type: Date, default: Date.now }
});
const Category = mongoose.model('Category', categorySchema);
// Schema MenuItem Aggiornato (per opzioni di personalizzazione future)
const customizableOptionSchema = new mongoose.Schema({
    name: { type: String, required: true }, // Es. "Extra Formaggio", "Senza Cipolle"
    priceChange: { type: Number, required: true, default: 0 } // Es. 0.50 per aggiunta, -0.20 per rimozione
}, { _id: false });

const menuItemSchema = new mongoose.Schema({
    // itemId: { type: String, required: true, unique: true, trim: true }, // RIMOSSO
    name: { type: String, required: true, trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
    image: { type: String, trim: true },
    available: { type: Boolean, default: true },
    customizableOptions: [customizableOptionSchema]
});
const MenuItem = mongoose.model('MenuItem', menuItemSchema);

// Schema OrderItem Aggiornato
const orderItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    originalItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }, // If it refers to another MenuItem _id
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    customizations: { type: String }
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
    status: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    items: [orderItemSchema], // Usa lo schema aggiornato
    status: { type: String, required: true, default: 'Ricevuto' },
    orderTime: { type: Date, default: Date.now },
    estimatedReadyTime: Date,
    initialEstimateMinutes: Number,
    actualReadyTime: Date,
    servedTime: Date,
    statusHistory: [statusHistorySchema],
    totalAmount: { type: Number, required: true }
});
const Order = mongoose.model('Order', orderSchema);

const initialCategories = [
    { name: 'Pizze Rosse', description: 'Le classiche pizze con base pomodoro.' },
    { name: 'Pizze Bianche', description: 'Pizze senza base pomodoro, con mozzarella e altri ingredienti.' },
    { name: 'Bibite', description: 'Bevande analcoliche e birre.' }
    // Aggiungi altre categorie se necessario, es. Dessert
];

const initialMenuItemsData = [
    {
        name: 'Margherita', categoryName: 'Pizze Rosse', price: 7.50,
        description: 'Pomodoro San Marzano DOP, Fiordilatte, Basilico fresco, Olio EVO',
        image: '/images/Margherita.png', // Percorso relativo alla cartella public
        available: true,
    },
    {
        name: 'Diavola', categoryName: 'Pizze Rosse', price: 8.50,
        description: 'Pomodoro San Marzano DOP, Fiordilatte, Salame piccante',
        image: '/images/Diavola.png',
        available: true,
    },
    {
        name: 'Capricciosa', categoryName: 'Pizze Rosse', price: 9.50,
        description: 'Pomodoro, Mozzarella, Prosciutto cotto, Funghi, Carciofini, Olive',
        image: '/images/Capricciosa.png',
        available: true,
    },
    {
        name: 'Quattro Formaggi', categoryName: 'Pizze Bianche', price: 9.00,
        description: 'Fiordilatte, Gorgonzola DOP, Fontina, Parmigiano Reggiano',
        image: '/images/QuattroFormaggi.png',
        available: true,
    },
    {
        name: 'Boscaiola', categoryName: 'Pizze Bianche', price: 10.00,
        description: 'Mozzarella, Salsiccia fresca, Funghi porcini',
        image: '/images/Boscaiola.png', // Assumendo che tu abbia questa immagine in public/images
        available: true,
    },
    {
        name: 'Acqua Naturale', categoryName: 'Bibite', price: 1.50,
        description: 'Bottiglia 50cl',
        image: '/images/Acqua.png',
        available: true,
    },
    {
        name: 'Coca Cola', categoryName: 'Bibite', price: 2.50,
        description: 'Lattina 33cl',
        image: '/images/CocaCola.jpg', // Nota: questa è .jpg come da tuo screenshot
        available: true,
    },
    {
        name: 'Birra Artigianale', categoryName: 'Bibite', price: 4.50,
        description: 'Bottiglia 33cl - Chiara',
        image: '/images/Birra.png',
        available: true,
    }
];

async function seedDatabase() {
    try {
        const adminUserCount = await User.countDocuments({ role: 'admin' });
        if (adminUserCount === 0) {
            console.log('Nessun utente admin trovato, creo un admin di esempio...');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('adminpassword', salt); // Cambia questa password!
            await User.create({
                name: 'Admin Pizzeria',
                email: 'admin@pizzeria.com', // Cambia questa email
                password: hashedPassword,
                role: 'admin',
                isActive: true
            });
            console.log('Utente admin di esempio creato con email: admin@pizzeria.com e password: adminpassword');
            console.log('IMPORTANTE: Cambia queste credenziali dopo il primo login o direttamente nel database!');
        } else {
            console.log('Utente admin già presente, skipping seeding utente admin.');
        }
        // Seeding Categorie
        const categoryCount = await Category.countDocuments();
        if (categoryCount === 0) {
            console.log('Nessuna categoria trovata, popolo con i dati iniziali...');
            await Category.insertMany(initialCategories);
            console.log('Categorie popolate con successo.');
        } else {
            console.log('Categorie già presenti, skipping seeding categorie.');
        }

        // Seeding Articoli Menu
        const menuItemCount = await MenuItem.countDocuments();
        if (menuItemCount === 0) {
            console.log('Nessun articolo nel menu trovato, popolo con i dati iniziali...');

            const categoriesFromDB = await Category.find();
            const categoryMap = {};
            categoriesFromDB.forEach(cat => {
                categoryMap[cat.name] = cat._id;
            });

            const menuItemsToInsert = initialMenuItemsData.map(item => {
                const categoryId = categoryMap[item.categoryName];
                if (!categoryId) {
                    console.warn(`Categoria "${item.categoryName}" non trovata per l'articolo "${item.name}". L'articolo sarà saltato.`);
                    return null; // Salta questo articolo se la categoria non esiste
                }
                return {
                    name: item.name,
                    category: categoryId,
                    price: item.price,
                    description: item.description,
                    image: item.image,
                    available: item.available,
                    customizableOptions: item.customizableOptions || []
                };
            }).filter(item => item !== null); // Rimuovi eventuali item saltati

            if (menuItemsToInsert.length > 0) {
                await MenuItem.insertMany(menuItemsToInsert);
                console.log(`${menuItemsToInsert.length} articoli del menu popolati con successo.`);
            } else {
                console.log("Nessun articolo del menu da inserire dopo il mapping delle categorie.");
            }
        } else {
            console.log('Articoli del menu già presenti, skipping seeding articoli.');
        }

    } catch (error) {
        console.error('Errore durante il popolamento del database:', error);
    }
}
// --- Middleware di Autenticazione ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
        return res.status(401).json({ message: 'Accesso negato. Nessun token fornito.' });
    }
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ message: 'Accesso negato. Token malformato.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        console.error("Errore verifica token:", err.message);
        res.status(401).json({ message: 'Token non valido.' });
    }
};

// NUOVO: Middleware per autorizzare solo staff o admin
const authorizeStaff = (req, res, next) => {
    if (!req.user || (req.user.role !== 'staff' && req.user.role !== 'admin')) {
        return res.status(403).json({ message: 'Accesso negato. Permessi insufficienti.' });
    }
    if (!req.user.isActive) { // Controlla se l'account staff è attivo
        return res.status(403).json({ message: 'Accesso negato. Account non attivo.' });
    }
    next();
};

// NUOVO: Middleware per autorizzare solo admin (se serviranno distinzioni future)
const authorizeAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Accesso negato. Solo amministratori.' });
    }
    if (!req.user.isActive) {
        return res.status(403).json({ message: 'Accesso negato. Account non attivo.' });
    }
    next();
};

// --- Costanti e Funzioni Helper Ordini ---
async function getNextOrderIdCounter() {
    const lastOrder = await Order.findOne().sort({ orderTime: -1 });
    if (lastOrder && lastOrder.orderId && lastOrder.orderId.startsWith('ORD')) {
        const lastIdNum = parseInt(lastOrder.orderId.substring(3), 10);
        if (!isNaN(lastIdNum)) return lastIdNum + 1;
    }
    return 1;
}
const AVG_PREP_TIME_PER_ORDER_MINUTES = 12;
const ORDER_STATUSES = { RICEVUTO: 'Ricevuto', IN_PREPARAZIONE: 'In Preparazione', PRONTO: 'Pronto per il Ritiro/Consegna', SERVITO: 'Servito/Consegnato', ANNULLATO: 'Annullato' };
async function generateOrderId() {
    const currentCounter = await getNextOrderIdCounter();
    return `ORD${String(currentCounter).padStart(3, '0')}`;
}
function calculateEstimatedWaitTime(currentOrderQueueLength) {
    const baseWait = (currentOrderQueueLength * AVG_PREP_TIME_PER_ORDER_MINUTES) + AVG_PREP_TIME_PER_ORDER_MINUTES;
    const minWait = Math.max(AVG_PREP_TIME_PER_ORDER_MINUTES, baseWait - 5);
    const maxWait = baseWait + 5;
    return { min: minWait, max: maxWait, average: baseWait };
}


// --- API Endpoints Autenticazione (Aggiornati per Reset Password) ---
// POST /api/auth/register 
app.post('/api/auth/register', [
    body('name').not().isEmpty().trim().escape(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ errors: [{ msg: 'Utente già esistente', path: 'email' }] });

        user = new User({ name, email, password, role: 'customer' }); // Ruolo 'customer' di default
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        // Includi il ruolo nel payload del token
        const payload = { user: { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
            if (err) throw err;
            res.status(201).json({ token, user: payload.user });
        });
    } catch (err) {
        console.error("Errore registrazione:", err.message);
        res.status(500).send('Errore del server');
    }
});

// POST /api/auth/login (come prima)
app.post('/api/auth/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').exists()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Credenziali non valide' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(400).json({ message: 'Credenziali non valide' });

        if (!user.isActive) { // Controlla se l'account è attivo
            return res.status(403).json({ message: 'Account disattivato. Contatta l\'amministrazione.' });
        }

        // Includi il ruolo nel payload del token
        const payload = { user: { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user: payload.user }); // Invia anche i dati utente con il ruolo
        });
    } catch (err) {
        console.error("Errore login:", err.message);
        res.status(500).send('Errore del server');
    }
});

// GET /api/auth/me (come prima)
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        // req.user è già popolato dal token, ma facciamo un fetch per dati aggiornati se necessario
        const user = await User.findById(req.user.id).select('-password -passwordResetToken -passwordResetExpires');
        if (!user || !user.isActive) { // Controlla anche se è attivo
            return res.status(404).json({ message: "Utente non trovato o non attivo." });
        }
        // Restituisci i dati utente inclusi nome, email, ruolo, createdAt, isActive
        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
            isActive: user.isActive
            // Non inviare l'intero oggetto user se contiene campi sensibili non deselezionati
        });
    } catch (err) {
        console.error("Errore /api/auth/me:", err.message);
        res.status(500).send('Errore del server');
    }
});

// POST /api/auth/forgot-password
app.post('/api/auth/forgot-password', [
    body('email', 'Inserisci una email valida').isEmail().normalizeEmail()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            // Non rivelare se l'email esiste o meno per motivi di sicurezza
            console.log(`Richiesta recupero password per email non trovata: ${req.body.email}`);
            return res.status(200).json({ message: 'Se l\'email è registrata, riceverai un link per il recupero.' });
        }

        // Genera token
        const resetToken = crypto.randomBytes(20).toString('hex');
        user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex'); // Salva l'hash
        user.passwordResetExpires = Date.now() + 3600000; // 1 ora di validità

        await user.save();

        // Crea URL di reset (per ambiente di sviluppo, potrebbe essere localhost)
        // Per produzione, dovrai configurare il domain corretto
        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${resetToken}`; // Assumendo che hai una pagina reset-password.html

        // Simula invio email (DA SOSTITUIRE CON VERO INVIO EMAIL)
        console.log('------------------------------------------------------------------');
        console.log('SIMULAZIONE INVIO EMAIL PER RESET PASSWORD');
        console.log(`A: ${user.email}`);
        console.log(`Oggetto: Reset Password Pizzeria`);
        console.log(`Messaggio: Hai richiesto il reset della password. Clicca su questo link per procedere: ${resetUrl}`);
        console.log('Token originale (solo per debug, non inviare in email reale):', resetToken);
        console.log('------------------------------------------------------------------');
        // Fine simulazione

        res.status(200).json({ message: 'Se l\'email è registrata, riceverai un link per il recupero.' });

    } catch (error) {
        console.error("Errore forgot-password:", error);
        res.status(500).json({ message: "Errore durante la richiesta di recupero password." });
    }
});

// POST /api/auth/reset-password/:token
app.post('/api/auth/reset-password/:token', [
    param('token').isHexadecimal().withMessage('Token non valido.'), // Valida che il token sia esadecimale
    body('password', 'La nuova password deve essere di almeno 6 caratteri').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() } // Controlla che il token non sia scaduto
        });

        if (!user) {
            return res.status(400).json({ message: 'Token di reset password non valido o scaduto.' });
        }

        // Imposta la nuova password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(req.body.password, salt);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        // Opzionale: Logga l'utente automaticamente o invia un token JWT
        const payload = { user: { id: user.id, name: user.name, email: user.email } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
            if (err) { // Non bloccare se il token non può essere generato, il reset è comunque avvenuto
                console.error("Errore generazione token dopo reset password:", err);
                return res.status(200).json({ message: 'Password resettata con successo. Effettua il login.' });
            }
            res.status(200).json({ message: 'Password resettata con successo.', token, user: payload.user });
        });

    } catch (error) {
        console.error("Errore reset-password:", error);
        res.status(500).json({ message: "Errore durante il reset della password." });
    }
});


// --- API Endpoints Menu (come prima, con riferimento a customizableOptions) ---
app.get('/api/menu', async (req, res) => {
    try {
        const menuItems = await MenuItem.find({ available: true }).populate('category');
        res.json(menuItems.map(item => ({
            _id: item._id, // Invia il vero _id
            name: item.name,
            category: item.category ? item.category.name : 'Senza Categoria',
            _categoryId: item.category ? item.category._id : null,
            price: item.price,
            description: item.description,
            image: item.image,
            available: item.available,
            customizableOptions: item.customizableOptions
        })));
    } catch (error) {
        console.error("Errore recupero menu per cliente:", error);
        res.status(500).json({ message: "Errore recupero menu", error: error.message });
    }
});

// ... (altri endpoint menu come /api/menu/all-items, POST, PUT, DELETE - potrebbero aver bisogno di gestire customizableOptions se modificabili dallo staff)
// GET /api/menu/all-items (per staff)
app.get('/api/menu/all-items',  authMiddleware, authorizeStaff, async (req, res) => {
    try {
        // MODIFICA QUI: Aggiungi .populate('category')
        const menuItems = await MenuItem.find().populate('category').sort({ 'category.name': 1, name: 1 });
        res.json(menuItems); // Invia l'intero oggetto, inclusa la categoria popolata
    } catch (error) {
        console.error("Errore recupero articoli menu per staff:", error);
        res.status(500).json({ message: "Errore recupero articoli menu per staff", error: error.message });
    }
});

// POST /api/menu/items
app.post('/api/menu/items', authMiddleware, authorizeStaff, uploadMenuItemImage.single('imageFile'), uploadMenuItemImage.single('imageFile'), [
    // body('itemId').not().isEmpty().trim().withMessage('itemId è obbligatorio'), // RIMOSSO
    body('name').not().isEmpty().trim().withMessage('Nome è obbligatorio'),
    body('category').not().isEmpty().custom(value => mongoose.Types.ObjectId.isValid(value)).withMessage('ID Categoria è obbligatorio e deve essere valido'),
    body('price').isNumeric().withMessage('Prezzo è obbligatorio e deve essere un numero'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, category, price, description, available } = req.body; // itemId rimosso
        let imagePath = req.body.image;

        if (req.file) {
            imagePath = `/uploads/menu_items/${req.file.filename}`;
        }

        const newItemData = {
            name, category, // category è l'ID
            price, description,
            image: imagePath,
            available: available === 'true' || available === true,
        };
        if (req.body.customizableOptions) {
            try {
                newItemData.customizableOptions = JSON.parse(req.body.customizableOptions);
            } catch (e) {
                console.warn("Opzioni personalizzabili non valide:", req.body.customizableOptions);
                newItemData.customizableOptions = [];
            }
        }

        const newItem = new MenuItem(newItemData);
        await newItem.save();
        const populatedItem = await MenuItem.findById(newItem._id).populate('category'); // Ripopola per inviare nome categoria
        res.status(201).json(populatedItem);
    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        // Non c'è più errore per itemId duplicato
        // if (error.code === 11000) return res.status(409).json({ message: `L'articolo con itemId '${error.keyValue.itemId}' esiste già.` });
        console.error("Errore POST /api/menu/items:", error);
        res.status(500).json({ message: "Errore aggiunta articolo", error: error.message });
    }
});

// PUT /api/menu/items/:id
app.put('/api/menu/items/:id', authMiddleware, authorizeStaff, uploadMenuItemImage.single('imageFile'), [
    // validatori opzionali
    body('name').optional().not().isEmpty().trim().withMessage('Il nome non può essere vuoto se fornito'),
    body('category').optional().custom(value => mongoose.Types.ObjectId.isValid(value)).withMessage('ID Categoria deve essere valido se fornito'),
    body('price').optional().isNumeric().withMessage('Il prezzo deve essere un numero se fornito'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params; // Questo è il MongoDB _id
    if (!mongoose.Types.ObjectId.isValid(id)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "ID articolo non valido." });
    }

    try {
        const itemToUpdate = await MenuItem.findById(id);
        if (!itemToUpdate) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(404).json({ message: "Articolo non trovato." });
        }

        const { name, category, price, description, available /*, itemId */ } = req.body; // itemId rimosso
        let imagePath = itemToUpdate.image;
        let newImageUrlProvided = req.body.image !== undefined && req.body.image !== itemToUpdate.image;

        if (req.file) {
            if (itemToUpdate.image && itemToUpdate.image.startsWith('/uploads/menu_items/')) {
                const oldFilePath = path.join(__dirname, itemToUpdate.image);
                if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
            }
            imagePath = `/uploads/menu_items/${req.file.filename}`;
        } else if (newImageUrlProvided) {
            if (itemToUpdate.image && itemToUpdate.image.startsWith('/uploads/menu_items/') && req.body.image === '') {
                const oldFilePath = path.join(__dirname, itemToUpdate.image);
                if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
            }
            imagePath = req.body.image;
        }

        // itemToUpdate.name = name !== undefined ? name : itemToUpdate.name;
        // itemToUpdate.category = category !== undefined ? category : itemToUpdate.category;
        // ... e così via per tutti i campi
        // oppure:

        const updateData = { ...req.body };
        if (name !== undefined) updateData.name = name;
        if (category !== undefined) updateData.category = category;
        if (price !== undefined) updateData.price = parseFloat(price);
        if (description !== undefined) updateData.description = description;
        if (available !== undefined) updateData.available = available === 'true' || available === true;
        updateData.image = imagePath;

        // Rimuovi itemId se presente per errore nel body, non deve essere aggiornato
        delete updateData.itemId;
        // delete updateData._id; // MongoDB _id non può essere cambiato

        if (req.body.customizableOptions) {
            try {
                updateData.customizableOptions = JSON.parse(req.body.customizableOptions);
            } catch (e) {
                updateData.customizableOptions = itemToUpdate.customizableOptions;
            }
        } else {
            updateData.customizableOptions = itemToUpdate.customizableOptions; // Mantiene se non fornito
        }

        const updatedItem = await MenuItem.findByIdAndUpdate(id, updateData, { new: true, runValidators: true }).populate('category');
        if (!updatedItem) {
            return res.status(404).json({ message: "Articolo non trovato dopo il tentativo di aggiornamento." });
        }
        res.json(updatedItem);

    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        // if (error.code === 11000 && error.keyPattern && error.keyPattern.itemId) { // Non più rilevante per itemId
        //     return res.status(409).json({ message: `L'itemId '${error.keyValue.itemId}' è già utilizzato.` });
        // }
        console.error(`Errore PUT /api/menu/items/${id}:`, error);
        res.status(500).json({ message: "Errore modifica articolo", error: error.message });
    }
});

// DELETE /api/menu/items/:id
app.delete('/api/menu/items/:id', authMiddleware, authorizeStaff,  async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "ID articolo non valido." });
    }
    try {
        const deletedItem = await MenuItem.findByIdAndDelete(id);
        if (!deletedItem) {
            return res.status(404).json({ message: "Articolo non trovato." });
        }
        if (deletedItem.image && deletedItem.image.startsWith('/uploads/menu_items/')) {
            const filePath = path.join(__dirname, deletedItem.image);
            if (fs.existsSync(filePath)) {
                fs.unlink(filePath, (err) => {
                    if (err) console.error("Errore eliminazione file immagine associata:", err);
                    else console.log(`File immagine ${filePath} eliminato.`);
                });
            }
        }
        res.json({ message: "Articolo eliminato con successo.", deletedItem });
    } catch (error) {
        console.error(`Errore DELETE /api/menu/items/${id}:`, error);
        res.status(500).json({ message: "Errore eliminazione articolo", error: error.message });
    }
});

// --- API Endpoints Ordini (Aggiornati per Personalizzazioni) ---
// POST /api/orders
app.post('/api/orders', authMiddleware, async (req, res) => {
    const { customerName, cart } = req.body;
    const userId = req.user ? req.user.id : null;

    if (!customerName || !cart || cart.length === 0) {
        return res.status(400).json({ message: 'Nome cliente e articoli nel carrello sono obbligatori.' });
    }
    try {
        const newOrderIdString = await generateOrderId();
        const activeOrdersInQueue = await Order.countDocuments({ status: { $nin: [ORDER_STATUSES.SERVITO, ORDER_STATUSES.ANNULLATO] } });
        const waitTimeInfo = calculateEstimatedWaitTime(activeOrdersInQueue);

        let calculatedTotalAmount = 0;
        const orderItems = [];

        for (const cartItem of cart) {
            calculatedTotalAmount += cartItem.price * cartItem.quantity;
            orderItems.push({
                itemId: cartItem.itemId, // Questo ora è l'_id del MenuItem
                originalItemId: cartItem.originalItemId || cartItem.itemId, // Anche questo è un _id
                name: cartItem.name,
                price: cartItem.price,
                quantity: cartItem.quantity,
                customizations: typeof cartItem.customizations === 'string' ? cartItem.customizations : (Array.isArray(cartItem.customizations) ? cartItem.customizations.join(', ') : undefined)
            });
        }

        const orderData = {
            orderId: newOrderIdString,
            customerName: req.user ? req.user.name : customerName,
            items: orderItems,
            status: ORDER_STATUSES.RICEVUTO,
            orderTime: new Date(),
            estimatedReadyTime: new Date(Date.now() + waitTimeInfo.average * 60000),
            initialEstimateMinutes: waitTimeInfo.average,
            statusHistory: [{ status: ORDER_STATUSES.RICEVUTO, timestamp: new Date() }],
            totalAmount: parseFloat(calculatedTotalAmount.toFixed(2))
        };
        if (userId) {
            orderData.userId = userId;
        }

        const newOrder = new Order(orderData);
        const savedOrder = await newOrder.save();
        console.log(`Nuovo ordine salvato nel DB: ${savedOrder.orderId} da ${orderData.customerName}`);
        res.status(201).json({
            orderId: savedOrder.orderId,
            customerName: savedOrder.customerName,
            estimatedWaitTime: `${waitTimeInfo.min}-${waitTimeInfo.max} minuti`,
            orderDetails: savedOrder
        });
    } catch (error) {
        console.error("Errore durante la creazione dell'ordine:", error);
        if (error.code === 11000) return res.status(409).json({ message: "Errore nella generazione dell'ID ordine, riprova.", error: error.message });
        res.status(500).json({ message: "Errore creazione ordine", error: error.message });
    }
});

// GET /api/orders/my-history (come prima, ma ora gli items potrebbero avere info custom)
app.get('/api/orders/my-history', authMiddleware, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id }).sort({ orderTime: -1 });
        res.json(orders);
    } catch (error) {
        console.error("Errore recupero storico ordini:", error.message);
        res.status(500).send("Errore del server");
    }
});

// GET /api/orders/queue (come prima)
app.get('/api/orders/queue', authMiddleware, authorizeStaff,async (req, res) => {
    try {
        const activeOrders = await Order.find({ status: { $nin: [ORDER_STATUSES.SERVITO, ORDER_STATUSES.ANNULLATO] } }).sort({ orderTime: 1 });
        res.json(activeOrders);
    } catch (error) { res.status(500).json({ message: "Errore recupero coda ordini", error: error.message }); }
});

// PUT /api/orders/:orderId/status (come prima)
app.put('/api/orders/:orderId/status', authMiddleware, authorizeStaff, async (req, res) => {
    const { orderId } = req.params; const { status } = req.body;
    if (!Object.values(ORDER_STATUSES).includes(status)) return res.status(400).json({ message: 'Stato non valido.' });
    try {
        const order = await Order.findOne({ orderId: orderId });
        if (!order) return res.status(404).json({ message: 'Ordine non trovato.' });
        order.status = status;
        order.statusHistory.push({ status: status, timestamp: new Date() });
        if (status === ORDER_STATUSES.PRONTO) order.actualReadyTime = new Date();
        if (status === ORDER_STATUSES.SERVITO) order.servedTime = new Date();
        const updatedOrder = await order.save();
        console.log(`Stato ordine ${updatedOrder.orderId} aggiornato nel DB a: ${status}`);
        res.json(updatedOrder);
    } catch (error) { res.status(500).json({ message: "Errore aggiornamento stato ordine", error: error.message }); }
});

// GET /api/orders/track/:orderId (come prima, ma ora gli items potrebbero avere info custom)
app.get('/api/orders/track/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        const order = await Order.findOne({ orderId: orderId.toUpperCase() });
        if (!order) return res.status(404).json({ message: 'Ordine non trovato.' });
        res.json(order);
    } catch (error) { res.status(500).json({ message: "Errore tracciamento ordine", error: error.message }); }
});


// --- API Endpoints Utente (per Ordini Preferiti) ---

// POST /api/users/me/favorites - Aggiunge un ordine ai preferiti
app.post('/api/users/me/favorites', authMiddleware, [
    // Validazione del body (es. che 'items' sia un array e 'totalAmount' un numero)
    body('items').isArray({ min: 1 }).withMessage('Gli articoli sono obbligatori.'),
    body('items.*.name').notEmpty().withMessage('Il nome dell\'articolo è obbligatorio.'),
    body('items.*.price').isNumeric().withMessage('Il prezzo dell\'articolo deve essere numerico.'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('La quantità deve essere almeno 1.'),
    body('totalAmount').isNumeric().withMessage('Il totale deve essere numerico.')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'Utente non trovato.' });
        }

        const { items, totalAmount } = req.body;
        const favoriteOrderSnapshot = {
            items: items.map(item => ({ // Assicurati di mappare solo i campi necessari
                originalItemId: item.originalItemId,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                customizations: item.customizations
            })),
            totalAmount: totalAmount,
            savedAt: new Date()
        };

        user.favoriteOrders.push(favoriteOrderSnapshot);
        // Opzionale: limita il numero di preferiti salvati
        // if (user.favoriteOrders.length > 10) { user.favoriteOrders.shift(); } 
        await user.save();
        res.status(201).json(favoriteOrderSnapshot);
    } catch (error) {
        console.error("Errore aggiunta ordine ai preferiti:", error);
        res.status(500).json({ message: 'Errore durante il salvataggio dell\'ordine preferito.' });
    }
});

// GET /api/users/me/favorites - Recupera gli ordini preferiti dell'utente
app.get('/api/users/me/favorites', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('favoriteOrders');
        if (!user) {
            return res.status(404).json({ message: 'Utente non trovato.' });
        }
        // Ordina i preferiti dal più recente al più vecchio
        const sortedFavorites = user.favoriteOrders.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
        res.json(sortedFavorites);
    } catch (error) {
        console.error("Errore recupero ordini preferiti:", error);
        res.status(500).json({ message: 'Errore durante il recupero degli ordini preferiti.' });
    }
});

// DELETE /api/users/me/favorites/:favoriteId - Rimuove un ordine dai preferiti
// Nota: favoriteId qui sarebbe l'_id generato da MongoDB per l'elemento nell'array favoriteOrders
app.delete('/api/users/me/favorites/:favoriteId', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'Utente non trovato.' });
        }

        const favoriteIdToRemove = req.params.favoriteId;
        if (!mongoose.Types.ObjectId.isValid(favoriteIdToRemove)) {
            return res.status(400).json({ message: 'ID preferito non valido.' });
        }

        const initialLength = user.favoriteOrders.length;
        user.favoriteOrders.pull({ _id: favoriteIdToRemove }); // Metodo Mongoose per rimuovere da array di subdocument

        if (user.favoriteOrders.length === initialLength) {
            return res.status(404).json({ message: 'Ordine preferito non trovato.' });
        }

        await user.save();
        res.status(200).json({ message: 'Ordine preferito rimosso con successo.' });
    } catch (error) {
        console.error("Errore rimozione ordine preferito:", error);
        res.status(500).json({ message: 'Errore durante la rimozione dell\'ordine preferito.' });
    }
});

// --- API Endpoints Categorie (NUOVO) ---

// GET /api/categories - Recupera tutte le categorie
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.find().sort({ name: 1 });
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: "Errore recupero categorie", error: error.message });
    }
});

// POST /api/categories - Crea una nuova categoria
app.post('/api/categories', authMiddleware, authorizeStaff, [
    body('name').not().isEmpty().trim().withMessage('Il nome della categoria è obbligatorio')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { name, description } = req.body;
        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(409).json({ message: `La categoria '${name}' esiste già.` });
        }
        const newCategory = new Category({ name, description });
        await newCategory.save();
        res.status(201).json(newCategory);
    } catch (error) {
        console.error("Errore POST /api/categories:", error);
        if (error.code === 11000) return res.status(409).json({ message: `La categoria '${error.keyValue.name}' esiste già.` });
        res.status(500).json({ message: "Errore creazione categoria", error: error.message });
    }
});

// PUT /api/categories/:id - Modifica una categoria esistente
app.put('/api/categories/:id', authMiddleware, authorizeStaff,[
    body('name').optional().not().isEmpty().trim().withMessage('Il nome della categoria non può essere vuoto se fornito')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "ID categoria non valido." });
    }
    try {
        const { name, description } = req.body;
        const categoryToUpdate = await Category.findById(id);
        if (!categoryToUpdate) {
            return res.status(404).json({ message: "Categoria non trovata." });
        }

        // Verifica se il nuovo nome esiste già (escludendo la categoria corrente)
        if (name && name !== categoryToUpdate.name) {
            const existingCategory = await Category.findOne({ name: name, _id: { $ne: id } });
            if (existingCategory) {
                return res.status(409).json({ message: `La categoria '${name}' esiste già.` });
            }
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;

        const updatedCategory = await Category.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
        res.json(updatedCategory);
    } catch (error) {
        console.error(`Errore PUT /api/categories/${id}:`, error);
        if (error.code === 11000) return res.status(409).json({ message: `Il nome categoria '${error.keyValue.name}' è già utilizzato.` });
        res.status(500).json({ message: "Errore modifica categoria", error: error.message });
    }
});

// DELETE /api/categories/:id - Elimina una categoria
app.delete('/api/categories/:id', authMiddleware, authorizeStaff, async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "ID categoria non valido." });
    }
    try {
        // Prima di eliminare una categoria, potresti voler verificare se è usata da qualche MenuItem
        // Se sì, potresti impedire l'eliminazione o riassegnare gli item a una categoria "Non categorizzato"
        const itemsInCategory = await MenuItem.countDocuments({ category: id });
        if (itemsInCategory > 0) {
            return res.status(400).json({ message: `Impossibile eliminare la categoria perché è associata a ${itemsInCategory} articoli del menu. Rimuovi prima gli articoli o assegnali a un'altra categoria.` });
        }

        const deletedCategory = await Category.findByIdAndDelete(id);
        if (!deletedCategory) {
            return res.status(404).json({ message: "Categoria non trovata." });
        }
        res.json({ message: "Categoria eliminata con successo.", deletedCategory });
    } catch (error) {
        console.error(`Errore DELETE /api/categories/${id}:`, error);
        res.status(500).json({ message: "Errore eliminazione categoria", error: error.message });
    }
});


// --- Gestione delle Route HTML ---
app.get('/staff', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'staff.html'));
});

// Assicurati che questa route per il reset password esista o creala
// Se usi un Single Page Application (SPA) con routing frontend, questo potrebbe non essere necessario.
// Altrimenti, serve una pagina HTML per l'input della nuova password.
app.get('/reset-password.html', (req, res) => {
    // Questa è solo una placeholder, la tua `index.html` dovrebbe gestire la view `/reset-password?token=TOKEN`
    // Se la tua SPA non ha una route specifica per `reset-password.html`,
    // dovrai gestire il token nel frontend JS quando la pagina principale viene caricata
    // con quel query parameter. Per semplicità, spesso si ha una pagina dedicata.
    // Oppure, il link nell'email punta direttamente a una route della tua SPA
    // es. https://tu Dominio.com/#/reset-password?token=TOKEN
    res.sendFile(path.join(__dirname, 'public', 'index.html')); // Invia index.html, il routing FE gestirà il resto
});


app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.includes('.')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else if (req.path.startsWith('/api')) {
        res.status(404).send('API endpoint not found');
    }
    // Non aggiungere un 'else' che invia index.html qui,
    // altrimenti le richieste a file statici non API (es. /script.js) fallirebbero se non trovate prima
});

app.listen(PORT, () => {
    console.log(`Backend Pizzeria Da Galileo in ascolto sulla porta ${PORT}`);
});
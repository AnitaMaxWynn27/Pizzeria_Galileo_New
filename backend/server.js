// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult, param } = require('express-validator');
const crypto = require('crypto'); // Per generare token di reset password
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/pizzeria';
const JWT_SECRET = process.env.JWT_SECRET;
console.log("JWT_SECRET in server.js:", JWT_SECRET ? "Definito" : "NON DEFINITO!!!"); // Aggiungi questo
if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET non è definito. Impostalo nelle variabili d'ambiente.");
    process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
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
        seedMenuItems();
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
    createdAt: { type: Date, default: Date.now },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    favoriteOrders: [{ // Struttura base per ordini preferiti
        savedAt: { type: Date, default: Date.now },
        items: [{ // Snapshot degli items
            originalItemId: String, // ID dell'item originale nel menu
            name: String, // Nome dell'item, potrebbe includere personalizzazioni
            price: Number, // Prezzo al momento del salvataggio
            quantity: Number,
            customizations: String // Stringa descrittiva delle personalizzazioni
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
    description: { type: String, trim: true, default: '' }
}, { timestamps: true });
const Category = mongoose.model('Category', categorySchema);


// Schema MenuItem Aggiornato (per opzioni di personalizzazione future)
const customizableOptionSchema = new mongoose.Schema({ 
    name: { type: String, required: true },
    priceChange: { type: Number, required: true, default: 0 }
}, { _id: false });

const menuItemSchema = new mongoose.Schema({
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
    image: { type: String, trim: true }, // Gestito dall'upload
    available: { type: Boolean, default: true },
    customizableOptions: [customizableOptionSchema]
}, { timestamps: true });

async function generateUniqueSlug(name, model) {
    let baseSlug = name.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
    if (!baseSlug) { // Fallback se il nome produce uno slug vuoto
        baseSlug = 'articolo';
    }

    let slug = baseSlug;
    let count = 0;
    // eslint-disable-next-line no-await-in-loop
    while (await model.findOne({ slug: slug })) {
        count++;
        slug = `${baseSlug}-${count}`;
    }
    return slug;
}
const MenuItem = mongoose.model('MenuItem', menuItemSchema);

// Schema OrderItem Aggiornato
const orderItemSchema = new mongoose.Schema({
    itemId: { type: String, required: true }, // Potrebbe essere l'ID base del prodotto
    originalItemId: { type: String }, // ID dell'item originale nel menu, se questo è una variante personalizzata
    name: { type: String, required: true }, // Nome come appare nell'ordine (può includere info custom)
    price: { type: Number, required: true }, // Prezzo dell'item nell'ordine (può includere costi custom)
    quantity: { type: Number, required: true, min: 1 },
    customizations: { type: String } // Stringa descrittiva delle personalizzazioni, es. "Senza cipolla, Extra formaggio"
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

// --- Dati Iniziali e Costanti (Menu) ---
const initialMenuData = [
    {
        itemId: 'p1', name: 'Margherita', category: 'Pizze Rosse', price: 7.50,
        description: 'Pomodoro San Marzano DOP, Fiordilatte, Basilico fresco, Olio EVO',
        image: '/images/Margherita.png',
        customizableOptions: [
            { name: 'Senza Mozzarella', priceChange: -0.50 },
            { name: 'Doppio Basilico', priceChange: 0.30 }
        ]
    },
    {
        itemId: 'p2', name: 'Diavola', category: 'Pizze Rosse', price: 8.50,
        description: 'Pomodoro San Marzano DOP, Fiordilatte, Salame piccante',
        image: '/images/Diavola.png',
        customizableOptions: [
            { name: 'Extra Salame Piccante', priceChange: 1.50 },
            { name: 'Senza Fiordilatte', priceChange: -1.00 }
        ]
    },
    // ... altri item con eventuali customizableOptions
    { itemId: 'p3', name: 'Capricciosa', category: 'Pizze Rosse', price: 9.50, description: 'Pomodoro, Mozzarella, Prosciutto cotto, Funghi, Carciofini, Olive', image: '/images/Capricciosa.png' },
    { itemId: 'p4', name: 'Quattro Formaggi', category: 'Pizze Bianche', price: 9.00, description: 'Fiordilatte, Gorgonzola DOP, Fontina, Parmigiano Reggiano', image: '/images/QuattroFormaggi.png' },
    { itemId: 'p5', name: 'Boscaiola', category: 'Pizze Bianche', price: 10.00, description: 'Mozzarella, Salsiccia fresca, Funghi porcini', image: '/images/Boscaiola' },
    { itemId: 'd1', name: 'Acqua Naturale', category: 'Bibite', price: 1.50, description: 'Bottiglia 50cl', image: '/images/Acqua.png' },
    { itemId: 'd2', name: 'Coca Cola', category: 'Bibite', price: 2.50, description: 'Lattina 33cl', image: '/images/CocaCola.png' },
    { itemId: 'd3', name: 'Birra Artigianale', category: 'Bibite', price: 4.50, description: 'Bottiglia 33cl - Chiara', image: '/images/Birra.png' },
];

async function seedMenuItems() {
    try {
        const count = await MenuItem.countDocuments();
        if (count === 0) {
            console.log('Nessun articolo nel menu trovato, popolo il database con i dati iniziali...');
            await MenuItem.insertMany(initialMenuData);
            console.log('Menu popolato con successo.');
        }
    } catch (error) {
        console.error('Errore durante il popolamento del menu:', error);
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

// --- Costanti e Funzioni Helper Ordini ---
// ... (generateOrderId, calculateEstimatedWaitTime, ORDER_STATUSES, ecc. come prima)
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
// POST /api/auth/register (come prima)
app.post('/api/auth/register', [
    body('name', 'Il nome è obbligatorio').not().isEmpty().trim().escape(),
    body('email', 'Inserisci una email valida').isEmail().normalizeEmail(),
    body('password', 'La password deve essere di almeno 6 caratteri').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { name, email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ errors: [{ msg: 'Utente già esistente con questa email', path: 'email' }] });
        }
        user = new User({ name, email, password });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
        const payload = { user: { id: user.id, name: user.name, email: user.email } };
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
    body('email', 'Inserisci una email valida').isEmail().normalizeEmail(),
    body('password', 'La password è obbligatoria').exists()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Credenziali non valide' });
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenziali non valide' });
        }
        const payload = { user: { id: user.id, name: user.name, email: user.email } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user: payload.user });
        });
    } catch (err) {
        console.error("Errore login:", err.message);
        res.status(500).send('Errore del server');
    }
});

// GET /api/auth/me (come prima)
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -passwordResetToken -passwordResetExpires');
        if (!user) {
            return res.status(404).json({ message: "Utente non trovato." });
        }
        res.json(user);
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
        const menuItems = await MenuItem.find({ available: true })
            .populate('category', 'name _id') // Popola nome e _id della categoria
            .sort({ 'category.name': 1, name: 1 }); // Ordina per nome categoria, poi per nome item

        res.json(menuItems.map(item => ({
            _id: item._id, // Invia _id per future operazioni specifiche (es. modifica quantità nel carrello)
            slug: item.slug,
            name: item.name,
            category: item.category ? item.category.name : 'Senza Categoria',
            categoryId: item.category ? item.category._id : null,
            price: item.price,
            description: item.description,
            image: item.image,
            available: item.available,
            customizableOptions: item.customizableOptions
        })));
    } catch (error) {
        console.error("Errore recupero menu per clienti:", error);
        res.status(500).json({ message: "Errore recupero menu", error: error.message });
    }
});

app.get('/api/menu/all-items', /* authMiddleware, */ async (req, res) => {
    try {
        const menuItems = await MenuItem.find()
            .populate('category', 'name _id') // Popola nome e _id della categoria
            .sort({ 'category.name': 1, name: 1 });
        res.json(menuItems); // Invia l'oggetto completo con categoria popolata
    } catch (error) {
        console.error("Errore recupero menu per staff:", error);
        res.status(500).json({ message: "Errore recupero articoli menu per staff", error: error.message });
    }
});

// POST /api/menu/items
app.post('/api/menu/items', /* authMiddleware, */ uploadMenuItemImage.single('imageFile'), [
    body('name', 'Nome è obbligatorio').not().isEmpty().trim(),
    body('category', 'Categoria è obbligatoria').isMongoId().withMessage('ID Categoria non valido.'), // Ora è un ObjectId
    body('price', 'Prezzo è obbligatorio e deve essere un numero').isNumeric(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, category, price, description, available } = req.body;
        const slug = await generateUniqueSlug(name, MenuItem); // Genera slug univoco
        let imagePath = null;
        if (req.file) {
            imagePath = `/uploads/menu_items/${req.file.filename}`;
        } else if (req.body.image) { // Se l'utente ha fornito un URL testuale (mantenendo la logica precedente)
             imagePath = req.body.image;
        }


        const newItemData = {
            slug, name, category, price, description,
            image: imagePath,
            available: available === 'true' || available === true,
        };
         if (req.body.customizableOptions) {
            try {
                newItemData.customizableOptions = JSON.parse(req.body.customizableOptions);
            } catch (parseError) {
                console.warn("Opzioni personalizzabili non valide (POST):", req.body.customizableOptions, parseError);
                newItemData.customizableOptions = []; // Fallback a array vuoto se il parsing fallisce
            }
        } else {
            newItemData.customizableOptions = []; // Assicura che sia un array se non fornito
        }


        const newItem = new MenuItem(newItemData);
        await newItem.save();
        const populatedItem = await MenuItem.findById(newItem._id).populate('category', 'name _id');
        res.status(201).json(populatedItem);
    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        // Il controllo di unicità dello slug è gestito da generateUniqueSlug e dall'indice unique in Mongoose
        if (error.code === 11000) { // Errore di duplicazione (probabilmente slug, se generateUniqueSlug fallisse)
            return res.status(409).json({ message: `Errore di univocità, probabilmente per lo slug.` });
        }
        console.error("Errore POST /api/menu/items:", error);
        res.status(500).json({ message: "Errore aggiunta articolo", error: error.message });
    }
});

// PUT /api/menu/items/:id (per staff)
app.put('/api/menu/items/:id', /* authMiddleware, */ uploadMenuItemImage.single('imageFile'), [
    body('name', 'Nome è obbligatorio').not().isEmpty().trim(),
    body('category', 'Categoria è obbligatoria').isMongoId().withMessage('ID Categoria non valido.'),
    body('price', 'Prezzo è obbligatorio e deve essere un numero').isNumeric(),
    // Aggiungi qui altre validazioni se necessario, es. per 'available', 'description'
], async (req, res) => {
    console.log(`Richiesta PUT a /api/menu/items/${req.params.id}`); // Log iniziale della richiesta
    console.log("Body della richiesta:", req.body);
    if (req.file) {
        console.log("File caricato:", req.file);
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.error("Errore di validazione:", errors.array());
        if (req.file) {
            // Considera di eliminare il file solo se è stato effettivamente salvato e c'è un errore
            // fs.unlinkSync(req.file.path); // Attenzione con unlinkSync in caso di errori precedenti
        }
        return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        console.error("ID Articolo non valido:", id);
        // if (req.file) fs.unlinkSync(req.file.path); // Attenzione
        return res.status(400).json({ message: "ID Articolo non valido." });
    }

    try {
        const itemToUpdate = await MenuItem.findById(id);
        if (!itemToUpdate) {
            console.warn("Articolo non trovato per l'ID:", id);
            // if (req.file) fs.unlinkSync(req.file.path); // Attenzione
            return res.status(404).json({ message: "Articolo non trovato." });
        }

        console.log("Articolo trovato:", itemToUpdate.name);

        const { name, category, price, description, available, image } = req.body; // 'image' qui è l'URL dell'immagine dal form

        // Logica per lo slug (se il nome cambia, lo slug dovrebbe idealmente cambiare, ma gestisci con cautela per SEO/link diretti)
        // Se il nome è cambiato e vuoi aggiornare lo slug:
        // if (name !== itemToUpdate.name) {
        //     itemToUpdate.slug = await generateUniqueSlug(name, MenuItem);
        //     console.log("Slug aggiornato a:", itemToUpdate.slug);
        // }
        itemToUpdate.name = name;
        itemToUpdate.category = category; // Assicurati che 'category' sia un ObjectId valido
        itemToUpdate.price = parseFloat(price); // Assicurati che sia un numero
        itemToUpdate.description = description !== undefined ? description : itemToUpdate.description;

        // Gestione di 'available' che arriva come stringa 'true'/'false' da FormData
        if (available === 'true') {
            itemToUpdate.available = true;
        } else if (available === 'false') {
            itemToUpdate.available = false;
        } else if (typeof available === 'boolean'){
            itemToUpdate.available = available;
        }
        // Se 'available' non è presente nel FormData (es. checkbox non spuntata e nessun valore inviato),
        // itemToUpdate.available manterrà il suo valore precedente se non lo imposti qui.
        // FormData invierà il valore della checkbox solo se è spuntata. Se non è spuntata, il campo 'available' potrebbe non essere nel req.body.
        // È più sicuro controllare esplicitamente:
        // itemToUpdate.available = (req.body.available === 'true' || req.body.available === true);
        // Se la checkbox non è spuntata, formData.get('available') sarà null.
        // Quindi, se vuoi che una checkbox non spuntata significhi 'false':
        itemToUpdate.available = formData.get('available') === 'true'; // formData.get('available') restituisce il valore se presente, altrimenti null


        if (req.body.customizableOptions) {
            try {
                itemToUpdate.customizableOptions = JSON.parse(req.body.customizableOptions);
            } catch (parseError) {
                 console.warn("Opzioni personalizzabili non valide (PUT):", req.body.customizableOptions, parseError);
                 // Mantieni quelle esistenti o decidi una strategia di fallback
            }
        }
        console.log("Dati prima della gestione immagine:", JSON.parse(JSON.stringify(itemToUpdate)));


        // Gestione Immagine
        let oldImagePhysicalPath = null;
        if (itemToUpdate.image && itemToUpdate.image.startsWith('/uploads/menu_items/')) {
            oldImagePhysicalPath = path.join(__dirname, itemToUpdate.image);
        }

        if (req.file) { // Se un nuovo file è caricato
            console.log("Nuovo file caricato:", req.file.filename);
            if (oldImagePhysicalPath && fs.existsSync(oldImagePhysicalPath)) {
                console.log("Tentativo eliminazione vecchia immagine fisica:", oldImagePhysicalPath);
                try {
                    fs.unlinkSync(oldImagePhysicalPath);
                    console.log("Vecchia immagine fisica eliminata:", oldImagePhysicalPath);
                } catch (unlinkErr) {
                    console.error("Errore eliminazione vecchia immagine fisica:", unlinkErr);
                    // Non bloccare l'operazione per questo, ma loggalo
                }
            }
            itemToUpdate.image = `/uploads/menu_items/${req.file.filename}`;
        } else if (image !== undefined) { // Se è stato fornito un campo 'image' (URL) nel form body
            if (image === '' && itemToUpdate.image) { // L'utente vuole rimuovere l'immagine
                console.log("Richiesta rimozione immagine esistente.");
                if (oldImagePhysicalPath && fs.existsSync(oldImagePhysicalPath)) {
                    console.log("Tentativo eliminazione immagine fisica da rimuovere:", oldImagePhysicalPath);
                     try {
                        fs.unlinkSync(oldImagePhysicalPath);
                        console.log("Immagine fisica da rimuovere, eliminata:", oldImagePhysicalPath);
                    } catch (unlinkErr) {
                        console.error("Errore eliminazione immagine fisica da rimuovere:", unlinkErr);
                    }
                }
                itemToUpdate.image = null; // O stringa vuota, a seconda delle preferenze
            } else if (image !== itemToUpdate.image) { // L'URL è cambiato (e non è un file caricato)
                 console.log("URL immagine modificato a:", image);
                // Se l'immagine precedente era fisica e ora si usa un URL esterno, elimina quella fisica
                if (oldImagePhysicalPath && fs.existsSync(oldImagePhysicalPath) && !image.startsWith('/uploads/menu_items/')) {
                    console.log("Passaggio da immagine fisica a URL, eliminazione vecchia immagine fisica:", oldImagePhysicalPath);
                    try {
                        fs.unlinkSync(oldImagePhysicalPath);
                        console.log("Vecchia immagine fisica eliminata con successo.");
                    } catch (unlinkErr) {
                        console.error("Errore eliminazione vecchia immagine fisica:", unlinkErr);
                    }
                }
                itemToUpdate.image = image;
            }
        }
        // Se né req.file né req.body.image sono forniti o modificati significativamente, itemToUpdate.image rimane invariato.

        console.log("Articolo prima del salvataggio:", JSON.parse(JSON.stringify(itemToUpdate)));

        await itemToUpdate.save();
        console.log("Articolo salvato con successo.");

        const populatedItem = await MenuItem.findById(itemToUpdate._id).populate('category', 'name _id');
        res.json(populatedItem);

    } catch (error) {
        console.error(`ERRORE DETTAGLIATO in PUT /api/menu/items/${id}:`, error); // Log dell'errore specifico
        // if (req.file) { // Se c'è un errore DOPO che il file è stato caricato, potresti volerlo eliminare
        //     try { fs.unlinkSync(req.file.path); } catch (e) { console.error("Errore durante pulizia file dopo errore:", e); }
        // }
        if (error.code === 11000) {
            return res.status(409).json({ message: `Conflitto di dati (probabilmente slug o altro campo univoco).`, error: error.message });
        }
        res.status(500).json({ message: "Errore modifica articolo", error: error.message });
    }
});

// DELETE /api/menu/items/:id 
app.delete('/api/menu/items/:id', /* authMiddleware, */ async (req, res) => {
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
            // Importante: il prezzo dell'item dovrebbe essere quello finale inviato dal frontend,
            // che include già le modifiche dovute alle personalizzazioni.
            // Il backend potrebbe opzionalmente riverificare il prezzo base + delta personalizzazioni se avesse la logica.
            // Per ora, ci fidiamo del prezzo inviato per l'item personalizzato.
            calculatedTotalAmount += cartItem.price * cartItem.quantity;
            orderItems.push({
                itemId: cartItem.itemId, // Questo potrebbe essere l'ID customizzato (es. p1_custom_timestamp)
                originalItemId: cartItem.originalItemId || cartItem.itemId, // ID dell'item base
                name: cartItem.name, // Nome che include già le personalizzazioni
                price: cartItem.price, // Prezzo con personalizzazioni
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
            orderDetails: savedOrder // Invia l'ordine completo come conferma
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
app.get('/api/orders/queue', /* authMiddleware, */ async (req, res) => {
    try {
        const activeOrders = await Order.find({ status: { $nin: [ORDER_STATUSES.SERVITO, ORDER_STATUSES.ANNULLATO] } }).sort({ orderTime: 1 });
        res.json(activeOrders);
    } catch (error) { res.status(500).json({ message: "Errore recupero coda ordini", error: error.message }); }
});

// PUT /api/orders/:orderId/status (come prima)
app.put('/api/orders/:orderId/status', /* authMiddleware, */ async (req, res) => {
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

// --- API Endpoints Categorie (NUOVI) ---
app.get('/api/categories', /* authMiddleware, */ async (req, res) => {
    try {
        const categories = await Category.find().sort({ name: 1 });
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: "Errore recupero categorie", error: error.message });
    }
});

app.post('/api/categories', /* authMiddleware, */ [
    body('name', 'Il nome della categoria è obbligatorio').not().isEmpty().trim(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const { name, description } = req.body;
        let existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existingCategory) return res.status(409).json({ message: `Categoria '${name}' già esistente.` });

        const newCategory = new Category({ name, description });
        await newCategory.save();
        res.status(201).json(newCategory);
    } catch (error) {
        console.error("Errore creazione categoria:", error);
        res.status(500).json({ message: "Errore creazione categoria", error: error.message });
    }
});

app.put('/api/categories/:id', /* authMiddleware, */ [
    body('name', 'Il nome della categoria è obbligatorio').not().isEmpty().trim(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "ID Categoria non valido" });

    try {
        const { name, description } = req.body;
        const categoryToUpdate = await Category.findById(id);
        if (!categoryToUpdate) return res.status(404).json({ message: "Categoria non trovata" });

        // Controlla se il nuovo nome è già usato da un'altra categoria
        if (name.toLowerCase() !== categoryToUpdate.name.toLowerCase()) {
            const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, _id: { $ne: id } });
            if (existingCategory) return res.status(409).json({ message: `Nome categoria '${name}' già in uso.` });
        }
        
        categoryToUpdate.name = name;
        categoryToUpdate.description = description !== undefined ? description : categoryToUpdate.description;
        await categoryToUpdate.save();
        res.json(categoryToUpdate);
    } catch (error) {
        console.error("Errore aggiornamento categoria:", error);
        res.status(500).json({ message: "Errore aggiornamento categoria", error: error.message });
    }
});

app.delete('/api/categories/:id', /* authMiddleware, */ async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "ID Categoria non valido" });
    try {
        const itemsUsingCategory = await MenuItem.countDocuments({ category: id });
        if (itemsUsingCategory > 0) {
            return res.status(400).json({ message: `Impossibile eliminare: ${itemsUsingCategory} articoli usano questa categoria.` });
        }
        const deletedCategory = await Category.findByIdAndDelete(id);
        if (!deletedCategory) return res.status(404).json({ message: "Categoria non trovata" });
        res.json({ message: "Categoria eliminata", deletedCategory });
    } catch (error) {
        console.error("Errore eliminazione categoria:", error);
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
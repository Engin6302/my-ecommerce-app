const express = require('express');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = express();
const PORT = 8000;

// JWT secret key (üretimde environment variable kullanın)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// JSON parsing için middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS için
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

const client = new Client({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: 'my_database',
  port: 5432,
});

client.connect()
  .then(() => console.log('🚀 E-ticaret API PostgreSQL\'e bağlandı!'))
  .catch(err => console.error('Bağlantı hatası:', err.stack));

// JWT doğrulama middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token gerekli' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Geçersiz token' });
    }
    req.user = user;
    next();
  });
};

// Opsiyonel JWT doğrulama (login olmasa da çalışır)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
      }
    });
  }
  next();
};

// Şifre hashleme fonksiyonu
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 12);
};

// Şifre doğrulama fonksiyonu
const verifyPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// Verification code oluşturma
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Sipariş numarası oluşturma
const generateOrderNumber = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `TM${timestamp.slice(-6)}${random}`;
};

// Veritabanı tablolarını oluştur
async function initializeDatabase() {
  try {
    // Kullanıcılar tablosu
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        country_code VARCHAR(5) DEFAULT '+90',
        birth_date DATE,
        gender VARCHAR(10),
        is_verified BOOLEAN DEFAULT false,
        verification_code VARCHAR(6),
        reset_token VARCHAR(255),
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Kullanıcı adresleri tablosu
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(100) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        country VARCHAR(100) DEFAULT 'Türkiye',
        city VARCHAR(100) NOT NULL,
        district VARCHAR(100) NOT NULL,
        neighborhood VARCHAR(100),
        address_line TEXT NOT NULL,
        postal_code VARCHAR(10),
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Geliştirilmiş ürünler tablosu
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        short_description VARCHAR(500),
        price DECIMAL(10,2) NOT NULL,
        discount_price DECIMAL(10,2),
        image_url VARCHAR(500),
        images TEXT[], -- Birden fazla resim için array
        category_id INTEGER,
        brand VARCHAR(100),
        model VARCHAR(100),
        color VARCHAR(50),
        size VARCHAR(50),
        weight DECIMAL(5,2),
        dimensions VARCHAR(100),
        warranty_period INTEGER, -- ay cinsinden
        stock INTEGER DEFAULT 0,
        min_stock INTEGER DEFAULT 5,
        is_active BOOLEAN DEFAULT true,
        is_featured BOOLEAN DEFAULT false,
        view_count INTEGER DEFAULT 0,
        rating DECIMAL(3,2) DEFAULT 0,
        review_count INTEGER DEFAULT 0,
        meta_title VARCHAR(255),
        meta_description TEXT,
        tags TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Kategoriler tablosu
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        image_url VARCHAR(500),
        parent_id INTEGER REFERENCES categories(id),
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ürün yorumları tablosu
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_reviews (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        title VARCHAR(200),
        comment TEXT NOT NULL,
        images TEXT[],
        is_verified_purchase BOOLEAN DEFAULT false,
        helpful_count INTEGER DEFAULT 0,
        not_helpful_count INTEGER DEFAULT 0,
        is_approved BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Yorum faydalılık oylaması tablosu
    await client.query(`
      CREATE TABLE IF NOT EXISTS review_votes (
        id SERIAL PRIMARY KEY,
        review_id INTEGER REFERENCES product_reviews(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        is_helpful BOOLEAN NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(review_id, user_id)
      )
    `);

    // Favoriler tablosu
    await client.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

    // Geliştirilmiş sepet tablosu
    await client.query(`
      CREATE TABLE IF NOT EXISTS cart (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER DEFAULT 1,
        selected_options JSONB, -- renk, beden vs
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

    // Geliştirilmiş siparişler tablosu
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        order_number VARCHAR(50) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        total_amount DECIMAL(10,2) NOT NULL,
        discount_amount DECIMAL(10,2) DEFAULT 0,
        shipping_cost DECIMAL(10,2) DEFAULT 0,
        payment_method VARCHAR(50),
        payment_status VARCHAR(50) DEFAULT 'pending',
        shipping_address JSONB NOT NULL,
        billing_address JSONB,
        tracking_number VARCHAR(100),
        estimated_delivery DATE,
        delivered_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sipariş ürünleri tablosu
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        product_name VARCHAR(255) NOT NULL,
        product_price DECIMAL(10,2) NOT NULL,
        quantity INTEGER NOT NULL,
        selected_options JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Son görüntülenen ürünler tablosu
    await client.query(`
      CREATE TABLE IF NOT EXISTS recently_viewed (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

    // Kategorileri ekle
    const categoryCount = await client.query('SELECT COUNT(*) FROM categories');
    if (categoryCount.rows[0].count === '0') {
      await client.query(`
        INSERT INTO categories (name, slug, description) VALUES
        ('Elektronik', 'elektronik', 'Telefon, tablet ve elektronik ürünler'),
        ('Bilgisayar', 'bilgisayar', 'Laptop, masaüstü ve bilgisayar aksesuarları'),
        ('Ses & Görüntü', 'ses-goruntu', 'Kulaklık, hoparlör ve ses sistemleri'),
        ('Giyilebilir Teknoloji', 'giyilebilir-teknoloji', 'Akıllı saat ve giyilebilir cihazlar'),
        ('Oyun & Konsol', 'oyun-konsol', 'Oyun konsolları ve aksesuarları'),
        ('Ev & Yaşam', 'ev-yasam', 'Akıllı ev ürünleri ve yaşam teknolojileri')
      `);
      console.log('✅ Kategoriler eklendi!');
    }

    // Örnek ürünleri ekle (sadece ilk çalıştırmada)
    const productCount = await client.query('SELECT COUNT(*) FROM products');
    if (productCount.rows[0].count === '0') {
      await client.query(`
        INSERT INTO products (
          name, slug, description, short_description, price, discount_price, 
          image_url, images, category_id, brand, model, color, warranty_period, 
          stock, is_featured, rating, review_count
        ) VALUES
        (
          'iPhone 15 Pro Max', 'iphone-15-pro-max', 
          'iPhone 15 Pro Max, ProRAW ile çarpıcı fotoğraflar çekmenizi sağlayan 48MP Ana kamera sistemi, 120Hz ProMotion teknolojisi ile akıcı görsel deneyim sunan 6.7" Super Retina XDR ekran ve A17 Pro çip ile güçlü performans.', 
          'En yeni iPhone modeli, 256GB depolama alanı ve A17 Pro çip', 
          52999.99, 49999.99,
          'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600',
          ARRAY['https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600'],
          1, 'Apple', 'iPhone 15 Pro Max', 'Natural Titanium', 12, 45, true, 4.8, 1247
        ),
        (
          'MacBook Air M3', 'macbook-air-m3',
          'MacBook Air M3, 8 çekirdekli CPU ve 10 çekirdekli GPU ile donatılmış M3 çipi sayesinde hem günlük kullanımda hem de profesyonel işlerde üstün performans sergiler. 18 saate kadar pil ömrü, Liquid Retina ekran ve sessiz çalışma.',
          'Apple M3 çipli ultra ince dizüstü bilgisayar, 13.6" ekran',
          29999.99, 27999.99,
          'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600',
          ARRAY['https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600'],
          2, 'Apple', 'MacBook Air', 'Space Gray', 12, 28, true, 4.7, 892
        ),
        (
          'AirPods Pro 2. Nesil', 'airpods-pro-2-nesil',
          'AirPods Pro (2. nesil) 2 kata kadar daha iyi Aktif Gürültü Engelleme, Adaptif Şeffaflık modu ve kişiselleştirilmiş Uzamsal Ses deneyimi sunar. MagSafe Şarj Kutusu ile 30 saate kadar dinleme süresi.',
          'Aktif gürültü engelleme özellikli premium kulaklık',
          9999.99, 8999.99,
          'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600',
          ARRAY['https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600', 'https://images.unsplash.com/photo-1588423771073-b8903fbb85b5?w=600'],
          3, 'Apple', 'AirPods Pro', 'White', 12, 150, true, 4.6, 2156
        ),
        (
          'Samsung Galaxy S24 Ultra', 'samsung-galaxy-s24-ultra',
          'Galaxy S24 Ultra, 200MP kamera, S Pen desteği ve 6.8" Dynamic AMOLED 2X ekran ile mobil fotografçılık ve üretkenlikte yeni standartlar belirliyor. Galaxy AI ile desteklenen akıllı özellikler.',
          'Android flagship telefon, 512GB depolama ve S Pen',
          42999.99, 39999.99,
          'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600',
          ARRAY['https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600'],
          1, 'Samsung', 'Galaxy S24 Ultra', 'Titanium Black', 24, 32, false, 4.5, 567
        ),
        (
          'Sony WH-1000XM5', 'sony-wh-1000xm5',
          'Sony WH-1000XM5, endüstrinin en iyi gürültü engelleme teknolojisi, 30 saate kadar pil ömrü ve premium ses kalitesi ile uzun yolculuklarınızın ve çalışma seanslarınızın ideal partneri.',
          'Premium noise-cancelling over-ear kulaklık',
          12999.99, null,
          'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600',
          ARRAY['https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600'],
          3, 'Sony', 'WH-1000XM5', 'Black', 12, 85, false, 4.9, 1834
        ),
        (
          'iPad Pro 12.9" M2', 'ipad-pro-12-9-m2',
          'iPad Pro 12.9", M2 çipi ile Mac düzeyinde performans, Liquid Retina XDR ekran ile pro seviye görsel deneyim ve Apple Pencil desteği ile dijital yaratıcılığın sınırlarını zorlar.',
          'M2 çipli professional tablet, 12.9" Liquid Retina XDR',
          34999.99, 32999.99,
          'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600',
          ARRAY['https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600'],
          1, 'Apple', 'iPad Pro', 'Space Gray', 12, 18, true, 4.8, 743
        ),
        (
          'Apple Watch Series 9', 'apple-watch-series-9',
          'Apple Watch Series 9, S9 çipi ile %20 daha hızlı performans, Always-On Retina ekran ve gelişmiş sağlık özellikleri ile aktif yaşamınızın en iyi yardımcısı.',
          'Sağlık ve fitness takip akıllı saati, GPS + Cellular',
          15999.99, 14999.99,
          'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=600',
          ARRAY['https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=600'],
          4, 'Apple', 'Watch Series 9', 'Midnight', 12, 67, false, 4.7, 956
        ),
        (
          'Nintendo Switch OLED', 'nintendo-switch-oled',
          'Nintendo Switch OLED, 7" OLED ekran ile daha canlı renkler, gelişmiş ses sistemi ve 64GB dahili depolama ile hem evde hem de yolda oyun deneyimini bir üst seviyeye taşır.',
          'Taşınabilir oyun konsolu, OLED ekran',
          11999.99, 10999.99,
          'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=600',
          ARRAY['https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=600'],
          5, 'Nintendo', 'Switch OLED', 'White', 12, 94, false, 4.6, 1289
        )
      `);
      console.log('✅ Detaylı ürünler eklendi!');
    }

    console.log('✅ E-ticaret veritabanı hazır!');
  } catch (error) {
    console.error('❌ Veritabanı başlatma hatası:', error);
  }
}

// API Routes

// Ana sayfa - API durumu
app.get('/', (req, res) => {
  res.json({ 
    message: '🛒 TechMart API Çalışıyor!', 
    version: '2.0.0',
    endpoints: ['/auth', '/products', '/cart', '/orders', '/users']
  });
});

// ==================== KULLANICI YÖNETİMİ ====================

// Kullanıcı kaydı
app.post('/auth/register', async (req, res) => {
  try {
    const { 
      email, password, firstName, lastName, phone, 
      countryCode = '+90', birthDate, gender 
    } = req.body;

    // Validasyon
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ 
        success: false, 
        error: 'E-posta, şifre, ad ve soyad gerekli' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'Şifre en az 6 karakter olmalı' 
      });
    }

    // E-posta format kontrolü
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Geçersiz e-posta formatı' 
      });
    }

    // Telefon format kontrolü (opsiyonel)
    if (phone && phone.length < 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'Geçersiz telefon numarası' 
      });
    }

    // Kullanıcı zaten var mı?
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Bu e-posta adresi zaten kayıtlı' 
      });
    }

    // Şifreyi hashle
    const passwordHash = await hashPassword(password);
    const verificationCode = generateVerificationCode();

    // Kullanıcıyı oluştur
    const result = await client.query(`
      INSERT INTO users (
        email, password_hash, first_name, last_name, phone, 
        country_code, birth_date, gender, verification_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING id, email, first_name, last_name, phone, country_code, created_at
    `, [
      email.toLowerCase(), passwordHash, firstName, lastName, 
      phone, countryCode, birthDate, gender, verificationCode
    ]);

    const user = result.rows[0];

    // JWT token oluştur
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Kayıt başarılı! Doğrulama kodu e-postanıza gönderildi.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        countryCode: user.country_code,
        isVerified: false
      },
      token,
      verificationCode // Geliştirme aşamasında gösteriyoruz
    });

  } catch (error) {
    console.error('Kayıt hatası:', error);
    res.status(500).json({ success: false, error: 'Kayıt işlemi başarısız' });
  }
});

// Kullanıcı girişi
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'E-posta ve şifre gerekli' 
      });
    }

    // Kullanıcıyı bul
    const result = await client.query(`
      SELECT id, email, password_hash, first_name, last_name, 
             phone, country_code, is_verified, last_login
      FROM users WHERE email = $1
    `, [email.toLowerCase()]);

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'E-posta veya şifre hatalı' 
      });
    }

    const user = result.rows[0];

    // Şifreyi doğrula
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'E-posta veya şifre hatalı' 
      });
    }

    // Son giriş zamanını güncelle
    await client.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // JWT token oluştur
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Giriş başarılı!',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        countryCode: user.country_code,
        isVerified: user.is_verified
      },
      token
    });

  } catch (error) {
    console.error('Giriş hatası:', error);
    res.status(500).json({ success: false, error: 'Giriş işlemi başarısız' });
  }
});

// E-posta doğrulama
app.post('/auth/verify-email', authenticateToken, async (req, res) => {
  try {
    const { verificationCode } = req.body;
    const userId = req.user.userId;

    if (!verificationCode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Doğrulama kodu gerekli' 
      });
    }

    const result = await client.query(`
      SELECT verification_code FROM users 
      WHERE id = $1 AND is_verified = false
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Kullanıcı bulunamadı veya zaten doğrulanmış' 
      });
    }

    const storedCode = result.rows[0].verification_code;
    if (storedCode !== verificationCode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Geçersiz doğrulama kodu' 
      });
    }

    // Kullanıcıyı doğrulanmış olarak işaretle
    await client.query(`
      UPDATE users 
      SET is_verified = true, verification_code = null, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [userId]);

    res.json({
      success: true,
      message: 'E-posta başarıyla doğrulandı!'
    });

  } catch (error) {
    console.error('E-posta doğrulama hatası:', error);
    res.status(500).json({ success: false, error: 'Doğrulama işlemi başarısız' });
  }
});

// Profil bilgilerini getir
app.get('/auth/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await client.query(`
      SELECT id, email, first_name, last_name, phone, country_code, 
             birth_date, gender, is_verified, created_at, last_login
      FROM users WHERE id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
    }

    const user = result.rows[0];
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        countryCode: user.country_code,
        birthDate: user.birth_date,
        gender: user.gender,
        isVerified: user.is_verified,
        memberSince: user.created_at,
        lastLogin: user.last_login
      }
    });

  } catch (error) {
    console.error('Profil getirme hatası:', error);
    res.status(500).json({ success: false, error: 'Profil bilgileri getirilemedi' });
  }
});

// Profil güncelleme
app.put('/auth/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { firstName, lastName, phone, countryCode, birthDate, gender } = req.body;

    const result = await client.query(`
      UPDATE users 
      SET first_name = $1, last_name = $2, phone = $3, country_code = $4,
          birth_date = $5, gender = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING first_name, last_name, phone, country_code, birth_date, gender
    `, [firstName, lastName, phone, countryCode, birthDate, gender, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
    }

    res.json({
      success: true,
      message: 'Profil başarıyla güncellendi!',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Profil güncelleme hatası:', error);
    res.status(500).json({ success: false, error: 'Profil güncellenemedi' });
  }
});

// ==================== ÜRÜN YÖNETİMİ ====================

// Tüm ürünleri getir (sayfalama ve filtreleme ile)
app.get('/products', optionalAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      category, 
      search, 
      minPrice, 
      maxPrice, 
      brand, 
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE p.is_active = true';
    let queryParams = [];
    let paramIndex = 1;

    // Filtreleme
    if (category) {
      whereClause += ` AND c.slug = $${paramIndex}`;
      queryParams.push(category);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex} OR p.brand ILIKE $${paramIndex})`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (minPrice) {
      whereClause += ` AND p.price >= $${paramIndex}`;
      queryParams.push(minPrice);
      paramIndex++;
    }

    if (maxPrice) {
      whereClause += ` AND p.price <= $${paramIndex}`;
      queryParams.push(maxPrice);
      paramIndex++;
    }

    if (brand) {
      whereClause += ` AND p.brand ILIKE $${paramIndex}`;
      queryParams.push(`%${brand}%`);
      paramIndex++;
    }

    // Sıralama
    let orderClause = `ORDER BY p.${sortBy} ${sortOrder}`;
    if (sortBy === 'popularity') {
      orderClause = 'ORDER BY p.view_count DESC, p.rating DESC';
    } else if (sortBy === 'rating') {
      orderClause = 'ORDER BY p.rating DESC, p.review_count DESC';
    } else if (sortBy === 'price_asc') {
      orderClause = 'ORDER BY p.price ASC';
    } else if (sortBy === 'price_desc') {
      orderClause = 'ORDER BY p.price DESC';
    }

    const query = `
      SELECT 
        p.*, 
        c.name as category_name,
        c.slug as category_slug,
        CASE 
          WHEN p.discount_price IS NOT NULL THEN 
            ROUND(((p.price - p.discount_price) / p.price * 100)::numeric, 0)
          ELSE 0 
        END as discount_percentage
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ${orderClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);

    // Toplam sayıyı al
    const countQuery = `
      SELECT COUNT(*) 
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
    `;
    
    const [productsResult, countResult] = await Promise.all([
      client.query(query, queryParams),
      client.query(countQuery, queryParams.slice(0, -2)) // limit ve offset'i çıkar
    ]);

    const totalProducts = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalProducts / limit);

    res.json({ 
      success: true, 
      products: productsResult.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Ürünler getirme hatası:', error);
    res.status(500).json({ success: false, error: 'Ürünler getirilemedi' });
  }
});

// Tek ürün detayını getir
app.get('/products/:slug', optionalAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.user?.userId;

    // Ürün detaylarını getir
    const productQuery = `
      SELECT 
        p.*, 
        c.name as category_name,
        c.slug as category_slug,
        CASE 
          WHEN p.discount_price IS NOT NULL THEN 
            ROUND(((p.price - p.discount_price) / p.price * 100)::numeric, 0)
          ELSE 0 
        END as discount_percentage
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.slug = $1 AND p.is_active = true
    `;

    const productResult = await client.query(productQuery, [slug]);
    
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
    }

    const product = productResult.rows[0];

    // Görüntülenme sayısını artır
    await client.query('UPDATE products SET view_count = view_count + 1 WHERE id = $1', [product.id]);

    // Kullanıcı giriş yapmışsa, son görüntülenen ürünlere ekle
    if (userId) {
      await client.query(`
        INSERT INTO recently_viewed (user_id, product_id, viewed_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, product_id) 
        DO UPDATE SET viewed_at = CURRENT_TIMESTAMP
      `, [userId, product.id]);

      // Favori durumunu kontrol et
      const favoriteResult = await client.query(
        'SELECT id FROM favorites WHERE user_id = $1 AND product_id = $2',
        [userId, product.id]
      );
      product.is_favorite = favoriteResult.rows.length > 0;
    }

    // Son yorumları getir
    const reviewsQuery = `
      SELECT 
        pr.*, 
        u.first_name, 
        u.last_name,
        u.email
      FROM product_reviews pr
      LEFT JOIN users u ON pr.user_id = u.id
      WHERE pr.product_id = $1 AND pr.is_approved = true
      ORDER BY pr.created_at DESC
      LIMIT 5
    `;

    const reviewsResult = await client.query(reviewsQuery, [product.id]);

    // Benzer ürünleri getir
    const similarQuery = `
      SELECT p.*, c.name as category_name,
        CASE 
          WHEN p.discount_price IS NOT NULL THEN 
            ROUND(((p.price - p.discount_price) / p.price * 100)::numeric, 0)
          ELSE 0 
        END as discount_percentage
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.category_id = $1 AND p.id != $2 AND p.is_active = true
      ORDER BY p.rating DESC, p.view_count DESC
      LIMIT 6
    `;

    const similarResult = await client.query(similarQuery, [product.category_id, product.id]);

    res.json({ 
      success: true, 
      product: {
        ...product,
        reviews: reviewsResult.rows.map(review => ({
          ...review,
          user_name: review.first_name && review.last_name 
            ? `${review.first_name} ${review.last_name.charAt(0)}.`
            : 'Anonim Kullanıcı'
        }))
      },
      similarProducts: similarResult.rows
    });

  } catch (error) {
    console.error('Ürün detayı hatası:', error);
    res.status(500).json({ success: false, error: 'Ürün detayı getirilemedi' });
  }
});

// Kategorileri getir
app.get('/categories', async (req, res) => {
  try {
    const query = `
      SELECT 
        c.*,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = true
      WHERE c.is_active = true
      GROUP BY c.id
      ORDER BY c.sort_order, c.name
    `;

    const result = await client.query(query);
    res.json({ success: true, categories: result.rows });

  } catch (error) {
    console.error('Kategoriler getirme hatası:', error);
    res.status(500).json({ success: false, error: 'Kategoriler getirilemedi' });
  }
});

// Öne çıkan ürünleri getir
app.get('/products/featured', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.*, 
        c.name as category_name,
        CASE 
          WHEN p.discount_price IS NOT NULL THEN 
            ROUND(((p.price - p.discount_price) / p.price * 100)::numeric, 0)
          ELSE 0 
        END as discount_percentage
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_featured = true AND p.is_active = true
      ORDER BY p.rating DESC, p.view_count DESC
      LIMIT 8
    `;

    const result = await client.query(query);
    res.json({ success: true, products: result.rows });

  } catch (error) {
    console.error('Öne çıkan ürünler hatası:', error);
    res.status(500).json({ success: false, error: 'Öne çıkan ürünler getirilemedi' });
  }
});

// Sepete ürün ekle
app.post('/cart/:productId', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity = 1 } = req.body;
    const userId = req.user.id;
    
    // Önce ürünün stokta olup olmadığını kontrol et
    const productResult = await client.query('SELECT stock FROM products WHERE id = $1', [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
    }
    
    if (productResult.rows[0].stock < quantity) {
      return res.status(400).json({ success: false, error: 'Yeterli stok yok' });
    }

    // Sepette aynı ürün var mı kontrol et
    const existingCart = await client.query('SELECT * FROM cart WHERE user_id = $1 AND product_id = $2', [userId, productId]);
    
    if (existingCart.rows.length > 0) {
      // Var olan ürünün miktarını güncelle
      await client.query('UPDATE cart SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND product_id = $3', [quantity, userId, productId]);
    } else {
      // Yeni ürün ekle
      await client.query('INSERT INTO cart (user_id, product_id, quantity) VALUES ($1, $2, $3)', [userId, productId, quantity]);
    }
    
    res.json({ success: true, message: 'Ürün sepete eklendi!' });
  } catch (error) {
    console.error('Sepete ekleme hatası:', error);
    res.status(500).json({ success: false, error: 'Sepete ekleme başarısız' });
  }
});

// Sepet içeriğini getir
app.get('/cart', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await client.query(`
      SELECT c.id, c.quantity, c.product_id, p.name, p.price, p.image_url, (c.quantity * p.price) as total
      FROM cart c 
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1
      ORDER BY c.added_at DESC
    `, [userId]);
    
    const total = result.rows.reduce((sum, item) => sum + parseFloat(item.total), 0);
    
    // Frontend'in beklediği formata uygun hale getir
    const items = result.rows.map(row => ({
      id: row.product_id,
      name: row.name,
      price: parseFloat(row.price),
      image: row.image_url,
      quantity: row.quantity
    }));
    
    res.json({ 
      success: true, 
      items: items,
      totalAmount: total.toFixed(2)
    });
  } catch (error) {
    console.error('Sepet getirme hatası:', error);
    res.status(500).json({ success: false, error: 'Sepet getirilemedi' });
  }
});

// Sepetten ürün sil
app.delete('/cart/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    await client.query('DELETE FROM cart WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json({ success: true, message: 'Ürün sepetten silindi!' });
  } catch (error) {
    console.error('Sepetten silme hatası:', error);
    res.status(500).json({ success: false, error: 'Sepetten silme başarısız' });
  }
});

// Sepeti sunucu ile senkronize et
app.post('/cart/sync', authenticateToken, async (req, res) => {
  try {
    const { items } = req.body;
    const userId = req.user.id;
    
    // Önce kullanıcının mevcut sepetini temizle
    await client.query('DELETE FROM cart WHERE user_id = $1', [userId]);
    
    // Yeni sepet öğelerini ekle
    for (const item of items) {
      await client.query(
        'INSERT INTO cart (user_id, product_id, quantity) VALUES ($1, $2, $3)',
        [userId, item.id, item.quantity]
      );
    }
    
    res.json({ success: true, message: 'Sepet senkronize edildi!' });
  } catch (error) {
    console.error('Sepet senkronizasyon hatası:', error);
    res.status(500).json({ success: false, error: 'Sepet senkronize edilemedi' });
  }
});

// Sipariş oluştur
app.post('/orders', authenticateToken, async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone } = req.body;
    const userId = req.user.id;
    
    // Sepet toplamını hesapla
    const cartResult = await client.query(`
      SELECT c.quantity, p.price, c.product_id
      FROM cart c 
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1
    `, [userId]);
    
    if (cartResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Sepet boş!' });
    }
    
    const totalAmount = cartResult.rows.reduce((sum, item) => sum + (item.quantity * parseFloat(item.price)), 0);
    
    // Siparişi oluştur
    const orderResult = await client.query(`
      INSERT INTO orders (customer_name, customer_email, customer_phone, total_amount) 
      VALUES ($1, $2, $3, $4) RETURNING id
    `, [customerName, customerEmail, customerPhone, totalAmount]);
    
    // Stokları güncelle
    for (const item of cartResult.rows) {
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, item.product_id]);
    }
    
    // Kullanıcının sepetini temizle
    await client.query('DELETE FROM cart WHERE user_id = $1', [userId]);
    
    res.json({ 
      success: true, 
      message: 'Sipariş başarıyla oluşturuldu!',
      orderId: orderResult.rows[0].id,
      totalAmount: totalAmount.toFixed(2)
    });
  } catch (error) {
    console.error('Sipariş oluşturma hatası:', error);
    res.status(500).json({ success: false, error: 'Sipariş oluşturulamadı' });
  }
});

// Siparişleri listele
app.get('/orders', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 20');
    res.json({ success: true, orders: result.rows });
  } catch (error) {
    console.error('Siparişler getirme hatası:', error);
    res.status(500).json({ success: false, error: 'Siparişler getirilemedi' });
  }
});

// Sipariş durumunu güncelle
app.put('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Geçersiz durum' });
    }
    
    const result = await client.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Sipariş bulunamadı' });
    }
    
    res.json({ 
      success: true, 
      message: 'Sipariş durumu güncellendi',
      order: result.rows[0]
    });
  } catch (error) {
    console.error('Sipariş durumu güncelleme hatası:', error);
    res.status(500).json({ success: false, error: 'Durum güncellenemedi' });
  }
});

// ==================== YORUM SİSTEMİ ====================

// Ürüne yorum yap
app.post('/products/:productId/reviews', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, title, comment } = req.body;
    const userId = req.user.userId;

    // Validasyon
    if (!rating || !comment || rating < 1 || rating > 5) {
      return res.status(400).json({ 
        success: false, 
        error: 'Geçerli bir puan (1-5) ve yorum gerekli' 
      });
    }

    // Kullanıcı daha önce yorum yapmış mı?
    const existingReview = await client.query(
      'SELECT id FROM product_reviews WHERE product_id = $1 AND user_id = $2',
      [productId, userId]
    );

    if (existingReview.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Bu ürüne zaten yorum yaptınız' 
      });
    }

    // Yorumu ekle
    const result = await client.query(`
      INSERT INTO product_reviews (product_id, user_id, rating, title, comment, is_approved)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `, [productId, userId, rating, title, comment]);

    // Ürünün ortalama puanını güncelle
    const avgResult = await client.query(`
      SELECT AVG(rating)::numeric(3,2) as avg_rating, COUNT(*) as review_count
      FROM product_reviews 
      WHERE product_id = $1 AND is_approved = true
    `, [productId]);

    const { avg_rating, review_count } = avgResult.rows[0];

    await client.query(`
      UPDATE products 
      SET rating = $1, review_count = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [avg_rating, review_count, productId]);

    res.status(201).json({ 
      success: true, 
      message: 'Yorumunuz başarıyla eklendi!',
      review: result.rows[0]
    });

  } catch (error) {
    console.error('Yorum ekleme hatası:', error);
    res.status(500).json({ success: false, error: 'Yorum eklenemedi' });
  }
});

// Ürün yorumlarını getir
app.get('/products/:productId/reviews', async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 5 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        pr.*, 
        u.first_name, 
        u.last_name,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - pr.created_at)) as seconds_ago
      FROM product_reviews pr
      LEFT JOIN users u ON pr.user_id = u.id
      WHERE pr.product_id = $1 AND pr.is_approved = true
      ORDER BY pr.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) FROM product_reviews 
      WHERE product_id = $1 AND is_approved = true
    `;

    const [reviewsResult, countResult] = await Promise.all([
      client.query(query, [productId, limit, offset]),
      client.query(countQuery, [productId])
    ]);

    const totalReviews = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalReviews / limit);

    // Puan dağılımını hesapla
    const ratingDistQuery = `
      SELECT rating, COUNT(*) as count
      FROM product_reviews 
      WHERE product_id = $1 AND is_approved = true
      GROUP BY rating
      ORDER BY rating DESC
    `;

    const ratingDistResult = await client.query(ratingDistQuery, [productId]);

    res.json({ 
      success: true, 
      reviews: reviewsResult.rows.map(review => ({
        ...review,
        user_name: review.first_name && review.last_name 
          ? `${review.first_name} ${review.last_name.charAt(0)}.`
          : 'Anonim Kullanıcı',
        time_ago: formatTimeAgo(review.seconds_ago)
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalReviews
      },
      ratingDistribution: ratingDistResult.rows
    });

  } catch (error) {
    console.error('Yorumlar getirme hatası:', error);
    res.status(500).json({ success: false, error: 'Yorumlar getirilemedi' });
  }
});

// Yorum faydalılık oylama
app.post('/reviews/:reviewId/vote', authenticateToken, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { isHelpful } = req.body; // true/false
    const userId = req.user.userId;

    // Daha önce oy vermiş mi?
    const existingVote = await client.query(
      'SELECT id, is_helpful FROM review_votes WHERE review_id = $1 AND user_id = $2',
      [reviewId, userId]
    );

    if (existingVote.rows.length > 0) {
      const currentVote = existingVote.rows[0];
      
      if (currentVote.is_helpful === isHelpful) {
        // Aynı oyu tekrar verdi, oyu kaldır
        await client.query('DELETE FROM review_votes WHERE id = $1', [currentVote.id]);
      } else {
        // Farklı oy verdi, güncelle
        await client.query(
          'UPDATE review_votes SET is_helpful = $1 WHERE id = $2',
          [isHelpful, currentVote.id]
        );
      }
    } else {
      // Yeni oy
      await client.query(
        'INSERT INTO review_votes (review_id, user_id, is_helpful) VALUES ($1, $2, $3)',
        [reviewId, userId, isHelpful]
      );
    }

    // Oy sayılarını güncelle
    const voteCountsResult = await client.query(`
      SELECT 
        SUM(CASE WHEN is_helpful = true THEN 1 ELSE 0 END) as helpful_count,
        SUM(CASE WHEN is_helpful = false THEN 1 ELSE 0 END) as not_helpful_count
      FROM review_votes 
      WHERE review_id = $1
    `, [reviewId]);

    const { helpful_count, not_helpful_count } = voteCountsResult.rows[0];

    await client.query(`
      UPDATE product_reviews 
      SET helpful_count = $1, not_helpful_count = $2
      WHERE id = $3
    `, [helpful_count || 0, not_helpful_count || 0, reviewId]);

    res.json({ 
      success: true, 
      message: 'Oyunuz kaydedildi!',
      helpfulCount: helpful_count || 0,
      notHelpfulCount: not_helpful_count || 0
    });

  } catch (error) {
    console.error('Oy verme hatası:', error);
    res.status(500).json({ success: false, error: 'Oy verilemedi' });
  }
});

// ==================== FAVORİLER ====================

// Favorilere ekle/çıkar
app.post('/favorites/:productId', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.userId;

    // Zaten favoride mi?
    const existingFavorite = await client.query(
      'SELECT id FROM favorites WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );

    if (existingFavorite.rows.length > 0) {
      // Favorilerden çıkar
      await client.query('DELETE FROM favorites WHERE user_id = $1 AND product_id = $2', [userId, productId]);
      res.json({ success: true, message: 'Ürün favorilerden çıkarıldı', isFavorite: false });
    } else {
      // Favorilere ekle
      await client.query(
        'INSERT INTO favorites (user_id, product_id) VALUES ($1, $2)',
        [userId, productId]
      );
      res.json({ success: true, message: 'Ürün favorilere eklendi', isFavorite: true });
    }

  } catch (error) {
    console.error('Favori işlemi hatası:', error);
    res.status(500).json({ success: false, error: 'Favori işlemi başarısız' });
  }
});

// Kullanıcının favorilerini getir
app.get('/favorites', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const query = `
      SELECT 
        p.*, 
        c.name as category_name,
        f.created_at as favorited_at,
        CASE 
          WHEN p.discount_price IS NOT NULL THEN 
            ROUND(((p.price - p.discount_price) / p.price * 100)::numeric, 0)
          ELSE 0 
        END as discount_percentage
      FROM favorites f
      JOIN products p ON f.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE f.user_id = $1 AND p.is_active = true
      ORDER BY f.created_at DESC
    `;

    const result = await client.query(query, [userId]);
    res.json({ success: true, favorites: result.rows });

  } catch (error) {
    console.error('Favoriler getirme hatası:', error);
    res.status(500).json({ success: false, error: 'Favoriler getirilemedi' });
  }
});

// Zaman formatı fonksiyonu
function formatTimeAgo(seconds) {
  if (seconds < 60) return 'Az önce';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dakika önce`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} saat önce`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)} gün önce`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} ay önce`;
  return `${Math.floor(seconds / 31536000)} yıl önce`;
}

// Sunucuyu başlat ve veritabanını initialize et
app.listen(PORT, () => {
  console.log(`🛒 E-ticaret Backend ${PORT} portunda çalışıyor!`);
  initializeDatabase();
});
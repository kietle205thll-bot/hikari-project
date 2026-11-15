const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  console.log('🚀 Bắt đầu khởi tạo Schema và Migrate dữ liệu sang Neon PostgreSQL...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Tạo bảng Categories
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        icon VARCHAR(50),
        description TEXT
      );
    `);

    // 2. Tạo bảng Banners
    await client.query(`
      CREATE TABLE IF NOT EXISTS banners (
        id SERIAL PRIMARY KEY,
        tenbanner VARCHAR(255) NOT NULL,
        hinhbanner TEXT NOT NULL,
        mota TEXT,
        "productId" INT,
        tag VARCHAR(100)
      );
    `);

    // 3. Tạo bảng Coupons
    await client.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        "discountType" VARCHAR(50) DEFAULT 'percent',
        "discountValue" NUMERIC NOT NULL,
        "minOrder" NUMERIC DEFAULT 0,
        description TEXT,
        target VARCHAR(50) DEFAULT 'all',
        "onceOnly" BOOLEAN DEFAULT false,
        "usageLimit" VARCHAR(50) DEFAULT 'once',
        "monthlyMinSpent" NUMERIC,
        "maintainMinSpent" NUMERIC
      );
    `);

    // 4. Tạo bảng Products
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id BIGINT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        author VARCHAR(255),
        publisher VARCHAR(255),
        translator VARCHAR(255),
        price NUMERIC NOT NULL,
        "originalPrice" NUMERIC,
        discount NUMERIC DEFAULT 0,
        "categoryId" INT,
        "categoryName" VARCHAR(255),
        genre VARCHAR(255) DEFAULT '',
        image TEXT,
        description TEXT,
        pages INT,
        "publishYear" INT,
        format VARCHAR(255),
        rating NUMERIC DEFAULT 5,
        "reviewsCount" INT DEFAULT 0,
        stock INT DEFAULT 0,
        sold INT DEFAULT 0,
        "isHot" BOOLEAN DEFAULT false,
        "isNew" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Tạo bảng Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        birthday VARCHAR(50),
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'customer',
        status VARCHAR(50) DEFAULT 'active',
        "usedCoupons" JSONB DEFAULT '[]'::jsonb,
        address TEXT,
        wishlist JSONB DEFAULT '[]'::jsonb,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. Tạo bảng Orders
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id BIGINT PRIMARY KEY,
        "orderCode" VARCHAR(50) UNIQUE NOT NULL,
        "userId" BIGINT,
        customer JSONB NOT NULL,
        items JSONB NOT NULL,
        subtotal NUMERIC NOT NULL,
        "shippingFee" NUMERIC DEFAULT 0,
        discount NUMERIC DEFAULT 0,
        "couponCode" VARCHAR(50),
        total NUMERIC NOT NULL,
        "paymentMethod" VARCHAR(50) DEFAULT 'cod',
        "paymentStatus" VARCHAR(100) DEFAULT 'Chưa thanh toán (COD)',
        status VARCHAR(100) DEFAULT 'Chờ xác nhận',
        "trackingCode" VARCHAR(100),
        "createdAt" VARCHAR(100),
        "createdAtIso" VARCHAR(100),
        "confirmedAt" VARCHAR(100),
        "shippedAt" VARCHAR(100),
        "completedAt" VARCHAR(100),
        "cancelledAt" VARCHAR(100),
        "cancelReason" TEXT
      );
    `);

    // 7. Tạo bảng Carts
    await client.query(`
      CREATE TABLE IF NOT EXISTS carts (
        id BIGINT PRIMARY KEY,
        "userId" BIGINT NOT NULL,
        "productId" BIGINT NOT NULL,
        name VARCHAR(255) NOT NULL,
        price NUMERIC NOT NULL,
        image TEXT,
        quantity INT DEFAULT 1,
        "isNew" BOOLEAN DEFAULT false
      );
    `);

    // 8. Tạo bảng SePay Transactions (lưu vết chuyển khoản)
    await client.query(`
      CREATE TABLE IF NOT EXISTS sepay_transactions (
        id SERIAL PRIMARY KEY,
        transaction_id INT,
        gateway VARCHAR(50),
        transaction_date VARCHAR(100),
        account_number VARCHAR(100),
        code VARCHAR(100),
        content TEXT,
        transfer_type VARCHAR(20),
        transfer_amount NUMERIC,
        accumulated NUMERIC,
        reference_code VARCHAR(100),
        description TEXT,
        order_code VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Đã tạo đầy đủ các bảng dữ liệu trong PostgreSQL!');

    // Đọc dữ liệu từ db.json
    const dbJsonPath = path.join(__dirname, '../manga/db.json');
    if (!fs.existsSync(dbJsonPath)) {
      throw new Error(`Không tìm thấy file db.json tại ${dbJsonPath}`);
    }
    const dbData = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));

    // Xóa dữ liệu cũ nếu có để seed mới
    await client.query('TRUNCATE categories, banners, coupons, products, users, orders, carts RESTART IDENTITY CASCADE;');

    // Seed Categories
    for (const c of dbData.categories || []) {
      await client.query(
        `INSERT INTO categories (id, name, slug, icon, description) VALUES ($1, $2, $3, $4, $5)`,
        [c.id, c.name, c.slug, c.icon, c.description]
      );
    }
    console.log(`✓ Đã nạp ${(dbData.categories || []).length} danh mục.`);

    // Seed Banners
    for (const b of dbData.banners || []) {
      await client.query(
        `INSERT INTO banners (id, tenbanner, hinhbanner, mota, "productId", tag) VALUES ($1, $2, $3, $4, $5, $6)`,
        [b.id, b.tenbanner, b.hinhbanner, b.mota, b.productId, b.tag]
      );
    }
    console.log(`✓ Đã nạp ${(dbData.banners || []).length} banners.`);

    // Seed Coupons
    for (const cp of dbData.coupons || []) {
      await client.query(
        `INSERT INTO coupons (id, code, title, "discountType", "discountValue", "minOrder", description, target, "onceOnly", "usageLimit", "monthlyMinSpent", "maintainMinSpent")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          cp.id,
          cp.code,
          cp.title,
          cp.discountType || 'percent',
          cp.discountValue || 0,
          cp.minOrder || 0,
          cp.description || '',
          cp.target || 'all',
          cp.onceOnly ?? false,
          cp.usageLimit || 'once',
          cp.monthlyMinSpent || null,
          cp.maintainMinSpent || null
        ]
      );
    }
    console.log(`✓ Đã nạp ${(dbData.coupons || []).length} mã giảm giá.`);

    // Seed Products
    for (const p of dbData.products || []) {
      await client.query(
        `INSERT INTO products (
          id, name, author, publisher, translator, price, "originalPrice", discount,
          "categoryId", "categoryName", image, description, pages, "publishYear",
          format, rating, "reviewsCount", stock, sold, "isHot", "isNew"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21
        )`,
        [
          p.id,
          p.name,
          p.author || '',
          p.publisher || '',
          p.translator || '',
          p.price || 0,
          p.originalPrice || p.price || 0,
          p.discount || 0,
          p.categoryId || null,
          p.categoryName || '',
          p.image || '',
          p.description || '',
          p.pages || 0,
          p.publishYear || 2024,
          p.format || '',
          p.rating || 5,
          p.reviewsCount || 0,
          p.stock || 0,
          p.sold || 0,
          p.isHot ?? false,
          p.isNew ?? false
        ]
      );
    }
    console.log(`✓ Đã nạp ${(dbData.products || []).length} sản phẩm sách.`);

    // Seed Users
    for (const u of dbData.users || []) {
      await client.query(
        `INSERT INTO users (id, name, email, phone, birthday, password, role, status, "usedCoupons", address, wishlist)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          u.id,
          u.name,
          u.email,
          u.phone || '',
          u.birthday || '',
          u.password || '123456',
          u.role || 'customer',
          u.status || 'active',
          JSON.stringify(u.usedCoupons || []),
          u.address || '',
          JSON.stringify(u.wishlist || [])
        ]
      );
    }
    console.log(`✓ Đã nạp ${(dbData.users || []).length} tài khoản người dùng.`);

    // Seed Orders
    for (const o of dbData.orders || []) {
      await client.query(
        `INSERT INTO orders (
          id, "orderCode", "userId", customer, items, subtotal, "shippingFee", discount,
          "couponCode", total, "paymentMethod", "paymentStatus", status, "trackingCode", "createdAt", "createdAtIso"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16
        )`,
        [
          o.id,
          o.orderCode,
          o.userId,
          JSON.stringify(o.customer || {}),
          JSON.stringify(o.items || []),
          o.subtotal || 0,
          o.shippingFee || 0,
          o.discount || 0,
          o.couponCode || '',
          o.total || 0,
          o.paymentMethod || 'cod',
          o.paymentStatus || 'Chưa thanh toán (COD)',
          o.status || 'Chờ xác nhận',
          o.trackingCode || '',
          o.createdAt || '',
          o.createdAtIso || ''
        ]
      );
    }
    console.log(`✓ Đã nạp ${(dbData.orders || []).length} đơn hàng.`);

    await client.query('COMMIT');
    console.log('🎉 TẤT CẢ DỮ LIỆU ĐÃ ĐƯỢC CHUYỂN THÀNH CÔNG LÊN NEON POSTGRESQL!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi khi Migrate CSDL:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();


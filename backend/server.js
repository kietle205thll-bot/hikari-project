const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { query } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Hikari BookStore API Server is running',
    database: 'Neon PostgreSQL (Singapore)',
    timestamp: new Date().toISOString()
  });
});

// ================= 1. CATEGORIES API =================
app.get('/categories', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=15, s-maxage=30');
    const result = await query('SELECT * FROM categories ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Lỗi GET /categories:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/categories', async (req, res) => {
  try {
    const { name, slug, icon, description } = req.body;
    const result = await query(
      `INSERT INTO categories (name, slug, icon, description) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, slug || name.toLowerCase().replace(/\s+/g, '-'), icon || '✨', description || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi POST /categories:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM categories WHERE id = $1', [id]);
    res.json({ success: true, message: `Deleted category #${id}` });
  } catch (err) {
    console.error('Lỗi DELETE /categories/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ================= 2. BANNERS API =================
app.get('/banners', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=15, s-maxage=30');
    const result = await query('SELECT * FROM banners ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Lỗi GET /banners:', err);
    res.status(500).json({ error: err.message });
  }
});

// ================= 3. COUPONS API =================
app.get('/coupons', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=15, s-maxage=30');
    const result = await query('SELECT * FROM coupons ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Lỗi GET /coupons:', err);
    res.status(500).json({ error: err.message });
  }
});

// ================= 4. PRODUCTS API =================
app.get('/products', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=15, s-maxage=30');
    const { categoryId, _sort, _order, _limit } = req.query;
    let sql = 'SELECT * FROM products';
    const params = [];

    if (categoryId && Number(categoryId) > 0) {
      params.push(Number(categoryId));
      sql += ` WHERE "categoryId" = $${params.length}`;
    }

    if (_sort) {
      const order = (_order || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      sql += ` ORDER BY "${_sort}" ${order}`;
    } else {
      sql += ' ORDER BY id ASC';
    }

    if (_limit && Number(_limit) > 0) {
      params.push(Number(_limit));
      sql += ` LIMIT $${params.length}`;
    }

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Lỗi GET /products:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM products WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi GET /products/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/products', async (req, res) => {
  try {
    const p = req.body;
    const id = p.id || Date.now();
    const result = await query(
      `INSERT INTO products (
        id, name, author, publisher, translator, price, "originalPrice", discount,
        "categoryId", "categoryName", image, description, pages, "publishYear",
        format, rating, "reviewsCount", stock, sold, "isHot", "isNew"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21
      ) RETURNING *`,
      [
        id,
        p.name || 'Sách mới',
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
        p.publishYear || new Date().getFullYear(),
        p.format || '',
        p.rating || 5,
        p.reviewsCount || 0,
        p.stock || 0,
        p.sold || 0,
        p.isHot ?? false,
        p.isNew ?? true
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi POST /products:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'id') continue;
      fields.push(`"${key}" = $${idx++}`);
      values.push(val);
    }

    if (fields.length === 0) {
      return res.json({ message: 'No fields to update' });
    }

    values.push(id);
    const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi PATCH /products/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const p = req.body;
    const result = await query(
      `UPDATE products SET
        name = $1, author = $2, publisher = $3, translator = $4, price = $5,
        "originalPrice" = $6, discount = $7, "categoryId" = $8, "categoryName" = $9,
        image = $10, description = $11, pages = $12, "publishYear" = $13,
        format = $14, rating = $15, "reviewsCount" = $16, stock = $17,
        sold = $18, "isHot" = $19, "isNew" = $20
      WHERE id = $21 RETURNING *`,
      [
        p.name, p.author || '', p.publisher || '', p.translator || '', p.price,
        p.originalPrice || p.price, p.discount || 0, p.categoryId || null, p.categoryName || '',
        p.image || '', p.description || '', p.pages || 0, p.publishYear || 2024,
        p.format || '', p.rating || 5, p.reviewsCount || 0, p.stock || 0,
        p.sold || 0, p.isHot ?? false, p.isNew ?? false, id
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi PUT /products/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM products WHERE id = $1', [id]);
    res.json({ success: true, message: `Deleted product #${id}` });
  } catch (err) {
    console.error('Lỗi DELETE /products/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ================= 5. USERS API =================
app.get('/users', async (req, res) => {
  try {
    const { email } = req.query;
    if (email) {
      const result = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      return res.json(result.rows);
    }
    const result = await query('SELECT * FROM users ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Lỗi GET /users:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi GET /users/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/users', async (req, res) => {
  try {
    const u = req.body;
    const id = u.id || Date.now();
    const result = await query(
      `INSERT INTO users (id, name, email, phone, birthday, password, role, status, "usedCoupons", address, wishlist)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        id,
        u.name || '',
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
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi POST /users:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'id') continue;
      fields.push(`"${key}" = $${idx++}`);
      values.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
    }

    if (fields.length === 0) return res.json({ message: 'No fields' });

    values.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi PATCH /users/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true, message: `Deleted user #${id}` });
  } catch (err) {
    console.error('Lỗi DELETE /users/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ================= 6. ORDERS API =================
app.get('/orders', async (req, res) => {
  try {
    const { userId, orderCode } = req.query;
    let sql = 'SELECT * FROM orders';
    const params = [];

    if (userId) {
      params.push(userId);
      sql += ` WHERE "userId" = $${params.length}`;
    } else if (orderCode) {
      params.push(orderCode);
      sql += ` WHERE "orderCode" ILIKE $${params.length}`;
    }

    sql += ' ORDER BY id DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Lỗi GET /orders:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM orders WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi GET /orders/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/orders', async (req, res) => {
  try {
    const o = req.body;
    const id = o.id || Date.now();
    const result = await query(
      `INSERT INTO orders (
        id, "orderCode", "userId", customer, items, subtotal, "shippingFee", discount,
        "couponCode", total, "paymentMethod", "paymentStatus", status, "trackingCode", "createdAt", "createdAtIso"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING *`,
      [
        id,
        o.orderCode || ('HKR' + Math.floor(100000 + Math.random() * 900000)),
        o.userId || null,
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
        o.createdAt || new Date().toLocaleString('vi-VN'),
        o.createdAtIso || new Date().toISOString()
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi POST /orders:', err);
    res.status(500).json({ error: err.message });
  }
});

const ALLOWED_ORDER_COLUMNS = new Set([
  'orderCode', 'userId', 'customer', 'items', 'subtotal', 'shippingFee',
  'discount', 'couponCode', 'total', 'paymentMethod', 'paymentStatus',
  'status', 'trackingCode', 'createdAt', 'createdAtIso',
  'confirmedAt', 'shippedAt', 'completedAt', 'cancelledAt', 'cancelReason'
]);

app.patch('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (key === 'id') continue;
      if (!ALLOWED_ORDER_COLUMNS.has(key)) continue;
      fields.push(`"${key}" = $${idx++}`);
      values.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
    }

    if (fields.length === 0) return res.json({ message: 'No valid fields to update' });

    values.push(id);
    const sql = `UPDATE orders SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi PATCH /orders/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM orders WHERE id = $1', [id]);
    res.json({ success: true, message: `Deleted order #${id}` });
  } catch (err) {
    console.error('Lỗi DELETE /orders/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ================= 7. CARTS API =================
app.get('/carts', async (req, res) => {
  try {
    const { userId, productId } = req.query;
    let sql = 'SELECT * FROM carts WHERE 1=1';
    const params = [];
    if (userId) {
      params.push(userId);
      sql += ` AND "userId" = $${params.length}`;
    }
    if (productId) {
      params.push(productId);
      sql += ` AND "productId" = $${params.length}`;
    }
    sql += ' ORDER BY id ASC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Lỗi GET /carts:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/carts', async (req, res) => {
  try {
    const item = req.body;
    const id = item.id || Date.now();
    const result = await query(
      `INSERT INTO carts (id, "userId", "productId", name, price, image, quantity, "isNew")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        id,
        item.userId,
        item.productId,
        item.name || '',
        item.price || 0,
        item.image || '',
        item.quantity || 1,
        item.isNew ?? false
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi POST /carts:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/carts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    const result = await query(
      `UPDATE carts SET quantity = $1 WHERE id = $2 RETURNING *`,
      [quantity, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cart item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi PATCH /carts/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/carts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM carts WHERE id = $1', [id]);
    res.json({ success: true, message: `Deleted cart item #${id}` });
  } catch (err) {
    console.error('Lỗi DELETE /carts/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/carts', async (req, res) => {
  try {
    const { userId } = req.query;
    if (userId) {
      await query('DELETE FROM carts WHERE "userId" = $1', [userId]);
      return res.json({ success: true, message: `Cleared cart for user #${userId}` });
    }
    await query('DELETE FROM carts');
    res.json({ success: true, message: 'Cleared all carts' });
  } catch (err) {
    console.error('Lỗi DELETE /carts:', err);
    res.status(500).json({ error: err.message });
  }
});

// ================= 8. SEPAY WEBHOOK & PAYMENT AUTOMATION =================

/**
 * Xử lý Webhook từ SePay gửi về khi có giao dịch chuyển khoản ngân hàng
 * SePay gửi payload JSON:
 * {
 *   "id": 123456,
 *   "gateway": "MBBank",
 *   "transactionDate": "2026-11-14 10:00:00",
 *   "accountNumber": "0388888888",
 *   "code": null,
 *   "content": "Thanh toan HKR889901",
 *   "transferType": "in",
 *   "transferAmount": 823500,
 *   "accumulated": 1000000,
 *   "referenceCode": "FT...",
 *   "description": "..."
 * }
 */
app.post('/api/sepay/webhook', async (req, res) => {
  try {
    const payload = req.body;
    console.log('⚡ Nhận SePay Webhook:', JSON.stringify(payload, null, 2));

    const {
      id: transactionId,
      gateway,
      transactionDate,
      accountNumber,
      code,
      content,
      transferType,
      transferAmount,
      accumulated,
      referenceCode,
      description
    } = payload;

    // Chỉ xử lý giao dịch tiền vào (tiền nhận được)
    if (transferType !== 'in' && transferType !== 'IN') {
      return res.json({ success: true, message: 'Bỏ qua giao dịch tiền ra' });
    }

    // Tách mã đơn hàng từ nội dung chuyển khoản (tìm HKR kèm số, ví dụ HKR889901)
    const contentStr = String(content || description || '');
    const codeMatch = contentStr.match(/(HKR\d{6,})/i) || contentStr.match(/(HKR[A-Z0-9]+)/i);

    let matchedOrderCode = null;
    let orderUpdated = false;

    if (codeMatch) {
      matchedOrderCode = codeMatch[1].toUpperCase();

      // Tìm đơn hàng trong PostgreSQL
      const orderRes = await query('SELECT * FROM orders WHERE "orderCode" ILIKE $1', [matchedOrderCode]);

      if (orderRes.rows.length > 0) {
        const order = orderRes.rows[0];
        const received = Number(transferAmount) || 0;
        const required = Number(order.total) || 0;

        // So khớp số tiền nhận được >= tổng tiền đơn hàng
        if (received >= required) {
          await query(
            `UPDATE orders SET
              "paymentStatus" = 'Đã thanh toán (SePay QR)',
              status = CASE WHEN status = 'Chờ xác nhận' THEN 'Đang xử lý' ELSE status END
             WHERE "orderCode" ILIKE $1`,
            [matchedOrderCode]
          );
          orderUpdated = true;
          console.log(`✅ Đã tự động kích hoạt ĐÃ THANH TOÁN cho đơn hàng #${matchedOrderCode} (Nhận ${received}đ / Yêu cầu ${required}đ)!`);
        } else {
          console.warn(`⚠️ Số tiền chuyển (${received}đ) ít hơn tổng tiền đơn hàng #${matchedOrderCode} (${required}đ). Cần đối soát thủ công.`);
        }
      }
    }

    // Lưu vết giao dịch SePay vào bảng sepay_transactions
    await query(
      `INSERT INTO sepay_transactions (
        transaction_id, gateway, transaction_date, account_number, code, content,
        transfer_type, transfer_amount, accumulated, reference_code, description, order_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        transactionId || null,
        gateway || '',
        transactionDate || '',
        accountNumber || '',
        code || '',
        contentStr,
        transferType || 'in',
        transferAmount || 0,
        accumulated || 0,
        referenceCode || '',
        description || '',
        matchedOrderCode || ''
      ]
    );

    res.json({
      success: true,
      orderCode: matchedOrderCode,
      orderUpdated,
      message: orderUpdated
        ? `Đơn hàng #${matchedOrderCode} đã thanh toán thành công qua SePay`
        : 'Đã ghi nhận giao dịch SePay'
    });
  } catch (err) {
    console.error('❌ Lỗi xử lý SePay Webhook:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint cho Frontend kiểm tra thời gian thực trạng thái thanh toán của đơn hàng (Polling)
app.get('/api/orders/check-payment/:orderCode', async (req, res) => {
  try {
    const { orderCode } = req.params;
    const result = await query(
      'SELECT id, "orderCode", total, "paymentStatus", status FROM orders WHERE "orderCode" ILIKE $1',
      [orderCode]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = result.rows[0];
    const isPaid = String(order.paymentStatus).toLowerCase().includes('đã thanh toán');
    res.json({
      orderCode: order.orderCode,
      paymentStatus: order.paymentStatus,
      status: order.status,
      isPaid
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint giả lập thanh toán SePay (Sandbox / Test Mode không cần tiền thật)
app.post('/api/sepay/simulate-test', async (req, res) => {
  try {
    const { orderCode, amount } = req.body;
    if (!orderCode) {
      return res.status(400).json({ error: 'Thiếu orderCode' });
    }

    const orderRes = await query('SELECT * FROM orders WHERE "orderCode" ILIKE $1', [orderCode]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: `Không tìm thấy đơn hàng #${orderCode}` });
    }

    const order = orderRes.rows[0];
    const payAmount = Number(amount) || Number(order.total) || 0;

    // Giả lập webhook payload
    const mockPayload = {
      id: Math.floor(100000 + Math.random() * 900000),
      gateway: 'MBBank (Simulated)',
      transactionDate: new Date().toLocaleString('vi-VN'),
      accountNumber: '0388888888',
      code: null,
      content: `Thanh toan don hang ${orderCode}`,
      transferType: 'in',
      transferAmount: payAmount,
      accumulated: 10000000,
      referenceCode: 'TEST' + Date.now(),
      description: 'Giao dịch giả lập kiểm thử đồ án'
    };

    // Cập nhật trạng thái đơn
    await query(
      `UPDATE orders SET
        "paymentStatus" = 'Đã thanh toán (SePay QR Test)',
        status = CASE WHEN status = 'Chờ xác nhận' THEN 'Đang xử lý' ELSE status END
       WHERE "orderCode" ILIKE $1`,
      [orderCode]
    );

    // Ghi nhận transaction
    await query(
      `INSERT INTO sepay_transactions (
        transaction_id, gateway, transaction_date, account_number, code, content,
        transfer_type, transfer_amount, accumulated, reference_code, description, order_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        mockPayload.id,
        mockPayload.gateway,
        mockPayload.transactionDate,
        mockPayload.accountNumber,
        mockPayload.code,
        mockPayload.content,
        mockPayload.transferType,
        mockPayload.transferAmount,
        mockPayload.accumulated,
        mockPayload.referenceCode,
        mockPayload.description,
        orderCode
      ]
    );

    res.json({
      success: true,
      message: `Đã giả lập thanh toán thành công cho đơn hàng #${orderCode}!`,
      orderCode,
      paidAmount: payAmount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Khởi chạy server
app.listen(PORT, () => {
  console.log(`🚀 Hikari Backend Server is running at http://localhost:${PORT}`);
  console.log(`🔗 Neon PostgreSQL Connected: ${process.env.DATABASE_URL ? 'YES' : 'NO'}`);
});


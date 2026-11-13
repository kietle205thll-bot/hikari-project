/**
 * api.js - Quản lý kết nối API tới json-server
 * Sử dụng Axios và Async/Await
 */
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  }
});

/**
 * Lấy danh sách danh mục (Categories)
 * Dùng timestamp _t để chống trình duyệt cache lại trạng thái cũ
 */
export const fetchCategories = async () => {
  try {
    const response = await api.get('/categories', {
      params: { _t: Date.now() }
    });
    return response.data;
  } catch (error) {
    console.warn('Không thể kết nối đến json-server:3000, đang dùng fallback db.json...', error.message);
    try {
      const fallbackResponse = await fetch(`./db.json?_t=${Date.now()}`);
      const data = await fallbackResponse.json();
      return data.categories || [];
    } catch (fbErr) {
      console.error('Lỗi lấy danh mục:', fbErr);
      return [];
    }
  }
};

/**
 * Lấy danh sách sản phẩm (Products)
 * Luôn lấy dữ liệu tồn kho mới nhất trực tiếp từ CSDL
 */
export const fetchProducts = async () => {
  try {
    const response = await api.get('/products', {
      params: { _t: Date.now() }
    });
    return response.data;
  } catch (error) {
    console.warn('Không thể kết nối đến json-server:3000, đang dùng fallback db.json...', error.message);
    try {
      const fallbackResponse = await fetch(`./db.json?_t=${Date.now()}`);
      const data = await fallbackResponse.json();
      return data.products || [];
    } catch (fbErr) {
      console.error('Lỗi lấy sản phẩm:', fbErr);
      return [];
    }
  }
};

/**
 * Lấy chi tiết 1 sản phẩm theo ID (luôn có số tồn kho mới nhất)
 */
export const fetchProductById = async (id) => {
  try {
    const response = await api.get(`/products/${id}`, {
      params: { _t: Date.now() }
    });
    return response.data;
  } catch (error) {
    console.warn(`Không lấy được /products/${id} từ json-server, fallback db.json...`);
    try {
      const fallbackResponse = await fetch(`./db.json?_t=${Date.now()}`);
      const data = await fallbackResponse.json();
      const product = (data.products || []).find(item => String(item.id) === String(id));
      return product || null;
    } catch (fbErr) {
      console.error('Lỗi lấy chi tiết sản phẩm:', fbErr);
      return null;
    }
  }
};

/**
 * Cập nhật số lượng tồn kho (Stock) vào CSDL
 */
export const updateProductStock = async (id, newStock) => {
  try {
    const response = await api.patch(`/products/${id}`, { stock: newStock });
    return response.data;
  } catch (error) {
    console.warn(`Lỗi updateProductStock(${id}):`, error.message);
    return null;
  }
};

/**
 * Lấy danh sách Banner quảng cáo sản phẩm mới
 */
export const fetchBanners = async () => {
  try {
    const response = await api.get('/banners', {
      params: { _t: Date.now() }
    });
    return response.data;
  } catch (error) {
    console.warn('Không thể kết nối /banners, fallback db.json...', error.message);
    try {
      const fallbackResponse = await fetch(`./db.json?_t=${Date.now()}`);
      const data = await fallbackResponse.json();
      return data.banners || [];
    } catch (fbErr) {
      console.error('Lỗi lấy banners:', fbErr);
      return [];
    }
  }
};

/**
 * Lấy danh sách mã giảm giá (Coupons)
 */
export const fetchCoupons = async () => {
  try {
    const response = await api.get('/coupons', {
      params: { _t: Date.now() }
    });
    return response.data;
  } catch (error) {
    console.warn('Không thể kết nối /coupons, fallback db.json...', error.message);
    try {
      const fallbackResponse = await fetch(`./db.json?_t=${Date.now()}`);
      const data = await fallbackResponse.json();
      return data.coupons || [];
    } catch (fbErr) {
      console.error('Lỗi lấy coupons:', fbErr);
      return [];
    }
  }
};

/**
 * Lấy toàn bộ danh sách hóa đơn đơn hàng (Orders) từ CSDL
 * Dùng để tính toán số lượng sách bán ra thực tế theo hóa đơn
 */
export const fetchOrders = async () => {
  try {
    const response = await api.get('/orders', {
      params: { _t: Date.now() }
    });
    return response.data || [];
  } catch (error) {
    console.warn('Không thể kết nối /orders, fallback db.json + localStorage...', error.message);
    try {
      const fallbackResponse = await fetch(`./db.json?_t=${Date.now()}`);
      const data = await fallbackResponse.json();
      const baseOrders = data.orders || [];
      const localOrders = JSON.parse(localStorage.getItem('orders')) || [];
      const mergedMap = new Map();
      baseOrders.forEach(o => mergedMap.set(String(o.id), o));
      localOrders.forEach(o => {
        const key = String(o.id);
        mergedMap.set(key, mergedMap.has(key) ? { ...mergedMap.get(key), ...o } : o);
      });
      return Array.from(mergedMap.values());
    } catch (fbErr) {
      console.error('Lỗi lấy orders:', fbErr);
      return JSON.parse(localStorage.getItem('orders')) || [];
    }
  }
};

// ================= CÁC HÀM XỬ LÝ GIỎ HÀNG BẤT ĐỒNG BỘ (ASYNC CART API) =================

/**
 * 1. Lấy toàn bộ sản phẩm trong giỏ hàng từ CSDL (GET /carts?userId=...)
 */
export const fetchCartServer = async (userId) => {
  try {
    const response = await api.get('/carts', {
      params: { userId, _t: Date.now() }
    });
    return response.data || [];
  } catch (error) {
    console.warn(`Lỗi fetchCartServer (userId: ${userId}):`, error.message);
    return [];
  }
};

/**
 * 2. Thêm sản phẩm vào giỏ hàng trên CSDL (Bất đồng bộ)
 * Kiểm tra xem đã có chưa: nếu có thì PATCH số lượng, chưa có thì POST mới
 */
export const addToCartServer = async (userId, product, quantity = 1) => {
  try {
    // Kiểm tra xem cuốn sách này đã có trong giỏ của user trên CSDL chưa
    const checkRes = await api.get('/carts', {
      params: { userId, productId: product.id, _t: Date.now() }
    });
    const existingItems = checkRes.data || [];

    if (existingItems.length > 0) {
      // Đã tồn tại -> Cập nhật số lượng bằng PATCH
      const item = existingItems[0];
      const newQuantity = (item.quantity || 0) + quantity;
      const patchRes = await api.patch(`/carts/${item.id}`, {
        quantity: newQuantity,
        isNew: Boolean(product.isNew)
      });
      return patchRes.data;
    } else {
      // Chưa tồn tại -> Tạo mới bằng POST
      const newCartItem = {
        userId,
        productId: product.id,
        name: product.name,
        price: product.price,
        originalPrice: product.originalPrice || product.price,
        image: product.image,
        categoryName: product.categoryName || 'Sách',
        isNew: Boolean(product.isNew),
        stock: product.stock,
        quantity: quantity
      };
      const postRes = await api.post('/carts', newCartItem);
      return postRes.data;
    }
  } catch (error) {
    console.error('Lỗi addToCartServer:', error);
    throw error;
  }
};

/**
 * 3. Cập nhật số lượng cuốn sách trong giỏ hàng (PATCH /carts/:id)
 */
export const updateCartItemQtyServer = async (cartId, newQuantity) => {
  try {
    const response = await api.patch(`/carts/${cartId}`, { quantity: newQuantity });
    return response.data;
  } catch (error) {
    console.error(`Lỗi updateCartItemQtyServer(${cartId}):`, error);
    throw error;
  }
};

/**
 * 4. Xóa một sản phẩm khỏi giỏ hàng trên CSDL (DELETE /carts/:id)
 */
export const removeCartItemServer = async (cartId) => {
  try {
    const response = await api.delete(`/carts/${cartId}`);
    return response.data;
  } catch (error) {
    console.error(`Lỗi removeCartItemServer(${cartId}):`, error);
    throw error;
  }
};

/**
 * 5. Xóa sạch toàn bộ giỏ hàng của người dùng trên CSDL (sau khi đặt hàng thành công)
 */
export const clearCartServer = async (userId) => {
  try {
    const items = await fetchCartServer(userId);
    // Dùng Promise.all để xóa đồng thời tất cả các bản ghi giỏ hàng bất đồng bộ
    await Promise.all(items.map(item => api.delete(`/carts/${item.id}`)));
    return true;
  } catch (error) {
    console.error(`Lỗi clearCartServer (userId: ${userId}):`, error);
    return false;
  }
};

// ================= CÁC HÀM XỬ LÝ VÒNG ĐỜI ĐƠN HÀNG & HOÀN/TRỪ TỒN KHO =================

/**
 * Chuẩn hóa tên trạng thái đơn hàng (hỗ trợ cả dữ liệu cũ trong db.json)
 */
export const normalizeOrderStatus = (status) => {
  if (!status) return 'Đã hoàn thành';
  const normalized = String(status).trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'chờ xác nhận') return 'Chờ xác nhận';
  if (normalized === 'processing' || normalized === 'đang xử lý') return 'Đang xử lý';
  if (normalized === 'shipping' || normalized === 'đang giao hàng') return 'Đang giao hàng';
  if (normalized === 'delivered' || normalized === 'completed' || normalized === 'đã hoàn thành' || normalized === 'đã giao hàng') {
    return 'Đã hoàn thành';
  }
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'đã hủy') return 'Đã hủy';
  return status;
};

/**
 * Kiểm tra đơn hàng đã bị hủy hay chưa (để loại khỏi Doanh thu, VIP, số lượng bán)
 */
export const isOrderCancelled = (order) => normalizeOrderStatus(order?.status) === 'Đã hủy';

/**
 * Sinh mã vận đơn chuẩn khi Nhân viên / Admin bấm giao hàng
 */
export const generateTrackingCode = (order) => {
  const rawCode = order?.orderCode || `HKR${String(order?.id || Date.now()).slice(-6)}`;
  const cleanCode = String(rawCode).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `VD-${cleanCode}`;
};

const syncLocalOrderCache = (orderRecord) => {
  if (!orderRecord) return;
  try {
    const localOrders = JSON.parse(localStorage.getItem('orders')) || [];
    const idx = localOrders.findIndex(o => String(o.id) === String(orderRecord.id));
    if (idx !== -1) {
      localOrders[idx] = { ...localOrders[idx], ...orderRecord };
    } else {
      localOrders.push(orderRecord);
    }
    localStorage.setItem('orders', JSON.stringify(localOrders));
    localStorage.setItem('orders_last_updated', String(Date.now()));
  } catch (e) {}
};

/**
 * Tạo đơn hàng mới trên CSDL (POST /orders) kèm đồng bộ cache localStorage
 */
export const createOrder = async (orderData) => {
  try {
    const response = await api.post('/orders', orderData);
    syncLocalOrderCache(response.data);
    return response.data;
  } catch (error) {
    console.warn('Fallback tạo đơn hàng trong localStorage:', error.message);
    syncLocalOrderCache(orderData);
    return orderData;
  }
};

/**
 * Cập nhật trạng thái / mã vận đơn của đơn hàng lên CSDL (PATCH /orders/:id)
 */
export const updateOrder = async (orderId, patchData) => {
  try {
    const response = await api.patch(`/orders/${orderId}`, patchData);
    syncLocalOrderCache(response.data);
    return response.data;
  } catch (error) {
    console.warn(`Lỗi updateOrder(${orderId}), đồng bộ fallback localStorage:`, error.message);
    syncLocalOrderCache({ id: orderId, ...patchData });
    return { id: orderId, ...patchData };
  }
};

/**
 * Điều chỉnh tồn kho sách theo danh sách items trong đơn (-1: trừ kho, +1: hoàn kho khi hủy đơn)
 */
export const adjustOrderItemsStock = async (items = [], multiplier = -1) => {
  if (!Array.isArray(items) || items.length === 0 || multiplier === 0) return;

  await Promise.all(items.map(async (item) => {
    try {
      const prodId = item.productId || item.id;
      const qty = Number(item.quantity) || 0;
      if (!prodId || qty <= 0) return;

      const prod = await fetchProductById(prodId);
      const currentStock = prod && typeof prod.stock === 'number'
        ? prod.stock
        : (Number(item.stock) || 0);
      const nextStock = Math.max(0, currentStock + (multiplier * qty));
      await updateProductStock(prodId, nextStock);
    } catch (err) {
      console.warn('Lỗi điều chỉnh tồn kho sản phẩm:', err);
    }
  }));
};

export const deductOrderStock = (items) => adjustOrderItemsStock(items, -1);
export const restoreOrderStock = (items) => adjustOrderItemsStock(items, 1);

/**
 * Ghi nhận thông báo cập nhật đơn hàng cho đúng chủ sở hữu đơn
 */
export const pushOrderNotification = (order, message, status) => {
  if (!order) return;
  try {
    const notifications = JSON.parse(localStorage.getItem('hikari_order_notifications')) || [];
    notifications.unshift({
      id: Date.now() + Math.floor(Math.random() * 100),
      orderId: order.id,
      orderCode: order.orderCode || order.id,
      userId: order.userId || null,
      userEmail: order.customer?.email || '',
      status,
      message,
      time: `${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${new Date().toLocaleDateString('vi-VN')}`,
      read: false
    });
    localStorage.setItem('hikari_order_notifications', JSON.stringify(notifications.slice(0, 50)));
  } catch (e) {}
};




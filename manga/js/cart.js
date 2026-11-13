/**
 * cart.js - Xử lý nghiệp vụ Giỏ Hàng & Đặt Hàng BẤT ĐỒNG BỘ (Asynchronous Cart)
 * Kết nối RESTful API (/carts) với json-server
 * Sử dụng đầy đủ tính năng ES6+: Async/Await, Promise.all, Array methods (reduce, map, find, filter)
 */
import {
  formatPrice,
  getCart,
  saveCart,
  updateCartBadge,
  showToast,
  checkCurrentUser,
  getCurrentUserId,
  calculateUserTier,
  parseOrderDate,
  attachVnPhoneInputGuard,
  validateVnPhone,
  parseStructuredAddress,
  validateStructuredAddress
} from './utils.js';
import { 
  api, 
  fetchCoupons, 
  fetchProducts,
  fetchCartServer, 
  updateCartItemQtyServer, 
  removeCartItemServer, 
  clearCartServer,
  fetchProductById,
  createOrder,
  deductOrderStock,
  pushOrderNotification,
  checkOrderPaymentStatus,
  simulateSepayPayment
} from './api.js';

let appliedDiscount = 0;
let appliedCouponCode = '';
let appliedCouponData = null;
let currentCartItems = [];

// Thiết lập mock user từ URL params sớm (hỗ trợ test & demo: ?mock=vip, ?mock=newbie)
const checkMockUser = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const mock = urlParams.get('mock');
  if (mock === 'vip' || mock === 'user2') {
    const user = { id: 2, name: 'Trần Văn An', email: 'an@gmail.com', phone: '0933888999', role: 'customer' };
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('currentUser', JSON.stringify(user));
  } else if (mock === 'newbie' || mock === 'user3') {
    const user = { id: 3, name: 'Nguyễn Thị Mai', email: 'mai@gmail.com', phone: '0988776655', role: 'customer', usedCoupons: [] };
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('currentUser', JSON.stringify(user));
  }
};
checkMockUser();

const enrichCartItemsNewFlag = async (cart = []) => {
  if (!Array.isArray(cart) || cart.length === 0) return cart;

  try {
    const products = await fetchProducts();
    const productById = new Map((products || []).map(p => [String(p.id), p]));
    return cart.map(item => {
      const prodId = String(item.productId || item.id);
      const matched = productById.get(prodId);
      return {
        ...item,
        productId: matched?.id || item.productId || item.id,
        stock: typeof matched?.stock === 'number' ? matched.stock : (item.stock || 50),
        isNew: Boolean(matched?.isNew ?? item.isNew)
      };
    });
  } catch (err) {
    console.warn('Không thể bổ sung cờ sách mới và tồn kho cho giỏ hàng:', err);
    return cart;
  }
};

// ================= TẢI DỮ LIỆU GIỎ HÀNG BẤT ĐỒNG BỘ TỪ SERVER =================
const loadCartData = async () => {
  const userId = getCurrentUserId();
  try {
    const serverItems = await fetchCartServer(userId);
    if (Array.isArray(serverItems) && serverItems.length > 0) {
      const enriched = await enrichCartItemsNewFlag(serverItems);
      currentCartItems = enriched;
      saveCart(enriched); // Cập nhật cache dự phòng
      return enriched;
    }
  } catch (error) {
    console.warn('Lỗi kết nối /carts server, fallback cache:', error);
  }
  let localCart = getCart();
  if ((!localCart || localCart.length === 0) && window.location.search.includes('mock=')) {
    // Tự động nạp mẫu giỏ hàng cho tài khoản test nếu giỏ trống
    localCart = [
      { id: 1, productId: 1, name: 'One Piece - Tập 108: Sinh Mệnh Khởi Động', price: 34000, quantity: 2, isNew: true, image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80', stock: 85, categoryName: 'Manga - Truyện Tranh' },
      { id: 2, productId: 2, name: 'Jujutsu Kaisen - Chú Thuật Hồi Chiến - Tập 24', price: 40500, quantity: 1, isNew: false, image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80', stock: 37, categoryName: 'Manga - Truyện Tranh' }
    ];
    saveCart(localCart);
  }
  const enrichedLocal = await enrichCartItemsNewFlag(localCart || []);
  currentCartItems = enrichedLocal;
  return currentCartItems;
};

const clearAppliedCoupon = () => {
  appliedDiscount = 0;
  appliedCouponCode = '';
  appliedCouponData = null;
};

const getSessionUser = () => {
  const userJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch (e) {
    return null;
  }
};

/**
 * Kiểm tra điều kiện & giới hạn tái sử dụng mã giảm giá theo chính sách:
 * - VIPMEMBER: 1 lần / tháng (reset theo tháng dương lịch)
 * - SINHNHAT35: 1 lần / năm (trong tháng sinh nhật của tài khoản)
 * - WELCOME20 & toàn bộ mã còn lại (HIKARI10, MANGA15, NEWBOOKS...): 1 lần duy nhất / tài khoản
 * Đối chiếu trực tiếp trên đơn hàng hợp lệ (chưa hủy) từ CSDL để tránh lách bằng đăng nhập lại.
 */
const validateCouponForUser = async (coupon, user, cartItems = [], subtotal = 0) => {
  if (!coupon) {
    return { valid: false, tone: 'info', message: 'Mã giảm giá không hợp lệ hoặc đã hết hạn!' };
  }
  if (!user || !user.id) {
    return { valid: false, tone: 'info', message: '⚠️ Vui lòng đăng nhập để kiểm tra và áp dụng mã giảm giá!' };
  }
  if (user.role === 'admin' || user.role === 'staff') {
    return { valid: false, tone: 'warning', message: '⚠️ Tài khoản nội bộ (Admin / Nhân viên) không áp dụng mã ưu đãi khách hàng!' };
  }
  if (coupon.minOrder && subtotal < coupon.minOrder) {
    return { valid: false, tone: 'info', message: `Đơn hàng phải từ ${formatPrice(coupon.minOrder)} để áp dụng mã này!` };
  }

  const tierInfo = await calculateUserTier(user);
  const activeOrders = tierInfo?.activeOrders || [];
  const code = String(coupon.code || '').toUpperCase();
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  if (code === 'VIPMEMBER' || coupon.usageLimit === 'monthly' || coupon.target === 'vip') {
    if (!tierInfo?.isVip) {
      return {
        valid: false,
        tone: 'error',
        message: `⚠️ Mã VIPMEMBER chỉ dành cho Thành Viên VIP (chi tiêu từ 500.000đ trong tháng hoặc duy trì từ tháng trước). Tháng này bạn đã chi tiêu ${formatPrice(tierInfo?.currentMonthSpent || 0)}, cần thêm ${formatPrice(tierInfo?.remainingToUpgrade || 0)} để lên VIP!`
      };
    }

    const usedThisMonth = activeOrders.some((o) => {
      if (String(o.couponCode || '').toUpperCase() !== code) return false;
      const d = parseOrderDate(o);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    if (usedThisMonth) {
      return {
        valid: false,
        tone: 'error',
        message: `⚠️ Mã ${code} chỉ dùng 1 lần mỗi tháng! Bạn đã sử dụng ưu đãi VIP trong tháng ${currentMonth + 1}/${currentYear} (sẽ làm mới vào tháng sau).`
      };
    }
  } else if (code === 'SINHNHAT35' || coupon.usageLimit === 'yearly' || coupon.target === 'birthday') {
    const bParts = String(user.birthday || '').split('-');
    const birthdayMonth = bParts.length >= 2 ? parseInt(bParts[1], 10) : NaN;
    if (!birthdayMonth || isNaN(birthdayMonth)) {
      return {
        valid: false,
        tone: 'info',
        message: '🎂 Vui lòng cập nhật Ngày Sinh trong Hồ Sơ Cá Nhân để sử dụng mã ưu đãi SINHNHAT35!'
      };
    }
    if (birthdayMonth !== currentMonth + 1) {
      return {
        valid: false,
        tone: 'info',
        message: `🎂 Mã ${code} chỉ áp dụng trong tháng sinh nhật của bạn (Tháng ${birthdayMonth})!`
      };
    }

    const usedThisYear = activeOrders.some((o) => {
      if (String(o.couponCode || '').toUpperCase() !== code) return false;
      return parseOrderDate(o).getFullYear() === currentYear;
    });
    if (usedThisYear) {
      return {
        valid: false,
        tone: 'error',
        message: `🎂 Bạn đã sử dụng mã sinh nhật ${code} trong năm ${currentYear} rồi (mỗi năm chỉ áp dụng 1 lần)!`
      };
    }
  } else if (code === 'WELCOME20' || coupon.target === 'new_member') {
    if ((tierInfo?.ordersCount || 0) > 0) {
      return {
        valid: false,
        tone: 'error',
        message: `⚠️ Mã ${code} chỉ dành cho Thành Viên Mới chưa có hóa đơn nào! Bạn đã có ${tierInfo?.ordersCount || 0} đơn hàng trước đó.`
      };
    }
    const usedWelcome = activeOrders.some((o) => String(o.couponCode || '').toUpperCase() === code);
    if (usedWelcome) {
      return {
        valid: false,
        tone: 'error',
        message: '⚠️ Bạn đã từng sử dụng mã ưu đãi Thành Viên Mới rồi (chỉ áp dụng 1 lần duy nhất)!'
      };
    }
  } else {
    // Tất cả các mã còn lại (NEWBOOKS, HIKARI10, MANGA15...): mỗi tài khoản chỉ dùng 1 lần duy nhất
    if (code === 'NEWBOOKS' || coupon.target === 'new_products') {
      const hasNewBook = cartItems.some(i => i.isNew === true);
      if (!hasNewBook) {
        return {
          valid: false,
          tone: 'info',
          message: '⚠️ Giỏ hàng chưa có cuốn Sách Mới nào để áp dụng mã ưu đãi NEWBOOKS!'
        };
      }
    }

    const usedOnceBefore = activeOrders.some((o) => String(o.couponCode || '').toUpperCase() === code);
    if (usedOnceBefore) {
      return {
        valid: false,
        tone: 'error',
        message: `⚠️ Mã ${code} chỉ được sử dụng 1 lần cho mỗi tài khoản! Bạn đã áp dụng mã này ở đơn hàng trước đó.`
      };
    }
  }

  const discount = computeCouponDiscount(coupon, cartItems, subtotal);
  if (discount <= 0) {
    return { valid: false, tone: 'info', message: `Không thể áp dụng mã ${code} cho giỏ hàng hiện tại.` };
  }

  return {
    valid: true,
    discount,
    tierInfo,
    newBooksCount: cartItems.filter(i => i.isNew === true).length
  };
};

const computeCouponDiscount = (coupon, cartItems = [], subtotal = 0) => {
  if (!coupon || subtotal <= 0) return 0;

  if (coupon.code === 'NEWBOOKS' || coupon.target === 'new_products') {
    const newBooksSubtotal = cartItems
      .filter(i => i.isNew === true)
      .reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0);
    if (newBooksSubtotal <= 0) return 0;
    const percent = Number(coupon.discountValue) || 10;
    return Math.round(newBooksSubtotal * (percent / 100));
  }

  if (coupon.code === 'VIPMEMBER' || coupon.target === 'vip' || coupon.discountType === 'percent' || coupon.discountPercent) {
    const percent = Number(coupon.discountValue || coupon.discountPercent) || 0;
    return Math.round(subtotal * (percent / 100));
  }

  if (coupon.discountType === 'fixed' || coupon.discountAmount) {
    return Math.min(subtotal, Number(coupon.discountValue || coupon.discountAmount) || 0);
  }

  return 0;
};

const syncAppliedCouponWithCart = async (cart = []) => {
  if (!cart || cart.length === 0) {
    clearAppliedCoupon();
    return;
  }
  if (!appliedCouponCode) return;

  if (!appliedCouponData) {
    const coupons = await fetchCoupons();
    appliedCouponData = coupons.find(c => c.code && c.code.toUpperCase() === appliedCouponCode) || null;
  }

  if (!appliedCouponData) {
    clearAppliedCoupon();
    return;
  }

  const subtotal = cart.reduce((total, item) => total + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0);
  if (appliedCouponData.minOrder && subtotal < appliedCouponData.minOrder) {
    const removedCode = appliedCouponCode;
    const minReq = appliedCouponData.minOrder;
    clearAppliedCoupon();
    showToast(`⚠️ Đã gỡ mã ${removedCode} do đơn dưới ${formatPrice(minReq)}.`, 'info');
    return;
  }

  const nextDiscount = computeCouponDiscount(appliedCouponData, cart, subtotal);
  if ((appliedCouponData.code === 'NEWBOOKS' || appliedCouponData.target === 'new_products') && nextDiscount <= 0) {
    clearAppliedCoupon();
    showToast('⚠️ Đã gỡ mã NEWBOOKS do không còn Sách Mới trong giỏ hàng.', 'info');
    return;
  }

  appliedDiscount = nextDiscount;
};

// Tính toán các giá trị tổng của giỏ hàng
const calculateCartTotals = (cart = []) => {
  const subtotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  const shippingFee = subtotal >= 250000 || subtotal === 0 ? 0 : 30000;
  const finalTotal = Math.max(0, subtotal + shippingFee - appliedDiscount);

  return { subtotal, shippingFee, finalTotal };
};

// ================= RENDER GIỎ HÀNG (ASYNC RENDER) =================
const renderCart = async () => {
  const container = document.querySelector('#cartContent');
  if (!container) return;

  const cart = await loadCartData();
  await syncAppliedCouponWithCart(cart);

  // 1. Trường hợp GIỎ HÀNG TRỐNG
  if (cart.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <h2 class="empty-title">Giỏ hàng của bạn đang trống</h2>
        <p class="empty-desc">
          Hãy khám phá hàng ngàn tựa manga, light novel và tiểu thuyết đặc sắc để thêm vào giỏ hàng nhé!
        </p>
        <div style="display: flex; gap: 0.85rem; justify-content: center; flex-wrap: wrap;">
          <a href="products.html" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none;">
            ⚡ Khám Phá Sách Ngay
          </a>
          <button id="btnLoadSampleCart" type="button" class="btn" style="background: #eef2ff; color: #4338ca; border: 1px dashed #6366f1; font-weight: 700; padding: 0.65rem 1.25rem; border-radius: var(--radius-md); cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem; transition: all 0.2s;">
            📦 Nạp Sách Mẫu Để Thử Nghiệm
          </button>
        </div>
      </div>
    `;

    const btnSample = document.querySelector('#btnLoadSampleCart');
    if (btnSample) {
      btnSample.addEventListener('click', async () => {
        const sampleItems = [
          { id: 1, productId: 1, name: 'One Piece - Tập 108: Sinh Mệnh Khởi Động', price: 34000, quantity: 2, isNew: true, image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80', stock: 85, categoryName: 'Manga - Truyện Tranh' },
          { id: 2, productId: 2, name: 'Jujutsu Kaisen - Chú Thuật Hồi Chiến - Tập 24', price: 40500, quantity: 1, isNew: false, image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80', stock: 37, categoryName: 'Manga - Truyện Tranh' }
        ];
        saveCart(sampleItems);
        showToast('✓ Đã nạp 2 cuốn sách mẫu vào giỏ hàng để bạn thử nghiệm!', 'success');
        await renderCart();
        await updateCartBadge();
      });
    }

    await updateCartBadge();
    return;
  }

  // 2. Trường hợp CÓ SẢN PHẨM TRONG GIỎ
  const { subtotal, shippingFee, finalTotal } = calculateCartTotals(cart);

  // Lấy thông tin tài khoản và hạng thành viên
  const urlParams = new URLSearchParams(window.location.search);
  let user = null;
  if (urlParams.get('mock') === 'vip' || urlParams.get('mock') === 'user2') {
    user = { id: 2, name: 'Trần Văn An', email: 'an@gmail.com', phone: '0933888999', role: 'customer' };
    localStorage.setItem('user', JSON.stringify(user));
  } else if (urlParams.get('mock') === 'newbie' || urlParams.get('mock') === 'user3') {
    user = { id: 3, name: 'Nguyễn Thị Mai', email: 'mai@gmail.com', phone: '0988776655', role: 'customer', usedCoupons: [] };
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    const userJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
    if (userJson) {
      try { user = JSON.parse(userJson); } catch (e) {}
    }
  }
  let tierInfo = null;
  const isInternalAccount = user && (user.role === 'admin' || user.role === 'staff');
  if (user && !isInternalAccount) {
    try {
      tierInfo = await calculateUserTier(user);
    } catch (e) {}
  }

  container.innerHTML = `
    <div class="cart-layout">
      <!-- CỘT TRÁI: BẢNG SẢN PHẨM TỪ CSDL -->
      <div>
        <div class="cart-items-card">
          <table class="cart-table">
            <thead>
              <tr>
                <th>Tác phẩm</th>
                <th>Đơn giá</th>
                <th>Số lượng</th>
                <th>Thành tiền</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${cart.map(item => `
                <tr class="cart-item-row" data-id="${item.id}">
                  <td>
                    <div class="cart-product-info">
                      <img 
                        src="${item.image}" 
                        alt="${item.name}" 
                        class="cart-thumb"
                        onerror="this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80'"
                      />
                      <div>
                        <h4 class="cart-item-name">
                          <a href="product-detail.html?id=${item.productId || item.id}">${item.name}</a>
                        </h4>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
                          <span class="cart-item-cat">${item.categoryName || 'Sách'}</span>
                          ${item.isNew ? '<span style="display: inline-block; font-size: 0.7rem; background: #e0e7ff; color: #4338ca; padding: 1px 5px; border-radius: 3px; font-weight: 700;">MỚI ✨</span>' : ''}
                          <span style="font-size: 0.75rem; color: #64748b;">
                            Kho: <strong style="color: ${(item.stock || 0) <= 5 ? 'var(--danger)' : 'var(--success)'};">${item.stock || 0}</strong> cuốn
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="cart-unit-price">${formatPrice(item.price)}</span>
                  </td>
                  <td>
                    <div class="cart-qty-ctrl">
                      <button class="cart-qty-btn btn-qty-minus" data-id="${item.id}" title="Giảm số lượng">-</button>
                      <input type="text" class="cart-qty-val" value="${item.quantity}" readonly />
                      <button class="cart-qty-btn btn-qty-plus" data-id="${item.id}" title="Tăng số lượng">+</button>
                    </div>
                  </td>
                  <td>
                    <span class="cart-subtotal">${formatPrice(item.price * item.quantity)}</span>
                  </td>
                  <td>
                    <button class="btn-remove-item" data-id="${item.id}" title="Xóa cuốn sách này">
                      🗑️
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="cart-actions-bottom">
          <a href="index.html#products" class="btn-continue-shopping">
            ← Tiếp tục chọn thêm sách khác
          </a>
          <button class="btn-clear-cart" id="btnClearCart">
            ✕ Xóa toàn bộ giỏ hàng
          </button>
        </div>
      </div>

      <!-- CỘT PHẢI: TỔNG KẾT & THANH TOÁN -->
      <div>
        <div class="cart-summary-card">
          <h3 class="summary-title">Tóm Tắt Đơn Hàng</h3>

          <!-- KHỐI THÔNG BÁO HẠNG THÀNH VIÊN (VIP / KHÁCH MỚI / THÂN THIẾT / NỘI BỘ) -->
          ${isInternalAccount ? `
            <div class="cart-member-tier-box tier-regular" style="background: #f0f9ff; border-color: #bae6fd;">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span style="font-size: 1.15rem;">${user.role === 'admin' ? '👑' : '💼'}</span>
                <strong style="color: #0f172a; font-size: 0.9rem;">${user.role === 'admin' ? 'Quản Trị Viên' : 'Nhân Viên'} - ${user.name}</strong>
              </div>
              <p style="font-size: 0.775rem; margin: 0; color: #0369a1; line-height: 1.4;">
                Tài khoản nội bộ không áp dụng tích lũy hạng khách hàng VIP hay mã ưu đãi dành riêng cho khách hàng.
              </p>
            </div>
          ` : user ? `
            <div class="cart-member-tier-box ${tierInfo?.badgeClass || 'tier-regular'}">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span style="font-size: 1.15rem;">${tierInfo?.badgeIcon || '👤'}</span>
                <strong style="color: #0f172a; font-size: 0.9rem;">${tierInfo?.tierName || 'Thành Viên'} - ${user.name}</strong>
              </div>
              <p style="font-size: 0.775rem; margin: 0; color: #475569; line-height: 1.4;">
                ${(tierInfo?.ordersCount || 0) === 0
                  ? '🎁 Bạn chưa có hóa đơn nào! Dùng mã <strong>WELCOME20</strong> giảm 20.000đ cho đơn đầu tiên (1 lần duy nhất).' 
                  : (tierInfo?.isVip 
                    ? `⭐ Bạn là <strong>Thành Viên VIP</strong> (Chi tiêu tháng này: ${formatPrice(tierInfo.currentMonthSpent)})! Dùng mã <strong>VIPMEMBER</strong> để giảm 15% tổng đơn (1 lần/tháng).` 
                    : `👤 Tháng này đã chi tiêu ${formatPrice(tierInfo?.currentMonthSpent)}. Mua thêm ${formatPrice(tierInfo?.remainingToUpgrade)} trong tháng để thăng hạng ⭐ VIP!`)}
              </p>
            </div>
          ` : `
            <div class="cart-member-tier-box tier-guest">
              <span style="font-size: 1.1rem;">💡</span>
              <span style="font-size: 0.8rem; color: #334155;">
                <a href="login.html?redirect=cart.html" style="font-weight: 700; color: #4338ca; text-decoration: underline;">Đăng nhập ngay</a> để nhận mã giảm giá <strong>Thành Viên Mới</strong> hoặc <strong>Thành Viên VIP</strong>!
              </span>
            </div>
          `}

          <div class="summary-line">
            <span>Tạm tính (${cart.length} sản phẩm):</span>
            <strong>${formatPrice(subtotal)}</strong>
          </div>

          <div class="summary-line">
            <span>Phí vận chuyển:</span>
            <span>${shippingFee === 0 ? '<span style="color: var(--success); font-weight: 700;">Miễn phí</span>' : formatPrice(shippingFee)}</span>
          </div>

          ${shippingFee > 0 ? `
            <div style="font-size: 0.8rem; color: #f59e0b; margin-bottom: 0.85rem;">
              💡 Mua thêm ${formatPrice(250000 - subtotal)} để được MIỄN PHÍ vận chuyển!
            </div>
          ` : ''}

          <!-- GỢI Ý MÃ GIẢM GIÁ THEO ĐỐI TƯỢNG (QUICK COUPON CHIPS) -->
          <div class="quick-coupon-chips" style="margin-top: 1rem; margin-bottom: 0.65rem;">
            <span style="font-size: 0.775rem; font-weight: 700; color: #64748b; display: block; margin-bottom: 0.35rem;">
              🏷️ Chọn nhanh mã khuyến mãi:
            </span>
            <div style="display: flex; flex-wrap: wrap; gap: 0.35rem;">
              <button type="button" class="btn-coupon-chip chip-welcome" data-code="WELCOME20" title="Chỉ dành cho Thành Viên Mới chưa có hóa đơn nào (dùng 1 lần)">
                🎁 WELCOME20 (Khách mới)
              </button>
              <button type="button" class="btn-coupon-chip chip-vip" data-code="VIPMEMBER" title="Dành riêng cho Thành Viên VIP (reset 1 lần/tháng)">
                ⭐ VIPMEMBER (VIP 15% - 1 lần/tháng)
              </button>
              <button type="button" class="btn-coupon-chip chip-newbooks" data-code="NEWBOOKS" title="Giảm 10% cho Sách Mới trong giỏ hàng (1 lần/tài khoản)">
                ✨ NEWBOOKS (Sách mới - 1 lần)
              </button>
              <button type="button" class="btn-coupon-chip chip-default" data-code="HIKARI10" title="Giảm 10% cho 1 đơn hàng (1 lần/tài khoản)">
                📖 HIKARI10 (Giảm 10% - 1 lần)
              </button>
            </div>
          </div>

          <!-- KHỐI MÃ GIẢM GIÁ ĐỘNG TỪ CSDL -->
          <div class="coupon-box">
            <input 
              type="text" 
              id="couponInput" 
              class="coupon-input" 
              placeholder="Nhập mã: WELCOME20, VIPMEMBER..."
              value="${appliedCouponCode}"
            />
            <button id="btnApplyCoupon" class="btn-apply-coupon">Áp dụng</button>
          </div>

          ${appliedDiscount > 0 ? `
            <div class="coupon-badge" style="justify-content: space-between; align-items: center; gap: 0.5rem;">
              <span>Đã áp dụng mã: <strong>${appliedCouponCode}</strong></span>
              <span style="display: inline-flex; align-items: center; gap: 0.5rem;">
                <strong>-${formatPrice(appliedDiscount)}</strong>
                <button type="button" id="btnRemoveCoupon" title="Gỡ mã giảm giá" style="background: transparent; border: none; color: #dc2626; font-weight: 800; cursor: pointer; font-size: 0.85rem; padding: 0 2px;">✕</button>
              </span>
            </div>
          ` : ''}

          <div class="summary-line total-line">
            <span>Tổng thanh toán:</span>
            <span class="total-amount">${formatPrice(finalTotal)}</span>
          </div>

          <button id="btnOpenCheckout" class="btn-checkout" style="margin-top: 1.25rem;">
            ⚡ Tiến Hành Đặt Hàng
          </button>
        </div>
      </div>
    </div>
  `;

  // Gắn sự kiện các nút trong giỏ
  attachCartEventListeners();
};

// ================= GẮN SỰ KIỆN TƯƠNG TÁC BẤT ĐỒNG BỘ =================
const attachCartEventListeners = () => {
  // 1. TĂNG SỐ LƯỢNG (+) BẤT ĐỒNG BỘ: Kiểm tra real-time tồn kho từ server
  document.querySelectorAll('.btn-qty-plus').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cartId = btn.dataset.id;
      const item = currentCartItems.find(p => String(p.id) === String(cartId));
      if (!item) return;

      btn.disabled = true;
      btn.style.opacity = '0.5';

      try {
        const prod = await fetchProductById(item.productId || item.id);
        const maxStock = prod && typeof prod.stock === 'number' ? prod.stock : (item.stock || 99);

        if (item.quantity >= maxStock) {
          showToast(`Kho chỉ còn ${maxStock} cuốn, không thể tăng thêm!`, 'info');
          btn.disabled = false;
          btn.style.opacity = '1';
          return;
        }

        // Cập nhật bất đồng bộ lên CSDL
        await updateCartItemQtyServer(cartId, item.quantity + 1);
        await renderCart();
        await updateCartBadge();
      } catch (err) {
        console.error('Lỗi tăng số lượng:', err);
        showToast('Có lỗi khi cập nhật số lượng!', 'error');
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });
  });

  // 2. GIẢM SỐ LƯỢNG (-) BẤT ĐỒNG BỘ
  document.querySelectorAll('.btn-qty-minus').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cartId = btn.dataset.id;
      const item = currentCartItems.find(p => String(p.id) === String(cartId));
      if (!item) return;

      btn.disabled = true;
      btn.style.opacity = '0.5';

      try {
        if (item.quantity > 1) {
          await updateCartItemQtyServer(cartId, item.quantity - 1);
          await renderCart();
          await updateCartBadge();
        } else {
          // Khi giảm xuống 0 -> Xác nhận xóa
          if (window.confirm(`Bạn có chắc chắn muốn xóa cuốn "${item.name}" khỏi giỏ hàng?`)) {
            await removeCartItemServer(cartId);
            showToast(`Đã xóa "${item.name}" khỏi giỏ hàng!`, 'info');
            await renderCart();
            await updateCartBadge();
          } else {
            btn.disabled = false;
            btn.style.opacity = '1';
          }
        }
      } catch (err) {
        console.error('Lỗi giảm số lượng:', err);
        showToast('Có lỗi khi cập nhật số lượng!', 'error');
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });
  });

  // 3. NÚT XÓA TỪNG SẢN PHẨM BẤT ĐỒNG BỘ
  document.querySelectorAll('.btn-remove-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cartId = btn.dataset.id;
      const item = currentCartItems.find(p => String(p.id) === String(cartId));
      if (!item) return;

      if (window.confirm(`Bạn có chắc chắn muốn xóa cuốn "${item.name}" khỏi giỏ hàng?`)) {
        try {
          await removeCartItemServer(cartId);
          showToast(`Đã xóa "${item.name}" khỏi giỏ hàng!`, 'info');
          await renderCart();
          await updateCartBadge();
        } catch (err) {
          console.error('Lỗi xóa sản phẩm:', err);
          showToast('Có lỗi khi xóa sản phẩm!', 'error');
        }
      }
    });
  });

  // 4. NÚT XÓA TOÀN BỘ GIỎ HÀNG BẤT ĐỒNG BỘ
  const btnClear = document.querySelector('#btnClearCart');
  if (btnClear) {
    btnClear.addEventListener('click', async () => {
      if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ sản phẩm khỏi giỏ hàng?')) {
        const userId = getCurrentUserId();
        try {
          await clearCartServer(userId);
          saveCart([]);
          clearAppliedCoupon();
          await renderCart();
          await updateCartBadge();
          showToast('Đã xóa sạch giỏ hàng trên CSDL!', 'info');
        } catch (err) {
          console.error('Lỗi xóa giỏ hàng:', err);
          showToast('Có lỗi khi xóa giỏ hàng!', 'error');
        }
      }
    });
  }

  // Nút gỡ mã giảm giá đang áp dụng
  document.querySelector('#btnRemoveCoupon')?.addEventListener('click', async () => {
    clearAppliedCoupon();
    await renderCart();
    showToast('Đã gỡ mã giảm giá khỏi đơn hàng.', 'info');
  });

  // Gắn sự kiện click nút chọn nhanh mã giảm giá
  document.querySelectorAll('.btn-coupon-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const input = document.querySelector('#couponInput');
      const btn = document.querySelector('#btnApplyCoupon');
      if (input && btn) {
        input.value = chip.dataset.code;
        btn.click();
      }
    });
  });

  // 5. NÚT ÁP DỤNG MÃ GIẢM GIÁ (Kiểm tra động & Phân cấp đối tượng: Thành viên mới, VIP, Sách mới)
  const btnCoupon = document.querySelector('#btnApplyCoupon');
  const couponInput = document.querySelector('#couponInput');
  if (btnCoupon && couponInput) {
    btnCoupon.addEventListener('click', async () => {
      const code = couponInput.value.trim().toUpperCase();
      if (!code) {
        showToast('Vui lòng nhập mã giảm giá!', 'info');
        return;
      }

      btnCoupon.disabled = true;
      btnCoupon.textContent = '...';

      try {
        const coupons = await fetchCoupons();
        const found = coupons.find(c => c.code && c.code.toUpperCase() === code);

        if (!found) {
          showToast('Mã giảm giá không hợp lệ hoặc đã hết hạn!', 'info');
          return;
        }

        const { subtotal } = calculateCartTotals(currentCartItems);
        const user = getSessionUser();
        const checkResult = await validateCouponForUser(found, user, currentCartItems, subtotal);
        if (!checkResult.valid) {
          showToast(checkResult.message, checkResult.tone || 'error');
          return;
        }

        appliedCouponCode = found.code;
        appliedCouponData = found;
        appliedDiscount = checkResult.discount;

        if (found.code === 'VIPMEMBER' || found.target === 'vip') {
          const percent = found.discountValue || 15;
          showToast(`⭐ Đặc quyền VIP: Áp dụng mã ${found.code} giảm ${percent}% tháng này (-${formatPrice(appliedDiscount)})!`, 'success');
        } else if (found.code === 'NEWBOOKS' || found.target === 'new_products') {
          const percent = found.discountValue || 10;
          showToast(`✨ Áp dụng mã Sách Mới ${found.code}: Giảm ${percent}% cho ${checkResult.newBooksCount} tựa sách mới (-${formatPrice(appliedDiscount)})!`, 'success');
        } else {
          const desc = found.description || found.mota || (found.discountValue ? `Giảm ${found.discountValue}%` : '');
          showToast(`✓ Áp dụng thành công mã ${found.code} (${desc})!`, 'success');
        }
        await renderCart();
      } catch (err) {
        console.error('Lỗi kiểm tra coupon:', err);
        showToast('Có lỗi xảy ra khi kiểm tra mã!', 'error');
      } finally {
        btnCoupon.disabled = false;
        btnCoupon.textContent = 'Áp dụng';
      }
    });
  }

  // 6. MỞ MODAL ĐẶT HÀNG (KHÓA NGHIỆP VỤ: BẮT BUỘC ĐĂNG NHẬP MỚI ĐƯỢC THANH TOÁN)
  const btnCheckout = document.querySelector('#btnOpenCheckout');
  const modal = document.querySelector('#checkoutModal');
  const requireLoginModal = document.querySelector('#requireLoginModal');
  const closeRequireLoginModal = document.querySelector('#closeRequireLoginModal');

  if (closeRequireLoginModal && requireLoginModal) {
    closeRequireLoginModal.addEventListener('click', () => {
      requireLoginModal.classList.remove('active');
    });
    requireLoginModal.addEventListener('click', (e) => {
      if (e.target === requireLoginModal) requireLoginModal.classList.remove('active');
    });
  }

  if (btnCheckout) {
    btnCheckout.addEventListener('click', () => {
      // Kiểm tra trạng thái đăng nhập
      const userJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
      let user = null;
      if (userJson) {
        try { user = JSON.parse(userJson); } catch (e) {}
      }

      // Khóa nghiệp vụ: Nếu chưa đăng nhập, bắt buộc phải đăng nhập trước khi thanh toán
      if (!user || !user.name) {
        if (requireLoginModal) {
          requireLoginModal.classList.add('active');
        } else {
          showToast('Vui lòng đăng nhập để tiến hành đặt hàng & thanh toán!', 'info');
          setTimeout(() => {
            window.location.href = 'login.html?redirect=cart.html';
          }, 1200);
        }
        return;
      }

      // Nếu đã đăng nhập -> Điền sẵn thông tin người dùng và mở modal thanh toán
      const nameInp = document.querySelector('#orderName');
      const phoneInp = document.querySelector('#orderPhone');
      const chkSaveNew = document.querySelector('#chkSaveNewAddressAsDefault');

      if (nameInp && user.name) nameInp.value = user.name;
      if (phoneInp && user.phone) phoneInp.value = user.phone;
      fillCheckoutAddressFields(user.address || '', user.address || '');

      if (chkSaveNew) chkSaveNew.checked = false;

      if (modal) {
        modal.classList.add('active');
        updateQrBoxDisplay();
      }
    });
  }
};

// ================= HÀM MÔ PHỎNG THANH TOÁN QR AN TOÀN =================
const updateQrBoxDisplay = () => {
  const select = document.querySelector('#paymentMethod');
  const qrBox = document.querySelector('#qrSimulationBox');
  const qrIcon = document.querySelector('#qrMethodIcon');
  const qrTitle = document.querySelector('#qrMethodTitle');
  const qrBank = document.querySelector('#qrBankName');
  const qrAmount = document.querySelector('#qrAmountDisplay');
  const qrContent = document.querySelector('#qrContentDisplay');
  const qrImgContainer = document.querySelector('#qrImageContainer');
  const submitBtn = document.querySelector('#btnConfirmOrder');

  if (!select || !qrBox) return;

  const method = select.value;
  const { finalTotal } = calculateCartTotals(currentCartItems);

  if (qrAmount) qrAmount.textContent = formatPrice(finalTotal);
  if (qrContent && (!qrContent.dataset.code || qrContent.textContent === 'HKR...')) {
    const randomCode = 'HKR' + Math.floor(100000 + Math.random() * 900000);
    qrContent.textContent = randomCode;
    qrContent.dataset.code = randomCode;
  }
  const currentCode = qrContent?.dataset?.code || 'HKR123456';

  if (qrImgContainer && method !== 'cod') {
    const vietQrUrl = `https://img.vietqr.io/image/MB-0388888888-compact2.jpg?amount=${finalTotal}&addInfo=${encodeURIComponent(currentCode)}&accountName=HIKARI%20BOOKSTORE`;
    qrImgContainer.innerHTML = `<img src="${vietQrUrl}" alt="VietQR SePay" style="width: 100%; height: 100%; object-fit: contain; border-radius: 6px;" onerror="this.onerror=null; this.src='https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentCode)}';" />`;
  }

  if (method === 'cod') {
    qrBox.style.display = 'none';
    if (submitBtn) {
      submitBtn.textContent = '✓ Xác Nhận Đặt Hàng (COD)';
      submitBtn.style.background = 'var(--primary)';
    }
  } else {
    qrBox.style.display = 'block';
    if (qrIcon) qrIcon.textContent = '💳';
    if (qrTitle) qrTitle.textContent = 'Mã Thanh Toán VietQR Tự Động (Tích Hợp SePay)';
    if (qrBank) qrBank.textContent = 'VietQR Ngân Hàng (MBBank / SePay)';
    if (submitBtn) {
      submitBtn.textContent = '✓ Xác Nhận Đặt Hàng & Mở Hóa Đơn';
      submitBtn.style.background = '#10b981';
    }
  }
};

// ================= MODAL ĐẶT HÀNG VÀ THANH TOÁN BẤT ĐỒNG BỘ =================
const setCheckoutFieldError = (inputEl, errEl, message = '') => {
  if (message) {
    inputEl?.classList.add('is-invalid');
    if (errEl) {
      errEl.textContent = message;
      errEl.classList.add('visible');
    }
  } else {
    inputEl?.classList.remove('is-invalid');
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.remove('visible');
    }
  }
};

const getCheckoutAddressElements = () => ({
  streetInp: document.querySelector('#orderStreet'),
  wardInp: document.querySelector('#orderWard'),
  districtInp: document.querySelector('#orderDistrict'),
  cityInp: document.querySelector('#orderCity'),
  streetErr: document.querySelector('#orderStreetError'),
  wardErr: document.querySelector('#orderWardError'),
  districtErr: document.querySelector('#orderDistrictError'),
  cityErr: document.querySelector('#orderCityError'),
  addrBadge: document.querySelector('#addressSourceBadge')
});

const refreshAddressSourceBadge = (defaultAddress = '') => {
  const { streetInp, wardInp, districtInp, cityInp, addrBadge } = getCheckoutAddressElements();
  if (!addrBadge) return;

  const currentParts = [
    streetInp?.value.trim(),
    wardInp?.value.trim(),
    districtInp?.value.trim(),
    cityInp?.value.trim()
  ];
  const hasAny = currentParts.some(Boolean);
  const currentJoined = currentParts.filter(Boolean).join(', ');
  const parsedDefault = parseStructuredAddress(defaultAddress);
  const isCompleteDefault = Boolean(parsedDefault.street && parsedDefault.ward && parsedDefault.district && parsedDefault.city);

  if (!hasAny) {
    addrBadge.style.display = 'none';
  } else if (isCompleteDefault && defaultAddress && currentJoined === String(defaultAddress).trim()) {
    addrBadge.style.display = 'inline-block';
    addrBadge.textContent = '🏠 Đã điền từ địa chỉ mặc định';
    addrBadge.style.background = '#e0e7ff';
    addrBadge.style.color = '#4338ca';
  } else if (defaultAddress && (!parsedDefault.ward || !parsedDefault.district || !parsedDefault.city) && !wardInp?.value.trim() && !districtInp?.value.trim() && !cityInp?.value.trim()) {
    addrBadge.style.display = 'inline-block';
    addrBadge.textContent = '⚠️ Vui lòng bổ sung đủ Phường, Quận, Thành phố';
    addrBadge.style.background = '#fef3c7';
    addrBadge.style.color = '#b45309';
  } else {
    addrBadge.style.display = 'inline-block';
    addrBadge.textContent = '✏️ Đang dùng địa chỉ giao hàng mới';
    addrBadge.style.background = '#fef3c7';
    addrBadge.style.color = '#b45309';
  }
};

const fillCheckoutAddressFields = (rawAddress = '', defaultAddress = '') => {
  const { streetInp, wardInp, districtInp, cityInp, streetErr, wardErr, districtErr, cityErr } = getCheckoutAddressElements();
  const parsed = parseStructuredAddress(rawAddress);
  if (streetInp) streetInp.value = parsed.street;
  if (wardInp) wardInp.value = parsed.ward;
  if (districtInp) districtInp.value = parsed.district;
  if (cityInp) cityInp.value = parsed.city;

  setCheckoutFieldError(streetInp, streetErr, '');
  setCheckoutFieldError(wardInp, wardErr, '');
  setCheckoutFieldError(districtInp, districtErr, '');
  setCheckoutFieldError(cityInp, cityErr, '');
  refreshAddressSourceBadge(defaultAddress);
};

const setupCheckoutModal = () => {
  const modal = document.querySelector('#checkoutModal');
  const btnClose = document.querySelector('#closeCheckoutModal') || document.querySelector('#btnCloseCheckout');
  const form = document.querySelector('#checkoutForm');

  const paymentSelect = document.querySelector('#paymentMethod');
  if (paymentSelect && !paymentSelect.dataset.listenerAttached) {
    paymentSelect.dataset.listenerAttached = 'true';
    paymentSelect.addEventListener('change', updateQrBoxDisplay);
  }

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }

  const nameInp = document.querySelector('#orderName');
  const phoneInp = document.querySelector('#orderPhone');
  const nameErrEl = document.querySelector('#orderNameError');
  const phoneErrEl = document.querySelector('#orderPhoneError');
  const { streetInp, wardInp, districtInp, cityInp, streetErr, wardErr, districtErr, cityErr } = getCheckoutAddressElements();

  attachVnPhoneInputGuard(phoneInp);

  nameInp?.addEventListener('input', () => setCheckoutFieldError(nameInp, nameErrEl, ''));
  phoneInp?.addEventListener('input', () => setCheckoutFieldError(phoneInp, phoneErrEl, ''));

  const getCurrentSavedAddress = () => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || localStorage.getItem('currentUser'));
      return u?.address || '';
    } catch (e) {
      return '';
    }
  };

  [
    [streetInp, streetErr],
    [wardInp, wardErr],
    [districtInp, districtErr],
    [cityInp, cityErr]
  ].forEach(([inp, errEl]) => {
    inp?.addEventListener('input', () => {
      setCheckoutFieldError(inp, errEl, '');
      refreshAddressSourceBadge(getCurrentSavedAddress());
    });
  });

  // Tự động điền thông tin người dùng nếu đã đăng nhập
  const currentUserJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
  if (currentUserJson) {
    try {
      const user = JSON.parse(currentUserJson);
      if (nameInp && user.name && !nameInp.value) nameInp.value = user.name;
      if (phoneInp && user.phone && !phoneInp.value) phoneInp.value = user.phone;
      if (user.address && !streetInp?.value && !wardInp?.value && !districtInp?.value && !cityInp?.value) {
        fillCheckoutAddressFields(user.address, user.address);
      }
    } catch (e) {}
  }

  // Xử lý gửi form đặt hàng
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Khóa nghiệp vụ: Kiểm tra quyền đăng nhập
      const userJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
      if (!userJson) {
        if (modal) modal.classList.remove('active');
        const requireLoginModal = document.querySelector('#requireLoginModal');
        if (requireLoginModal) requireLoginModal.classList.add('active');
        showToast('Vui lòng đăng nhập để hoàn tất đơn hàng!', 'error');
        return;
      }

      const name = nameInp?.value.trim() || '';
      const rawPhone = phoneInp?.value.trim() || '';
      const paymentMethod = document.querySelector('#paymentMethod')?.value;
      const note = document.querySelector('#orderNote')?.value.trim();

      let valid = true;
      let firstInvalidEl = null;

      if (!name || name.length < 2) {
        setCheckoutFieldError(nameInp, nameErrEl, 'Vui lòng nhập đầy đủ họ tên người nhận!');
        if (!firstInvalidEl) firstInvalidEl = nameInp;
        valid = false;
      } else {
        setCheckoutFieldError(nameInp, nameErrEl, '');
      }

      const phoneCheck = validateVnPhone(rawPhone);
      if (!phoneCheck.valid) {
        setCheckoutFieldError(phoneInp, phoneErrEl, phoneCheck.message);
        if (!firstInvalidEl) firstInvalidEl = phoneInp;
        valid = false;
      } else {
        if (phoneInp) phoneInp.value = phoneCheck.normalized;
        setCheckoutFieldError(phoneInp, phoneErrEl, '');
      }

      const addressCheck = validateStructuredAddress({
        street: streetInp?.value,
        ward: wardInp?.value,
        district: districtInp?.value,
        city: cityInp?.value
      });

      const addressEntries = [
        [streetInp, streetErr, addressCheck.errors.street],
        [wardInp, wardErr, addressCheck.errors.ward],
        [districtInp, districtErr, addressCheck.errors.district],
        [cityInp, cityErr, addressCheck.errors.city]
      ];
      addressEntries.forEach(([inp, errEl, msg]) => {
        setCheckoutFieldError(inp, errEl, msg);
        if (msg && !firstInvalidEl) firstInvalidEl = inp;
      });
      if (!addressCheck.valid) valid = false;

      if (!valid) {
        firstInvalidEl?.focus();
        showToast('Vui lòng nhập đúng SĐT (10 số) và đầy đủ 4 mục địa chỉ (số nhà/đường, phường, quận, thành phố)!', 'error');
        return;
      }

      const phone = phoneCheck.normalized;
      const address = addressCheck.formattedAddress;

      const cart = currentCartItems;
      const userId = getCurrentUserId();

      const submitBtn = document.querySelector('#btnConfirmOrder');
      const originalSubmitText = submitBtn?.textContent || 'Xác Nhận Đặt Hàng';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang kiểm tra tồn kho & đặt hàng...';
      }

      // 1. KIỂM TRA TỒN KHO LẦN CUỐI BẰNG API BẤT ĐỒNG BỘ
      try {
        for (const item of cart) {
          const prodId = item.productId || item.id;
          const latestProd = await fetchProductById(prodId);
          if (latestProd && typeof latestProd.stock === 'number') {
            if (latestProd.stock < item.quantity) {
              showToast(`Sách "${item.name}" chỉ còn ${latestProd.stock} cuốn trong kho! Vui lòng giảm số lượng.`, 'info');
              await renderCart();
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalSubmitText;
              }
              updateQrBoxDisplay();
              return;
            }
          }
        }
      } catch (checkErr) {
        console.error('Lỗi kiểm tra kho:', checkErr);
      }

      try {
        const currentCustomerUser = getSessionUser();

        // 1.1 XÁC THỰC LẠI MÃ GIẢM GIÁ TRÊN CSDL TRƯỚC KHI LẬP ĐƠN (CHỐNG TÁI SỬ DỤNG)
        if (appliedCouponCode) {
          if (!appliedCouponData) {
            const coupons = await fetchCoupons();
            appliedCouponData = coupons.find(c => c.code && c.code.toUpperCase() === appliedCouponCode.toUpperCase()) || null;
          }
          const preSubtotal = cart.reduce((s, item) => s + (item.price * item.quantity), 0);
          const recheck = await validateCouponForUser(appliedCouponData, currentCustomerUser, cart, preSubtotal);
          if (!recheck.valid) {
            clearAppliedCoupon();
            await renderCart();
            updateQrBoxDisplay();
            showToast(recheck.message, recheck.tone || 'error');
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = originalSubmitText;
            }
            return;
          }
          appliedDiscount = recheck.discount;
        }

        const { subtotal, shippingFee, finalTotal } = calculateCartTotals(cart);

        const simulatedOrderCode = document.querySelector('#qrContentDisplay')?.dataset?.code || ('HKR' + Math.floor(100000 + Math.random() * 900000));
        const orderData = {
          id: Date.now(),
          orderCode: simulatedOrderCode,
          userId,
          customer: {
            name,
            phone,
            email: currentCustomerUser?.email || '',
            address,
            note
          },
          items: cart,
          subtotal,
          shippingFee,
          discount: appliedDiscount,
          couponCode: appliedCouponCode,
          total: finalTotal,
          paymentMethod,
          paymentStatus: paymentMethod === 'cod' ? 'Chưa thanh toán (COD)' : 'Đã thanh toán',
          status: 'Chờ xác nhận',
          trackingCode: '',
          createdAt: new Date().toLocaleString('vi-VN'),
          createdAtIso: new Date().toISOString()
        };

        // Ghi nhận lịch sử mã giảm giá đã sử dụng cho tài khoản vào /users và localStorage
        if (appliedCouponCode && currentCustomerUser?.id) {
          try {
            const userObj = { ...currentCustomerUser };
            const prevUsed = Array.isArray(userObj.usedCoupons) ? userObj.usedCoupons : [];
            const nextEntry = {
              code: appliedCouponCode.toUpperCase(),
              orderCode: orderData.orderCode,
              usedAt: orderData.createdAtIso
            };
            userObj.usedCoupons = [
              ...prevUsed.filter(u => (typeof u === 'string' ? u !== nextEntry.code : u.orderCode !== nextEntry.orderCode)),
              nextEntry
            ];
            localStorage.setItem('user', JSON.stringify(userObj));
            localStorage.setItem('currentUser', JSON.stringify(userObj));
            localStorage.setItem(`used_coupons_${userObj.id}`, JSON.stringify(userObj.usedCoupons));
            await api.patch(`/users/${userObj.id}`, { usedCoupons: userObj.usedCoupons }).catch(() => {});
          } catch (e) {}
        }

        // Nếu người dùng chọn lưu địa chỉ mới làm địa chỉ mặc định
        const chkSaveNew = document.querySelector('#chkSaveNewAddressAsDefault');
        if (chkSaveNew && chkSaveNew.checked && address) {
          const userJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
          if (userJson) {
            try {
              const userObj = JSON.parse(userJson);
              userObj.address = address;
              localStorage.setItem('user', JSON.stringify(userObj));
              localStorage.setItem('currentUser', JSON.stringify(userObj));
              await api.patch(`/users/${userObj.id}`, { address }).catch(() => {});
            } catch (e) {}
          }
        }

        // 2. TẠO ĐƠN HÀNG LÊN CSDL SERVER (POST /orders)
        await createOrder(orderData);
        pushOrderNotification(
          orderData,
          `Đơn hàng #${orderData.orderCode} đã được đặt thành công (Chờ nhân viên xác nhận).`,
          'Chờ xác nhận'
        );

        // 3. TRỪ TỒN KHO TỪNG SẢN PHẨM TRỰC TIẾP TRÊN CSDL (PATCH /products/:id)
        await deductOrderStock(cart);

        // 4. XÓA SẠCH GIỎ HÀNG TRÊN CSDL SERVER (DELETE /carts)
        try {
          await clearCartServer(userId);
        } catch (clearErr) {}
        saveCart([]);
        clearAppliedCoupon();

        // Báo hiệu cập nhật tồn kho cho các tab khác
        localStorage.setItem('stock_last_updated', String(Date.now()));
        window.dispatchEvent(new CustomEvent('stockUpdated'));

        if (modal) modal.classList.remove('active');
        await updateCartBadge();

        // Hiển thị thông báo đặt hàng thành công kèm nút xuất hóa đơn PDF
        const container = document.querySelector('#cartContent');
        if (container) {
          container.innerHTML = `
          <div class="empty-state" style="border-color: var(--success); background: #f0fdf4;">
            <div class="empty-icon" style="color: var(--success);">🎉</div>
            <h2 class="empty-title" style="color: #166534;">Đặt Hàng Thành Công!</h2>
            <p class="empty-desc" style="color: #15803d; line-height: 1.6;">
              Cảm ơn <strong>${name}</strong> đã ủng hộ Hikari BookStore!<br>
              Mã đơn hàng của bạn là: <strong>#${orderData.orderCode}</strong> (Trạng thái: <strong>⏳ Chờ xác nhận</strong>).<br>
              Đơn hàng đã được gửi lên hệ thống để nhân viên xác nhận, đóng gói và cấp mã vận đơn.
            </p>

            <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; margin-top: 1.5rem;">
              <button id="btnExportInvoicePdf" class="btn btn-primary" style="background: #1e1b4b; border-color: #1e1b4b;">
                📄 Xuất Hóa Đơn PDF
              </button>
              <a href="profile.html#orders" class="btn btn-outline" style="background: #ffffff; color: #1e1b4b; border-color: #cbd5e1;">
                📦 Theo Dõi Đơn Hàng
              </a>
              <a href="index.html" class="btn btn-outline" style="background: #ffffff;">
                ← Tiếp tục mua sắm
              </a>
            </div>

            ${paymentMethod !== 'cod' ? `
              <div id="sepayStatusBox" style="margin-top: 1.25rem; padding: 0.85rem 1rem; background: #eff6ff; border: 1.5px dashed #3b82f6; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.9rem; font-weight: 800; color: #1d4ed8; margin-bottom: 0.35rem; display: flex; align-items: center; justify-content: center; gap: 0.4rem;">
                  <span id="sepaySpinIcon">⏳</span> <span id="sepayStatusText">Đang đợi xác thực thanh toán từ SePay...</span>
                </div>
                <p style="font-size: 0.8rem; color: #475569; margin: 0 0 0.6rem 0;">
                  Khi bạn chuyển khoản với nội dung <strong>${orderData.orderCode}</strong>, SePay sẽ gửi Webhook và tự động duyệt đơn hàng sau 2 - 5 giây.
                </p>
                <button type="button" id="btnSimulateSepay" style="background: #2563eb; color: #ffffff; border: none; font-size: 0.8rem; font-weight: 700; padding: 0.4rem 0.9rem; border-radius: 5px; cursor: pointer;">
                  ⚡ Bấm để giả lập SePay bắn Webhook thành công (Demo)
                </button>
              </div>
            ` : ''}
          </div>

          <!-- MẪU HÓA ĐƠN ĐỂ XUẤT PDF CHUẨN A4 (TỰ ĐỘNG CÂN CHỈNH 1 TRANG, KHÔNG CẮT CHỮ, KHÔNG LỖI CUỘN TRANG) -->
          <div id="invoicePrintTemplate" style="display: none; background: #ffffff; width: 680px; max-width: 100%; box-sizing: border-box; padding: 20px 24px; font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
            <!-- 1. HEADER HÓA ĐƠN -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 2px solid #e11d48; padding-bottom: 12px; margin-bottom: 14px;">
              <div style="flex: 1; min-width: 0;">
                <h1 style="font-size: 21px; color: #b91c1c; margin: 0 0 4px 0; font-weight: 900; letter-spacing: 0.5px;">HIKARI BOOKSTORE</h1>
                <p style="margin: 0; font-size: 11.5px; color: #475569; font-weight: 600;">Nhà Sách Manga, Light Novel &amp; Tiểu Thuyết Bản Quyền</p>
                <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b;">Địa chỉ: 123 Đường Sách Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh</p>
                <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b;">Hotline: 1900 6868 | Email: support@hikaribooks.vn</p>
              </div>
              <div style="text-align: right; flex-shrink: 0;">
                <h2 style="font-size: 16px; margin: 0 0 4px 0; color: #0f172a; font-weight: 800;">HÓA ĐƠN BÁN HÀNG</h2>
                <div style="display: inline-block; background: #ffe4e6; color: #e11d48; font-weight: 800; padding: 2px 8px; border-radius: 4px; font-size: 11.5px;">Mã đơn: #${orderData.orderCode}</div>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">Ngày tạo: ${orderData.createdAt}</p>
              </div>
            </div>

            <!-- 2. THÔNG TIN KHÁCH HÀNG & THANH TOÁN (LAYOUT 2 CỘT GỌN GÀNG, KHÔNG TRÀN TRANG) -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; font-size: 12px; line-height: 1.6;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div style="min-width: 0; word-break: break-word;">
                  <div style="font-weight: 800; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">THÔNG TIN NGƯỜI NHẬN</div>
                  <div><strong>Khách hàng:</strong> ${name}</div>
                  <div><strong>Số điện thoại:</strong> ${phone}</div>
                  <div><strong>Địa chỉ giao:</strong> ${address}</div>
                </div>
                <div style="min-width: 0; word-break: break-word;">
                  <div style="font-weight: 800; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">CHI TIẾT ĐƠN HÀNG</div>
                  <div><strong>Thanh toán:</strong> ${paymentMethod === 'cod' ? 'Thanh toán tiền mặt khi nhận sách (COD)' : 'Chuyển khoản Ngân hàng / Ví MoMo (VietQR)'}</div>
                  <div><strong>Trạng thái:</strong> <span style="color: #b45309; font-weight: 700;">Chờ xác nhận đơn hàng</span></div>
                  ${note ? `<div><strong>Ghi chú:</strong> ${note}</div>` : ''}
                </div>
              </div>
            </div>

            <!-- 3. BẢNG DANH SÁCH SÁCH -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 12px; table-layout: fixed;">
              <thead>
                <tr style="background: #1e1b4b; color: #ffffff; text-align: left;">
                  <th style="padding: 8px 8px; width: 42px; text-align: center;">STT</th>
                  <th style="padding: 8px 8px;">Tên tác phẩm</th>
                  <th style="padding: 8px 8px; width: 90px; text-align: right;">Đơn giá</th>
                  <th style="padding: 8px 8px; width: 45px; text-align: center;">SL</th>
                  <th style="padding: 8px 8px; width: 102px; text-align: right;">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                ${orderData.items.map((item, idx) => `
                  <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid; break-inside: avoid;">
                    <td style="padding: 8px 8px; text-align: center; color: #64748b;">${idx + 1}</td>
                    <td style="padding: 8px 8px; font-weight: 600; color: #0f172a; word-break: break-word;">${item.name}</td>
                    <td style="padding: 8px 8px; text-align: right;">${formatPrice(item.price)}</td>
                    <td style="padding: 8px 8px; text-align: center;">${item.quantity}</td>
                    <td style="padding: 8px 8px; text-align: right; font-weight: 600;">${formatPrice(item.price * item.quantity)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <!-- 4. TỔNG KẾT THANH TOÁN -->
            <div style="display: flex; justify-content: flex-end; margin-bottom: 18px; page-break-inside: avoid; break-inside: avoid;">
              <div style="width: 280px; font-size: 12px; line-height: 1.7;">
                <div style="display: flex; justify-content: space-between;">
                  <span>Tạm tính:</span>
                  <strong>${formatPrice(orderData.subtotal)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span>Phí vận chuyển:</span>
                  <span>${orderData.shippingFee === 0 ? '<span style="color: #16a34a; font-weight: 700;">Miễn phí (0 ₫)</span>' : `<strong>${formatPrice(orderData.shippingFee)}</strong>`}</span>
                </div>
                ${appliedDiscount > 0 ? `
                  <div style="display: flex; justify-content: space-between; color: #e11d48;">
                    <span>Voucher (${appliedCouponCode}):</span>
                    <strong>-${formatPrice(appliedDiscount)}</strong>
                  </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 6px; font-size: 14.5px; font-weight: 900; color: #e11d48;">
                  <span>TỔNG CỘNG:</span>
                  <span>${formatPrice(orderData.total)}</span>
                </div>
              </div>
            </div>

            <!-- 5. CHỮ KÝ XÁC NHẬN CHỨNG TỪ & CON DẤU XUẤT KHO -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; text-align: center; margin-top: 18px; font-size: 12px; page-break-inside: avoid; break-inside: avoid;">
              <div style="width: 200px;">
                <strong style="color: #0f172a; font-size: 12.5px;">Người mua hàng</strong><br>
                <span style="font-size: 11px; color: #64748b;">(Ký và ghi rõ họ tên)</span>
                <div style="height: 38px;"></div>
                <span style="font-size: 12px; color: #334155; font-style: italic; font-weight: 700;">${name}</span>
              </div>
              <div style="width: 250px;">
                <strong style="color: #0f172a; font-size: 12.5px;">Thủ kho Hikari BookStore</strong><br>
                <span style="font-size: 11px; color: #64748b;">(Đã ký xác nhận xuất kho)</span>
                <div style="margin-top: 6px; display: flex; justify-content: center;">
                  <div style="border: 2px solid #dc2626; border-radius: 6px; padding: 5px 12px; background: #fff1f2; transform: rotate(-2deg); text-align: center; min-width: 165px; box-shadow: 0 1px 4px rgba(220,38,38,0.12);">
                    <div style="font-size: 9.5px; font-weight: 800; color: #dc2626; letter-spacing: 0.5px;">XÁC NHẬN XUẤT KHO</div>
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; font-weight: 800; color: #b91c1c; margin: 1px 0; letter-spacing: 0.5px;">Hikari BookStore</div>
                    <div style="font-size: 8.5px; color: #991b1b; font-weight: 600;">HỆ THỐNG KHO TỰ ĐỘNG</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 6. FOOTER CHÚ THÍCH -->
            <div style="text-align: center; border-top: 1px dashed #cbd5e1; margin-top: 18px; padding-top: 8px; font-size: 11px; color: #94a3b8; page-break-inside: avoid; break-inside: avoid;">
              Cảm ơn quý độc giả đã tin tưởng lựa chọn Hikari BookStore! Hóa đơn này là chứng từ bảo hành đổi trả trong 7 ngày.
            </div>
          </div>
        `;

        // GẮN SỰ KIỆN XUẤT HÓA ĐƠN PDF VỚI TIMEOUT 2 GIÂY THEO ĐÚNG YÊU CẦU
        const btnExportPdf = document.querySelector('#btnExportInvoicePdf');
        if (btnExportPdf) {
          btnExportPdf.addEventListener('click', () => {
            btnExportPdf.disabled = true;
            btnExportPdf.innerHTML = `⏳ Đang xử lý & tạo hóa đơn PDF...`;

            // Đợi 1 giây để hiệu ứng mượt mà và chuẩn bị DOM in ấn
            setTimeout(async () => {
              const invoiceEl = document.querySelector('#invoicePrintTemplate');
              if (!invoiceEl) return;

              // Cuộn nhẹ lên đầu để html2canvas chụp đúng vị trí chuẩn xác
              window.scrollTo({ top: 0, behavior: 'instant' });
              invoiceEl.style.display = 'block';

              try {
                const opt = {
                  margin: [10, 10, 10, 10], // 10mm căn đều 4 cạnh chuẩn in ấn A4
                  filename: `HoaDon_${orderData.orderCode}.pdf`,
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { 
                    scale: 2, 
                    useCORS: true,
                    scrollY: 0,
                    scrollX: 0,
                    logging: false
                  },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                  pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } // Chống cắt đôi con dấu hoặc bảng
                };

                if (window.html2pdf) {
                  // Gọi lưu PDF và chờ hoàn tất
                  await window.html2pdf().set(opt).from(invoiceEl).toPdf().get('pdf').save();
                } else {
                  window.print();
                }

                showToast('✓ Xuất file hóa đơn PDF thành công! File đã được lưu về máy của bạn.', 'success');
              } catch (pdfErr) {
                console.error('Lỗi tạo PDF:', pdfErr);
                showToast('Đang mở cửa sổ in ấn hóa đơn...', 'info');
                window.print();
              } finally {
                invoiceEl.style.display = 'none';
                btnExportPdf.disabled = false;
                btnExportPdf.innerHTML = `📄 Tải Lại Hóa Đơn PDF`;
              }
            }, 1000);
          });
        }

        // LẮNG NGHE WEBHOOK SEPAY THỜI GIAN THỰC (POLLING) CHO ĐƠN CHUYỂN KHOẢN
        if (orderData.paymentMethod !== 'cod') {
          const pollInterval = setInterval(async () => {
            const checkData = await checkOrderPaymentStatus(orderData.orderCode);
            if (checkData && checkData.isPaid) {
              clearInterval(pollInterval);
              const box = document.querySelector('#sepayStatusBox');
              const text = document.querySelector('#sepayStatusText');
              const icon = document.querySelector('#sepaySpinIcon');
              const simBtn = document.querySelector('#btnSimulateSepay');
              if (box) {
                box.style.background = '#dcfce7';
                box.style.borderColor = '#22c55e';
              }
              if (text) {
                text.textContent = '✅ ĐÃ THANH TOÁN THÀNH CÔNG (SePay đã xác nhận)!';
                text.style.color = '#15803d';
              }
              if (icon) icon.textContent = '🎉';
              if (simBtn) simBtn.style.display = 'none';
              showToast(`✓ Đơn hàng #${orderData.orderCode} đã thanh toán thành công qua SePay!`, 'success');
            }
          }, 3000);

          const btnSim = document.querySelector('#btnSimulateSepay');
          if (btnSim) {
            btnSim.addEventListener('click', async () => {
              btnSim.disabled = true;
              btnSim.textContent = '⏳ Đang kích hoạt webhook SePay...';
              const simRes = await simulateSepayPayment(orderData.orderCode, orderData.total);
              if (simRes && simRes.success) {
                showToast('✓ Đã kích hoạt Webhook SePay giả lập thành công!', 'success');
              } else {
                btnSim.disabled = false;
                btnSim.textContent = '⚡ Bấm để giả lập SePay bắn Webhook thành công (Demo)';
              }
            });
          }
        }
      }

      showToast('Đặt hàng thành công! Mã đơn #' + orderData.orderCode, 'success');
    } catch (err) {
      console.error('Lỗi khi xử lý đặt hàng:', err);
      showToast('Có lỗi xảy ra khi xử lý đơn hàng. Vui lòng thử lại!', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        updateQrBoxDisplay();
      }
    }
    });
  }
};

// Khởi chạy khi DOM sẵn sàng hoặc ngay lập tức nếu DOM đã tải xong
const initCart = async () => {
  try { checkMockUser(); } catch (e) { console.warn('checkMockUser warning:', e); }
  try { await checkCurrentUser(); } catch (e) { console.warn('checkCurrentUser warning:', e); }
  try { await renderCart(); } catch (e) { console.error('renderCart error:', e); }
  try { setupCheckoutModal(); } catch (e) { console.error('setupCheckoutModal error:', e); }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCart);
} else {
  initCart();
}

// Lắng nghe tín hiệu cập nhật từ các trang khác
window.addEventListener('storage', async (e) => {
  if (e.key === 'cart_last_synced') {
    await renderCart();
  }
});

window.addEventListener('cartUpdated', async () => {
  await renderCart();
});

/**
 * utils.js - Các hàm tiện ích dùng chung
 * Áp dụng các tính năng ES6+: Arrow functions, Template literals, Default parameters, Destructuring
 */

import { api, addToCartServer, fetchCartServer, fetchOrders, isOrderCancelled } from './api.js';
import { initMailbox, updateMailboxHeaderBadge } from './mailbox.js';
import './chatbot.js';

// Định dạng số thành tiền tệ Việt Nam Đồng (VND)
export const formatPrice = (price = 0) => {
  return Number(price).toLocaleString('vi-VN', {
    style: 'currency',
    currency: 'VND'
  });
};

// Hiển thị thông báo Toast góc màn hình
export const showToast = (message, type = 'success') => {
  let container = document.querySelector('#toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? '✓' : 'ℹ';
  toast.innerHTML = `
    <span style="font-size: 1.1rem; font-weight: bold;">${icon}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Tự động xóa sau 3.5 giây
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
};

// ================= CHUẨN HÓA & KIỂM TRA SỐ ĐIỆN THOẠI / ĐỊA CHỈ 4 CẤP =================
const VN_PHONE_REGEX = /^0(3|5|7|8|9)[0-9]{8}$/;
const VN_REPEATED_PHONE_REGEX = /^0(\d)\1{8}$/;

export const normalizeVnPhoneInput = (raw = '') => {
  let digits = String(raw || '').trim();
  if (digits.startsWith('+84')) {
    digits = '0' + digits.slice(3);
  } else if (digits.startsWith('84') && digits.length >= 10) {
    digits = '0' + digits.slice(2);
  }
  return digits.replace(/\D/g, '').slice(0, 10);
};

export const attachVnPhoneInputGuard = (inputEl) => {
  if (!inputEl) return;
  inputEl.setAttribute('maxlength', '10');
  inputEl.setAttribute('inputmode', 'numeric');
  if (inputEl.dataset.phoneGuardAttached) return;
  inputEl.dataset.phoneGuardAttached = 'true';

  inputEl.addEventListener('input', () => {
    const cleaned = normalizeVnPhoneInput(inputEl.value);
    if (inputEl.value !== cleaned) {
      inputEl.value = cleaned;
    }
  });
};

export const validateVnPhone = (raw = '') => {
  const normalized = normalizeVnPhoneInput(raw);
  if (!normalized) {
    return { valid: false, normalized: '', message: 'Vui lòng nhập số điện thoại!' };
  }
  if (!VN_PHONE_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      message: 'Số điện thoại phải gồm đúng 10 chữ số, bắt đầu bằng 03, 05, 07, 08 hoặc 09!'
    };
  }
  if (VN_REPEATED_PHONE_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      message: 'Số điện thoại không hợp lệ (không dùng số lặp giả mạo)!'
    };
  }
  return { valid: true, normalized, message: '' };
};

export const parseStructuredAddress = (fullAddress = '') => {
  const parts = String(fullAddress || '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  if (parts.length >= 4) {
    return {
      street: parts.slice(0, parts.length - 3).join(', '),
      ward: parts[parts.length - 3],
      district: parts[parts.length - 2],
      city: parts[parts.length - 1]
    };
  }

  return {
    street: parts[0] || '',
    ward: parts[1] || '',
    district: parts[2] || '',
    city: ''
  };
};

const isValidAddressPart = (value = '', { requireHouseNumber = false } = {}) => {
  const trimmed = String(value || '').trim();
  const hasLetter = /\p{L}/u.test(trimmed);
  if (trimmed.length < 2 || !hasLetter) return false;
  if (requireHouseNumber) {
    return trimmed.length >= 4 && /\d/.test(trimmed);
  }
  return true;
};

export const validateStructuredAddress = ({ street = '', ward = '', district = '', city = '' } = {}) => {
  const cleanStreet = String(street || '').trim();
  const cleanWard = String(ward || '').trim();
  const cleanDistrict = String(district || '').trim();
  const cleanCity = String(city || '').trim();

  const errors = { street: '', ward: '', district: '', city: '' };

  if (!cleanStreet) {
    errors.street = 'Vui lòng nhập số nhà và tên đường!';
  } else if (!isValidAddressPart(cleanStreet, { requireHouseNumber: true })) {
    errors.street = 'Cần ghi rõ số nhà và tên đường (VD: 123 Đường Nguyễn Huệ)!';
  }

  if (!cleanWard) {
    errors.ward = 'Vui lòng nhập Phường / Xã!';
  } else if (!isValidAddressPart(cleanWard)) {
    errors.ward = 'Phường / Xã không hợp lệ (VD: Phường Bến Nghé)!';
  }

  if (!cleanDistrict) {
    errors.district = 'Vui lòng nhập Quận / Huyện!';
  } else if (!isValidAddressPart(cleanDistrict)) {
    errors.district = 'Quận / Huyện không hợp lệ (VD: Quận 1)!';
  }

  if (!cleanCity) {
    errors.city = 'Vui lòng nhập Tỉnh / Thành phố!';
  } else if (!isValidAddressPart(cleanCity)) {
    errors.city = 'Tỉnh / Thành phố không hợp lệ (VD: TP. Hồ Chí Minh)!';
  }

  const valid = !errors.street && !errors.ward && !errors.district && !errors.city;
  const formattedAddress = [cleanStreet, cleanWard, cleanDistrict, cleanCity].filter(Boolean).join(', ');

  return { valid, errors, formattedAddress };
};

// ================= LẤY USER ID HIỆN TẠI (ĐỂ LIÊN KẾT GIỎ HÀNG BẤT ĐỒNG BỘ) =================
export const getCurrentUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('currentUser'));
    if (user && user.id) return user.id;
  } catch (e) {
    // Không có user đăng nhập
  }
  // Nếu là khách vãng lai, tạo và duy trì 1 guest ID cố định
  let guestId = localStorage.getItem('hikari_guest_id');
  if (!guestId) {
    guestId = 'guest_' + Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('hikari_guest_id', guestId);
  }
  return guestId;
};

// ================= LOCAL STORAGE CHO GIỎ HÀNG (CACHE DỰ PHÒNG) =================
const CART_STORAGE_KEY = 'hikari_cart';

// Lấy danh sách sản phẩm trong giỏ hàng (Cache)
export const getCart = () => {
  try {
    const cart = localStorage.getItem(CART_STORAGE_KEY);
    return cart ? JSON.parse(cart) : [];
  } catch (error) {
    console.error('Lỗi khi đọc giỏ hàng từ localStorage:', error);
    return [];
  }
};

// Cập nhật giỏ hàng vào localStorage
export const saveCart = (cart = []) => {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    updateCartBadge();
  } catch (error) {
    console.error('Lỗi khi lưu giỏ hàng vào localStorage:', error);
  }
};

// Thêm sản phẩm vào giỏ hàng (TỐI ƯU PHẢN HỒI TỨC THÌ 0ms - LƯU VÀO CSDL SERVER)
export const addToCart = async (product, quantity = 1) => {
  if (!product || !product.id) return false;

  const stock = typeof product.stock === 'number' ? product.stock : 99;

  // 1. Kiểm tra nếu sản phẩm đã hết hàng trong CSDL
  if (stock <= 0) {
    showToast(`Rất tiếc! Cuốn "${product.name}" hiện đã hết hàng trong kho.`, 'info');
    return false;
  }

  const qtyToAdd = Math.max(1, Number(quantity) || 1);
  const userId = getCurrentUserId();

  // 2. Cập nhật ngay lập tức LocalStorage & Badge (0ms delay - Optimistic UI)
  const cart = getCart();
  const existingIndex = cart.findIndex(item => String(item.id) === String(product.id) || String(item.productId) === String(product.id));

  if (existingIndex !== -1) {
    cart[existingIndex].quantity += qtyToAdd;
    cart[existingIndex].stock = stock;
    cart[existingIndex].isNew = Boolean(product.isNew);
  } else {
    const { id, name, price, originalPrice, image, categoryName, isNew } = product;
    cart.push({
      id,
      productId: id,
      name,
      price,
      originalPrice,
      image,
      categoryName,
      isNew: Boolean(isNew),
      stock,
      quantity: qtyToAdd
    });
  }

  saveCart(cart);
  updateCartBadge();

  // Phát tín hiệu cập nhật giỏ hàng tức thời
  localStorage.setItem('cart_last_synced', Date.now().toString());
  window.dispatchEvent(new CustomEvent('cartUpdated'));

  showToast(`Đã thêm ${qtyToAdd} cuốn "${product.name}" vào giỏ hàng!`, 'success');

  // 3. Đồng bộ ngầm lên CSDL Server (/carts) không làm chặn giao diện
  addToCartServer(userId, product, qtyToAdd).catch(err => {
    console.warn('Lỗi đồng bộ giỏ hàng ngầm lên server:', err);
  });

  return true;
};

// Cập nhật số lượng đếm trên badge giỏ hàng (Đếm số loại sản phẩm trong giỏ)
export const updateCartBadge = async () => {
  const badge = document.querySelector('#cartCount');
  if (!badge) return;

  const userId = getCurrentUserId();
  try {
    const serverItems = await fetchCartServer(userId);
    if (Array.isArray(serverItems)) {
      badge.textContent = serverItems.length;
      return;
    }
  } catch (e) {
    // Fallback nếu API lỗi
  }

  // Fallback đọc từ LocalStorage
  const cart = getCart();
  badge.textContent = cart.length;
};

// ================= HÀM TIỆN ÍCH XỬ LÝ NGÀY THÁNG ĐƠN HÀNG =================
export const parseOrderDate = (order) => {
  if (!order) return new Date();
  if (order.createdAtIso) {
    const d = new Date(order.createdAtIso);
    if (!isNaN(d.getTime())) return d;
  }
  if (order.createdAt) {
    // Ưu tiên định dạng Việt Nam "HH:mm:ss DD/MM/YYYY" hoặc "DD/MM/YYYY" trước new Date()
    const raw = String(order.createdAt);
    const vnDateMatch = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (vnDateMatch) {
      const day = Number(vnDateMatch[1]);
      const month = Number(vnDateMatch[2]);
      const year = Number(vnDateMatch[3]);
      const timeMatch = raw.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
      const hours = timeMatch ? Number(timeMatch[1]) : 0;
      const minutes = timeMatch ? Number(timeMatch[2]) : 0;
      const seconds = timeMatch && timeMatch[3] ? Number(timeMatch[3]) : 0;
      return new Date(year, month - 1, day, hours, minutes, seconds);
    }

    const dIso = new Date(raw);
    if (!isNaN(dIso.getTime())) return dIso;
  }
  if (order.id && typeof order.id === 'number' && order.id > 1000000000000) {
    return new Date(order.id);
  }
  return new Date();
};

// ================= TÍNH TOÁN CẤP BẬC THÀNH VIÊN THEO THÁNG & DUY TRÌ VIP =================
export const calculateUserTier = async (user) => {
  if (!user || user.role === 'admin' || user.role === 'staff') return null;

  const orders = await fetchOrders();

  // Lọc các đơn hàng của user dựa vào userId hoặc SĐT / Tên / Email
  const userOrders = orders.filter(o => 
    (o.userId && String(o.userId) === String(user.id)) ||
    (o.customer?.phone && user.phone && o.customer.phone === user.phone) ||
    (o.customer?.email && user.email && o.customer.email.toLowerCase() === user.email.toLowerCase()) ||
    (o.customer?.name && user.name && o.customer.name.toLowerCase() === user.name.toLowerCase())
  );

  // Chỉ tính doanh thu & điểm VIP trên các đơn không bị hủy
  const activeOrders = userOrders.filter(o => !isOrderCancelled(o));
  const totalSpent = activeOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const ordersCount = activeOrders.length;

  // Xác định thời gian Tháng Hiện Tại và Tháng Trước
  const now = new Date();
  const currentMonth = now.getMonth(); // 0 - 11
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  // Lọc đơn hợp lệ (chưa hủy) trong tháng này và tháng trước
  const currentMonthOrders = activeOrders.filter(o => {
    const d = parseOrderDate(o);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const prevMonthOrders = activeOrders.filter(o => {
    const d = parseOrderDate(o);
    return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  });

  const currentMonthSpent = currentMonthOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const prevMonthSpent = prevMonthOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  // Mốc điều kiện VIP theo tháng
  const VIP_UPGRADE_THRESHOLD = 500000;   // Chi tiêu ≥ 500.000đ trong tháng để lên VIP
  const VIP_MAINTAIN_THRESHOLD = 250000;  // Chi tiêu ≥ 250.000đ trong tháng để DUY TRÌ VIP tháng sau

  // 1. Đạt mốc trong tháng hiện tại
  const achievedThisMonth = currentMonthSpent >= VIP_UPGRADE_THRESHOLD;
  // 2. Tháng trước đã là VIP (Bảo lưu danh hiệu VIP sang tháng này)
  const wasVipLastMonth = prevMonthSpent >= VIP_UPGRADE_THRESHOLD;

  // Trạng thái VIP hiện tại: Đạt mốc tháng này HOẶC bảo lưu từ tháng trước
  const isVip = achievedThisMonth || wasVipLastMonth;

  // Điều kiện DUY TRÌ sang tháng sau: Nếu là VIP và tháng này chi tiêu ≥ 250.000đ
  const isMaintainedForNextMonth = isVip && currentMonthSpent >= VIP_MAINTAIN_THRESHOLD;

  // Kiểm tra tài khoản mới đăng ký
  let isUnderOneMonth = false;
  if (user.createdAt) {
    const daysOld = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld <= 30) isUnderOneMonth = true;
  }
  const isNewbie = ordersCount === 0 || isUnderOneMonth;

  let tier = 'regular';
  let tierName = 'Thành Viên Thân Thiết';
  let badgeIcon = '👤';
  let badgeClass = 'tier-regular';

  if (isVip) {
    tier = 'vip';
    tierName = `Thành Viên VIP (T${currentMonth + 1})`;
    badgeIcon = '⭐';
    badgeClass = 'tier-vip';
  } else if (isNewbie) {
    tier = 'newbie';
    tierName = 'Thành Viên Mới';
    badgeIcon = '🎁';
    badgeClass = 'tier-newbie';
  }

  const remainingToUpgrade = Math.max(0, VIP_UPGRADE_THRESHOLD - currentMonthSpent);
  const remainingToMaintain = Math.max(0, VIP_MAINTAIN_THRESHOLD - currentMonthSpent);

  return {
    tier,
    tierName,
    badgeIcon,
    badgeClass,
    ordersCount,
    totalSpent,
    currentMonthSpent,
    currentMonthOrdersCount: currentMonthOrders.length,
    prevMonthSpent,
    isNewbie,
    isVip,
    achievedThisMonth,
    wasVipLastMonth,
    isMaintainedForNextMonth,
    remainingToUpgrade,
    remainingToMaintain,
    upgradeThreshold: VIP_UPGRADE_THRESHOLD,
    maintainThreshold: VIP_MAINTAIN_THRESHOLD,
    currentMonthNum: currentMonth + 1,
    userOrders,
    activeOrders
  };
};

// ================= RENDER MODAL HỒ SƠ KHÁCH HÀNG & LỊCH SỬ ĐƠN HÀNG (CÓ HỆ THỐNG TAB RIÊNG) =================
export const showUserProfileModal = async (user) => {
  if (!user) return;

  const tierInfo = await calculateUserTier(user);
  let modalEl = document.querySelector('#userProfileModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'userProfileModal';
    modalEl.className = 'profile-modal-overlay';
    document.body.appendChild(modalEl);
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const userBirthdayMonth = user.birthday ? parseInt(user.birthday.split('-')[1], 10) : null;
  const isBirthdayThisMonth = userBirthdayMonth === currentMonth;

  // Tính phần trăm thanh tiến độ
  let progressPercent = 0;
  if (tierInfo?.isVip) {
    progressPercent = Math.min(100, Math.round((tierInfo.currentMonthSpent / tierInfo.maintainThreshold) * 100));
  } else {
    progressPercent = Math.min(100, Math.round(((tierInfo?.currentMonthSpent || 0) / (tierInfo?.upgradeThreshold || 500000)) * 100));
  }

  const recentOrders = [...(tierInfo?.userOrders || [])].reverse();

  modalEl.innerHTML = `
    <div class="profile-modal-card">
      <button type="button" class="profile-modal-close" id="btnCloseProfileModal" title="Đóng">&times;</button>
      
      <!-- 1. HEADER TÀI KHOẢN KHÁCH HÀNG -->
      <div class="profile-header-card">
        <div class="profile-avatar-circle">
          ${tierInfo?.badgeIcon || '👤'}
        </div>
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <h2 style="font-size: 1.35rem; color: #0f172a; margin: 0; font-weight: 800;">${user.name}</h2>
            <span class="user-tier-badge ${tierInfo?.badgeClass === 'tier-vip' ? 'tier-vip-header' : (tierInfo?.badgeClass === 'tier-newbie' ? 'tier-newbie-header' : 'tier-regular-header')}">
              ${tierInfo?.tierName || 'Thành Viên'}
            </span>
          </div>
          <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem; color: #64748b;">
            Độc giả Hikari BookStore • ID Thành Viên: #${user.id} • ${user.email}
          </p>
        </div>
      </div>

      <!-- 2. HỆ THỐNG TAB ĐIỀU HƯỚNG RIÊNG BIỆT -->
      <div class="profile-tabs-nav" id="profileTabsNav">
        <button type="button" class="profile-tab-btn active" data-tab="info">
          <span>📋</span> Thông Tin Cá Nhân
        </button>
        <button type="button" class="profile-tab-btn" data-tab="vip">
          <span>⭐</span> Cấp Bậc VIP &amp; Quyền Lợi
        </button>
        <button type="button" class="profile-tab-btn" data-tab="orders">
          <span>📦</span> Lịch Sử Đơn Hàng (${recentOrders.length})
        </button>
      </div>

      <!-- ================= TAB 1: THÔNG TIN CÁ NHÂN ================= -->
      <div class="profile-tab-pane active" id="profileTab_info">
        <div class="profile-info-grid">
          <div class="profile-info-item">
            <div class="profile-info-label">Email Đăng Ký</div>
            <div class="profile-info-val">${user.email || 'Chưa cập nhật'}</div>
          </div>
          <div class="profile-info-item">
            <div class="profile-info-label">Số Điện Thoại</div>
            <div class="profile-info-val">${user.phone || 'Chưa cập nhật'}</div>
          </div>
          <div class="profile-info-item">
            <div class="profile-info-label">Ngày Sinh</div>
            <div class="profile-info-val">
              ${user.birthday ? user.birthday : 'Chưa cập nhật'}
              ${isBirthdayThisMonth ? '<span style="font-size: 0.75rem; color: #e11d48; font-weight: 700; margin-left: 0.35rem;">🎉 Sinh nhật tháng này!</span>' : ''}
            </div>
          </div>
          <div class="profile-info-item">
            <div class="profile-info-label">Tổng Chi Tiêu Toàn Thời Gian</div>
            <div class="profile-info-val" style="color: #e11d48; font-weight: 800;">
              ${formatPrice(tierInfo?.totalSpent || 0)} <span style="font-size: 0.8rem; color: #64748b; font-weight: 600;">(${tierInfo?.ordersCount || 0} đơn)</span>
            </div>
          </div>
        </div>

        <!-- FORM CẬP NHẬT THÔNG TIN NHANH -->
        <div class="profile-edit-box">
          <h4 style="font-size: 0.95rem; font-weight: 800; color: #0f172a; margin: 0 0 0.75rem 0; display: flex; align-items: center; gap: 0.35rem;">
            <span>✏️</span> Cập Nhật Thông Tin Cá Nhân
          </h4>
          <form id="profileUpdateForm" style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.75rem; align-items: flex-end;">
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: #64748b; display: block; margin-bottom: 0.25rem;">
                Số Điện Thoại
              </label>
              <input type="tel" id="profileInputPhone" class="form-input" value="${user.phone || ''}" placeholder="09xxxxxxxx" style="padding: 0.5rem 0.75rem; font-size: 0.85rem;" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: #64748b; display: block; margin-bottom: 0.25rem;">
                Ngày Sinh (Nhận quà sinh nhật)
              </label>
              <input type="date" id="profileInputBirthday" class="form-input" value="${user.birthday || ''}" style="padding: 0.5rem 0.75rem; font-size: 0.85rem;" />
            </div>
            <button type="submit" class="btn btn-primary" style="padding: 0.55rem 1rem; font-size: 0.85rem; font-weight: 700; height: fit-content;">
              💾 Lưu
            </button>
          </form>
        </div>
      </div>

      <!-- ================= TAB 2: CẤP BẬC VIP & QUYỀN LỢI ================= -->
      <div class="profile-tab-pane" id="profileTab_vip">
        <div class="vip-privilege-card ${tierInfo?.isVip ? '' : (tierInfo?.isNewbie ? 'newbie-card' : 'regular-card')}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
            <div>
              <div style="font-size: 0.75rem; font-weight: 800; color: ${tierInfo?.isVip ? '#b45309' : '#047857'}; text-transform: uppercase; letter-spacing: 0.5px;">
                ${tierInfo?.isVip ? '👑 HẠNG THÀNH VIÊN CAO CẤP' : '🎯 MỤC TIÊU THĂNG HẠNG'}
              </div>
              <h3 style="font-size: 1.2rem; color: #0f172a; margin: 0.25rem 0; font-weight: 800;">
                ${tierInfo?.tierName || 'Thành Viên'}
              </h3>
              <p style="margin: 0; font-size: 0.85rem; color: #475569;">
                ${tierInfo?.isVip 
                  ? (tierInfo.isMaintainedForNextMonth 
                      ? `✅ <strong>Tuyệt vời!</strong> Bạn đã duy trì thành công VIP sang tháng sau (đã mua ${formatPrice(tierInfo.currentMonthSpent)} trong tháng).`
                      : `⏳ Mua thêm <strong>${formatPrice(tierInfo.remainingToMaintain)}</strong> trong tháng ${currentMonth} để tiếp tục giữ hạng VIP tháng sau.`)
                  : `Mua sắm thêm <strong>${formatPrice(tierInfo?.remainingToUpgrade || 0)}</strong> trong tháng ${currentMonth} để thăng hạng VIP và nhận mã giảm 15%!`}
              </p>
            </div>
            <span style="font-weight: 900; font-size: 1.25rem; color: ${tierInfo?.isVip ? '#b45309' : '#e11d48'};">
              ${progressPercent}%
            </span>
          </div>

          <!-- THANH TIẾN ĐỘ VIP THEO THÁNG -->
          <div class="tier-progress-track">
            <div class="tier-progress-fill ${tierInfo?.tier || 'regular'}" style="width: ${progressPercent}%;"></div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #64748b; margin-top: 0.4rem;">
            <span>Đã chi tiêu tháng này: <strong style="color: #0f172a;">${formatPrice(tierInfo?.currentMonthSpent || 0)}</strong></span>
            <span>Mục tiêu: <strong style="color: #0f172a;">${formatPrice(tierInfo?.isVip ? tierInfo.maintainThreshold : tierInfo.upgradeThreshold)}</strong></span>
          </div>

          <!-- MÃ VOUCHER ĐẶC QUYỀN VIP -->
          <div class="vip-coupon-box">
            <div>
              <div style="font-size: 0.75rem; font-weight: 800; color: #b45309;">VOUCHER ĐẶC QUYỀN VIP</div>
              <strong style="font-size: 1.1rem; color: #0f172a; letter-spacing: 0.5px;">VIPMEMBER</strong>
              <div style="font-size: 0.8rem; color: #64748b;">Giảm ngay 15% tổng hóa đơn (1 lần/tháng, reset theo tháng)</div>
            </div>
            <div>
              ${tierInfo?.isVip 
                ? '<span style="background: #dcfce7; color: #15803d; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 0.8rem;">✓ Sẵn Sàng Dùng</span>'
                : '<span style="background: #f1f5f9; color: #64748b; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.8rem;">🔒 Chưa Đạt Hạng</span>'}
            </div>
          </div>
        </div>

        <!-- THỂ LỆ CẤP BẬC THEO THÁNG -->
        <div class="vip-rule-box">
          <strong style="font-size: 0.9rem; color: #0f172a; display: flex; align-items: center; gap: 0.35rem;">
            <span>📜</span> Thể Lệ Xếp Hạng &amp; Cơ Chế Duy Trì VIP:
          </strong>
          <ul class="vip-rule-list">
            <li><span>⭐</span> <strong>Lên VIP:</strong> Đạt tổng chi tiêu từ <strong>500.000đ</strong> trong tháng hiện tại.</li>
            <li><span>🔄</span> <strong>Duy Trì VIP:</strong> Chi tiêu tối thiểu <strong>250.000đ</strong> trong tháng để bảo lưu hạng VIP sang tháng tiếp theo.</li>
            <li><span>🎁</span> <strong>Đặc quyền:</strong> Áp dụng mã <strong>VIPMEMBER</strong> giảm 15% (1 lần/tháng), quà tặng sinh nhật và ưu tiên bọc sách plastic.</li>
          </ul>
        </div>
      </div>

      <!-- ================= TAB 3: LỊCH SỬ ĐƠN HÀNG ================= -->
      <div class="profile-tab-pane" id="profileTab_orders">
        <div class="profile-orders-table-wrap">
          <table class="profile-orders-table">
            <thead>
              <tr>
                <th style="width: 100px;">Mã Đơn</th>
                <th style="width: 120px;">Ngày Đặt</th>
                <th>Sản Phẩm Đã Mua</th>
                <th style="text-align: right; width: 110px;">Tổng Tiền</th>
                <th style="text-align: center; width: 110px;">Trạng Thái</th>
              </tr>
            </thead>
            <tbody>
              ${recentOrders.length === 0 ? `
                <tr>
                  <td colspan="5" style="text-align: center; padding: 2.5rem 1rem; color: #94a3b8;">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">📦</div>
                    <div>Bạn chưa có đơn hàng nào tại Hikari BookStore!</div>
                    <a href="products.html" class="btn btn-primary" style="margin-top: 0.75rem; font-size: 0.85rem; padding: 0.5rem 1rem; display: inline-flex;">
                      Khám Phá Sách Ngay
                    </a>
                  </td>
                </tr>
              ` : recentOrders.map(o => `
                <tr>
                  <td><strong>#${o.orderCode || o.id}</strong></td>
                  <td style="color: #64748b;">${o.createdAt || 'Mới đặt'}</td>
                  <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${(o.items || []).map(i => `${i.name} (x${i.quantity})`).join(', ')}">
                    ${(o.items || []).map(i => `${i.name} (x${i.quantity})`).join(', ')}
                  </td>
                  <td style="text-align: right; font-weight: 700; color: #e11d48;">
                    ${formatPrice(o.total)}
                  </td>
                  <td style="text-align: center;">
                    <span style="background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">
                      ${o.status || 'Đã ghi nhận'}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Mở modal
  modalEl.classList.add('active');

  // GẮN SỰ KIỆN CHUYỂN TAB TRỰC QUAN
  const tabBtns = modalEl.querySelectorAll('.profile-tab-btn');
  const tabPanes = modalEl.querySelectorAll('.profile-tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = modalEl.querySelector(`#profileTab_${targetTab}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // GẮN SỰ KIỆN CẬP NHẬT THÔNG TIN NGƯỜI DÙNG
  const updateForm = modalEl.querySelector('#profileUpdateForm');
  const modalPhoneInput = modalEl.querySelector('#profileInputPhone');
  attachVnPhoneInputGuard(modalPhoneInput);
  if (updateForm) {
    updateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawPhone = modalEl.querySelector('#profileInputPhone').value.trim();
      const phoneCheck = validateVnPhone(rawPhone);
      if (!phoneCheck.valid) {
        showToast(phoneCheck.message, 'error');
        modalPhoneInput?.focus();
        return;
      }

      const newPhone = phoneCheck.normalized;
      const newBirthday = modalEl.querySelector('#profileInputBirthday').value;

      user.phone = newPhone;
      user.birthday = newBirthday;
      localStorage.setItem('user', JSON.stringify(user));

      try {
        await api.patch(`/users/${user.id}`, { phone: newPhone, birthday: newBirthday });
      } catch (err) {
        console.warn('Lỗi đồng bộ server users:', err);
      }

      showToast('✓ Cập nhật thông tin cá nhân thành công!', 'success');
      showUserProfileModal(user); // Làm mới modal
    });
  }

  // Đóng modal
  const closeModal = () => modalEl.classList.remove('active');
  modalEl.querySelector('#btnCloseProfileModal')?.addEventListener('click', closeModal);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeModal();
  });
};

// ================= QUẢN LÝ DANH SÁCH YÊU THÍCH (WISHLIST) =================
export const updateWishlistHeaderBadge = () => {
  const user = JSON.parse(localStorage.getItem('user'));
  const headerWishlistBtn = document.querySelector('#headerWishlistBtn');
  const badges = document.querySelectorAll('#headerWishlistCount, .wishlist-count-badge');

  if (!user || !user.name) {
    if (headerWishlistBtn) {
      headerWishlistBtn.style.display = 'none';
    }
    badges.forEach(b => {
      b.textContent = '0';
      b.style.display = 'none';
    });
    return;
  }

  if (headerWishlistBtn) {
    headerWishlistBtn.style.display = 'flex';
  }
  const wishlist = JSON.parse(localStorage.getItem('hikari_wishlist')) || [];
  badges.forEach(b => {
    b.textContent = wishlist.length;
    b.style.display = 'flex';
  });
};

export const toggleWishlistItem = (prodId, prodName) => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user || !user.name) {
    showToast('Vui lòng đăng nhập để lưu tác phẩm vào danh sách yêu thích! ❤️', 'info');
    setTimeout(() => {
      const currentPage = window.location.pathname.split('/').pop() || 'index.html';
      window.location.href = `login.html?redirect=${encodeURIComponent(currentPage)}`;
    }, 1000);
    return null;
  }

  let wishlist = JSON.parse(localStorage.getItem('hikari_wishlist')) || [];
  const strId = String(prodId);
  const numId = Number(prodId);
  const isFavorited = wishlist.some(id => String(id) === strId);

  let isNowFav = false;
  if (isFavorited) {
    wishlist = wishlist.filter(id => String(id) !== strId);
    localStorage.setItem('hikari_wishlist', JSON.stringify(wishlist));
    localStorage.setItem(`hikari_wishlist_${user.id}`, JSON.stringify(wishlist));
    showToast(`Đã bỏ "${prodName || 'tác phẩm'}" khỏi danh sách yêu thích`, 'info');
    isNowFav = false;
  } else {
    wishlist.push(numId);
    localStorage.setItem('hikari_wishlist', JSON.stringify(wishlist));
    localStorage.setItem(`hikari_wishlist_${user.id}`, JSON.stringify(wishlist));
    showToast(`Đã thêm "${prodName || 'tác phẩm'}" vào danh sách yêu thích! ❤️`, 'success');
    isNowFav = true;
  }

  // Đồng bộ gián tiếp lên thông tin người dùng nếu có server
  if (user.id) {
    api.patch(`/users/${user.id}`, { wishlist }).catch(() => {});
  }

  updateWishlistHeaderBadge();
  return isNowFav;
};

// ================= QUẢN LÝ THÔNG BÁO ĐƠN HÀNG (NOTIFICATIONS) =================
const getCurrentSessionUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || localStorage.getItem('currentUser'));
  } catch (e) {
    return null;
  }
};

const doesNotificationBelongToUser = (notif, user) => {
  if (!user) return false;
  if (!notif.userId && !notif.userEmail) return true;
  if (notif.userId && user.id && String(notif.userId) === String(user.id)) return true;
  if (notif.userEmail && user.email && notif.userEmail.toLowerCase() === user.email.toLowerCase()) return true;
  return false;
};

export const updateNotificationsDisplay = () => {
  const notifCountBadge = document.querySelector('#headerNotifCount');
  const notifList = document.querySelector('#headerNotifList');
  if (!notifCountBadge || !notifList) return;

  const curUser = getCurrentSessionUser();
  const allNotifs = JSON.parse(localStorage.getItem('hikari_order_notifications')) || [];
  const notifs = curUser ? allNotifs.filter(n => doesNotificationBelongToUser(n, curUser)) : [];
  const unreadCount = notifs.filter(n => !n.read).length;

  if (unreadCount > 0) {
    notifCountBadge.textContent = unreadCount;
    notifCountBadge.style.display = 'flex';
  } else {
    notifCountBadge.style.display = 'none';
  }

  if (notifs.length === 0) {
    notifList.innerHTML = `
      <div style="padding: 1.5rem 1rem; text-align: center; color: #64748b; font-size: 0.82rem;">
        📦 Chưa có cập nhật đơn hàng nào
      </div>
    `;
    return;
  }

  notifList.innerHTML = notifs.slice(0, 8).map(n => `
    <div style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; background: ${n.read ? '#fff' : '#fef2f2'}; font-size: 0.8rem;">
      <div style="font-weight: 700; color: #0f172a; margin-bottom: 2px;">
        ${n.message}
      </div>
      <div style="font-size: 0.72rem; color: #94a3b8;">${n.time || ''}</div>
    </div>
  `).join('');
};

/**
 * Tự động đồng bộ thông báo từ CSDL Neon Server về thiết bị (Chống bị nuốt thông báo)
 */
export const syncNotificationsFromOrders = async () => {
  const curUser = getCurrentSessionUser();
  if (!curUser) return;

  try {
    const orders = await fetchOrders();
    const userOrders = orders.filter(o => 
      (o.userId && curUser.id && String(o.userId) === String(curUser.id)) ||
      (o.customer?.email && curUser.email && o.customer.email.toLowerCase() === curUser.email.toLowerCase())
    );

    if (userOrders.length === 0) return;

    const allNotifs = JSON.parse(localStorage.getItem('hikari_order_notifications')) || [];
    let hasNew = false;

    userOrders.forEach(o => {
      const orderCode = o.orderCode || o.id;
      const status = o.status || 'Chờ xác nhận';
      const isPaid = String(o.paymentStatus || '').toLowerCase().includes('đã thanh toán');

      let notifMsg = '';
      if (status === 'Đã hoàn thành') {
        notifMsg = `Đơn hàng #${orderCode} đã giao thành công bởi SPX Express!`;
      } else if (status === 'Đang giao hàng') {
        notifMsg = `Đơn hàng #${orderCode} đang được giao đến bạn (Mã VĐ: ${o.trackingCode || 'SPX'}).`;
      } else if (isPaid && status === 'Đang xử lý') {
        notifMsg = `Đơn hàng #${orderCode} đã thanh toán VietQR thành công & đang đóng gói.`;
      } else if (status === 'Đang xử lý') {
        notifMsg = `Đơn hàng #${orderCode} đã được xác nhận và đang đóng gói.`;
      } else if (status === 'Chờ xác nhận') {
        notifMsg = `Đơn hàng #${orderCode} đã được đặt thành công (Chờ nhân viên xác nhận).`;
      }

      if (notifMsg) {
        const exists = allNotifs.some(n => 
          (String(n.orderId) === String(o.id) || String(n.orderCode) === String(orderCode)) &&
          n.status === status
        );

        if (!exists) {
          allNotifs.unshift({
            id: Date.now() + Math.floor(Math.random() * 1000),
            orderId: o.id,
            orderCode,
            userId: curUser.id,
            userEmail: curUser.email,
            status,
            message: notifMsg,
            time: o.createdAt || new Date().toLocaleString('vi-VN'),
            read: false
          });
          hasNew = true;
        }
      }
    });

    if (hasNew) {
      localStorage.setItem('hikari_order_notifications', JSON.stringify(allNotifs.slice(0, 50)));
      updateNotificationsDisplay();
    }
  } catch (err) {
    console.warn('Lỗi đồng bộ thông báo từ server:', err);
  }
};

// Kiểm tra phiên đăng nhập của người dùng & hiển thị huy hiệu cấp bậc
export const checkCurrentUser = async () => {
  const userGreeting = document.querySelector('#userGreeting');
  if (!userGreeting) return;

  const user = JSON.parse(localStorage.getItem('user'));
  if (user && user.name) {
    const isAdmin = user.role === 'admin';
    const isStaff = user.role === 'staff';
    let tierBadgeHtml = '';

    if (!isAdmin && !isStaff) {
      try {
        const tierInfo = await calculateUserTier(user);
        if (tierInfo) {
          if (tierInfo.isVip) {
            tierBadgeHtml = `<span class="user-tier-badge tier-vip-header" title="Thành Viên VIP (Chi tiêu ≥ 500k/tháng)">⭐ VIP</span>`;
          } else if (tierInfo.isNewbie) {
            tierBadgeHtml = `<span class="user-tier-badge tier-newbie-header" title="Thành Viên Mới (Chưa có đơn hàng nào)">🎁 Mới</span>`;
          } else {
            tierBadgeHtml = `<span class="user-tier-badge tier-regular-header" title="Thành Viên Thân Thiết">Thân Thiết</span>`;
          }
        }
      } catch (err) {
        console.warn('Lỗi tính hạng thành viên:', err);
      }
    } else if (isStaff) {
      tierBadgeHtml = `<span class="user-tier-badge" style="background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 0.75rem;" title="Nhân Viên Hikari">💼 Nhân Viên</span>`;
    }

    userGreeting.innerHTML = `
      <div class="user-dropdown" style="display: flex; align-items: center; gap: 0.45rem;">
        <!-- Nút Yêu Thích Header -->
        <a href="profile.html#wishlist" class="header-icon-btn" id="headerWishlistBtn" title="Xem danh sách yêu thích" style="position: relative; text-decoration: none; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: #fff; border: 1px solid #e2e8f0; color: #e11d48; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          <span>❤️</span>
          <span class="wishlist-count-badge" id="headerWishlistCount" style="position: absolute; top: -4px; right: -4px; background: #e11d48; color: #fff; font-size: 0.65rem; font-weight: 800; min-width: 17px; height: 17px; border-radius: 9px; display: flex; align-items: center; justify-content: center; padding: 0 3px;">0</span>
        </a>

        <!-- Nút Chuông Thông Báo Header -->
        <div class="notif-wrapper" style="position: relative;">
          <button type="button" id="headerNotifBtn" class="header-icon-btn" title="Thông báo trạng thái đơn hàng" style="position: relative; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: #fff; border: 1px solid #e2e8f0; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <span>🔔</span>
            <span class="notif-count-badge" id="headerNotifCount" style="position: absolute; top: -4px; right: -4px; background: #f59e0b; color: #fff; font-size: 0.65rem; font-weight: 800; min-width: 17px; height: 17px; border-radius: 9px; display: none; align-items: center; justify-content: center; padding: 0 3px;">0</span>
          </button>
          
          <!-- Dropdown Popup Thông Báo -->
          <div id="headerNotifDropdown" style="display: none; position: absolute; right: 0; top: 40px; width: 310px; background: #fff; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; z-index: 1000; overflow: hidden;">
            <div style="padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
              <strong style="font-size: 0.85rem; color: #0f172a;">🔔 Cập Nhật Đơn Hàng</strong>
              <button id="btnClearNotifs" style="background: none; border: none; font-size: 0.72rem; color: #64748b; cursor: pointer; text-decoration: underline;">Đã đọc hết</button>
            </div>
            <div id="headerNotifList" style="max-height: 240px; overflow-y: auto;">
              <!-- Render động thông báo -->
            </div>
            <div style="padding: 8px; text-align: center; background: #f8fafc; border-top: 1px solid #e2e8f0;">
              <a href="profile.html#orders" style="font-size: 0.78rem; font-weight: 700; color: #e11d48; text-decoration: none;">Xem lịch sử đơn hàng →</a>
            </div>
          </div>
        </div>

        <!-- Nút Hòm Thư Ảo Header (Mã OTP & Hóa Đơn PDF) -->
        <button type="button" id="headerMailboxBtn" class="header-icon-btn mailbox-header-btn" title="Hòm thư ảo Hikari Mail (Nhận mã OTP & Hóa đơn PDF)" style="position: relative; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: #fff; border: 1px solid #e2e8f0; cursor: pointer; color: #0284c7; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          <span>📬</span>
          <span class="mailbox-header-badge" id="headerMailboxCount" style="position: absolute; top: -4px; right: -4px; background: #0284c7; color: #fff; font-size: 0.65rem; font-weight: 800; min-width: 17px; height: 17px; border-radius: 9px; display: none; align-items: center; justify-content: center; padding: 0 3px;">0</span>
        </button>

        ${isAdmin ? `<a href="admin.html" class="btn-admin-link" style="background: #1e1b4b; color: #ffffff; padding: 0.35rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 0.25rem;">👑 Quản Trị</a>` : ''}
        ${isStaff ? `<a href="admin.html" class="btn-admin-link" style="background: #0369a1; color: #ffffff; padding: 0.35rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 0.25rem;">💼 Quản Lý Kho</a>` : ''}
        ${user.role === 'shipper' ? `<a href="shipper.html" class="btn-admin-link" style="background: #ea580c; color: #ffffff; padding: 0.35rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 0.25rem;">🚚 Giao Hàng SPX</a>` : ''}
        <a href="profile.html" id="btnOpenUserProfile" class="user-badge user-badge-clickable" title="Trang cá nhân, Cấp bậc VIP và Lịch sử đơn hàng" style="text-decoration: none;">
          <span>👤</span>
          <span><strong>${user.name}</strong></span>
          ${tierBadgeHtml}
        </a>
        <button id="logoutBtn" class="btn-logout" title="Đăng xuất khỏi tài khoản">Đăng xuất</button>
      </div>
    `;

    const logoutBtn = document.querySelector('#logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const curUser = JSON.parse(localStorage.getItem('user'));
        if (curUser && curUser.id) {
          const currentWishlist = localStorage.getItem('hikari_wishlist');
          if (currentWishlist) {
            localStorage.setItem(`hikari_wishlist_${curUser.id}`, currentWishlist);
          }
        }
        localStorage.removeItem('user');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('hikari_wishlist');
        showToast('Đã đăng xuất tài khoản!', 'info');
        setTimeout(() => {
          window.location.reload();
        }, 500);
      });
    }

    // Thiết lập sự kiện Dropdown Thông Báo
    const notifBtn = document.querySelector('#headerNotifBtn');
    const notifDropdown = document.querySelector('#headerNotifDropdown');
    const btnClearNotifs = document.querySelector('#btnClearNotifs');

    if (notifBtn && notifDropdown) {
      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = notifDropdown.style.display === 'none' || !notifDropdown.style.display;
        notifDropdown.style.display = isHidden ? 'block' : 'none';
        updateNotificationsDisplay();
      });

      document.addEventListener('click', (e) => {
        if (!notifDropdown.contains(e.target) && e.target !== notifBtn) {
          notifDropdown.style.display = 'none';
        }
      });
    }

    if (btnClearNotifs) {
      btnClearNotifs.addEventListener('click', (e) => {
        e.stopPropagation();
        const curUser = getCurrentSessionUser();
        const notifs = JSON.parse(localStorage.getItem('hikari_order_notifications')) || [];
        notifs.forEach(n => {
          if (doesNotificationBelongToUser(n, curUser)) {
            n.read = true;
          }
        });
        localStorage.setItem('hikari_order_notifications', JSON.stringify(notifs));
        updateNotificationsDisplay();
        showToast('Đã đánh dấu đã đọc tất cả thông báo!', 'info');
      });
    }

    updateNotificationsDisplay();
  } else {
    // Khách vãng lai: Chỉ hiển thị nút Đăng nhập & Đăng ký, kèm nút Hòm thư ảo
    userGreeting.innerHTML = `
      <div class="auth-links" style="display: flex; align-items: center; gap: 0.5rem;">
        <button type="button" id="headerMailboxBtn" class="header-icon-btn mailbox-header-btn" title="Hòm thư ảo Hikari Mail (Nhận mã OTP & Hóa đơn PDF)" style="position: relative; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: #fff; border: 1px solid #e2e8f0; cursor: pointer; color: #0284c7; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          <span>📬</span>
          <span class="mailbox-header-badge" id="headerMailboxCount" style="position: absolute; top: -4px; right: -4px; background: #0284c7; color: #fff; font-size: 0.65rem; font-weight: 800; min-width: 17px; height: 17px; border-radius: 9px; display: none; align-items: center; justify-content: center; padding: 0 3px;">0</span>
        </button>
        <a href="login.html" class="nav-link">Đăng nhập</a>
        <a href="register.html" class="btn-register-header">Đăng ký</a>
      </div>
    `;

    // Đảm bảo loại bỏ nút yêu thích ở header nếu còn tồn tại
    const headerWishlistBtn = document.querySelector('#headerWishlistBtn');
    if (headerWishlistBtn) {
      headerWishlistBtn.remove();
    }
  }

  updateWishlistHeaderBadge();
  initMailbox();
  syncNotificationsFromOrders();
};


// Thiết lập sự kiện đóng mở Dropdown Danh mục sản phẩm
export const setupCategoryDropdown = async () => {
  const wrapper = document.querySelector('#catDropdownWrapper');
  const btn = document.querySelector('#catDropdownBtn');
  const menu = document.querySelector('#catDropdownMenu');
  if (!wrapper || !btn) return;

  // Tự động nạp danh mục mới nhất từ CSDL vào Header Dropdown
  if (menu) {
    try {
      let categories = [];
      try {
        const res = await api.get('/categories');
        categories = res.data || [];
      } catch (e) {
        const fb = await fetch('./db.json');
        const d = await fb.json();
        categories = d.categories || [];
      }

      if (categories && categories.length > 0) {
        menu.innerHTML = `
          <a href="products.html" class="cat-dropdown-item">
            <span class="cat-item-icon">📚</span>
            <div class="cat-item-text">
              <span class="cat-item-title">Tất Cả Tác Phẩm</span>
              <span class="cat-item-sub">Khám phá toàn bộ kho truyện &amp; sách</span>
            </div>
          </a>
        ` + categories.map(cat => `
          <a href="products.html?cat=${cat.id}" class="cat-dropdown-item">
            <span class="cat-item-icon">${cat.icon || '📖'}</span>
            <div class="cat-item-text">
              <span class="cat-item-title">${cat.name}</span>
              <span class="cat-item-sub">${cat.description || 'Tác phẩm chọn lọc'}</span>
            </div>
          </a>
        `).join('');
      }
    } catch (catErr) {
      console.warn('Lỗi tải danh mục động cho header dropdown:', catErr);
    }
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    wrapper.classList.toggle('open');
    const isOpen = wrapper.classList.contains('open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  // Tự động đóng dropdown khi click ra ngoài
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      wrapper.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  // Đóng khi bấm phím Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      wrapper.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
};

// Lắng nghe sự kiện click nút Yêu Thích trên toàn bộ trang
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-card-wishlist');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();

  const id = btn.dataset.id;
  const name = btn.dataset.name;
  const isNowFav = toggleWishlistItem(id, name);

  // Nếu người dùng chưa đăng nhập (trả về null), giữ nguyên tim trắng không đổi màu
  if (isNowFav === null) {
    btn.classList.remove('active');
    btn.innerHTML = '🤍';
    btn.style.color = '#94a3b8';
    return;
  }

  btn.classList.toggle('active', isNowFav);
  btn.innerHTML = isNowFav ? '❤️' : '🤍';
  btn.style.color = isNowFav ? '#e11d48' : '#94a3b8';
});

// Tự động khởi chạy dropdown khi DOM sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupCategoryDropdown);
} else {
  setupCategoryDropdown();
}



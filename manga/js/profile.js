/**
 * HIKARI BOOKSTORE - LOGIC TRANG HỒ SƠ ĐỘC GIẢ (PROFILE.JS)
 * Quản lý thông tin, Cấp bậc VIP theo tháng, Lịch sử đơn hàng & Xuất hóa đơn PDF
 */

import { 
  formatPrice, 
  showToast, 
  checkCurrentUser, 
  updateCartBadge, 
  addToCart,
  calculateUserTier,
  parseOrderDate,
  updateWishlistHeaderBadge,
  updateNotificationsDisplay,
  attachVnPhoneInputGuard,
  validateVnPhone,
  parseStructuredAddress,
  validateStructuredAddress
} from './utils.js';
import { 
  api,
  fetchProducts,
  fetchOrders,
  updateOrder,
  restoreOrderStock,
  normalizeOrderStatus,
  isOrderCancelled,
  pushOrderNotification
} from './api.js';

// State lưu trữ dữ liệu trang Profile
const state = {
  user: null,
  tierInfo: null,
  orders: [],
  allProducts: [],
  orderSyncAttached: false,
  orderSyncTimer: null
};

// Khởi chạy khi tải trang
document.addEventListener('DOMContentLoaded', async () => {
  await checkCurrentUser();
  await updateCartBadge();
  await initProfilePage();
  setupTabNavigation();
  setupDropdownMenu();
});

// ================= 1. KHỞI TẠO DỮ LIỆU TRANG PROFILE =================
const initProfilePage = async () => {
  const requireLoginNotice = document.querySelector('#requireLoginNotice');
  const profileDashboard = document.querySelector('#profileDashboard');

  const storedUser = JSON.parse(localStorage.getItem('user'));
  if (!storedUser || !storedUser.name) {
    if (requireLoginNotice) requireLoginNotice.style.display = 'block';
    if (profileDashboard) profileDashboard.style.display = 'none';
    return;
  }

  state.user = storedUser;
  if (requireLoginNotice) requireLoginNotice.style.display = 'none';
  if (profileDashboard) profileDashboard.style.display = 'grid';

  // Tính toán cấp bậc VIP và lấy đơn hàng
  try {
    state.tierInfo = await calculateUserTier(state.user);
    state.orders = [...(state.tierInfo?.userOrders || [])].reverse();
  } catch (err) {
    console.error('Lỗi tính toán cấp bậc:', err);
  }

  // Lấy toàn bộ sách để phục vụ hiển thị danh sách Yêu thích
  try {
    state.allProducts = await fetchProducts();
  } catch (err) {
    state.allProducts = JSON.parse(localStorage.getItem('products')) || [];
  }

  // Render các thành phần
  renderSidebar();
  renderInfoTab();
  renderVipTab();
  renderOrdersTab();
  renderWishlistTab();
  setupProfileForms();
  setupOrderSyncListeners();

  // Kiểm tra URL hash (ví dụ: profile.html#vip, profile.html#orders, profile.html#wishlist)
  const isInternalRole = state.user?.role === 'admin' || state.user?.role === 'staff';
  const hash = window.location.hash.replace('#', '');
  if (hash && ['info', 'vip', 'orders', 'wishlist', 'password'].includes(hash)) {
    switchTab(isInternalRole && hash === 'vip' ? 'info' : hash);
  }
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getUserMatchedOrders = (orders = [], user) => {
  if (!user) return [];
  return orders.filter(o =>
    (o.userId && String(o.userId) === String(user.id)) ||
    (o.customer?.email && user.email && o.customer.email.toLowerCase() === user.email.toLowerCase()) ||
    (o.customer?.phone && user.phone && o.customer.phone === user.phone) ||
    (o.customer?.name && user.name && o.customer.name.toLowerCase() === user.name.toLowerCase())
  );
};

let isRefreshingProfileOrders = false;
const refreshProfileOrders = async (showNotice = false) => {
  if (!state.user || isRefreshingProfileOrders) return;
  isRefreshingProfileOrders = true;

  const refreshBtn = document.querySelector('#btnRefreshProfileOrders');
  if (refreshBtn && showNotice) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳ Đang đồng bộ...';
  }

  try {
    const tierInfo = await calculateUserTier(state.user);
    if (tierInfo) {
      state.tierInfo = tierInfo;
      state.orders = [...(tierInfo.userOrders || [])].reverse();
    } else {
      const allOrders = await fetchOrders();
      state.orders = [...getUserMatchedOrders(allOrders, state.user)].reverse();
    }

    renderSidebar();
    renderVipTab();
    renderOrdersTab();
    updateNotificationsDisplay();

    if (showNotice) {
      showToast('✓ Đã đồng bộ trạng thái đơn hàng mới nhất!', 'success');
    }
  } catch (err) {
    console.warn('Lỗi đồng bộ đơn hàng cá nhân:', err);
    if (showNotice) {
      showToast('Không thể đồng bộ đơn hàng lúc này. Vui lòng thử lại!', 'error');
    }
  } finally {
    isRefreshingProfileOrders = false;
    if (refreshBtn && showNotice) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 Cập nhật';
    }
  }
};

const setupOrderSyncListeners = () => {
  if (state.orderSyncAttached) return;
  state.orderSyncAttached = true;

  const refreshBtn = document.querySelector('#btnRefreshProfileOrders');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => refreshProfileOrders(true));
  }

  const syncIfOrdersTabActive = () => {
    const ordersPane = document.querySelector('#tabPane_orders');
    if (!document.hidden && ordersPane?.classList.contains('active') && state.user) {
      refreshProfileOrders(false);
    }
  };

  window.addEventListener('focus', syncIfOrdersTabActive);
  document.addEventListener('visibilitychange', syncIfOrdersTabActive);
  window.addEventListener('storage', (e) => {
    if (e.key === 'hikari_order_status_updated' || e.key === 'cart_last_synced') {
      refreshProfileOrders(false);
    }
  });
  window.addEventListener('orderUpdated', () => refreshProfileOrders(false));
  state.orderSyncTimer = window.setInterval(syncIfOrdersTabActive, 3000);
};

// ================= 2. RENDER SIDEBAR TÀI KHOẢN (CỘT TRÁI) =================
const renderSidebar = () => {
  const { user, tierInfo, orders } = state;

  const sidebarAvatar = document.querySelector('#sidebarAvatar');
  const sidebarUserName = document.querySelector('#sidebarUserName');
  const sidebarUserEmail = document.querySelector('#sidebarUserEmail');
  const sidebarTierBadgeContainer = document.querySelector('#sidebarTierBadgeContainer');
  const sidebarOrdersCount = document.querySelector('#sidebarOrdersCount');
  const vipNavBtn = document.querySelector('.profile-nav-item[data-tab="vip"]');
  const isInternalRole = user.role === 'admin' || user.role === 'staff';

  if (vipNavBtn) {
    vipNavBtn.style.display = isInternalRole ? 'none' : '';
  }

  if (sidebarAvatar) {
    if (user.role === 'admin') sidebarAvatar.textContent = '👑';
    else if (user.role === 'staff') sidebarAvatar.textContent = '💼';
    else sidebarAvatar.textContent = tierInfo?.badgeIcon || '👤';
  }
  if (sidebarUserName) sidebarUserName.textContent = user.name;
  if (sidebarUserEmail) sidebarUserEmail.textContent = user.email || 'Chưa có email';
  if (sidebarOrdersCount) sidebarOrdersCount.textContent = orders.length;

  if (sidebarTierBadgeContainer) {
    let badgeHtml = '';
    if (user.role === 'admin') {
      badgeHtml = `<span class="user-tier-badge" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5;">👑 Quản Trị Viên</span>`;
    } else if (user.role === 'staff') {
      badgeHtml = `<span class="user-tier-badge" style="background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc;">💼 Nhân Viên</span>`;
    } else if (tierInfo?.isVip) {
      badgeHtml = `<span class="user-tier-badge tier-vip-header">⭐ ${tierInfo.tierName}</span>`;
    } else if (tierInfo?.isNewbie) {
      badgeHtml = `<span class="user-tier-badge tier-newbie-header">🎁 Thành Viên Mới</span>`;
    } else {
      badgeHtml = `<span class="user-tier-badge tier-regular-header">Thành Viên Thân Thiết</span>`;
    }
    sidebarTierBadgeContainer.innerHTML = badgeHtml;
  }

  // Nút đăng xuất ở sidebar
  const sidebarLogoutBtn = document.querySelector('#sidebarLogoutBtn');
  if (sidebarLogoutBtn) {
    sidebarLogoutBtn.addEventListener('click', () => {
      if (confirm('Bạn có chắc chắn muốn đăng xuất khỏi tài khoản Hikari?')) {
        const curUser = state.user || JSON.parse(localStorage.getItem('user'));
        if (curUser && curUser.id) {
          const currentWishlist = localStorage.getItem('hikari_wishlist');
          if (currentWishlist) {
            localStorage.setItem(`hikari_wishlist_${curUser.id}`, currentWishlist);
          }
        }
        localStorage.removeItem('user');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('hikari_wishlist');
        showToast('Đăng xuất thành công!', 'info');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 500);
      }
    });
  }
};

// ================= 3. RENDER TAB 1: THÔNG TIN CÁ NHÂN =================
const renderInfoTab = () => {
  const { user, tierInfo } = state;

  // Stats row
  const statTotalSpent = document.querySelector('#statTotalSpent');
  const statOrdersCount = document.querySelector('#statOrdersCount');
  const statTierName = document.querySelector('#statTierName');

  if (statTotalSpent) statTotalSpent.textContent = formatPrice(tierInfo?.totalSpent || 0);
  if (statOrdersCount) statOrdersCount.textContent = `${tierInfo?.ordersCount || 0} đơn`;
  if (statTierName) statTierName.textContent = tierInfo?.tierName || 'Thành Viên';

  // Điền giá trị vào form
  const inpName = document.querySelector('#inpName');
  const inpEmail = document.querySelector('#inpEmail');
  const inpPhone = document.querySelector('#inpPhone');
  const inpBirthday = document.querySelector('#inpBirthday');
  const inpStreet = document.querySelector('#inpStreet');
  const inpWard = document.querySelector('#inpWard');
  const inpDistrict = document.querySelector('#inpDistrict');
  const inpCity = document.querySelector('#inpCity');
  const birthdayAlertTag = document.querySelector('#birthdayAlertTag');

  if (inpName) inpName.value = user.name || '';
  if (inpEmail) inpEmail.value = user.email || '';
  if (inpPhone) inpPhone.value = user.phone || '';
  if (inpBirthday) inpBirthday.value = user.birthday || '';

  const parsedAddr = parseStructuredAddress(user.address || '');
  if (inpStreet) inpStreet.value = parsedAddr.street;
  if (inpWard) inpWard.value = parsedAddr.ward;
  if (inpDistrict) inpDistrict.value = parsedAddr.district;
  if (inpCity) inpCity.value = parsedAddr.city;

  // Kiểm tra tháng sinh nhật
  if (user.birthday && birthdayAlertTag) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const bMonth = parseInt(user.birthday.split('-')[1], 10);
    if (bMonth === currentMonth) {
      birthdayAlertTag.style.display = 'inline';
    } else {
      birthdayAlertTag.style.display = 'none';
    }
  }
};

// ================= 4. RENDER TAB 2: CẤP BẬC VIP & ƯU ĐÃI =================
const renderVipTab = () => {
  const { user, tierInfo } = state;
  if (!tierInfo || user?.role === 'admin' || user?.role === 'staff') return;
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  // 1. Cập nhật thẻ VIP Card điện tử
  const digitalVipCard = document.querySelector('#digitalVipCard');
  const vipCardNumber = document.querySelector('#vipCardNumber');
  const vipCardHolder = document.querySelector('#vipCardHolder');
  const vipCardTierTag = document.querySelector('#vipCardTierTag');

  if (digitalVipCard) {
    digitalVipCard.className = `vip-digital-card ${tierInfo?.isVip ? 'tier-vip' : (tierInfo?.isNewbie ? 'tier-newbie' : 'tier-regular')}`;
  }
  if (vipCardNumber) {
    const padId = String(user.id || '1').padStart(4, '0');
    vipCardNumber.textContent = `**** **** **** ${padId}`;
  }
  if (vipCardHolder) {
    vipCardHolder.textContent = (user.name || 'HIKARI MEMBER').toUpperCase();
  }
  if (vipCardTierTag) {
    vipCardTierTag.textContent = tierInfo?.tierName || 'THÀNH VIÊN';
  }

  // 2. Tiến trình chi tiêu trong tháng
  const vipStatusHeading = document.querySelector('#vipStatusHeading');
  const vipStatusTitle = document.querySelector('#vipStatusTitle');
  const vipStatusDesc = document.querySelector('#vipStatusDesc');
  const vipProgressPercent = document.querySelector('#vipProgressPercent');
  const vipProgressBar = document.querySelector('#vipProgressBar');
  const vipMonthSpentText = document.querySelector('#vipMonthSpentText');
  const vipMonthTargetText = document.querySelector('#vipMonthTargetText');

  let percent = 0;
  if (tierInfo?.isVip) {
    percent = Math.min(100, Math.round((tierInfo.currentMonthSpent / tierInfo.maintainThreshold) * 100));
  } else {
    percent = Math.min(100, Math.round(((tierInfo?.currentMonthSpent || 0) / (tierInfo?.upgradeThreshold || 500000)) * 100));
  }

  if (vipProgressPercent) vipProgressPercent.textContent = `${percent}%`;
  if (vipProgressBar) {
    vipProgressBar.style.width = `${percent}%`;
    vipProgressBar.className = `tier-progress-fill ${tierInfo?.tier || 'regular'}`;
  }
  if (vipMonthSpentText) vipMonthSpentText.textContent = formatPrice(tierInfo?.currentMonthSpent || 0);
  if (vipMonthTargetText) vipMonthTargetText.textContent = formatPrice(tierInfo?.isVip ? tierInfo.maintainThreshold : tierInfo.upgradeThreshold);

  if (tierInfo?.isVip) {
    if (vipStatusHeading) vipStatusHeading.textContent = `⭐ ĐẶC QUYỀN THÀNH VIÊN VIP (THÁNG ${currentMonth})`;
    if (vipStatusTitle) vipStatusTitle.textContent = `Thành Viên VIP Đẳng Cấp`;
    if (vipStatusDesc) {
      if (tierInfo.isMaintainedForNextMonth) {
        vipStatusDesc.innerHTML = `✅ <strong>Xuất sắc!</strong> Bạn đã chi tiêu <strong>${formatPrice(tierInfo.currentMonthSpent)}</strong> trong tháng này và <strong>đã gia hạn thành công hạng VIP sang tháng sau</strong>.`;
      } else {
        vipStatusDesc.innerHTML = `⏳ Bạn đã là VIP! Mua thêm <strong>${formatPrice(tierInfo.remainingToMaintain)}</strong> trong tháng ${currentMonth} để tiếp tục bảo lưu hạng VIP sang tháng tiếp theo.`;
      }
    }
  } else {
    if (vipStatusHeading) vipStatusHeading.textContent = `🎯 MỤC TIÊU THĂNG HẠNG VIP (THÁNG ${currentMonth})`;
    if (vipStatusTitle) vipStatusTitle.textContent = tierInfo?.tierName || 'Thành Viên Thân Thiết';
    if (vipStatusDesc) {
      vipStatusDesc.innerHTML = `Mua sắm thêm <strong>${formatPrice(tierInfo?.remainingToUpgrade || 0)}</strong> trong tháng ${currentMonth} để trở thành Thành Viên VIP và nhận mã giảm 15% trọn đời mỗi tháng!`;
    }
  }

  // 3. Voucher VIP
  const vipVoucherStatusBox = document.querySelector('#vipVoucherStatusBox');
  if (vipVoucherStatusBox) {
    if (tierInfo?.isVip) {
      vipVoucherStatusBox.innerHTML = `
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <span style="background: #dcfce7; color: #15803d; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 0.8rem;">✓ Sẵn Sàng Dùng</span>
          <button type="button" class="btn btn-outline" id="btnCopyVipCoupon" style="padding: 4px 10px; font-size: 0.8rem; font-weight: 700;">
            📋 Sao Chép Mã
          </button>
        </div>
      `;
      document.querySelector('#btnCopyVipCoupon')?.addEventListener('click', () => {
        navigator.clipboard.writeText('VIPMEMBER');
        showToast('✓ Đã sao chép mã VIPMEMBER vào bộ nhớ tạm!', 'success');
      });
    } else {
      vipVoucherStatusBox.innerHTML = `
        <span style="background: #f1f5f9; color: #64748b; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.8rem;">
          🔒 Cần Đạt Hạng VIP
        </span>
      `;
    }
  }
};

// ================= 5. RENDER TAB 3: LỊCH SỬ ĐƠN HÀNG =================
const ORDER_LIFECYCLE_STEPS = [
  { key: 'Chờ xác nhận', icon: '⏳', label: 'Chờ xác nhận' },
  { key: 'Đang xử lý', icon: '📦', label: 'Đang xử lý' },
  { key: 'Đang giao hàng', icon: '🚚', label: 'Đang giao hàng' },
  { key: 'Đã hoàn thành', icon: '✅', label: 'Đã hoàn thành' }
];

const getOrderStatusBadge = (status) => {
  const normalized = normalizeOrderStatus(status);
  switch (normalized) {
    case 'Chờ xác nhận':
      return '<span style="background: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 0.8rem;">⏳ Chờ xác nhận</span>';
    case 'Đang xử lý':
      return '<span style="background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 0.8rem;">📦 Đang xử lý</span>';
    case 'Đang giao hàng':
      return '<span style="background: #f3e8ff; color: #7e22ce; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 0.8rem;">🚚 Đang giao hàng</span>';
    case 'Đã hoàn thành':
      return '<span style="background: #dcfce7; color: #15803d; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 0.8rem;">✅ Đã hoàn thành</span>';
    case 'Đã hủy':
      return '<span style="background: #fee2e2; color: #b91c1c; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 0.8rem;">❌ Đã hủy</span>';
    default:
      return `<span style="background: #dcfce7; color: #15803d; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 0.8rem;">✓ ${escapeHtml(normalized || 'Đã ghi nhận')}</span>`;
  }
};

const renderOrderTimelineHtml = (currentStatus) => {
  if (currentStatus === 'Đã hủy') {
    return `
      <div style="padding: 0.55rem 0.9rem; background: #fff1f2; border-bottom: 1px solid #fecdd3; color: #b91c1c; font-size: 0.78rem; font-weight: 700; display: flex; align-items: center; gap: 0.4rem;">
        <span>❌</span>
        <span>Đơn hàng đã được hủy — Không tính vào doanh thu và điểm tích lũy VIP.</span>
      </div>
    `;
  }

  const activeIdx = ORDER_LIFECYCLE_STEPS.findIndex(step => step.key === currentStatus);
  const currentIdx = activeIdx === -1 ? 0 : activeIdx;

  return `
    <div style="padding: 0.55rem 1rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
      ${ORDER_LIFECYCLE_STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const bg = isCurrent ? '#eef2ff' : (isDone ? '#dcfce7' : '#ffffff');
        const color = isCurrent ? '#4338ca' : (isDone ? '#15803d' : '#94a3b8');
        const border = isCurrent ? '#a5b4fc' : (isDone ? '#86efac' : '#e2e8f0');
        return `
          <span style="display: inline-flex; align-items: center; gap: 0.25rem; padding: 2px 8px; border-radius: 999px; font-size: 0.74rem; font-weight: ${isCurrent ? '800' : '600'}; background: ${bg}; color: ${color}; border: 1px solid ${border};">
            <span>${step.icon}</span>
            <span>${step.label}</span>
          </span>
          ${idx < ORDER_LIFECYCLE_STEPS.length - 1 ? '<span style="color: #cbd5e1; font-size: 0.75rem;">→</span>' : ''}
        `;
      }).join('')}
    </div>
  `;
};

// ================= POPUP CHI TIẾT ĐƠN HÀNG KHÁCH HÀNG =================
const showCustomerOrderDetailModal = (order) => {
  if (!order) return;
  let modalEl = document.querySelector('#customerOrderDetailModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'customerOrderDetailModal';
    modalEl.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(15, 23, 42, 0.65); z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      padding: 1rem; backdrop-filter: blur(4px); box-sizing: border-box;
    `;
    document.body.appendChild(modalEl);
  }

  const orderCode = order.orderCode || order.id;
  const customerName = order.customer?.name || state.user?.name || 'Khách Hàng Hikari';
  const customerPhone = order.customer?.phone || state.user?.phone || 'Chưa có SĐT';
  const customerAddress = order.customer?.address || '123 Đường Sách Nguyễn Huệ, Q1, TP.HCM';
  const customerNote = order.customer?.note || order.note || '';
  const createdAt = order.createdAt || 'Mới đặt';
  const currentStatus = normalizeOrderStatus(order.status);
  const trackingCode = String(order.trackingCode || '').trim();
  const isCod = order.paymentMethod === 'cod';
  const paymentBadge = isCod
    ? '<span style="background: #f1f5f9; color: #334155; font-weight: 700; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem;">💵 Thanh toán khi nhận hàng (COD)</span>'
    : '<span style="background: #ecfdf5; color: #047857; font-weight: 700; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem;">🏦 Chuyển khoản QR (SePay / MoMo)</span>';

  const items = Array.isArray(order.items) ? order.items : [];
  const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 1), 0);
  const { subtotal, shippingFee, discount, total } = getOrderFinancialBreakdown(order);

  modalEl.innerHTML = `
    <div style="background: #fff; width: 720px; max-width: 100%; max-height: 90vh; border-radius: 14px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.25); display: flex; flex-direction: column; overflow: hidden; animation: popIn 0.2s ease-out;">
      <!-- MODAL HEADER -->
      <div style="padding: 1.1rem 1.4rem; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color: #fff; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-size: 0.78rem; color: #a5b4fc; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Chi Tiết Đơn Hàng Của Bạn</div>
          <div style="font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            <span>#${escapeHtml(orderCode)}</span>
            <span style="font-size: 0.8rem; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: rgba(255,255,255,0.2);">${escapeHtml(currentStatus)}</span>
          </div>
        </div>
        <button type="button" id="btnCloseCustomerOrderModal" style="background: none; border: none; color: #e0e7ff; font-size: 1.5rem; cursor: pointer; line-height: 1; padding: 4px 8px;" title="Đóng">✕</button>
      </div>

      <!-- MODAL BODY (SCROLLABLE) -->
      <div style="padding: 1.25rem 1.4rem; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 1rem;">
        
        <!-- TIẾN TRÌNH ĐƠN HÀNG -->
        ${renderOrderTimelineHtml(currentStatus)}

        <!-- MÃ VẬN ĐƠN (NẾU ĐANG GIAO HOẶC ĐÃ GIAO) -->
        ${trackingCode ? `
          <div style="padding: 0.65rem 0.9rem; background: #f5f3ff; border: 1px solid #d8b4fe; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; font-size: 0.82rem; color: #6b21a8;">
            <div>🚚 <strong>Mã vận đơn bưu cục:</strong> <span style="font-family: monospace; font-weight: 800; background: #fff; padding: 2px 8px; border-radius: 4px; border: 1px solid #d8b4fe; color: #581c87;">${escapeHtml(trackingCode)}</span></div>
            <button type="button" id="btnCopyModalTracking" style="background: #fff; color: #6b21a8; border: 1px solid #d8b4fe; border-radius: 5px; padding: 2px 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">📋 Sao chép mã</button>
          </div>
        ` : ''}

        <!-- THÔNG TIN NGƯỜI NHẬN & ĐỊA CHỈ -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; background: #f8fafc; padding: 0.9rem; border-radius: 10px; border: 1px solid #e2e8f0; font-size: 0.85rem;">
          <div>
            <div style="color: #64748b; font-size: 0.75rem; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">👤 Người Nhận Hàng</div>
            <div style="font-weight: 700; color: #0f172a; font-size: 0.95rem;">${escapeHtml(customerName)}</div>
            <div style="color: #4338ca; font-weight: 600;">📞 ${escapeHtml(customerPhone)}</div>
            <div style="color: #64748b; font-size: 0.78rem; margin-top: 3px;">🕒 Ngày đặt: ${escapeHtml(createdAt)}</div>
          </div>
          <div>
            <div style="color: #64748b; font-size: 0.75rem; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">📍 Địa Chỉ Giao Hàng</div>
            <div style="color: #1e293b; line-height: 1.45;">${escapeHtml(customerAddress)}</div>
            <div style="margin-top: 4px;">${paymentBadge}</div>
            ${customerNote ? `<div style="margin-top: 4px; padding: 4px 8px; background: #fffbeb; color: #b45309; border-radius: 6px; font-size: 0.78rem;">📝 <strong>Ghi chú:</strong> ${escapeHtml(customerNote)}</div>` : ''}
          </div>
        </div>

        <!-- DANH SÁCH SÁCH -->
        <div>
          <div style="font-size: 0.85rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem; display: flex; justify-content: space-between;">
            <span>📚 Danh Sách Tác Phẩm (${items.length} tác phẩm)</span>
            <span style="color: #64748b;">Tổng: <strong>${totalQty} cuốn</strong></span>
          </div>
          <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.83rem;">
              <thead style="background: #f8fafc; color: #475569; text-align: left; font-size: 0.75rem;">
                <tr>
                  <th style="padding: 8px 10px;">Sách</th>
                  <th style="padding: 8px 10px; text-align: center;">Đơn giá</th>
                  <th style="padding: 8px 10px; text-align: center;">Số lượng</th>
                  <th style="padding: 8px 10px; text-align: right;">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => `
                  <tr style="border-top: 1px solid #f1f5f9;">
                    <td style="padding: 8px 10px; display: flex; align-items: center; gap: 8px;">
                      <img src="${item.image || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=100'}" style="width: 36px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #e2e8f0;" onerror="this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=100'" />
                      <div>
                        <div style="font-weight: 700; color: #0f172a;">${escapeHtml(item.name)}</div>
                        ${item.isNew ? '<span style="font-size: 0.68rem; color: #4338ca; background: #e0e7ff; padding: 1px 4px; border-radius: 3px;">Mới ✨</span>' : ''}
                      </div>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; color: #475569;">${formatPrice(item.price)}</td>
                    <td style="padding: 8px 10px; text-align: center; font-weight: 700; color: #0f172a;">x${item.quantity}</td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #e11d48;">${formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 1))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- TỔNG KẾT TÀI CHÍNH -->
        <div style="margin-left: auto; width: 280px; max-width: 100%; font-size: 0.83rem; display: flex; flex-direction: column; gap: 4px; padding: 0.75rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="display: flex; justify-content: space-between; color: #64748b;">
            <span>Tạm tính (${totalQty} cuốn):</span>
            <strong style="color: #0f172a;">${formatPrice(subtotal)}</strong>
          </div>
          ${order.couponCode ? `
            <div style="display: flex; justify-content: space-between; color: #16a34a;">
              <span>Voucher (${escapeHtml(order.couponCode)}):</span>
              <strong>-${formatPrice(discount)}</strong>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; color: #64748b;">
            <span>Phí vận chuyển:</span>
            <strong style="color: #0f172a;">${shippingFee === 0 ? 'Miễn phí' : formatPrice(shippingFee)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 0.95rem; font-weight: 800; color: #e11d48;">
            <span>Tổng thanh toán:</span>
            <span>${formatPrice(total)}</span>
          </div>
        </div>
      </div>

      <!-- MODAL FOOTER -->
      <div style="padding: 0.9rem 1.4rem; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
        <button type="button" id="btnCustomerModalPdf" class="btn" style="padding: 0.45rem 1rem; font-size: 0.82rem; font-weight: 700; background: #e0e7ff; color: #4338ca; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
          📄 Xuất Hóa Đơn PDF
        </button>
        <button type="button" id="btnCustomerModalCloseBottom" class="btn" style="padding: 0.45rem 1.25rem; font-size: 0.85rem; font-weight: 600; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">Đóng</button>
      </div>
    </div>
  `;

  modalEl.style.display = 'flex';

  const closeModal = () => {
    modalEl.style.display = 'none';
  };

  modalEl.querySelector('#btnCloseCustomerOrderModal')?.addEventListener('click', closeModal);
  modalEl.querySelector('#btnCustomerModalCloseBottom')?.addEventListener('click', closeModal);
  modalEl.querySelector('#btnCopyModalTracking')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(trackingCode);
    showToast(`Đã sao chép mã vận đơn: ${trackingCode}`, 'info');
  });
  modalEl.querySelector('#btnCustomerModalPdf')?.addEventListener('click', () => {
    exportProfileInvoicePdf(order, modalEl.querySelector('#btnCustomerModalPdf'));
  });
  modalEl.onclick = (e) => {
    if (e.target === modalEl) closeModal();
  };
};

const renderOrdersTab = () => {
  const { orders } = state;
  const container = document.querySelector('#ordersListContainer');
  const ordersTotalSummary = document.querySelector('#ordersTotalSummary');

  // SẮP XẾP ĐƠN MỚI NHẤT LÊN ĐẦU
  const sortedOrders = [...orders].sort((a, b) => {
    const idA = Number(a.id) || 0;
    const idB = Number(b.id) || 0;
    if (idB !== idA) return idB - idA;
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  if (ordersTotalSummary) ordersTotalSummary.textContent = `${sortedOrders.length} đơn hàng`;
  if (!container) return;

  if (sortedOrders.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3.5rem 1rem; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">
        <div style="font-size: 3rem; margin-bottom: 0.75rem;">📦</div>
        <h3 style="font-size: 1.15rem; color: #0f172a; margin-bottom: 0.35rem;">Bạn chưa có đơn hàng nào</h3>
        <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 1.25rem;">Hãy khám phá kho truyện tranh và light novel đặc sắc của Hikari BookStore ngay hôm nay!</p>
        <a href="products.html" class="btn btn-primary" style="padding: 0.65rem 1.5rem; font-weight: 700;">
          📚 Khám Phá Sách Ngay
        </a>
      </div>
    `;
    return;
  }

  container.innerHTML = sortedOrders.map(order => {
    const items = order.items || [];
    const orderCode = order.orderCode || order.id;
    const createdAt = order.createdAt || 'Mới đặt';
    const { subtotal, shippingFee, discount, total } = getOrderFinancialBreakdown(order);
    const isCodOrder = order.paymentMethod === 'cod';
    const paymentMethodText = isCodOrder
      ? 'Thanh toán khi nhận hàng (COD)'
      : 'Chuyển khoản Ngân hàng / Ví MoMo (QR)';
    const currentStatus = normalizeOrderStatus(order.status);
    const trackingCode = String(order.trackingCode || '').trim();
    const canConfirmReceived = currentStatus === 'Đang giao hàng';
    const canCancelCod = isCodOrder && (currentStatus === 'Chờ xác nhận' || currentStatus === 'Đang xử lý');

    let policyNoticeHtml = '';
    if (!isOrderCancelled(order)) {
      if (!isCodOrder) {
        policyNoticeHtml = `
          <div style="margin-top: 0.5rem; padding: 0.45rem 0.75rem; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; font-size: 0.76rem; color: #9a3412;">
            🔒 <strong>Chính sách thanh toán chuyển khoản:</strong> Đơn đã thanh toán online không hỗ trợ hủy hoặc trả hàng. Hỗ trợ đổi cuốn lỗi in ấn qua Hotline <strong>1900 6868</strong>.
          </div>
        `;
      } else if (currentStatus === 'Đang giao hàng') {
        policyNoticeHtml = `
          <div style="margin-top: 0.5rem; padding: 0.45rem 0.75rem; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 6px; font-size: 0.76rem; color: #5b21b6;">
            🚚 Đơn COD đang trên đường giao đến bạn nên không thể hủy trực tuyến. Khi nhận được kiện hàng, vui lòng bấm <strong>"Đã nhận được hàng"</strong>.
          </div>
        `;
      } else if (canCancelCod) {
        policyNoticeHtml = `
          <div style="margin-top: 0.5rem; padding: 0.45rem 0.75rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 0.76rem; color: #166534;">
            💡 Đơn COD có thể hủy trước khi cửa hàng bàn giao cho đơn vị vận chuyển.
          </div>
        `;
      }
    }

    const trackingBannerHtml = trackingCode ? `
      <div style="padding: 0.55rem 1rem; background: #f5f3ff; border-bottom: 1px solid #e9d5ff; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; font-size: 0.82rem; color: #6b21a8;">
        <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
          <span>🚚 Mã vận đơn giao hàng:</span>
          <strong style="font-family: monospace; background: #ffffff; color: #581c87; padding: 2px 8px; border-radius: 5px; border: 1px solid #d8b4fe; letter-spacing: 0.03em;">${escapeHtml(trackingCode)}</strong>
        </div>
        <button type="button" class="btn-copy-tracking" data-tracking="${escapeHtml(trackingCode)}" style="background: #ffffff; color: #6b21a8; border: 1px solid #d8b4fe; border-radius: 5px; padding: 2px 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
          📋 Sao chép mã
        </button>
      </div>
    ` : '';

    return `
      <div class="order-card-item">
        <!-- HEADER ĐƠN HÀNG -->
        <div class="order-card-header">
          <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
            <button type="button" class="btn-customer-order-detail" data-order-id="${order.id}" style="background: none; border: none; cursor: pointer; color: #4338ca; font-weight: 800; font-size: 0.95rem; text-decoration: underline; padding: 0; display: inline-flex; align-items: center; gap: 4px;" title="Bấm để xem chi tiết đầy đủ đơn hàng">
              <span>Mã Đơn: #${escapeHtml(orderCode)}</span>
              <span style="font-size: 0.72rem; color: #4338ca; font-weight: 700; text-decoration: none; background: #e0e7ff; padding: 1px 7px; border-radius: 4px;">🔍 Chi tiết</span>
            </button>
            <span style="color: #64748b; font-size: 0.85rem;">• ${escapeHtml(createdAt)}</span>
            <span style="background: ${isCodOrder ? '#f1f5f9' : '#ecfdf5'}; color: ${isCodOrder ? '#334155' : '#047857'}; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">
              ${isCodOrder ? '💵 COD' : '🏦 CK / MoMo'}
            </span>
            ${order.couponCode ? `<span class="coupon-tag" style="font-size: 0.75rem;">Mã: ${escapeHtml(order.couponCode)}</span>` : ''}
          </div>
          ${getOrderStatusBadge(currentStatus)}
        </div>

        ${renderOrderTimelineHtml(currentStatus)}
        ${trackingBannerHtml}

        <!-- DANH SÁCH SÁCH TRONG ĐƠN -->
        <div class="order-card-body">
          ${items.map(item => `
            <div class="order-prod-row">
              <img 
                src="${item.image || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200&auto=format&fit=crop&q=80'}" 
                alt="${escapeHtml(item.name)}" 
                class="order-prod-thumb"
                onerror="this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200&auto=format&fit=crop&q=80'"
              />
              <div style="flex: 1;">
                <h4 style="font-size: 0.92rem; font-weight: 700; color: #0f172a; margin: 0 0 0.25rem 0;">
                  ${escapeHtml(item.name)}
                </h4>
                <div style="font-size: 0.8rem; color: #64748b;">
                  Số lượng: <strong>x${item.quantity}</strong> • Đơn giá: ${formatPrice(item.price)}
                </div>
              </div>
              <div style="font-weight: 800; color: #0f172a; font-size: 0.95rem;">
                ${formatPrice((item.price || 0) * (item.quantity || 1))}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- FOOTER ĐƠN HÀNG & HÀNH ĐỘNG KHÁCH HÀNG -->
        <div class="order-card-footer" style="flex-direction: column; align-items: stretch; gap: 0.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div style="font-size: 0.82rem; color: #64748b; display: flex; flex-wrap: wrap; gap: 0.35rem 0.75rem;">
              <span>Thanh toán: <strong>${paymentMethodText}</strong></span>
              <span>• Tạm tính: <strong>${formatPrice(subtotal)}</strong></span>
              <span>• Phí vận chuyển: <strong style="color: ${shippingFee === 0 ? '#16a34a' : '#0f172a'};">${shippingFee === 0 ? 'Miễn phí' : formatPrice(shippingFee)}</strong></span>
              ${discount > 0 ? `<span>• Giảm giá: <strong style="color: #e11d48;">-${formatPrice(discount)}</strong></span>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
              <div style="font-size: 1rem; font-weight: 800; color: #e11d48;">
                Tổng: ${formatPrice(total)}
              </div>
              ${canConfirmReceived ? `
                <button type="button" class="btn btn-primary btn-confirm-received" data-order-id="${order.id}" style="padding: 0.45rem 0.9rem; font-size: 0.82rem; font-weight: 800; background: #16a34a; border-color: #16a34a;">
                  ✅ Đã nhận được hàng
                </button>
              ` : ''}
              ${canCancelCod ? `
                <button type="button" class="btn btn-outline btn-cancel-cod-order" data-order-id="${order.id}" style="padding: 0.45rem 0.85rem; font-size: 0.82rem; font-weight: 700; color: #dc2626; border-color: #fca5a5; background: #fff1f2;">
                  ❌ Hủy đơn hàng
                </button>
              ` : ''}
              <button type="button" class="btn btn-outline btn-export-order-pdf" data-order-id="${order.id}" style="padding: 0.45rem 0.85rem; font-size: 0.82rem; font-weight: 700;">
                📄 Tải Hóa Đơn PDF
              </button>
            </div>
          </div>
          ${policyNoticeHtml}
        </div>
      </div>
    `;
  }).join('');

  // Sao chép mã vận đơn
  container.querySelectorAll('.btn-copy-tracking').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.tracking;
      if (!code) return;
      try {
        await navigator.clipboard?.writeText(code);
        showToast(`✓ Đã sao chép mã vận đơn ${code}`, 'success');
      } catch (e) {
        showToast(`Mã vận đơn của bạn: ${code}`, 'info');
      }
    });
  });

  // Khách xác nhận đã nhận hàng (Đang giao hàng -> Đã hoàn thành)
  container.querySelectorAll('.btn-confirm-received').forEach(btn => {
    btn.addEventListener('click', async () => {
      const order = sortedOrders.find(o => String(o.id) === String(btn.dataset.orderId));
      if (!order) return;

      const orderCode = order.orderCode || order.id;
      if (!window.confirm(`Xác nhận bạn đã nhận đầy đủ đơn hàng #${orderCode}?\nĐơn hàng sẽ chuyển sang trạng thái "Đã hoàn thành".`)) {
        return;
      }

      btn.disabled = true;
      btn.textContent = '⏳ Đang xác nhận...';
      try {
        await updateOrder(order.id, {
          status: 'Đã hoàn thành',
          completedAt: new Date().toISOString()
        });
        pushOrderNotification(
          order,
          `Khách hàng đã xác nhận nhận đơn hàng #${orderCode} — Hoàn thành!`,
          'Đã hoàn thành'
        );
        await refreshProfileOrders(false);
        showToast(`🎉 Cảm ơn bạn! Đơn #${orderCode} đã chuyển sang "Đã hoàn thành".`, 'success');
      } catch (err) {
        console.error('Lỗi xác nhận nhận hàng:', err);
        btn.disabled = false;
        btn.textContent = '✅ Đã nhận được hàng';
        showToast('Không thể cập nhật trạng thái đơn hàng. Vui lòng thử lại!', 'error');
      }
    });
  });

  // Khách hủy đơn COD trước khi giao hàng (Chờ xác nhận / Đang xử lý -> Đã hủy)
  container.querySelectorAll('.btn-cancel-cod-order').forEach(btn => {
    btn.addEventListener('click', async () => {
      const order = sortedOrders.find(o => String(o.id) === String(btn.dataset.orderId));
      if (!order) return;

      const currentStatus = normalizeOrderStatus(order.status);
      if (order.paymentMethod !== 'cod' || (currentStatus !== 'Chờ xác nhận' && currentStatus !== 'Đang xử lý')) {
        showToast('Đơn hàng này không còn điều kiện hủy trực tuyến!', 'error');
        await refreshProfileOrders(false);
        return;
      }

      const orderCode = order.orderCode || order.id;
      if (!window.confirm(`Bạn có chắc muốn hủy đơn hàng COD #${orderCode}?\nSố lượng sách sẽ được hoàn lại kho và đơn không tính vào chi tiêu VIP.`)) {
        return;
      }

      btn.disabled = true;
      btn.textContent = '⏳ Đang hủy...';
      try {
        await updateOrder(order.id, {
          status: 'Đã hủy',
          cancelledAt: new Date().toISOString(),
          cancelReason: 'Khách hàng hủy đơn COD trước khi giao hàng'
        });
        await restoreOrderStock(order.items || []);
        pushOrderNotification(
          order,
          `Đơn hàng COD #${orderCode} đã được khách hàng hủy và hoàn tồn kho.`,
          'Đã hủy'
        );
        await refreshProfileOrders(false);
        showToast(`✓ Đã hủy đơn hàng #${orderCode} và hoàn tồn kho sách!`, 'success');
      } catch (err) {
        console.error('Lỗi hủy đơn COD:', err);
        btn.disabled = false;
        btn.textContent = '❌ Hủy đơn hàng';
        showToast('Không thể hủy đơn hàng lúc này. Vui lòng thử lại!', 'error');
      }
    });
  });

  // Gắn sự kiện bấm vào mã đơn xem chi tiết đơn hàng (Modal)
  container.querySelectorAll('.btn-customer-order-detail').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = btn.dataset.orderId;
      const order = sortedOrders.find(o => String(o.id) === String(orderId));
      if (order) showCustomerOrderDetailModal(order);
    });
  });

  // Gắn sự kiện xuất hóa đơn PDF cho từng đơn hàng
  container.querySelectorAll('.btn-export-order-pdf').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = btn.dataset.orderId;
      const order = sortedOrders.find(o => String(o.id) === String(orderId));
      if (order) exportProfileInvoicePdf(order, btn);
    });
  });
};

// ================= 6. RENDER TAB 4: TÁC PHẨM YÊU THÍCH =================
const renderWishlistTab = () => {
  const container = document.querySelector('#wishlistGridContainer');
  const summaryEl = document.querySelector('#wishlistTotalSummary');
  const sidebarBadge = document.querySelector('#sidebarWishlistCount');

  const wishlistIds = JSON.parse(localStorage.getItem('hikari_wishlist')) || [];
  if (sidebarBadge) sidebarBadge.textContent = wishlistIds.length;
  if (summaryEl) summaryEl.textContent = `${wishlistIds.length} tác phẩm`;
  if (!container) return;

  if (wishlistIds.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1rem; background: #fff1f2; border-radius: 12px; border: 1px dashed #f43f5e;">
        <div style="font-size: 3rem; margin-bottom: 0.75rem;">💔</div>
        <h3 style="font-size: 1.15rem; color: #0f172a; margin-bottom: 0.35rem;">Danh sách yêu thích đang trống</h3>
        <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 1.25rem;">Bạn chưa thả tim cuốn truyện nào. Hãy khám phá và lưu lại những tác phẩm yêu thích nhé!</p>
        <a href="products.html" class="btn btn-primary" style="padding: 0.65rem 1.5rem; font-weight: 700;">
          📚 Khám Phá Kệ Sách
        </a>
      </div>
    `;
    return;
  }

  const favoriteProducts = (state.allProducts || []).filter(p => wishlistIds.includes(Number(p.id)) || wishlistIds.includes(String(p.id)));

  if (favoriteProducts.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #64748b;">
        Đang tải danh sách tác phẩm yêu thích...
      </div>
    `;
    return;
  }

  container.innerHTML = favoriteProducts.map(prod => `
    <div class="wishlist-book-card" style="width: 100%; max-width: 185px; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.05); transition: transform 0.2s, box-shadow 0.2s;">
      <div style="position: relative; width: 100%; height: 210px; background: #f8fafc; overflow: hidden;">
        <a href="product-detail.html?id=${prod.id}" style="display: block; width: 100%; height: 100%;">
          <img src="${prod.image}" alt="${prod.name}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=300&auto=format&fit=crop&q=80'" />
        </a>
        <button class="btn-remove-wishlist" data-id="${prod.id}" title="Bỏ khỏi yêu thích" style="position: absolute; top: 6px; right: 6px; background: rgba(255,255,255,0.95); border: none; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #e11d48; font-size: 0.85rem; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
          ❤️
        </button>
      </div>
      <div style="padding: 0.65rem; display: flex; flex-direction: column; flex: 1; justify-content: space-between;">
        <div>
          <span style="font-size: 0.7rem; color: #64748b; font-weight: 600; display: block; margin-bottom: 2px;">${prod.categoryName || 'Manga'}</span>
          <h4 style="font-size: 0.82rem; font-weight: 700; color: #0f172a; margin: 0 0 0.3rem 0; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2.2rem;" title="${prod.name}">
            <a href="product-detail.html?id=${prod.id}" style="text-decoration: none; color: inherit;">${prod.name}</a>
          </h4>
          <div style="font-size: 0.72rem; color: #64748b; margin-bottom: 0.35rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Tác giả: <strong>${prod.author || 'Chưa rõ'}</strong></div>
        </div>
        <div>
          <div style="font-size: 0.92rem; font-weight: 800; color: #e11d48; margin-bottom: 0.5rem;">
            ${formatPrice(prod.price)}
          </div>
          <div style="display: flex; gap: 0.35rem;">
            <a href="product-detail.html?id=${prod.id}" class="btn btn-outline" style="flex: 1; text-align: center; padding: 0.35rem 0.2rem; font-size: 0.72rem; font-weight: 700; text-decoration: none; border-radius: 6px;">
              Xem
            </a>
            <button class="btn btn-primary btn-wishlist-buy" data-id="${prod.id}" style="padding: 0.35rem 0.6rem; font-size: 0.75rem; font-weight: 700; border-radius: 6px;" title="Thêm vào giỏ hàng">
              🛒
            </button>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  // Gắn sự kiện bỏ yêu thích
  container.querySelectorAll('.btn-remove-wishlist').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      let currentWishlist = JSON.parse(localStorage.getItem('hikari_wishlist')) || [];
      currentWishlist = currentWishlist.filter(item => String(item) !== String(id));
      localStorage.setItem('hikari_wishlist', JSON.stringify(currentWishlist));
      if (state.user && state.user.id) {
        localStorage.setItem(`hikari_wishlist_${state.user.id}`, JSON.stringify(currentWishlist));
        api.patch(`/users/${state.user.id}`, { wishlist: currentWishlist }).catch(() => {});
      }
      showToast('Đã xóa tác phẩm khỏi danh sách yêu thích!', 'info');
      renderWishlistTab();
      // Kích hoạt cập nhật badge ở header
      updateWishlistHeaderBadge();
    });
  });

  // Gắn sự kiện mua nhanh từ Wishlist (liên kết đồng bộ với Giỏ hàng & CSDL /carts)
  container.querySelectorAll('.btn-wishlist-buy').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const targetProd = (state.allProducts || []).find(p => String(p.id) === String(id));
      if (!targetProd) return;

      btn.disabled = true;
      btn.style.opacity = '0.6';
      try {
        await addToCart(targetProd, 1);
      } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });
  });
};

// ================= 7. HÀM HỖ TRỢ & XUẤT HÓA ĐƠN PDF TỪ TRANG PROFILE =================
const getOrderFinancialBreakdown = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  const itemsSum = items.reduce(
    (sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 1)),
    0
  );
  const subtotal = Number(order?.subtotal ?? itemsSum) || 0;
  const discount = Number(order?.discount) || 0;
  const total = Number(order?.total) || 0;

  let shippingFee = 0;
  if (order?.shippingFee !== undefined && order?.shippingFee !== null) {
    shippingFee = Number(order.shippingFee) || 0;
  } else {
    const inferred = total + discount - subtotal;
    shippingFee = inferred >= 0 ? inferred : (subtotal > 0 && subtotal < 250000 ? 30000 : 0);
  }

  return { subtotal, shippingFee, discount, total };
};

const exportProfileInvoicePdf = async (order, btnEl) => {
  if (!order) return;
  const originalText = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = `⏳ Đang tạo PDF...`;

  const printContainer = document.querySelector('#profileInvoicePrintContainer');
  if (!printContainer) return;

  const orderCode = order.orderCode || order.id;
  const customerName = order.customer?.name || state.user?.name || 'Khách Hàng Hikari';
  const customerPhone = order.customer?.phone || state.user?.phone || 'Chưa có SĐT';
  const customerAddress = order.customer?.address || '123 Đường Sách Nguyễn Huệ, Q1, TP.HCM';
  const createdAt = order.createdAt || new Date().toLocaleString('vi-VN');
  const currentStatus = normalizeOrderStatus(order.status);
  const trackingCode = order.trackingCode || '';
  const items = order.items || [];
  const { subtotal, shippingFee, discount, total } = getOrderFinancialBreakdown(order);
  const paymentText = order.paymentMethod === 'cod'
    ? 'COD (Tiền mặt)'
    : 'Chuyển khoản / MoMo (QR)';

  printContainer.innerHTML = `
    <div style="width: 680px; max-width: 100%; box-sizing: border-box; padding: 20px 24px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; background: #ffffff; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 2px solid #e11d48; padding-bottom: 14px;">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 21px; font-weight: 900; color: #e11d48; letter-spacing: -0.5px;">HIKARI BOOKSTORE</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Nhà Sách Manga, Light Novel &amp; Tiểu Thuyết Bản Quyền</div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 4px;">📍 123 Đường Sách Nguyễn Huệ, Quận 1, TP.HCM | 📞 Hotline: 1900 6868</div>
        </div>
        <div style="text-align: right; flex-shrink: 0;">
          <div style="font-size: 16px; font-weight: 800; color: #1e1b4b;">HÓA ĐƠN BÁN HÀNG</div>
          <div style="font-size: 12px; font-weight: 700; color: #e11d48; margin-top: 2px;">#${orderCode}</div>
          <div style="font-size: 10.5px; color: #64748b; margin-top: 2px;">Ngày đặt: ${createdAt}</div>
        </div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin: 14px 0; font-size: 11.5px; line-height: 1.6;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div style="min-width: 0; word-break: break-word;">
            <span style="color: #64748b;">Họ tên khách hàng:</span> <strong style="color: #0f172a;">${customerName}</strong><br>
            <span style="color: #64748b;">Số điện thoại:</span> <strong style="color: #0f172a;">${customerPhone}</strong><br>
            <span style="color: #64748b;">Trạng thái:</span> <strong style="color: #0f172a;">${currentStatus}</strong>
          </div>
          <div style="min-width: 0; word-break: break-word;">
            <span style="color: #64748b;">Địa chỉ giao hàng:</span> <span style="color: #0f172a;">${customerAddress}</span><br>
            <span style="color: #64748b;">Hình thức:</span> <strong style="color: #0f172a;">${paymentText}</strong>
            ${trackingCode ? `<br><span style="color: #64748b;">Mã vận đơn:</span> <strong style="color: #4338ca;">${trackingCode}</strong>` : ''}
          </div>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; margin: 12px 0; table-layout: fixed;">
        <thead>
          <tr style="background: #1e1b4b; color: #ffffff;">
            <th style="padding: 7px 8px; text-align: center; width: 40px;">STT</th>
            <th style="padding: 7px 8px; text-align: left;">Tên Sách / Tác Phẩm</th>
            <th style="padding: 7px 8px; text-align: center; width: 52px;">SL</th>
            <th style="padding: 7px 8px; text-align: right; width: 90px;">Đơn Giá</th>
            <th style="padding: 7px 8px; text-align: right; width: 102px;">Thành Tiền</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it, idx) => `
            <tr style="border-bottom: 1px solid #f1f5f9; page-break-inside: avoid; break-inside: avoid;">
              <td style="padding: 7px 8px; text-align: center;">${idx + 1}</td>
              <td style="padding: 7px 8px; word-break: break-word;"><strong>${it.name}</strong></td>
              <td style="padding: 7px 8px; text-align: center;">${it.quantity}</td>
              <td style="padding: 7px 8px; text-align: right;">${formatPrice(it.price)}</td>
              <td style="padding: 7px 8px; text-align: right; font-weight: 700;">${formatPrice((it.price || 0) * (it.quantity || 1))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="display: flex; justify-content: flex-end; margin-top: 10px; page-break-inside: avoid; break-inside: avoid;">
        <div style="width: 280px; font-size: 12px; line-height: 1.75;">
          <div style="display: flex; justify-content: space-between; color: #334155;">
            <span>Tạm tính:</span>
            <strong>${formatPrice(subtotal)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; color: #334155;">
            <span>Phí vận chuyển:</span>
            <span>${shippingFee === 0 ? '<span style="color: #16a34a; font-weight: 700;">Miễn phí (0 ₫)</span>' : `<strong>${formatPrice(shippingFee)}</strong>`}</span>
          </div>
          ${discount > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #e11d48;">
              <span>Giảm giá${order.couponCode ? ` (${order.couponCode})` : ''}:</span>
              <strong>-${formatPrice(discount)}</strong>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 6px; font-size: 14px; font-weight: 900; color: #e11d48;">
            <span>TỔNG THANH TOÁN:</span>
            <span>${formatPrice(total)}</span>
          </div>
        </div>
      </div>

      <div style="text-align: center; border-top: 1px dashed #cbd5e1; margin-top: 18px; padding-top: 8px; font-size: 10.5px; color: #94a3b8; page-break-inside: avoid; break-inside: avoid;">
        Cảm ơn quý khách đã mua sắm tại Hikari BookStore! Hóa đơn này là chứng từ bảo hành đổi trả trong 7 ngày.
      </div>
    </div>
  `;

  // Cuộn lên đầu & bật hiển thị phần tử hóa đơn chuẩn khổ A4
  window.scrollTo({ top: 0, behavior: 'instant' });
  printContainer.style.display = 'block';
  const invoiceEl = printContainer.firstElementChild || printContainer;

  try {
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `HoaDon_${orderCode}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0, scrollX: 0, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    if (window.html2pdf) {
      await window.html2pdf().set(opt).from(invoiceEl).toPdf().get('pdf').save();
      showToast('✓ Xuất file hóa đơn PDF thành công!', 'success');
    } else {
      window.print();
    }
  } catch (err) {
    console.error('Lỗi xuất PDF:', err);
    window.print();
  } finally {
    printContainer.style.display = 'none';
    btnEl.disabled = false;
    btnEl.innerHTML = originalText;
  }
};

// ================= 7. GẮN SỰ KIỆN SUBMIT FORM =================
const setProfileFieldError = (inputEl, errEl, message = '') => {
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

const setupProfileForms = () => {
  // Form cập nhật thông tin cá nhân
  const formUpdateProfile = document.querySelector('#formUpdateProfile');
  if (formUpdateProfile) {
    const inpName = document.querySelector('#inpName');
    const inpPhone = document.querySelector('#inpPhone');
    const inpStreet = document.querySelector('#inpStreet');
    const inpWard = document.querySelector('#inpWard');
    const inpDistrict = document.querySelector('#inpDistrict');
    const inpCity = document.querySelector('#inpCity');

    const inpPhoneError = document.querySelector('#inpPhoneError');
    const inpStreetError = document.querySelector('#inpStreetError');
    const inpWardError = document.querySelector('#inpWardError');
    const inpDistrictError = document.querySelector('#inpDistrictError');
    const inpCityError = document.querySelector('#inpCityError');

    attachVnPhoneInputGuard(inpPhone);

    [
      [inpPhone, inpPhoneError],
      [inpStreet, inpStreetError],
      [inpWard, inpWardError],
      [inpDistrict, inpDistrictError],
      [inpCity, inpCityError]
    ].forEach(([inp, errEl]) => {
      inp?.addEventListener('input', () => setProfileFieldError(inp, errEl, ''));
    });

    formUpdateProfile.addEventListener('submit', async (e) => {
      e.preventDefault();

      const newName = inpName?.value.trim() || '';
      const rawPhone = inpPhone?.value.trim() || '';
      const newBirthday = document.querySelector('#inpBirthday')?.value;

      if (!newName || newName.length < 2) {
        showToast('Vui lòng nhập đầy đủ họ và tên (tối thiểu 2 ký tự)!', 'error');
        inpName?.focus();
        return;
      }

      const phoneCheck = validateVnPhone(rawPhone);
      setProfileFieldError(inpPhone, inpPhoneError, phoneCheck.valid ? '' : phoneCheck.message);

      const addrCheck = validateStructuredAddress({
        street: inpStreet?.value,
        ward: inpWard?.value,
        district: inpDistrict?.value,
        city: inpCity?.value
      });

      const addressEntries = [
        [inpStreet, inpStreetError, addrCheck.errors.street],
        [inpWard, inpWardError, addrCheck.errors.ward],
        [inpDistrict, inpDistrictError, addrCheck.errors.district],
        [inpCity, inpCityError, addrCheck.errors.city]
      ];

      let firstInvalidEl = phoneCheck.valid ? null : inpPhone;
      addressEntries.forEach(([inp, errEl, msg]) => {
        setProfileFieldError(inp, errEl, msg);
        if (msg && !firstInvalidEl) firstInvalidEl = inp;
      });

      if (!phoneCheck.valid || !addrCheck.valid) {
        firstInvalidEl?.focus();
        showToast('Vui lòng nhập đúng SĐT (10 số) và đầy đủ Số nhà/đường, Phường/Xã, Quận/Huyện, Tỉnh/Thành phố!', 'error');
        return;
      }

      const newPhone = phoneCheck.normalized;
      const newAddress = addrCheck.formattedAddress;
      if (inpPhone) inpPhone.value = newPhone;

      const btnSave = document.querySelector('#btnSaveProfile');
      if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = '⏳ Đang lưu...';
      }

      state.user.name = newName;
      state.user.phone = newPhone;
      state.user.birthday = newBirthday;
      state.user.address = newAddress;

      localStorage.setItem('user', JSON.stringify(state.user));
      localStorage.setItem('currentUser', JSON.stringify(state.user));

      try {
        await api.patch(`/users/${state.user.id}`, {
          name: state.user.name,
          phone: newPhone,
          birthday: newBirthday,
          address: newAddress
        });
      } catch (err) {
        console.warn('Lỗi đồng bộ API users:', err);
      }

      showToast('✓ Cập nhật thông tin tài khoản thành công!', 'success');
      renderSidebar();
      renderInfoTab();
      renderVipTab();

      if (btnSave) {
        btnSave.disabled = false;
        btnSave.textContent = '💾 Lưu Cập Nhật Thông Tin';
      }
    });
  }

  // Form đổi mật khẩu (Áp dụng Password Complexity Policy)
  const formChangePassword = document.querySelector('#formChangePassword');
  if (formChangePassword) {
    const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_#^])[A-Za-z\d@$!%*?&_#^]{8,}$/;

    formChangePassword.addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldPass = document.querySelector('#inpOldPass')?.value.trim();
      const newPass = document.querySelector('#inpNewPass')?.value.trim();
      const confirmPass = document.querySelector('#inpConfirmPass')?.value.trim();

      if (!oldPass || !newPass || !confirmPass) {
        showToast('Vui lòng điền đầy đủ các trường mật khẩu!', 'error');
        return;
      }

      // Xác minh mật khẩu hiện tại
      let actualCurrentPassword = state.user?.password;
      if (!actualCurrentPassword) {
        try {
          const res = await api.get(`/users/${state.user.id}`);
          actualCurrentPassword = res.data?.password;
        } catch (fetchErr) {
          const regUsers = JSON.parse(localStorage.getItem('registered_users')) || [];
          const found = regUsers.find(u => String(u.id) === String(state.user.id));
          actualCurrentPassword = found?.password;
        }
      }

      if (actualCurrentPassword && actualCurrentPassword !== oldPass) {
        showToast('Mật khẩu hiện tại không chính xác!', 'error');
        return;
      }

      if (oldPass === newPass) {
        showToast('Mật khẩu mới không được trùng với mật khẩu cũ!', 'error');
        return;
      }

      if (!PASSWORD_COMPLEXITY_REGEX.test(newPass)) {
        showToast('Mật khẩu mới phải từ 8 ký tự trở lên, gồm cả chữ hoa, chữ thường, số và ký tự đặc biệt (VD: Hikari@2026)!', 'error');
        return;
      }

      if (newPass !== confirmPass) {
        showToast('Xác nhận mật khẩu mới không trùng khớp!', 'error');
        return;
      }

      // Cập nhật state & localStorage
      state.user.password = newPass;
      localStorage.setItem('user', JSON.stringify(state.user));

      const localUsers = JSON.parse(localStorage.getItem('registered_users')) || [];
      const userIdx = localUsers.findIndex(u => String(u.id) === String(state.user.id));
      if (userIdx !== -1) {
        localUsers[userIdx].password = newPass;
        localStorage.setItem('registered_users', JSON.stringify(localUsers));
      }

      // Đồng bộ về JSON-Server
      try {
        await api.patch(`/users/${state.user.id}`, { password: newPass });
      } catch (err) {
        console.warn('Lỗi cập nhật mật khẩu server:', err);
      }

      showToast('✓ Đổi mật khẩu thành công! Vui lòng ghi nhớ mật khẩu mới.', 'success');
      formChangePassword.reset();
    });
  }
};

// ================= 8. ĐIỀU HƯỚNG TAB TRÊN SIDEBAR =================
const setupTabNavigation = () => {
  const navBtns = document.querySelectorAll('.profile-nav-item');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });
};

const switchTab = (tabName) => {
  const isInternalRole = state.user?.role === 'admin' || state.user?.role === 'staff';
  if (isInternalRole && tabName === 'vip') {
    tabName = 'info';
  }
  const navBtns = document.querySelectorAll('.profile-nav-item');
  const tabPanes = document.querySelectorAll('.profile-tab-section');

  navBtns.forEach(b => {
    if (b.dataset.tab === tabName) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  tabPanes.forEach(p => {
    if (p.id === `tabPane_${tabName}`) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  window.history.replaceState(null, '', `#${tabName}`);

  if (tabName === 'orders' && state.user) {
    refreshProfileOrders(false);
  }
};

// Setup Category Dropdown trong header
const setupDropdownMenu = () => {
  const catBtn = document.querySelector('#catDropdownBtn');
  const catWrapper = document.querySelector('#catDropdownWrapper');
  if (catBtn && catWrapper) {
    catBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      catWrapper.classList.toggle('active');
    });
    document.addEventListener('click', (e) => {
      if (!catWrapper.contains(e.target)) {
        catWrapper.classList.remove('active');
      }
    });
  }
};


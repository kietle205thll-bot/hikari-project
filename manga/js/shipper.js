/**
 * shipper.js - Hệ thống điều phối & Giao hàng SPX Express (Shopee Xpress Partner)
 * Xử lý nghiệp vụ phân biệt Đơn COD (Thu tiền mặt) vs Đơn Thanh Toán Trước (0đ)
 * Tự động gửi Email hoàn tất đơn + Hóa đơn VAT Điện Tử PDF vào Hòm thư ảo của khách
 */
import { api, fetchOrders, updateOrder, normalizeOrderStatus } from './api.js';
import { formatPrice, showToast } from './utils.js';
import { sendOrderCompletedEmail } from './mailbox.js';

const state = {
  currentUser: null,
  allOrders: [],
  activeTab: 'delivering', // 'delivering' | 'pending' | 'completed'
  selectedOrderForConfirm: null
};

/**
 * Kiểm tra quyền truy cập của Shipper
 */
const checkShipperAuth = () => {
  try {
    const userRaw = localStorage.getItem('user') || localStorage.getItem('currentUser');
    if (!userRaw) {
      window.location.href = 'login.html?redirect=shipper.html';
      return false;
    }
    const user = JSON.parse(userRaw);
    if (user.role !== 'shipper' && user.role !== 'admin') {
      showToast('Tài khoản của bạn không có quyền truy cập cổng giao hàng SPX!', 'error');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1500);
      return false;
    }
    state.currentUser = user;

    const nameDisplay = document.querySelector('#shipperNameDisplay');
    if (nameDisplay) {
      nameDisplay.textContent = `${user.name || 'Nguyễn Văn Giao'} (SPX-SG-88)`;
    }
    return true;
  } catch (e) {
    window.location.href = 'login.html?redirect=shipper.html';
    return false;
  }
};

/**
 * Tải danh sách đơn hàng từ CSDL Server
 */
const loadOrders = async () => {
  try {
    const orders = await fetchOrders();
    state.allOrders = orders || [];
    updateMetrics();
    renderTabBadges();
    renderOrders();
  } catch (error) {
    console.error('Lỗi tải đơn hàng SPX:', error);
    const container = document.querySelector('#spxOrdersContainer');
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #ef4444;">
          ⚠️ Không thể kết nối máy chủ để lấy danh sách đơn SPX. Đang thử lại...
        </div>
      `;
    }
  }
};

/**
 * Cập nhật số liệu thống kê trên Dashboard
 */
const updateMetrics = () => {
  const deliveringOrders = state.allOrders.filter(o => normalizeOrderStatus(o.status) === 'Đang giao hàng');
  const completedOrders = state.allOrders.filter(o => normalizeOrderStatus(o.status) === 'Đã hoàn thành');

  // Đếm đơn giao
  const metricDeliveringCount = document.querySelector('#metricDeliveringCount');
  if (metricDeliveringCount) {
    metricDeliveringCount.textContent = deliveringOrders.length;
  }

  // Tổng tiền mặt COD cần thu
  const codOrders = deliveringOrders.filter(o => o.paymentMethod === 'cod');
  const codTotal = codOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const metricCodTotal = document.querySelector('#metricCodTotal');
  if (metricCodTotal) {
    metricCodTotal.textContent = formatPrice(codTotal);
  }

  // Đơn đã thanh toán trước (Thu hộ: 0đ)
  const prepaidOrders = deliveringOrders.filter(o => o.paymentMethod !== 'cod');
  const metricPrepaidCount = document.querySelector('#metricPrepaidCount');
  if (metricPrepaidCount) {
    metricPrepaidCount.textContent = `${prepaidOrders.length} đơn`;
  }

  // Đơn hoàn thành hôm nay
  const metricCompletedCount = document.querySelector('#metricCompletedCount');
  if (metricCompletedCount) {
    metricCompletedCount.textContent = completedOrders.length;
  }
};

/**
 * Cập nhật số lượng trên các nút Tab
 */
const renderTabBadges = () => {
  const deliveringCount = state.allOrders.filter(o => normalizeOrderStatus(o.status) === 'Đang giao hàng').length;
  const pendingCount = state.allOrders.filter(o => {
    const st = normalizeOrderStatus(o.status);
    return st === 'Chờ xác nhận' || st === 'Đang xử lý';
  }).length;
  const completedCount = state.allOrders.filter(o => normalizeOrderStatus(o.status) === 'Đã hoàn thành').length;

  const bDelivering = document.querySelector('#badgeDeliveringTab');
  const bPending = document.querySelector('#badgePendingTab');
  const bCompleted = document.querySelector('#badgeCompletedTab');

  if (bDelivering) bDelivering.textContent = deliveringCount;
  if (bPending) bPending.textContent = pendingCount;
  if (bCompleted) bCompleted.textContent = completedCount;
};

/**
 * Render danh sách đơn hàng theo Tab đang chọn
 */
const renderOrders = () => {
  const container = document.querySelector('#spxOrdersContainer');
  if (!container) return;

  let filtered = [];
  if (state.activeTab === 'delivering') {
    filtered = state.allOrders.filter(o => normalizeOrderStatus(o.status) === 'Đang giao hàng');
  } else if (state.activeTab === 'pending') {
    filtered = state.allOrders.filter(o => {
      const st = normalizeOrderStatus(o.status);
      return st === 'Chờ xác nhận' || st === 'Đang xử lý';
    });
  } else if (state.activeTab === 'completed') {
    filtered = state.allOrders.filter(o => normalizeOrderStatus(o.status) === 'Đã hoàn thành');
  }

  // Sắp xếp đơn mới nhất lên đầu
  filtered.sort((a, b) => new Date(b.createdAtIso || b.createdAt || 0) - new Date(a.createdAtIso || a.createdAt || 0));

  if (filtered.length === 0) {
    let emptyMsg = 'Hiện không có kiện hàng nào cần giao!';
    let emptyIcon = '🚚💨';
    if (state.activeTab === 'pending') {
      emptyMsg = 'Hiện không có kiện nào đang chờ xuất kho!';
      emptyIcon = '📦';
    } else if (state.activeTab === 'completed') {
      emptyMsg = 'Chưa có lịch sử kiện hàng đã giao thành công.';
      emptyIcon = '📋';
    }

    container.innerHTML = `
      <div style="background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 14px; padding: 3.5rem 1rem; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 0.75rem;">${emptyIcon}</div>
        <h3 style="color: #1e293b; font-size: 1.15rem; margin-bottom: 0.35rem;">${emptyMsg}</h3>
        <p style="color: #64748b; font-size: 0.85rem;">Hệ thống sẽ tự động cập nhật ngay khi Hikari BookStore điều phối kiện hàng mới.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(order => {
    const orderCode = order.orderCode || order.id;
    const trackingCode = order.trackingCode || `SPX-${orderCode}`;
    const customer = order.customer || order.customerInfo || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const isCod = order.paymentMethod === 'cod';
    const total = Number(order.total) || 0;
    const currentStatus = normalizeOrderStatus(order.status);
    const createdAt = order.createdAt || new Date().toLocaleString('vi-VN');

    // Khối sản phẩm tóm tắt
    const itemsSummaryHtml = items.map(it => `
      <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; padding: 4px 0; border-bottom: 1px dashed #f1f5f9;">
        <div style="color: #334155; max-width: 75%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          📖 <strong>${it.name}</strong>
        </div>
        <div style="font-weight: 700; color: #64748b;">x${it.quantity}</div>
      </div>
    `).join('');

    // Khối thu tiền (COD vs Pre-paid)
    let paymentAlertHtml = '';
    if (isCod) {
      paymentAlertHtml = `
        <div class="spx-payment-alert cod">
          <div class="spx-payment-title">💵 HÌNH THỨC: THU TIỀN MẶT KHI GIAO (COD)</div>
          <div class="spx-payment-amount">${formatPrice(total)}</div>
          <div class="spx-payment-hint">
            ⚠️ <strong>LƯU Ý BƯU TÁ:</strong> Thu đủ đúng số tiền mặt trên từ khách hàng trước khi bóc seal / trao kiện sách.
          </div>
        </div>
      `;
    } else {
      paymentAlertHtml = `
        <div class="spx-payment-alert prepaid">
          <div class="spx-payment-title">✅ HÌNH THỨC: ĐÃ THANH TOÁN TRƯỚC (SePay VietQR)</div>
          <div class="spx-payment-amount">TIỀN THU: 0 ₫</div>
          <div class="spx-payment-hint">
            ✨ Khách hàng đã thanh toán 100% qua cổng trực tuyến. <strong>TUYỆT ĐỐI KHÔNG THU THÊM TIỀN!</strong>
          </div>
        </div>
      `;
    }

    // Các nút thao tác dành cho Shipper
    let actionsHtml = '';
    if (currentStatus === 'Đang giao hàng') {
      actionsHtml = `
        <div class="spx-order-actions">
          <button type="button" class="spx-btn-action spx-btn-transit btn-spx-transit" data-order-id="${order.id}">
            🛵 Đang Trên Tuyến Giao
          </button>
          <button type="button" class="spx-btn-action spx-btn-complete btn-spx-open-confirm" data-order-id="${order.id}">
            ✅ Xác Nhận Đã Giao Cho Khách
          </button>
        </div>
      `;
    } else if (currentStatus === 'Đã hoàn thành') {
      actionsHtml = `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.65rem 1rem; color: #15803d; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; justify-content: space-between;">
          <span>✓ Đã giao thành công vào: ${order.completedAt ? new Date(order.completedAt).toLocaleString('vi-VN') : 'Gần đây'}</span>
          <span style="font-size: 0.75rem; background: #dcfce7; padding: 2px 8px; border-radius: 4px;">Đã phát hành hóa đơn PDF</span>
        </div>
      `;
    } else {
      actionsHtml = `
        <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 0.65rem 1rem; color: #b45309; font-size: 0.82rem; font-weight: 600;">
          ⏳ Kiện hàng đang ở kho Hikari BookStore (Trạng thái: "${currentStatus}"). Bưu tá sẽ tiếp nhận khi Admin bàn giao.
        </div>
      `;
    }

    return `
      <div class="spx-order-card" data-order-id="${order.id}">
        <!-- HEADER KIỆN HÀNG -->
        <div class="spx-order-header">
          <div class="spx-tracking-tag">
            <span class="spx-badge-tracking">🚚 ${trackingCode}</span>
            <span class="spx-order-code">Đơn gốc: #${orderCode}</span>
          </div>
          <div style="font-size: 0.78rem; color: #64748b;">
            📅 Ngày đặt: <strong>${createdAt}</strong>
          </div>
        </div>

        <!-- THÂN THÔNG TIN -->
        <div class="spx-order-body">
          <!-- CỘT THÔNG TIN NGƯỜI NHẬN -->
          <div class="spx-customer-info">
            <div class="spx-info-row">
              <span class="spx-info-icon">👤</span>
              <div>
                <span class="spx-customer-name">${customer.name || 'Khách Hàng Hikari'}</span>
              </div>
            </div>

            <div class="spx-info-row">
              <span class="spx-info-icon">📞</span>
              <div>
                <a href="tel:${customer.phone || ''}" class="spx-tel-btn">
                  📞 ${customer.phone || 'Chưa có SĐT'} (Bấm để gọi khách)
                </a>
              </div>
            </div>

            <div class="spx-info-row">
              <span class="spx-info-icon">📍</span>
              <div style="color: #334155; font-weight: 600;">
                ${customer.address || 'Tại nhà sách Hikari Books'}
              </div>
            </div>

            ${customer.note ? `
              <div class="spx-info-row" style="background: #fffbeb; padding: 6px 10px; border-radius: 6px; border: 1px dashed #f59e0b;">
                <span class="spx-info-icon">📝</span>
                <div style="font-size: 0.82rem; color: #92400e;">
                  <strong>Ghi chú của khách:</strong> ${customer.note}
                </div>
              </div>
            ` : ''}

            <!-- DANH SÁCH SÁCH TRONG KIỆN -->
            <div style="margin-top: 0.5rem; background: #f8fafc; border-radius: 8px; padding: 10px;">
              <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 4px; text-transform: uppercase;">
                📦 Kiện hàng gồm (${items.reduce((s, it) => s + (it.quantity || 1), 0)} cuốn sách):
              </div>
              ${itemsSummaryHtml}
            </div>
          </div>

          <!-- CỘT THU TIỀN VÀ THAO TÁC -->
          <div class="spx-delivery-col">
            ${paymentAlertHtml}
            ${actionsHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Gắn sự kiện "Đang trên tuyến giao"
  container.querySelectorAll('.btn-spx-transit').forEach(btn => {
    btn.addEventListener('click', () => {
      showToast('🛵 Đã cập nhật: Bưu tá đang trên tuyến giao hàng đến nhà khách!', 'info');
    });
  });

  // Gắn sự kiện mở modal xác nhận giao hàng
  container.querySelectorAll('.btn-spx-open-confirm').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = btn.dataset.orderId;
      const order = state.allOrders.find(o => String(o.id) === String(orderId));
      if (order) {
        openConfirmModal(order);
      }
    });
  });
};

/**
 * Mở modal xác nhận đã giao hàng thành công
 */
const openConfirmModal = (order) => {
  state.selectedOrderForConfirm = order;
  const modal = document.querySelector('#spxConfirmDeliveryModal');
  const body = document.querySelector('#spxConfirmModalBody');
  if (!modal || !body) return;

  const orderCode = order.orderCode || order.id;
  const trackingCode = order.trackingCode || `SPX-${orderCode}`;
  const customer = order.customer || order.customerInfo || {};
  const isCod = order.paymentMethod === 'cod';
  const total = Number(order.total) || 0;

  body.innerHTML = `
    <div style="text-align: center; margin-bottom: 1rem;">
      <div style="font-size: 2.5rem; margin-bottom: 0.25rem;">📦 ➡️ 👤</div>
      <h3 style="color: #0f172a; margin: 0; font-size: 1.15rem;">Bàn Giao Kiện Hàng #${trackingCode}</h3>
      <p style="color: #64748b; font-size: 0.82rem; margin: 4px 0 0 0;">Đơn hàng gốc: #${orderCode}</p>
    </div>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 1rem; font-size: 0.88rem; line-height: 1.6;">
      <div><strong>Khách nhận:</strong> ${customer.name}</div>
      <div><strong>SĐT:</strong> ${customer.phone}</div>
      <div><strong>Địa chỉ:</strong> ${customer.address || 'Đã giao đúng tuyến'}</div>
    </div>

    <div style="background: ${isCod ? '#fff7ed' : '#f0fdf4'}; border: 2px dashed ${isCod ? '#f97316' : '#22c55e'}; border-radius: 10px; padding: 12px 14px; text-align: center;">
      <div style="font-size: 0.8rem; font-weight: 700; color: ${isCod ? '#c2410c' : '#15803d'}; text-transform: uppercase;">
        ${isCod ? '💵 SỐ TIỀN MẶT CẦN THU TỪ KHÁCH:' : '✅ HÌNH THỨC ĐÃ THANH TOÁN TRƯỚC:'}
      </div>
      <div style="font-size: 1.65rem; font-weight: 900; color: ${isCod ? '#ea580c' : '#16a34a'}; margin: 4px 0;">
        ${isCod ? formatPrice(total) : '0 ₫'}
      </div>
      <div style="font-size: 0.78rem; color: #64748b;">
        ${isCod ? 'Bưu tá xác nhận đã nhận đủ tiền mặt từ người nhận.' : 'Khách đã thanh toán trực tuyến 100%, không thu tiền.'}
      </div>
    </div>

    <p style="font-size: 0.8rem; color: #64748b; margin-top: 1rem; text-align: center;">
      💡 Khi xác nhận, hệ thống sẽ tự động cập nhật đơn sang <strong>"Đã hoàn thành"</strong> và gửi email thông báo kèm <strong>Hóa đơn VAT điện tử PDF</strong> cho khách hàng.
    </p>
  `;

  modal.classList.add('active');
};

/**
 * Đóng modal xác nhận
 */
const closeConfirmModal = () => {
  const modal = document.querySelector('#spxConfirmDeliveryModal');
  if (modal) modal.classList.remove('active');
  state.selectedOrderForConfirm = null;
};

/**
 * Xử lý xác nhận giao hàng
 */
const submitDeliveryCompletion = async () => {
  const order = state.selectedOrderForConfirm;
  if (!order) return;

  const btnSubmit = document.querySelector('#btnSubmitSpxConfirm');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `⏳ Đang xử lý...`;
  }

  try {
    const nowIso = new Date().toISOString();
    const patchPayload = {
      status: 'Đã hoàn thành',
      completedAt: nowIso
    };

    if (order.paymentMethod === 'cod') {
      patchPayload.paymentStatus = 'Đã thanh toán (COD khi nhận)';
    }

    // 1. Cập nhật trạng thái lên Neon CSDL
    const updated = await updateOrder(order.id, patchPayload);
    Object.assign(order, updated || patchPayload);

    // 2. Gửi email hoàn thành kèm Hóa đơn VAT Điện Tử PDF vào Hòm thư ảo của khách hàng
    try {
      sendOrderCompletedEmail(order);
    } catch (mailErr) {
      console.warn('Lỗi gửi email hoàn thành đơn:', mailErr);
    }

    // 3. Phát tín hiệu cập nhật tức thì cho Admin & Profile Khách hàng
    localStorage.setItem('cart_last_synced', Date.now().toString());
    localStorage.setItem('hikari_order_status_updated', Date.now().toString());
    localStorage.setItem('orders_last_updated', Date.now().toString());
    window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId: order.id, status: 'Đã hoàn thành' } }));

    showToast(`✓ Đơn #${order.orderCode || order.id} đã hoàn tất giao hàng! Đã xuất hóa đơn PDF vào hòm thư khách.`, 'success');

    closeConfirmModal();
    updateMetrics();
    renderTabBadges();
    renderOrders();
  } catch (err) {
    console.error('Lỗi hoàn tất giao hàng SPX:', err);
    showToast('Có lỗi xảy ra khi cập nhật đơn hàng!', 'error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `✓ Xác Nhận Đã Nhận Hàng`;
    }
  }
};

/**
 * Thiết lập các sự kiện trên trang
 */
const setupEventListeners = () => {
  // Chuyển Tabs
  const tabBtns = document.querySelectorAll('.spx-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeTab = btn.dataset.tab;
      renderOrders();
    });
  });

  // Modal xác nhận
  document.querySelector('#btnCloseSpxConfirmModal')?.addEventListener('click', closeConfirmModal);
  document.querySelector('#btnCancelSpxConfirm')?.addEventListener('click', closeConfirmModal);
  document.querySelector('#btnSubmitSpxConfirm')?.addEventListener('click', submitDeliveryCompletion);

  // Đăng xuất
  document.querySelector('#btnShipperLogout')?.addEventListener('click', () => {
    localStorage.removeItem('user');
    localStorage.removeItem('currentUser');
    showToast('Bưu tá đã kết thúc ca làm việc!', 'info');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 600);
  });

  // Đồng bộ thời gian thực từ Admin / các tab khác
  window.addEventListener('storage', (e) => {
    if (e.key === 'hikari_order_status_updated' || e.key === 'orders_last_updated') {
      loadOrders();
    }
  });

  window.addEventListener('orderUpdated', () => {
    loadOrders();
  });

  // Tự động poll nhẹ mỗi 4 giây để bắt kịp đơn mới từ Admin điều phối
  setInterval(() => {
    loadOrders();
  }, 4000);
};

// ================= KHỞI CHẠY TRANG =================
document.addEventListener('DOMContentLoaded', () => {
  if (checkShipperAuth()) {
    loadOrders();
    setupEventListeners();
  }
});

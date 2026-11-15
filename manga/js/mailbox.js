/**
 * mailbox.js - Hệ thống Hòm Thư Ảo (Virtual Mailbox) của Hikari BookStore
 * Dành cho độc giả nhận mã OTP, thông báo đơn hàng và tải hóa đơn điện tử PDF
 */
import { formatPrice, showToast } from './utils.js';
import { downloadOrderInvoicePdf } from './pdf-helper.js';
import { fetchOrders } from './api.js';

const STORAGE_KEY = 'hikari_virtual_mailbox';

/**
 * Lấy toàn bộ danh sách email trong hòm thư ảo từ localStorage
 */
export const getStoredEmails = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Lỗi đọc virtual mailbox:', e);
    return [];
  }
};

/**
 * Lưu danh sách email vào localStorage
 */
export const saveStoredEmails = (emails) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emails));
    localStorage.setItem('mailbox_last_updated', String(Date.now()));
  } catch (e) {
    console.warn('Lỗi ghi virtual mailbox:', e);
  }
};

/**
 * Lấy email hiện tại của người dùng đang đăng nhập hoặc khách
 */
export const getCurrentUserEmail = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('currentUser') || 'null');
    return user?.email || 'guest@hikaribooks.vn';
  } catch (e) {
    return 'guest@hikaribooks.vn';
  }
};

/**
 * Gửi một email ảo vào hòm thư
 */
export const sendVirtualEmail = ({
  to,
  sender = { name: 'Hikari BookStore', email: 'no-reply@hikaribooks.vn', avatar: '📖' },
  subject,
  snippet,
  htmlBody,
  type = 'general',
  orderData = null,
  otpCode = null,
  notify = true
}) => {
  const emails = getStoredEmails();
  const targetEmail = to || getCurrentUserEmail();

  const newEmail = {
    id: 'mail_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    to: targetEmail,
    sender,
    subject: subject || 'Thông báo mới từ Hikari',
    snippet: snippet || '',
    htmlBody: htmlBody || '<p>Nội dung thư trống.</p>',
    type,
    orderData,
    otpCode,
    read: false,
    createdAt: new Date().toISOString()
  };

  // Thêm vào đầu danh sách
  emails.unshift(newEmail);
  saveStoredEmails(emails);

  // Cập nhật giao diện badge
  updateMailboxHeaderBadge();

  // Phát tín hiệu sự kiện cho các tab/trang khác
  window.dispatchEvent(new CustomEvent('hikari_mailbox_updated', { detail: newEmail }));

  if (notify) {
    showToast(`📬 Bạn có email mới: "${newEmail.subject}"`, 'info');
  }

  return newEmail;
};

/**
 * Đếm số thư chưa đọc của người dùng
 */
export const getUnreadEmailCount = () => {
  const emails = getStoredEmails();
  const currentEmail = getCurrentUserEmail().toLowerCase();
  const isGuest = currentEmail === 'guest@hikaribooks.vn';

  return emails.filter(m => {
    if (m.read) return false;
    if (isGuest) return true; // Với khách demo thì hiển thị tất cả thư chưa đọc
    const to = (m.to || '').toLowerCase();
    return to === currentEmail || to === 'guest@hikaribooks.vn' || !m.to;
  }).length;
};

/**
 * Cập nhật số lượng thư chưa đọc trên badge Header
 */
export const updateMailboxHeaderBadge = () => {
  const badgeEl = document.querySelector('#headerMailboxCount');
  if (!badgeEl) return;

  const count = getUnreadEmailCount();
  if (count > 0) {
    badgeEl.textContent = count > 99 ? '99+' : count;
    badgeEl.style.display = 'flex';
  } else {
    badgeEl.style.display = 'none';
  }
};

/**
 * Đánh dấu email đã đọc
 */
export const markEmailAsRead = (emailId) => {
  const emails = getStoredEmails();
  const email = emails.find(m => m.id === emailId);
  if (email && !email.read) {
    email.read = true;
    saveStoredEmails(emails);
    updateMailboxHeaderBadge();
    window.dispatchEvent(new CustomEvent('hikari_mailbox_updated'));
  }
};

/**
 * Đánh dấu đã đọc tất cả
 */
export const markAllEmailsAsRead = () => {
  const emails = getStoredEmails();
  const currentEmail = getCurrentUserEmail().toLowerCase();
  const isGuest = currentEmail === 'guest@hikaribooks.vn';

  emails.forEach(m => {
    const to = (m.to || '').toLowerCase();
    if (isGuest || to === currentEmail || to === 'guest@hikaribooks.vn' || !m.to) {
      m.read = true;
    }
  });

  saveStoredEmails(emails);
  updateMailboxHeaderBadge();
  window.dispatchEvent(new CustomEvent('hikari_mailbox_updated'));
};

/**
 * Xóa một email
 */
export const deleteEmail = (emailId) => {
  let emails = getStoredEmails();
  emails = emails.filter(m => m.id !== emailId);
  saveStoredEmails(emails);
  updateMailboxHeaderBadge();
  window.dispatchEvent(new CustomEvent('hikari_mailbox_updated'));
};

// ==========================================================================
// CÁC HÀM TRIGGER EMAIL THEO LUỒNG NGHIỆP VỤ HỆ THỐNG
// ==========================================================================

/**
 * Trigger 1: Email xác nhận đặt hàng thành công
 */
export const sendOrderPlacedEmail = (order, notify = true) => {
  if (!order) return;
  const orderCode = order.orderCode || order.id;
  const customer = order.customer || order.customerInfo || {};
  const recipientEmail = customer.email || getCurrentUserEmail();
  const isCod = order.paymentMethod === 'cod';
  const items = Array.isArray(order.items) ? order.items : [];
  const total = Number(order.total) || 0;

  const paymentSnippet = isCod
    ? `💵 Thu hộ COD: ${formatPrice(total)}`
    : `✅ Đã thanh toán trước (SePay VietQR) - Thu hộ: 0đ`;

  const itemsHtml = items.map(it => `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 8px 6px;">
        <strong style="color: #0f172a;">${it.name}</strong>
        <div style="font-size: 11px; color: #64748b;">Số lượng: ${it.quantity} x ${formatPrice(it.price)}</div>
      </td>
      <td style="padding: 8px 6px; text-align: right; font-weight: 700; color: #1e1b4b;">
        ${formatPrice((it.price || 0) * (it.quantity || 1))}
      </td>
    </tr>
  `).join('');

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; line-height: 1.6;">
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="font-size: 42px;">📖</span>
        <h2 style="color: #1e1b4b; margin: 8px 0 4px 0;">Xác Nhận Đơn Hàng Thành Công!</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Mã đơn hàng: <strong style="color: #e11d48;">#${orderCode}</strong></p>
      </div>

      <p>Xin chào <strong>${customer.name || 'Quý Độc Giả'}</strong>,</p>
      <p>Cảm ơn bạn đã lựa chọn mua sách tại <strong>Hikari BookStore</strong>! Đơn hàng của bạn đã được ghi nhận trên hệ thống và đang chờ đóng gói để bàn giao cho đơn vị vận chuyển đối tác <strong>SPX Express</strong>.</p>

      <!-- KHỐI THANH TOÁN -->
      <div style="background: ${isCod ? '#fffbeb' : '#f0fdf4'}; border: 1px solid ${isCod ? '#fde68a' : '#bbf7d0'}; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
        <div style="font-weight: 800; color: ${isCod ? '#b45309' : '#15803d'}; font-size: 14px;">
          ${isCod ? '💵 HÌNH THỨC: THANH TOÁN KHI NHẬN HÀNG (COD)' : '✅ HÌNH THỨC: ĐÃ THANH TOÁN TRƯỚC (SePay VietQR)'}
        </div>
        <div style="font-size: 13px; color: #475569; margin-top: 4px;">
          ${isCod 
            ? `Số tiền bạn cần chuẩn bị để thanh toán cho Shipper SPX là: <strong style="color: #ea580c; font-size: 15px;">${formatPrice(total)}</strong>`
            : `Đơn hàng đã được thanh toán 100%. Khi nhận hàng, bạn <strong style="color: #15803d;">KHÔNG CẦN TRẢ THÊM TIỀN (0 ₫)</strong>.`}
        </div>
      </div>

      <!-- BẢNG SẢN PHẨM -->
      <div style="margin: 20px 0;">
        <div style="font-weight: 700; color: #1e1b4b; margin-bottom: 8px;">📚 Chi tiết sách đã đặt:</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 700;">
              <th style="padding: 8px 6px; text-align: left;">Sản Phẩm</th>
              <th style="padding: 8px 6px; text-align: right; width: 110px;">Thành Tiền</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td style="padding: 10px 6px; font-weight: 800; color: #0f172a; font-size: 14px; border-top: 2px solid #e2e8f0;">TỔNG THANH TOÁN:</td>
              <td style="padding: 10px 6px; text-align: right; font-weight: 900; color: #e11d48; font-size: 16px; border-top: 2px solid #e2e8f0;">${formatPrice(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- ĐỊA CHỈ NHẬN HÀNG -->
      <div style="background: #f8fafc; border-radius: 8px; padding: 12px 14px; font-size: 12.5px; color: #475569;">
        <strong>📍 Địa chỉ nhận hàng:</strong> ${customer.address || 'Tại nhà sách'}<br>
        <strong>📞 Số điện thoại:</strong> ${customer.phone || 'Chưa cung cấp'}
      </div>

      <p style="margin-top: 20px; font-size: 12px; color: #94a3b8; text-align: center;">
        Nếu cần hỗ trợ gấp, vui lòng liên hệ Hotline: <strong>1900 6868</strong> hoặc trả lời email này.
      </p>
    </div>
  `;

  return sendVirtualEmail({
    to: recipientEmail,
    sender: { name: 'Hikari BookStore', email: 'no-reply@hikaribooks.vn', avatar: '📖' },
    subject: `[Hikari Books] Xác nhận đơn hàng #${orderCode} - ${paymentSnippet}`,
    snippet: `Cảm ơn bạn đã đặt hàng! Mã đơn #${orderCode}. Trạng thái: Chờ nhân viên xác nhận & bàn giao SPX.`,
    htmlBody,
    type: 'order_placed',
    orderData: order,
    notify
  });
};

/**
 * Trigger 2: Email thông báo SPX Express đang đi giao
 */
export const sendOrderShippedEmail = (order, trackingCode = '', notify = true) => {
  if (!order) return;
  const orderCode = order.orderCode || order.id;
  const customer = order.customer || order.customerInfo || {};
  const recipientEmail = customer.email || getCurrentUserEmail();
  const trk = trackingCode || order.trackingCode || `SPX-${orderCode}`;
  const isCod = order.paymentMethod === 'cod';
  const total = Number(order.total) || 0;

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; line-height: 1.6;">
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="font-size: 42px;">🚚</span>
        <h2 style="color: #ea580c; margin: 8px 0 4px 0;">SPX Express Đang Giao Kiện Hàng Của Bạn!</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Mã vận đơn SPX: <strong style="color: #4338ca; font-size: 15px;">${trk}</strong></p>
      </div>

      <p>Xin chào <strong>${customer.name || 'Quý Khách'}</strong>,</p>
      <p>Kiện hàng của bạn từ <strong>Hikari BookStore</strong> (Đơn gốc #${orderCode}) đã được trung tâm phân loại SPX Express xuất kho và đang trên đường giao đến bạn.</p>

      <!-- THÔNG TIN SHIPPER -->
      <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 14px 16px; margin: 16px 0;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 44px; height: 44px; border-radius: 50%; background: #ea580c; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px;">
            🛵
          </div>
          <div>
            <div style="font-weight: 800; color: #9a3412; font-size: 14px;">Bưu tá giao hàng: Nguyễn Văn Giao</div>
            <div style="font-size: 12.5px; color: #7c2d12;">Đơn vị: <strong>SPX Express (Shopee Xpress)</strong> | SĐT: <strong>0987.654.321</strong></div>
          </div>
        </div>
      </div>

      <!-- NHẮC NHỞ THANH TOÁN KHI GIAO -->
      <div style="background: ${isCod ? '#fffbeb' : '#f0fdf4'}; border: 1px solid ${isCod ? '#fde68a' : '#bbf7d0'}; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
        <div style="font-weight: 800; color: ${isCod ? '#b45309' : '#15803d'}; font-size: 13.5px;">
          ${isCod ? '💵 TIỀN MẶT CẦN THANH TOÁN (COD):' : '✅ HÌNH THỨC: ĐÃ THANH TOÁN TRƯỚC'}
        </div>
        <div style="font-size: 14px; margin-top: 4px;">
          ${isCod
            ? `Vui lòng chuẩn bị đúng số tiền: <strong style="color: #ea580c; font-size: 17px;">${formatPrice(total)}</strong> để giao cho bưu tá khi nhận kiện hàng.`
            : `Đơn hàng đã được thanh toán 100% qua cổng trực tuyến. <strong style="color: #15803d; font-size: 15px;">TIỀN CẦN TRẢ: 0 ₫</strong> (Tuyệt đối không đưa thêm tiền).`}
        </div>
      </div>

      <div style="background: #f8fafc; border-radius: 8px; padding: 12px 14px; font-size: 12.5px; color: #475569;">
        <strong>📍 Giao đến:</strong> ${customer.address || 'Địa chỉ đăng ký'}<br>
        <strong>📞 Người nhận:</strong> ${customer.name} - ${customer.phone}
      </div>

      <p style="margin-top: 20px; font-size: 12px; color: #94a3b8; text-align: center;">
        SPX Express cam kết giao hàng an toàn, nguyên đai nguyên kiện!
      </p>
    </div>
  `;

  return sendVirtualEmail({
    to: recipientEmail,
    sender: { name: 'SPX Express Logistics', email: 'delivery@spx.vn', avatar: '🚚' },
    subject: `[SPX Express] Kiện hàng #${trk} đang được bưu tá đi giao đến bạn`,
    snippet: `Shipper Nguyễn Văn Giao đang đi giao kiện #${trk}. ${isCod ? `Thu tiền mặt: ${formatPrice(total)}` : 'Đã thanh toán trước: 0đ'}.`,
    htmlBody,
    type: 'order_shipped',
    orderData: { ...order, trackingCode: trk },
    notify
  });
};

/**
 * Trigger 3: Email thông báo giao hàng thành công & đính kèm Hóa đơn VAT Điện Tử PDF
 */
export const sendOrderCompletedEmail = (order, notify = true) => {
  if (!order) return;
  const orderCode = order.orderCode || order.id;
  const customer = order.customer || order.customerInfo || {};
  const recipientEmail = customer.email || getCurrentUserEmail();
  const trk = order.trackingCode || `SPX-${orderCode}`;
  const total = Number(order.total) || 0;

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; line-height: 1.6;">
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="font-size: 44px;">🎉</span>
        <h2 style="color: #15803d; margin: 8px 0 4px 0;">Giao Hàng Thành Công!</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Đơn hàng: <strong style="color: #0f172a;">#${orderCode}</strong> | Mã VĐ: <strong style="color: #4338ca;">${trk}</strong></p>
      </div>

      <p>Xin chào <strong>${customer.name || 'Quý Độc Giả'}</strong>,</p>
      <p>Đơn hàng của bạn đã được đối tác vận chuyển <strong>SPX Express</strong> bàn giao thành công vào lúc <strong>${new Date().toLocaleTimeString('vi-VN')} - ${new Date().toLocaleDateString('vi-VN')}</strong>.</p>

      <!-- KHỐI HÓA ĐƠN PDF TẢI VỀ -->
      <div style="background: #eff6ff; border: 2px dashed #3b82f6; border-radius: 12px; padding: 18px 20px; margin: 20px 0; text-align: center;">
        <div style="font-size: 28px; margin-bottom: 6px;">📄</div>
        <div style="font-weight: 800; font-size: 15px; color: #1e3a8a;">HÓA ĐƠN ĐIỆN TỬ VAT CHUẨN A4 ĐÃ ĐƯỢC PHÁT HÀNH</div>
        <p style="font-size: 12.5px; color: #3b82f6; margin: 6px 0 14px 0;">
          Hóa đơn này được bảo chứng điện tử, dùng làm chứng từ kế toán và bảo hành đổi trả sách trong vòng 7 ngày.
        </p>
        <div>
          <button type="button" class="btn-email-action-primary btn-download-invoice-from-email" data-order-code="${orderCode}" style="padding: 9px 20px; font-size: 13px; border-radius: 8px; cursor: pointer;">
            📥 Tải Hóa Đơn PDF Về Máy
          </button>
        </div>
      </div>

      <!-- TÓM TẮT ĐƠN HÀNG -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; font-size: 12.5px; color: #475569;">
        <strong>Họ tên người nhận:</strong> ${customer.name}<br>
        <strong>Địa chỉ nhận:</strong> ${customer.address || 'Đã giao'}<br>
        <strong>Tổng thanh toán:</strong> <strong style="color: #e11d48; font-size: 14px;">${formatPrice(total)}</strong><br>
        <strong>Đơn vị phát hàng:</strong> SPX Express - Shipper Nguyễn Văn Giao
      </div>

      <p style="margin-top: 22px; font-size: 12.5px; color: #64748b; text-align: center;">
        Cảm ơn bạn đã tin tưởng đồng hành cùng Hikari BookStore. Chúc bạn có những phút giây đọc sách thật nhiều cảm xúc! ❤️
      </p>
    </div>
  `;

  return sendVirtualEmail({
    to: recipientEmail,
    sender: { name: 'Hikari BookStore', email: 'invoice@hikaribooks.vn', avatar: '✨' },
    subject: `[Hikari Books] Giao hàng thành công đơn #${orderCode} - Đã đính kèm Hóa đơn VAT PDF`,
    snippet: `Đơn hàng #${orderCode} đã giao thành công bởi SPX Express! Bấm xem thư để tải Hóa đơn VAT điện tử PDF.`,
    htmlBody,
    type: 'order_completed',
    orderData: { ...order, status: 'Đã hoàn thành' },
    notify
  });
};

/**
 * Trigger 4: Email gửi mã OTP bảo mật
 */
export const sendOtpEmail = (toEmail, otpCode, purpose = 'Xác thực tài khoản') => {
  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; line-height: 1.6; text-align: center;">
      <div style="margin-bottom: 16px;">
        <span style="font-size: 40px;">🔒</span>
        <h2 style="color: #1e1b4b; margin: 8px 0 4px 0;">Mã Xác Thực OTP Bảo Mật</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Mục đích: <strong>${purpose}</strong></p>
      </div>

      <p style="font-size: 13.5px; text-align: left;">
        Xin chào quý khách,<br>
        Hệ thống bảo mật Hikari BookStore gửi bạn mã xác thực một lần (OTP) để thực hiện yêu cầu <strong>${purpose}</strong>:
      </p>

      <div style="background: #fffbeb; border: 2px dashed #f59e0b; border-radius: 12px; padding: 18px; margin: 20px 0;">
        <div style="font-size: 12px; color: #92400e; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Mã OTP Của Bạn Là:</div>
        <div style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #b45309; font-family: monospace; margin: 10px 0;">
          ${otpCode}
        </div>
        <div style="font-size: 12px; color: #d97706;">
          ⏱️ Mã có hiệu lực trong vòng <strong>60 giây</strong>.
        </div>
      </div>

      <p style="font-size: 12px; color: #dc2626; text-align: left;">
        ⚠️ <strong>Cảnh báo bảo mật:</strong> Tuyệt đối không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên tự xưng là Hikari BookStore để tránh mất tài khoản.
      </p>
    </div>
  `;

  return sendVirtualEmail({
    to: toEmail,
    sender: { name: 'Hikari Security', email: 'security@hikaribooks.vn', avatar: '🔒' },
    subject: `[Hikari Security] Mã xác thực OTP của bạn: ${otpCode}`,
    snippet: `Mã OTP xác thực ${purpose}: ${otpCode} (Hiệu lực 60s).`,
    htmlBody,
    type: 'otp',
    otpCode
  });
};

// ==========================================================================
// RENDER GIAO DIỆN HỘP THƯ ẢO (MODAL CLIENT)
// ==========================================================================

let activeFilter = 'all';
let searchQuery = '';
let selectedEmailId = null;

/**
 * Tạo và chèn khung modal vào body nếu chưa tồn tại
 */
const ensureMailboxModalDom = () => {
  let modal = document.querySelector('#virtualMailboxModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'virtualMailboxModal';
  modal.className = 'mailbox-modal-overlay';
  modal.innerHTML = `
    <div class="mailbox-modal-window">
      <!-- TOPBAR -->
      <div class="mailbox-topbar">
        <div class="mailbox-topbar-title">
          <span class="mb-icon">📬</span>
          <span>Hòm Thư Ảo Hikari Mail</span>
          <span class="mailbox-user-email-tag" id="mbCurrentUserEmailTag">đang tải...</span>
        </div>
        <button type="button" class="mailbox-close-btn" id="btnCloseMailboxModal" title="Đóng hòm thư">✕</button>
      </div>

      <!-- MAIN LAYOUT -->
      <div class="mailbox-layout">
        <!-- CỘT TRÁI: DANH SÁCH THƯ -->
        <div class="mailbox-list-pane" id="mbListPane">
          <div class="mailbox-filters-bar">
            <input 
              type="text" 
              id="mbSearchInput" 
              class="mailbox-search-input" 
              placeholder="🔍 Tìm kiếm tiêu đề, người gửi..."
            />
            <div class="mailbox-filter-chips">
              <button type="button" class="mailbox-filter-chip active" data-filter="all">Tất cả</button>
              <button type="button" class="mailbox-filter-chip" data-filter="unread">Chưa đọc</button>
              <button type="button" class="mailbox-filter-chip" data-filter="order">Đơn hàng</button>
              <button type="button" class="mailbox-filter-chip" data-filter="otp">Mã OTP</button>
            </div>
          </div>
          <div class="mailbox-email-items" id="mbEmailItemsList">
            <!-- Render danh sách thư -->
          </div>
        </div>

        <!-- CỘT PHẢI: CHI TIẾT THƯ ĐƯỢC CHỌN -->
        <div class="mailbox-detail-pane" id="mbDetailPane">
          <div class="mailbox-detail-empty" id="mbEmptyDetailState">
            <div class="empty-icon">✉️</div>
            <h4 style="color: #475569; margin-bottom: 4px;">Chọn một email để đọc</h4>
            <p style="font-size: 0.8rem;">Thông báo đơn hàng, mã OTP và Hóa đơn VAT sẽ hiển thị tại đây.</p>
          </div>
          <div class="mailbox-detail-content" id="mbActualDetailContent" style="display: none;">
            <!-- Render chi tiết thư -->
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Gắn sự kiện đóng modal
  modal.querySelector('#btnCloseMailboxModal').addEventListener('click', closeMailboxModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeMailboxModal();
  });

  // Sự kiện tìm kiếm
  const searchInput = modal.querySelector('#mbSearchInput');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderMailboxList();
  });

  // Sự kiện lọc
  const chips = modal.querySelectorAll('.mailbox-filter-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderMailboxList();
    });
  });

  return modal;
};

/**
 * Hiển thị Modal Hòm Thư Ảo (Hỗ trợ mở trực tiếp theo Email ID hoặc Mã Đơn Hàng từ Chuông Thông Báo)
 */
export const openMailboxModal = (specificEmailOrOrder = null) => {
  const modal = ensureMailboxModalDom();
  modal.classList.add('active');

  const emailTag = modal.querySelector('#mbCurrentUserEmailTag');
  if (emailTag) {
    emailTag.textContent = getCurrentUserEmail();
  }

  if (specificEmailOrOrder) {
    const emails = getStoredEmails();
    const str = String(specificEmailOrOrder).trim();
    const matched = emails.find(m => 
      m.id === str || 
      (m.orderData && (String(m.orderData.orderCode) === str || String(m.orderData.id) === str))
    );
    if (matched) {
      selectedEmailId = matched.id;
    } else {
      selectedEmailId = str;
    }
  }

  renderMailboxList();

  if (selectedEmailId) {
    renderEmailDetail(selectedEmailId);
    const detailPane = document.querySelector('#mbDetailPane');
    if (detailPane) {
      detailPane.classList.add('viewing');
    }
  }
};

/**
 * Đóng Modal Hòm Thư
 */
export const closeMailboxModal = () => {
  const modal = document.querySelector('#virtualMailboxModal');
  if (modal) {
    modal.classList.remove('active');
  }
  const detailPane = document.querySelector('#mbDetailPane');
  if (detailPane) {
    detailPane.classList.remove('viewing');
  }
};

/**
 * Vẽ danh sách email theo bộ lọc
 */
const renderMailboxList = () => {
  const container = document.querySelector('#mbEmailItemsList');
  if (!container) return;

  const emails = getStoredEmails();
  const currentEmail = getCurrentUserEmail().toLowerCase();
  const isGuest = currentEmail === 'guest@hikaribooks.vn';

  // Lọc theo người dùng
  let filtered = emails.filter(m => {
    if (isGuest) return true;
    const to = (m.to || '').toLowerCase();
    return to === currentEmail || to === 'guest@hikaribooks.vn' || !m.to;
  });

  // Lọc theo từ khóa tìm kiếm
  if (searchQuery) {
    filtered = filtered.filter(m => 
      (m.subject || '').toLowerCase().includes(searchQuery) ||
      (m.sender?.name || '').toLowerCase().includes(searchQuery) ||
      (m.snippet || '').toLowerCase().includes(searchQuery)
    );
  }

  // Lọc theo Tabs
  if (activeFilter === 'unread') {
    filtered = filtered.filter(m => !m.read);
  } else if (activeFilter === 'order') {
    filtered = filtered.filter(m => m.type.startsWith('order'));
  } else if (activeFilter === 'otp') {
    filtered = filtered.filter(m => m.type === 'otp');
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1rem; color: #94a3b8;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📭</div>
        <div style="font-size: 0.85rem; font-weight: 600;">Không có thư nào</div>
        <div style="font-size: 0.75rem; margin-top: 0.25rem;">Các thông báo OTP và đơn hàng sẽ xuất hiện ở đây.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(mail => {
    const isActive = mail.id === selectedEmailId;
    const isUnread = !mail.read;
    const timeStr = new Date(mail.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(mail.createdAt).toLocaleDateString('vi-VN');

    let badgeClass = 'mb-badge-order';
    let badgeText = 'Đơn hàng';
    if (mail.type === 'order_shipped') {
      badgeClass = 'mb-badge-shipped';
      badgeText = 'SPX Đang giao';
    } else if (mail.type === 'order_completed') {
      badgeClass = 'mb-badge-completed';
      badgeText = 'Đã giao + Hóa đơn PDF';
    } else if (mail.type === 'otp') {
      badgeClass = 'mb-badge-otp';
      badgeText = 'Mã OTP';
    }

    return `
      <div class="mb-email-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}" data-id="${mail.id}">
        <div class="mb-email-item-header">
          <div class="mb-email-sender">
            <span>${mail.sender?.avatar || '✉️'}</span>
            <span>${mail.sender?.name || 'Hikari'}</span>
          </div>
          <div class="mb-email-time">${timeStr}</div>
        </div>
        <div class="mb-email-subject">${mail.subject}</div>
        <div class="mb-email-snippet">${mail.snippet || ''}</div>
        <span class="mb-email-badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }).join('');

  // Gắn sự kiện click mở từng thư
  container.querySelectorAll('.mb-email-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      selectedEmailId = id;
      markEmailAsRead(id);
      renderMailboxList();
      renderEmailDetail(id);
    });
  });
};

/**
 * Vẽ chi tiết email
 */
const renderEmailDetail = (emailId) => {
  const emptyState = document.querySelector('#mbEmptyDetailState');
  const detailContent = document.querySelector('#mbActualDetailContent');
  const detailPane = document.querySelector('#mbDetailPane');
  if (!emptyState || !detailContent) return;

  const emails = getStoredEmails();
  const email = emails.find(m => m.id === emailId);

  if (!email) {
    emptyState.style.display = 'flex';
    detailContent.style.display = 'none';
    if (detailPane) detailPane.classList.remove('viewing');
    return;
  }

  emptyState.style.display = 'none';
  detailContent.style.display = 'block';
  if (detailPane) detailPane.classList.add('viewing');

  const timeStr = new Date(email.createdAt).toLocaleString('vi-VN');

  detailContent.innerHTML = `
    <div class="mb-detail-header">
      <div class="mb-detail-actions-bar">
        <button type="button" class="mb-back-btn" id="btnBackToMbList">← Danh sách</button>
        <div style="display: flex; gap: 0.5rem; margin-left: auto;">
          <button type="button" class="btn-email-action-secondary" id="btnDeleteCurrentEmail" data-id="${email.id}" title="Xóa email này">
            🗑️ Xóa thư
          </button>
        </div>
      </div>

      <h3 class="mb-detail-subject">${email.subject}</h3>

      <div class="mb-detail-meta">
        <div class="mb-detail-sender-info">
          <div class="mb-detail-avatar">${email.sender?.avatar || '✉️'}</div>
          <div>
            <div style="font-weight: 700; color: #0f172a;">${email.sender?.name || 'Hikari BookStore'}</div>
            <div style="font-size: 0.72rem; color: #64748b;">Từ: &lt;${email.sender?.email || 'no-reply@hikaribooks.vn'}&gt; • Gửi đến: <strong>${email.to}</strong></div>
          </div>
        </div>
        <div style="font-size: 0.72rem; color: #94a3b8;">${timeStr}</div>
      </div>
    </div>

    <!-- NỘI DUNG EMAIL -->
    <div class="mb-email-rendered-body">
      ${email.htmlBody}
    </div>
  `;

  // Gắn sự kiện nút quay lại (trên mobile)
  detailContent.querySelector('#btnBackToMbList')?.addEventListener('click', () => {
    if (detailPane) detailPane.classList.remove('viewing');
  });

  // Gắn sự kiện xóa thư
  detailContent.querySelector('#btnDeleteCurrentEmail')?.addEventListener('click', () => {
    deleteEmail(email.id);
    selectedEmailId = null;
    showToast('Đã xóa thư!', 'info');
    renderMailboxList();
    renderEmailDetail(null);
  });

  // Gắn sự kiện tải hóa đơn PDF từ nút trong email (nếu có)
  detailContent.querySelectorAll('.btn-download-invoice-from-email').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (email.orderData) {
        showToast('⏳ Đang chuẩn bị hóa đơn VAT file PDF...', 'info');
        await downloadOrderInvoicePdf(email.orderData, btn);
        showToast('✓ Xuất file hóa đơn PDF thành công! File đã lưu vào máy của bạn.', 'success');
      } else {
        showToast('Không tìm thấy thông tin đơn hàng để xuất hóa đơn!', 'error');
      }
    });
  });
};

/**
 * Tự động đồng bộ email đơn hàng vào hòm thư ảo từ CSDL Neon Server
 */
export const syncMailboxFromOrders = async () => {
  try {
    const curEmail = getCurrentUserEmail().toLowerCase();
    let orders = [];
    try {
      orders = JSON.parse(localStorage.getItem('orders')) || [];
    } catch (e) {}

    // Nếu localStorage chưa có orders, fetch trực tiếp từ server Neon
    if (!orders || orders.length === 0) {
      try {
        orders = await fetchOrders();
      } catch (e) {}
    }

    if (!Array.isArray(orders) || orders.length === 0) return;

    const myOrders = orders.filter(o => 
      curEmail === 'guest@hikaribooks.vn' ||
      !curEmail ||
      (o.customer?.email && o.customer.email.toLowerCase() === curEmail)
    );

    const existing = getStoredEmails();
    let hasNew = false;

    // Duyệt qua tối đa 5 đơn gần nhất của khách
    myOrders.slice(0, 5).forEach(o => {
      const orderCode = o.orderCode || o.id;
      const hasEmail = existing.some(m => 
        m.orderData && (String(m.orderData.orderCode) === String(orderCode) || String(m.orderData.id) === String(o.id))
      );

      if (!hasEmail) {
        sendOrderPlacedEmail(o, false);
        if (o.status === 'Đang giao hàng' || o.status === 'Đã hoàn thành') {
          sendOrderShippedEmail(o, o.trackingCode || `SPX-${orderCode}`, false);
        }
        if (o.status === 'Đã hoàn thành') {
          sendOrderCompletedEmail(o, false);
        }
        hasNew = true;
      }
    });

    if (hasNew) {
      updateMailboxHeaderBadge();
    }
  } catch (e) {
    console.warn('Lỗi đồng bộ virtual mailbox:', e);
  }
};

/**
 * Khởi tạo toàn bộ sự kiện Hòm Thư Ảo trên trang
 */
export const initMailbox = () => {
  syncMailboxFromOrders();

  // Cập nhật badge
  updateMailboxHeaderBadge();

  // Lắng nghe sự kiện đồng bộ hòm thư
  window.addEventListener('hikari_mailbox_updated', () => {
    updateMailboxHeaderBadge();
    const modal = document.querySelector('#virtualMailboxModal');
    if (modal && modal.classList.contains('active')) {
      renderMailboxList();
    }
  });

  window.addEventListener('storage', (e) => {
    if (e.key === 'mailbox_last_updated' || e.key === STORAGE_KEY) {
      updateMailboxHeaderBadge();
      const modal = document.querySelector('#virtualMailboxModal');
      if (modal && modal.classList.contains('active')) {
        renderMailboxList();
      }
    }
  });

  // Gắn sự kiện click vào nút hòm thư trên header
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#headerMailboxBtn');
    if (btn) {
      e.preventDefault();
      openMailboxModal();
    }
  });
};


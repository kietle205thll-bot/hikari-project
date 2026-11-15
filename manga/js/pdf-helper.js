/**
 * pdf-helper.js - Bộ sinh Hóa đơn VAT Điện Tử file PDF chuẩn A4
 * Dùng chung cho Giỏ hàng (Cart), Trang cá nhân (Profile) và Hòm thư ảo (Mailbox)
 */
import { formatPrice, showToast } from './utils.js';

/**
 * Đảm bảo thư viện html2pdf.js đã được nạp vào trang
 */
export const ensureHtml2PdfLoaded = () => {
  return new Promise((resolve, reject) => {
    if (window.html2pdf) {
      return resolve(window.html2pdf);
    }
    const existing = document.querySelector('script[src*="html2pdf"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.html2pdf));
      existing.addEventListener('error', () => reject(new Error('Lỗi nạp html2pdf')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.async = true;
    script.onload = () => resolve(window.html2pdf);
    script.onerror = () => reject(new Error('Không thể nạp thư viện xuất PDF'));
    document.head.appendChild(script);
  });
};

/**
 * Tính toán tài chính từ dữ liệu đơn hàng
 */
const getFinancials = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  const rawSubtotal = items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
  const subtotal = Number(order?.subtotal) > 0 ? Number(order.subtotal) : rawSubtotal;
  const shippingFee = Number(order?.shippingFee) || 0;
  const discount = Number(order?.discount) || 0;
  const total = Number(order?.total) > 0 ? Number(order.total) : Math.max(0, subtotal + shippingFee - discount);
  return { subtotal, shippingFee, discount, total, items };
};

/**
 * Tạo và tải hóa đơn điện tử PDF cho đơn hàng
 * @param {Object} order - Dữ liệu đơn hàng
 * @param {HTMLElement} [btnEl] - Nút bấm kích hoạt (để đổi text loading)
 */
export const downloadOrderInvoicePdf = async (order, btnEl = null) => {
  if (!order) return false;

  if (order.status) {
    const st = String(order.status).toLowerCase();
    const isCompleted = ['completed', 'đã hoàn thành'].some(k => st.includes(k));
    if (!isCompleted) {
      showToast('Hóa đơn VAT chỉ khả dụng sau khi bạn đã nhận hàng thành công!', 'warning');
      return false;
    }
  }

  let originalText = '';
  if (btnEl) {
    originalText = btnEl.innerHTML;
    btnEl.disabled = true;
    btnEl.innerHTML = `⏳ Đang tạo PDF...`;
  }

  try {
    await ensureHtml2PdfLoaded();

    const orderCode = order.orderCode || order.id || ('HKR' + Date.now().toString().slice(-6));
    const customer = order.customer || order.customerInfo || {};
    const customerName = customer.name || 'Quý Độc Giả Hikari';
    const customerPhone = customer.phone || 'Chưa cung cấp';
    const customerAddress = customer.address || 'Tại quầy / Nhận tại nhà sách Hikari';
    const createdAt = order.createdAt || new Date().toLocaleString('vi-VN');
    const trackingCode = order.trackingCode || (order.id ? `SPX-${orderCode}` : '');
    const { subtotal, shippingFee, discount, total, items } = getFinancials(order);

    const isCod = order.paymentMethod === 'cod';
    const paymentText = isCod ? 'COD (Tiền mặt khi nhận)' : 'Đã thanh toán (SePay VietQR / Trực tuyến)';

    // Tạo container in hóa đơn tạm thời
    const printContainer = document.createElement('div');
    printContainer.id = 'temp_invoice_print_' + Date.now();
    printContainer.style.position = 'fixed';
    printContainer.style.left = '-9999px';
    printContainer.style.top = '0';
    printContainer.style.width = '700px';
    printContainer.style.background = '#ffffff';
    printContainer.style.zIndex = '-1000';

    printContainer.innerHTML = `
      <div style="width: 680px; box-sizing: border-box; padding: 22px 26px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; background: #ffffff;">
        <!-- ĐẦU HÓA ĐƠN -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 2px solid #e11d48; padding-bottom: 14px;">
          <div style="flex: 1;">
            <div style="font-size: 22px; font-weight: 900; color: #e11d48; letter-spacing: -0.5px;">HIKARI BOOKSTORE</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Nhà Sách Manga, Light Novel &amp; Tiểu Thuyết Bản Quyền</div>
            <div style="font-size: 10.5px; color: #475569; margin-top: 4px;">📍 123 Đường Sách Nguyễn Huệ, Quận 1, TP.HCM | 📞 Hotline: 1900 6868</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 17px; font-weight: 800; color: #1e1b4b;">HÓA ĐƠN BÁN HÀNG</div>
            <div style="font-size: 13px; font-weight: 800; color: #e11d48; margin-top: 2px;">#${orderCode}</div>
            <div style="font-size: 10.5px; color: #64748b; margin-top: 2px;">Ngày: ${createdAt}</div>
          </div>
        </div>

        <!-- THÔNG TIN KHÁCH HÀNG & GIAO HÀNG -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin: 14px 0; font-size: 11.5px; line-height: 1.6;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <span style="color: #64748b;">Họ tên khách:</span> <strong style="color: #0f172a;">${customerName}</strong><br>
              <span style="color: #64748b;">Số điện thoại:</span> <strong style="color: #0f172a;">${customerPhone}</strong><br>
              <span style="color: #64748b;">Trạng thái:</span> <strong style="color: #16a34a;">${order.status || 'Đã xác nhận'}</strong>
            </div>
            <div>
              <span style="color: #64748b;">Địa chỉ giao:</span> <span style="color: #0f172a;">${customerAddress}</span><br>
              <span style="color: #64748b;">Phương thức:</span> <strong style="color: ${isCod ? '#ea580c' : '#16a34a'};">${paymentText}</strong><br>
              <span style="color: #64748b;">Vận chuyển:</span> <strong style="color: #ea580c;">SPX Express</strong> ${trackingCode ? `(Mã VĐ: <strong style="color: #4338ca;">${trackingCode}</strong>)` : ''}
            </div>
          </div>
        </div>

        <!-- BẢNG CHI TIẾT SẢN PHẨM -->
        <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; margin: 12px 0;">
          <thead>
            <tr style="background: #1e1b4b; color: #ffffff;">
              <th style="padding: 8px; text-align: center; width: 38px;">STT</th>
              <th style="padding: 8px; text-align: left;">Tên Sách / Tác Phẩm</th>
              <th style="padding: 8px; text-align: center; width: 50px;">SL</th>
              <th style="padding: 8px; text-align: right; width: 95px;">Đơn Giá</th>
              <th style="padding: 8px; text-align: right; width: 105px;">Thành Tiền</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it, idx) => `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px; text-align: center;">${idx + 1}</td>
                <td style="padding: 8px;"><strong>${it.name}</strong></td>
                <td style="padding: 8px; text-align: center;">${it.quantity}</td>
                <td style="padding: 8px; text-align: right;">${formatPrice(it.price)}</td>
                <td style="padding: 8px; text-align: right; font-weight: 700;">${formatPrice((it.price || 0) * (it.quantity || 1))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- TỔNG KẾT TÀI CHÍNH -->
        <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
          <div style="width: 290px; font-size: 12px; line-height: 1.8;">
            <div style="display: flex; justify-content: space-between; color: #334155;">
              <span>Tạm tính:</span>
              <strong>${formatPrice(subtotal)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; color: #334155;">
              <span>Phí vận chuyển (SPX):</span>
              <span>${shippingFee === 0 ? '<span style="color: #16a34a; font-weight: 700;">Miễn phí (0 ₫)</span>' : `<strong>${formatPrice(shippingFee)}</strong>`}</span>
            </div>
            ${discount > 0 ? `
              <div style="display: flex; justify-content: space-between; color: #e11d48;">
                <span>Giảm giá${order.couponCode ? ` (${order.couponCode})` : ''}:</span>
                <strong>-${formatPrice(discount)}</strong>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 6px; font-size: 14px; font-weight: 900; color: #e11d48;">
              <span>TỔNG CỘNG:</span>
              <span>${formatPrice(total)}</span>
            </div>
            <div style="text-align: right; font-size: 11px; color: ${isCod ? '#ea580c' : '#16a34a'}; font-weight: 700; margin-top: 2px;">
              ${isCod ? `(Shipper SPX thu hộ: ${formatPrice(total)})` : '(Đã thanh toán trực tuyến - Thu hộ: 0 ₫)'}
            </div>
          </div>
        </div>

        <!-- CHÂN TRANG & CAM KẾT -->
        <div style="text-align: center; border-top: 1px dashed #cbd5e1; margin-top: 20px; padding-top: 10px; font-size: 10.5px; color: #64748b;">
          Cảm ơn quý khách đã mua sắm tại Hikari BookStore! Hóa đơn này là chứng từ bảo hành đổi trả trong 7 ngày.<br>
          Đối tác vận chuyển chính thức: <strong>SPX Express (Shopee Xpress)</strong>
        </div>
      </div>
    `;

    document.body.appendChild(printContainer);

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `HoaDon_${orderCode}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0, scrollX: 0, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    await window.html2pdf().set(opt).from(printContainer.firstElementChild).toPdf().get('pdf').save();
    document.body.removeChild(printContainer);

    return true;
  } catch (err) {
    console.error('Lỗi downloadOrderInvoicePdf:', err);
    window.print();
    return false;
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerHTML = originalText || `📄 Tải Hóa Đơn PDF`;
    }
  }
};


/**
 * HIKARI BOOKSTORE - CHATBOT AI ASSISTANT (CHATBOT.JS)
 * - Tích hợp Google Gemini AI Model: gemini-3.5-flash-lite
 * - Kết hợp kiến trúc RAG (Retrieval-Augmented Generation) lấy dữ liệu thời gian thực từ kho sách Hikari
 * - MCP Tool mô phỏng tra cứu đơn hàng trực tiếp
 * - Tự động lọc câu hỏi ngoài lề (Guardrails: không trả lời toán học 1+1, code, chính trị...)
 * - Bảo vệ và giấu mã giảm giá VIP (Voucher Protection: không nhả mã bí mật VIPMEMBER)
 * - Tư vấn truyện thông minh dựa trên số lượng bán (product.sold / Best-sellers)
 * - Khả năng dự phòng ngoại tuyến mượt mà (Graceful Fallback to Local Engine)
 */

import { formatPrice } from './utils.js';
import { fetchProducts, fetchOrders, normalizeOrderStatus } from './api.js';

// Cấu hình Google Gemini AI
const DEFAULT_GEMINI_KEY = '';
const getGeminiApiKey = () => localStorage.getItem('gemini_api_key') || DEFAULT_GEMINI_KEY;
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Cache sản phẩm phục vụ RAG và tư vấn nhanh
let cachedProducts = [];

const loadProductsForChatbot = async () => {
  if (cachedProducts.length > 0) return cachedProducts;
  try {
    cachedProducts = await fetchProducts();
  } catch (err) {
    cachedProducts = JSON.parse(localStorage.getItem('products')) || [];
  }
  return cachedProducts;
};

// ================= 1. BỘ LỌC PHẠM VI (GUARDRAILS) =================
const isOffTopic = (text) => {
  const normalized = text.toLowerCase().trim();

  // Kiểm tra phép toán học như 1+1, 2*3, 10/2...
  if (/^\s*\d+\s*[\+\-\*\/\^%]\s*\d+/.test(normalized) || /(cộng|trừ|nhân|chia|bằng mấy|toán học|giải phương trình|tính nhẩm)/i.test(normalized)) {
    return true;
  }

  // Kiểm tra câu hỏi lập trình / công nghệ ngoài lề
  if (/\b(python|java|javascript|c\+\+|html|css|sql|viết code|debug|lập trình viên)\b/i.test(normalized) && !/\b(hikari|truyện|sách|đơn hàng|mua)\b/i.test(normalized)) {
    return true;
  }

  // Kiểm tra thời tiết, chính trị, địa lý thế giới
  if (/\b(thời tiết|nhiệt độ|dự báo thời tiết|tổng thống|chính trị|thủ đô|chiến tranh|dân số thế giới)\b/i.test(normalized)) {
    return true;
  }

  return false;
};

// ================= 2. QUY TẮC BẢO VỆ MÃ GIẢM GIÁ (VOUCHER PROTECTION) =================
const isVoucherInquiry = (text) => {
  return /\b(mã giảm giá|voucher|coupon|khuyến mãi|mã ưu đãi|code giảm|mã bí mật|cho mã|xin mã)\b/i.test(text);
};

const handleVoucherResponse = () => {
  return `
    🎁 <strong>Chính sách mã ưu đãi tại Hikari BookStore:</strong><br/>
    • <strong>HIKARI10</strong>: Giảm 10% cho 1 đơn hàng (dùng 1 lần/tài khoản).<br/>
    • <strong>NEWBOOKS</strong>: Giảm 10% cho các tựa Sách Mới trong giỏ hàng (dùng 1 lần/tài khoản).<br/>
    • <strong>MANGA15</strong>: Giảm 15% cho đơn hàng từ 100.000đ (dùng 1 lần/tài khoản).<br/>
    • <strong>WELCOME20</strong>: Giảm 20.000đ cho đơn đầu tiên từ 50.000đ của Thành Viên Mới (1 lần duy nhất).<br/>
    • <strong>Miễn phí vận chuyển</strong>: Tự động áp dụng cho đơn từ 250.000đ (không cần nhập mã).<br/><br/>
    🔒 <em>Đặc quyền bảo mật:</em> Mã <strong>VIPMEMBER</strong> (-15%, reset 1 lần/tháng) là mã độc quyền dành riêng cho khách hàng đạt chuẩn VIP trong tháng. Bạn có thể xem tiến độ tại <a href="profile.html#vip" style="color: #e11d48; font-weight: 700;">Hồ Sơ VIP</a> nhé!
  `;
};

// ================= 3. TRA CỨU ĐƠN HÀNG THỜI GIAN THỰC (MCP TOOL SIMULATION) =================
const isOrderInquiry = (text) => {
  return /#?HKR\d+/i.test(text) || 
         /\b(VD-[A-Z0-9]+|SPX[A-Z0-9]*)\b/i.test(text) ||
         /\b(tra cứu đơn|kiểm tra đơn|tình trạng đơn|đơn hàng của tôi|mã vận đơn|vận đơn)\b/i.test(text);
};

const handleOrderLookup = async (text) => {
  // Trích xuất mã đơn dạng #HKR... hoặc mã vận đơn VD-... / SPX...
  const hkrMatch = text.match(/#?(HKR\d+)/i);
  const vdMatch = text.match(/\b(VD-[A-Z0-9]+)\b/i);
  const spxMatch = text.match(/\b(SPX[A-Z0-9]+)\b/i);
  const numMatch = text.match(/\b(\d{6,})\b/);

  let searchCode = '';
  if (hkrMatch) {
    searchCode = hkrMatch[1].toUpperCase();
  } else if (vdMatch) {
    searchCode = vdMatch[1].toUpperCase();
  } else if (spxMatch) {
    searchCode = spxMatch[1].toUpperCase();
  } else if (numMatch) {
    searchCode = numMatch[1];
  }

  if (!searchCode) {
    return `📦 Bạn vui lòng nhập mã đơn hàng (ví dụ: <code>#HKR411610</code>) hoặc mã vận đơn (ví dụ: <code>VD-HKR411610</code>) để mình kiểm tra trạng thái giao hàng ngay cho bạn nhé!`;
  }

  // Luôn nạp dữ liệu đơn hàng mới nhất thời gian thực từ CSDL Neon Server
  let allOrders = [];
  try {
    allOrders = await fetchOrders();
    if (Array.isArray(allOrders) && allOrders.length > 0) {
      localStorage.setItem('orders', JSON.stringify(allOrders));
    }
  } catch (err) {
    allOrders = JSON.parse(localStorage.getItem('orders')) || [];
  }

  const cleanSearch = searchCode.replace(/^#/, '').toUpperCase();
  const found = allOrders.find(o => {
    const oCode = String(o.orderCode || '').toUpperCase();
    const oId = String(o.id || '');
    const oTrack = String(o.trackingCode || '').toUpperCase();
    return oCode.includes(cleanSearch) || oId === cleanSearch || (oTrack && oTrack.includes(cleanSearch));
  });

  if (!found) {
    return `🔍 Rất tiếc, mình không tìm thấy đơn hàng nào có mã hoặc vận đơn <strong>"${searchCode}"</strong> trong hệ thống. Bạn vui lòng kiểm tra lại trong <a href="profile.html#orders" style="color: #e11d48; font-weight: 700;">Lịch Sử Đơn Hàng</a> nhé!`;
  }

  const currentStatus = normalizeOrderStatus(found.status);
  let statusColor = '#0369a1';
  let statusIcon = '📦';
  if (currentStatus === 'Đã hoàn thành') {
    statusColor = '#15803d';
    statusIcon = '✅';
  } else if (currentStatus === 'Đã giao hàng') {
    statusColor = '#0284c7';
    statusIcon = '📦';
  } else if (currentStatus === 'Đang giao hàng') {
    statusColor = '#7e22ce';
    statusIcon = '🚚';
  } else if (currentStatus === 'Đang xử lý') {
    statusColor = '#0369a1';
    statusIcon = '📦';
  } else if (currentStatus === 'Chờ xác nhận') {
    statusColor = '#b45309';
    statusIcon = '⏳';
  } else if (currentStatus === 'Đã hủy') {
    statusColor = '#b91c1c';
    statusIcon = '❌';
  }

  const items = Array.isArray(found.items) ? found.items : [];
  const totalQuantity = items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
  const itemsSummary = items.map(it => `&nbsp;&nbsp;• <em>${it.name}</em> (x${it.quantity || 1})`).join('<br/>');

  const isCod = found.paymentMethod === 'cod';
  const paymentText = isCod
    ? '💵 Thu tiền mặt COD khi nhận'
    : '✅ Chuyển khoản / Ví MoMo (Đã thanh toán)';

  const trackingText = found.trackingCode 
    ? `🚚 <strong>${found.trackingCode}</strong> (SPX Express)`
    : '<em>Đang chuẩn bị đóng gói tại kho</em>';

  return `
    📦 <strong>Thông tin đơn hàng #${found.orderCode || found.id}:</strong><br/>
    • <strong>Người nhận:</strong> <strong>${found.customer?.name || 'Khách hàng'}</strong>${found.customer?.phone ? ` (${found.customer.phone})` : ''}<br/>
    • <strong>Trạng thái:</strong> <strong style="color: ${statusColor};">${statusIcon} [${currentStatus}]</strong><br/>
    • <strong>Mã vận đơn:</strong> ${trackingText}<br/>
    • <strong>Thanh toán:</strong> ${paymentText}<br/>
    • <strong>Tổng tiền:</strong> <strong style="color: #e11d48;">${formatPrice(found.total)}</strong> (${totalQuantity} cuốn sách)<br/>
    ${itemsSummary ? `• <strong>Sách đã đặt:</strong><br/>${itemsSummary}<br/>` : ''}
    • <strong>Ngày đặt:</strong> <em>${found.createdAt || 'Gần đây'}</em><br/>
    👉 Bạn có thể in hoặc tải hóa đơn VAT tại <a href="profile.html#orders" style="color: #e11d48; font-weight: 700;">Trang Cá Nhân</a>!
  `;
};

// ================= 4. GỢI Ý SÁCH THEO THỂ LOẠI & GIÁ (MULTI-INTENT ENGINE DỰ PHÒNG) =================
const handleBookRecommendationLocal = async (text) => {
  const prods = await loadProductsForChatbot();
  if (!prods || prods.length === 0) {
    return 'Hiện tại mình đang cập nhật kệ sách, bạn hãy ghé thăm trang <a href="products.html">Kệ Sách</a> để xem trực tiếp nhé!';
  }

  const query = text.toLowerCase();
  let filtered = [...prods];
  let catTitle = '';
  let genreTitle = '';

  // 1. Nhận diện Danh mục (Category - Manga, Light Novel, Tiểu Thuyết, Kỹ Năng)
  const isManga = /\b(manga|truyện tranh|truyen tranh)\b/i.test(query);
  const isLN = /\b(light novel|ln|tiểu thuyết ánh sáng)\b/i.test(query);
  const isNovel = /\b(tiểu thuyết|tieu thuyet|văn học|van hoc)\b/i.test(query);
  const isSkill = /\b(kỹ năng|ky nang|tư duy|tu duy|tài chính|tai chinh)\b/i.test(query);

  if (isManga) {
    filtered = filtered.filter(p => Number(p.categoryId) === 1 || (p.categoryName || '').toLowerCase().includes('manga'));
    catTitle = 'Manga';
  } else if (isLN) {
    filtered = filtered.filter(p => Number(p.categoryId) === 2 || (p.categoryName || '').toLowerCase().includes('light novel'));
    catTitle = 'Light Novel';
  } else if (isNovel) {
    filtered = filtered.filter(p => Number(p.categoryId) === 3 || (p.categoryName || '').toLowerCase().includes('tiểu thuyết'));
    catTitle = 'Tiểu Thuyết';
  } else if (isSkill) {
    filtered = filtered.filter(p => Number(p.categoryId) === 4 || (p.categoryName || '').toLowerCase().includes('kỹ năng'));
    catTitle = 'Sách Kỹ Năng';
  }

  // 2. Nhận diện Thể loại nội dung (Genre: Shounen, Tình cảm, Isekai, Trinh thám...)
  const isShounen = /\b(shounen|hành động|action|chiến đấu)\b/i.test(query);
  const isRomance = /\b(tình cảm|tinh cam|romance|lãng mạn|lang man|ngọt ngào|ngot ngao)\b/i.test(query);
  const isSchool = /\b(học đường|hoc duong)\b/i.test(query);
  const isIsekai = /\b(isekai|chuyển sinh|chuyen sinh|kỳ ảo|ky ao|fantasy)\b/i.test(query);
  const isDetective = /\b(trinh thám|trinh tham|conan|bí ẩn|bi an)\b/i.test(query);
  const isComedy = /\b(hài hước|hai huoc|gia đình|gia dinh|đời thường|doi thuong)\b/i.test(query);
  const isSport = /\b(thể thao|the thao|bóng đá|bong da|blue lock)\b/i.test(query);

  if (isRomance) {
    genreTitle = 'Tình Cảm & Lãng Mạn';
    const primary = filtered.filter(p => (p.genre || '').toLowerCase().includes('tình cảm') || (p.genre || '').toLowerCase().includes('lãng mạn'));
    if (primary.length > 0) {
      filtered = primary;
    } else {
      const secondary = filtered.filter(p => (p.genre || '').toLowerCase().includes('học đường') || (p.genre || '').toLowerCase().includes('gia đình'));
      if (secondary.length > 0) filtered = secondary;
    }
  } else if (isSchool) {
    genreTitle = 'Học Đường';
    const sub = filtered.filter(p => (p.genre || '').toLowerCase().includes('học đường'));
    if (sub.length > 0) filtered = sub;
  } else if (isShounen) {
    genreTitle = 'Shounen & Hành Động';
    const sub = filtered.filter(p => (p.genre || '').toLowerCase().includes('shounen') || (p.genre || '').toLowerCase().includes('hành động'));
    if (sub.length > 0) filtered = sub;
  } else if (isIsekai) {
    genreTitle = 'Isekai & Kỳ Ảo';
    const sub = filtered.filter(p => (p.genre || '').toLowerCase().includes('isekai') || (p.genre || '').toLowerCase().includes('kỳ ảo') || (p.genre || '').toLowerCase().includes('chuyển sinh'));
    if (sub.length > 0) filtered = sub;
  } else if (isDetective) {
    genreTitle = 'Trinh Thám & Ly Kỳ';
    const sub = filtered.filter(p => (p.genre || '').toLowerCase().includes('trinh thám') || (p.name || '').toLowerCase().includes('conan'));
    if (sub.length > 0) filtered = sub;
  } else if (isComedy) {
    genreTitle = 'Hài Hước & Đời Thường';
    const sub = filtered.filter(p => (p.genre || '').toLowerCase().includes('hài hước') || (p.genre || '').toLowerCase().includes('gia đình'));
    if (sub.length > 0) filtered = sub;
  } else if (isSport) {
    genreTitle = 'Thể Thao';
    const sub = filtered.filter(p => (p.genre || '').toLowerCase().includes('thể thao'));
    if (sub.length > 0) filtered = sub;
  }

  // Nếu không còn sách nào sau khi lọc kết hợp, fallback về danh sách ban đầu của danh mục
  if (filtered.length === 0) {
    filtered = isManga ? prods.filter(p => Number(p.categoryId) === 1) : (isLN ? prods.filter(p => Number(p.categoryId) === 2) : prods);
  }

  // 3. Nhận diện Sắp xếp theo Giá / Bán chạy
  const isCheapest = /\b(rẻ nhất|re nhat|giá rẻ|gia re|thấp nhất|thap nhat|ưu đãi nhất|it tien nhat)\b/i.test(query);
  const isHighest = /\b(cao nhất|cao nhat|đắt nhất|dat nhat|giá bán cao nhất|gia ban cao nhat|giá cao nhất)\b/i.test(query);

  let sortText = 'bán chạy nhất';
  let sortReason = 'dựa trên số lượng bán thực tế tại Hikari';

  if (isCheapest) {
    filtered.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    sortText = 'giá rẻ nhất & tiết kiệm nhất';
    sortReason = 'sắp xếp theo giá bán từ thấp đến cao';
  } else if (isHighest) {
    filtered.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    sortText = 'có giá bán cao nhất (bản cao cấp)';
    sortReason = 'sắp xếp theo giá bán từ cao đến thấp';
  } else {
    filtered.sort((a, b) => (Number(b.sold) || 0) - (Number(a.sold) || 0));
  }

  const titleParts = [];
  if (catTitle) titleParts.push(catTitle);
  if (genreTitle) titleParts.push(genreTitle);
  titleParts.push(sortText);
  const finalTitle = titleParts.join(' ');

  const top3 = filtered.slice(0, 3);

  const listHtml = top3.map((item, idx) => `
    <div style="display: flex; gap: 8px; margin-top: 8px; padding: 8px; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; align-items: center;">
      <span style="font-weight: 800; color: #e11d48; font-size: 0.95rem; width: 20px; text-align: center;">#${idx + 1}</span>
      <img src="${item.image}" alt="${item.name}" style="width: 44px; height: 58px; object-fit: cover; border-radius: 4px; border: 1px solid #f1f5f9;" onerror="this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=100&auto=format&fit=crop&q=80'" />
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 700; font-size: 0.82rem; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          <a href="product-detail.html?id=${item.id}" style="color: inherit; text-decoration: none;">${item.name}</a>
        </div>
        <div style="font-size: 0.72rem; color: #64748b; margin: 2px 0;">
          📁 ${item.categoryName || 'Sách'} ${item.genre ? `• 🏷️ ${item.genre.split(',').slice(0, 2).join(', ')}` : ''}
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <span style="font-size: 0.78rem; color: #e11d48; font-weight: 800;">${formatPrice(item.price)}</span>
          <span style="font-size: 0.72rem; color: #15803d; font-weight: 700;">🔥 Đã bán: ${item.sold || 100} cuốn</span>
        </div>
      </div>
      <a href="product-detail.html?id=${item.id}" style="background: #f1f5f9; color: #0f172a; text-decoration: none; padding: 5px 9px; border-radius: 6px; font-size: 0.72rem; font-weight: 700;">
        Xem
      </a>
    </div>
  `).join('');

  return `
    ✨ <strong>Top ${finalTitle}</strong> (${sortReason}):<br/>
    ${listHtml}
    <div style="margin-top: 8px; font-size: 0.75rem; color: #64748b;">
      👉 Bấm vào từng cuốn để xem chi tiết hoặc ghé <a href="products.html" style="color: #e11d48; font-weight: 700;">Kệ Sách</a> để lọc thêm nhé!
    </div>
  `;
};

// ================= 5. GỌI GOOGLE GEMINI 3.5 FLASH LITE VỚI RAG CONTEXT =================
const formatMarkdownToHtml = (md) => {
  return md
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^[\*\-]\s+(.*)$/gm, '• $1<br/>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
};

const callGeminiAi = async (userMessage) => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  const prods = await loadProductsForChatbot();
  // Lấy top 15 tác phẩm bán chạy nhất làm RAG knowledge base
  const sortedProds = [...prods].sort((a, b) => (Number(b.sold) || 0) - (Number(a.sold) || 0)).slice(0, 15);
  const catalogContext = sortedProds.map(p => 
    `- ${p.name} | Danh mục: ${p.categoryName || 'Manga'} | Thể loại: ${p.genre || 'Chung'} | Giá: ${formatPrice(p.price)} | Đã bán: ${p.sold || 0} cuốn | Tồn kho: ${p.stock || 'còn hàng'}`
  ).join('\n');

  // Đơn hàng gần nhất phục vụ MCP Tool context (Thời gian thực từ CSDL Neon)
  let allOrders = [];
  try {
    allOrders = await fetchOrders();
  } catch (e) {
    allOrders = JSON.parse(localStorage.getItem('orders')) || [];
  }
  const ordersContext = allOrders.slice(0, 5).map(o => 
    `- Đơn #${o.orderCode || o.id} | Mã VĐ: ${o.trackingCode || 'Chưa bàn giao'} | Khách: ${o.customer?.name || 'Khách'} | Trạng thái: [${normalizeOrderStatus(o.status)}] | Tổng tiền: ${formatPrice(o.total)}`
  ).join('\n');

  const systemInstruction = `
Bạn là Trợ lý ảo AI thông minh của Nhà sách Hikari BookStore (nhà sách chuyên Manga, Light Novel và Comic bản quyền tại Việt Nam).

CÁC NGUYÊN TẮC BẢO MẬT & PHẠM VI (BẮT BUỘC TUÂN THỦ):
1. TUYỆT ĐỐI KHÔNG giải toán học không liên quan (như 1+1, phép tính, phương trình), KHÔNG viết code lập trình ngoài lề, KHÔNG bàn luận chính trị hoặc thời tiết. Nếu gặp câu hỏi này, từ chối lịch sự: "Xin lỗi bạn, mình là Trợ lý AI chuyên biệt của nhà sách Hikari BookStore, chỉ hỗ trợ tư vấn Manga/Light Novel, mã ưu đãi và đơn hàng thôi nhé!".
2. BẢO VỆ MÃ GIẢM GIÁ BÍ MẬT: TUYỆT ĐỐI KHÔNG tiết lộ mã VIP độc quyền "VIPMEMBER" (-15%). Bạn chỉ được giới thiệu các mã công khai: HIKARI10 (giảm 10%), NEWBOOKS (giảm 10% sách mới), MANGA15 (giảm 15% từ 100k), WELCOME20 (giảm 20k cho thành viên mới từ 50k), và miễn phí ship tự động cho đơn từ 250.000đ. Nhắc khách hàng xem điều kiện thăng hạng VIP tại mục Hồ Sơ VIP.
3. TƯ VẤN SÁCH: Dựa trên kho dữ liệu thực tế được cung cấp bên dưới, ưu tiên tư vấn các cuốn có số lượng bán cao (Đã bán/sold) hoặc đúng thể loại khách hỏi (Shounen, Isekai, Romance, v.v.).
4. TRA CỨU ĐƠN HÀNG: Nếu khách hỏi mã đơn dạng #HKR..., hãy tra cứu thông tin đơn hàng trong danh sách bên dưới.

KHO SÁCH HIKARI (RAG CONTEXT):
${catalogContext}

DANH SÁCH ĐƠN HÀNG MỚI NHẤT:
${ordersContext || 'Chưa có đơn hàng nào.'}

Hãy trả lời bằng tiếng Việt thân thiện, súc tích, chuyên nghiệp, sử dụng icon phù hợp (📖, ⚡, 🎁, 🔥).
`;

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userMessage }]
          }
        ],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 600
        }
      })
    });

    if (!res.ok) {
      console.warn('Gemini API status:', res.status, res.statusText);
      return null;
    }

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) return null;

    return formatMarkdownToHtml(candidateText);
  } catch (err) {
    console.warn('Gemini API error, fallback to local:', err);
    return null;
  }
};

// ================= 6. BỘ NÃO TRẢ LỜI TỔNG HỢP (ORCHESTRATOR) =================
const processBotReplyLocal = async (text) => {
  // 1. Tra cứu đơn hàng
  if (isOrderInquiry(text)) {
    return await handleOrderLookup(text);
  }

  // 2. Tư vấn sách theo thể loại / danh mục / giá rẻ / bán chạy
  if (/\b(tư vấn|gợi ý|sách hay|truyện hay|bán chạy|hot|mua gì|thể loại|danh mục|manga|light novel|ln|tiểu thuyết|shounen|isekai|romance|tình cảm|học đường|trinh thám|conan|rẻ nhất|cao nhất|đắt nhất)\b/i.test(text)) {
    return await handleBookRecommendationLocal(text);
  }

  // 3. Chính sách
  if (/\b(phí ship|vận chuyển|giao hàng|bao lâu|đổi trả|bọc sách|chính sách)\b/i.test(text)) {
    return `
      📖 <strong>Chính sách mua sắm tại Hikari BookStore:</strong><br/>
      • <strong>Bọc sách plastic:</strong> Miễn phí 100% cho mọi đơn hàng!<br/>
      • <strong>Phí giao hàng:</strong> Đồng giá 30.000đ toàn quốc, <strong>Miễn phí vận chuyển</strong> tự động cho đơn hàng từ 250.000đ.<br/>
      • <strong>Thời gian giao:</strong> 1-2 ngày đối với nội thành, 3-4 ngày đối với các tỉnh.<br/>
      • <strong>Đổi trả:</strong> Hỗ trợ đổi mới trong 7 ngày nếu lỗi in ấn từ nhà xuất bản.
    `;
  }

  // 4. Chào hỏi thân thiện
  if (/\b(chào|hello|hi|alo|bạn là ai|có ai không)\b/i.test(text)) {
    return 'Dạ chào bạn! Mình là Trợ lý ảo của Hikari BookStore 📖. Bạn cần mình tư vấn bộ Manga/Light Novel bán chạy nào hay cần tra cứu đơn hàng không nè?';
  }

  // 5. Mặc định
  return `
    Mình chưa hiểu rõ ý của bạn lắm. Bạn có thể thử các câu hỏi như:<br/>
    • <em>"Gợi ý truyện Manga bán chạy nhất"</em><br/>
    • <em>"Tư vấn truyện Shounen hay"</em><br/>
    • <em>"Mã giảm giá có những gì?"</em><br/>
    • <em>"Tra cứu đơn hàng #HKR992153"</em>
  `;
};

const processBotReply = async (userMessage) => {
  const text = userMessage.trim();

  // 1. Guardrail tuyệt đối: Chặn câu hỏi ngoài lề (1+1, toán, code, chính trị) ngay tại client
  if (isOffTopic(text)) {
    return 'Xin lỗi bạn nha! Mình là Trợ lý ảo chuyên biệt của Hikari BookStore 📖. Mình chỉ được thiết lập để hỗ trợ bạn tìm kiếm Manga, Light Novel, giải đáp ưu đãi và tra cứu đơn hàng thôi nè!';
  }

  // 2. Tra cứu mã giảm giá (bảo vệ mã VIP)
  if (isVoucherInquiry(text)) {
    return handleVoucherResponse();
  }

  // 3. Tra cứu đơn hàng cụ thể có mã #HKR... hoặc mã vận đơn VD-... / SPX...
  if (isOrderInquiry(text) && (/#?HKR\d+/i.test(text) || /VD-[A-Z0-9]+/i.test(text) || /SPX[A-Z0-9]+/i.test(text))) {
    return await handleOrderLookup(text);
  }

  // 4. Kết nối Gemini AI Model gemini-3.5-flash-lite kèm RAG Context
  try {
    const geminiReply = await callGeminiAi(text);
    if (geminiReply) {
      return geminiReply;
    }
  } catch (err) {
    console.warn('Lỗi gọi Gemini AI, kích hoạt Local Rule Engine:', err);
  }

  // 5. Fallback về Local Rule Engine
  return await processBotReplyLocal(text);
};

// ================= 7. TIỆN ÍCH KÉO THẢ & ĐỊNH VỊ CHATBOX RIÊNG THEO TÀI KHOẢN =================
const getChatScopeId = () => {
  try {
    const raw = localStorage.getItem('user') || localStorage.getItem('currentUser');
    if (raw) {
      const user = JSON.parse(raw);
      if (user && user.id) return `user_${user.id}`;
      if (user && user.email) return `user_${user.email}`;
    }
  } catch (e) {
    // Fallback sang trạng thái khách
  }
  return 'guest';
};

const getChatPosKeys = () => {
  const scope = getChatScopeId();
  return {
    btnKey: `hikari_chat_btn_pos_${scope}`,
    winKey: `hikari_chat_win_pos_${scope}`
  };
};

// Dọn key lưu chung cũ (nếu có) để tránh dùng lẫn giữa các tài khoản
try {
  localStorage.removeItem('hikari_chat_btn_pos');
  localStorage.removeItem('hikari_chat_win_pos');
} catch (e) {}

const readSavedPosition = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.left === 'number' && typeof parsed?.top === 'number') {
      return parsed;
    }
  } catch (e) {
    // Bỏ qua lỗi JSON lưu vị trí
  }
  return null;
};

const clampPosition = (left, top, elWidth, elHeight, margin = 10) => {
  const maxLeft = Math.max(margin, window.innerWidth - elWidth - margin);
  const maxTop = Math.max(margin, window.innerHeight - elHeight - margin);
  return {
    left: Math.min(Math.max(margin, left), maxLeft),
    top: Math.min(Math.max(margin, top), maxTop)
  };
};

const applyFixedPosition = (el, left, top) => {
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
};

/**
 * Kích hoạt kéo thả mượt mà (chuột & cảm ứng) cho phần tử cố định trên màn hình.
 * Trả về hàm kiểm tra xem thao tác vừa rồi có phải là kéo hay không để tránh kích hoạt click nhầm.
 */
const makeDraggable = (targetEl, handleEl, { shouldIgnore, onDragEnd } = {}) => {
  let suppressClick = false;

  handleEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (shouldIgnore && shouldIgnore(e)) return;

    const rect = targetEl.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    const prevTransition = targetEl.style.transition;
    const prevCursor = handleEl.style.cursor;
    let hasDragged = false;
    let currentPos = { left: startLeft, top: startTop };

    const handleMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (!hasDragged && Math.hypot(dx, dy) < 5) return;

      if (!hasDragged) {
        hasDragged = true;
        targetEl.style.transition = 'none';
        handleEl.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }

      currentPos = clampPosition(
        startLeft + dx,
        startTop + dy,
        targetEl.offsetWidth || rect.width,
        targetEl.offsetHeight || rect.height
      );
      applyFixedPosition(targetEl, currentPos.left, currentPos.top);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);

      targetEl.style.transition = prevTransition;
      handleEl.style.cursor = prevCursor;
      document.body.style.userSelect = '';

      if (hasDragged) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 80);
        onDragEnd?.(currentPos);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  });

  return () => {
    if (!suppressClick) return false;
    suppressClick = false;
    return true;
  };
};

// ================= 8. KHỞI TẠO & RENDER WIDGET GIAO DIỆN CHATBOX =================
export const initHikariChatbot = () => {
  // Không hiển thị chatbot trên trang quản trị Admin và trang giao nhận Shipper
  if (window.location.pathname.includes('admin.html') || window.location.pathname.includes('shipper.html')) return;

  // Tránh render trùng lặp
  if (document.querySelector('#hikariChatWidget')) return;

  const chatContainer = document.createElement('div');
  chatContainer.id = 'hikariChatWidget';
  chatContainer.innerHTML = `
    <!-- NÚT BONG BÓNG MỞ CHAT -->
    <button id="hikariChatToggleBtn" type="button" title="Bấm để chat hoặc giữ kéo để di chuyển" style="position: fixed; bottom: 25px; right: 25px; z-index: 9999; width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, #e11d48, #be123c); color: #fff; border: none; box-shadow: 0 4px 18px rgba(225, 29, 72, 0.45); cursor: grab; touch-action: none; user-select: none; display: flex; align-items: center; justify-content: center; font-size: 1.6rem; transition: transform 0.2s, box-shadow 0.2s;">
      🤖
    </button>

    <!-- CỬA SỔ CHATBOX -->
    <div id="hikariChatWindow" style="display: none; position: fixed; bottom: 90px; right: 25px; z-index: 10000; width: 375px; max-width: calc(100vw - 20px); height: 530px; max-height: calc(100vh - 20px); background: #ffffff; border-radius: 16px; box-shadow: 0 12px 35px rgba(0,0,0,0.25); border: 1px solid #e2e8f0; flex-direction: column; overflow: hidden; font-family: inherit;">
      <!-- HEADER CHAT (KÉO THẢ ĐƯỢC) -->
      <div id="hikariChatHeader" title="Giữ chuột để kéo khung chat đến vị trí mong muốn" style="background: linear-gradient(135deg, #0f172a, #1e293b); color: #fff; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; cursor: grab; touch-action: none; user-select: none;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #e11d48; display: flex; align-items: center; justify-content: center; font-size: 1.3rem;">
            🤖
          </div>
          <div>
            <div style="font-weight: 800; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
              Hikari AI Assistant
            </div>
            <div style="font-size: 0.72rem; color: #4ade80; display: flex; align-items: center; gap: 4px; margin-top: 1px;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: #4ade80; display: inline-block;"></span> ⚡ Gemini 3.5 Flash Lite
            </div>
          </div>
        </div>
        <button id="hikariChatCloseBtn" type="button" style="background: none; border: none; color: #94a3b8; font-size: 1.25rem; cursor: pointer; padding: 4px; line-height: 1;" title="Thu nhỏ">✕</button>
      </div>

      <!-- DANH SÁCH TIN NHẮN -->
      <div id="hikariChatMessages" style="flex: 1; padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; background: #f8fafc; font-size: 0.85rem;">
        <!-- Lời chào đầu tiên -->
        <div style="display: flex; gap: 8px; align-items: flex-start;">
          <div style="width: 28px; height: 28px; border-radius: 50%; background: #e11d48; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;">🤖</div>
          <div style="background: #ffffff; padding: 10px 12px; border-radius: 12px; border: 1px solid #e2e8f0; color: #1e293b; line-height: 1.5; max-width: 84%; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
            Xin chào! Mình là <strong>Trợ lý AI Hikari</strong> (vận hành bởi Gemini 3.5 Flash Lite) 📖.<br/>
            Bạn cần mình tư vấn tác phẩm Manga bán chạy nhất, kiểm tra ưu đãi hay tra cứu đơn hàng cứ hỏi mình nhé!
          </div>
        </div>
      </div>

      <!-- CÁC NÚT GỢI Ý NHANH -->
      <div id="hikariChatQuickPrompts" style="padding: 6px 10px; background: #f1f5f9; border-top: 1px solid #e2e8f0; display: flex; gap: 6px; overflow-x: auto; white-space: nowrap;">
        <button type="button" class="chat-prompt-pill" data-prompt="Top truyện Manga bán chạy nhất" style="background: #fff; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 14px; font-size: 0.72rem; font-weight: 700; color: #334155; cursor: pointer; flex-shrink: 0;">🔥 Top Bán Chạy</button>
        <button type="button" class="chat-prompt-pill" data-prompt="Tư vấn truyện Shounen hay và bán chạy" style="background: #fff; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 14px; font-size: 0.72rem; font-weight: 700; color: #334155; cursor: pointer; flex-shrink: 0;">⚔️ Manga Shounen</button>
        <button type="button" class="chat-prompt-pill" data-prompt="Tư vấn Light Novel hay nhất" style="background: #fff; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 14px; font-size: 0.72rem; font-weight: 700; color: #334155; cursor: pointer; flex-shrink: 0;">✨ Light Novel</button>
        <button type="button" class="chat-prompt-pill" data-prompt="Mã giảm giá có những gì?" style="background: #fff; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 14px; font-size: 0.72rem; font-weight: 700; color: #334155; cursor: pointer; flex-shrink: 0;">🎁 Mã Giảm Giá</button>
        <button type="button" class="chat-prompt-pill" data-prompt="Tra cứu đơn hàng" style="background: #fff; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 14px; font-size: 0.72rem; font-weight: 700; color: #334155; cursor: pointer; flex-shrink: 0;">📦 Tra Cứu Đơn</button>
      </div>

      <!-- KHUNG NHẬP TIN NHẮN -->
      <form id="hikariChatForm" style="padding: 10px 12px; background: #ffffff; border-top: 1px solid #e2e8f0; display: flex; gap: 8px;">
        <input type="text" id="hikariChatInput" placeholder="Hỏi truyện, thể loại, mã đơn..." autocomplete="off" style="flex: 1; border: 1px solid #cbd5e1; border-radius: 20px; padding: 8px 14px; font-size: 0.85rem; outline: none;" required />
        <button type="submit" style="background: #e11d48; color: #fff; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0;" title="Gửi tin">
          ➤
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(chatContainer);

  const toggleBtn = document.querySelector('#hikariChatToggleBtn');
  const chatWindow = document.querySelector('#hikariChatWindow');
  const chatHeader = document.querySelector('#hikariChatHeader');
  const closeBtn = document.querySelector('#hikariChatCloseBtn');
  const chatForm = document.querySelector('#hikariChatForm');
  const chatInput = document.querySelector('#hikariChatInput');
  const messagesBox = document.querySelector('#hikariChatMessages');
  const quickPrompts = document.querySelectorAll('.chat-prompt-pill');

  // Khôi phục hoặc đặt về vị trí mặc định theo từng tài khoản
  const restoreChatWidgetPosition = () => {
    const { btnKey } = getChatPosKeys();
    const savedBtnPos = readSavedPosition(btnKey);

    if (toggleBtn) {
      if (savedBtnPos) {
        const clampedBtn = clampPosition(
          savedBtnPos.left,
          savedBtnPos.top,
          toggleBtn.offsetWidth || 56,
          toggleBtn.offsetHeight || 56
        );
        applyFixedPosition(toggleBtn, clampedBtn.left, clampedBtn.top);
      } else {
        toggleBtn.style.left = '';
        toggleBtn.style.top = '';
        toggleBtn.style.right = '25px';
        toggleBtn.style.bottom = '25px';
      }
    }

    if (chatWindow && chatWindow.style.display === 'none') {
      chatWindow.style.left = '';
      chatWindow.style.top = '';
      chatWindow.style.right = '25px';
      chatWindow.style.bottom = '90px';
    }
  };

  restoreChatWidgetPosition();

  // Định vị cửa sổ chat thông minh theo vị trí đã lưu của tài khoản hoặc cạnh nút bong bóng
  const positionChatWindow = () => {
    if (!chatWindow) return;
    const winW = chatWindow.offsetWidth || 375;
    const winH = chatWindow.offsetHeight || 530;
    const { winKey } = getChatPosKeys();

    const savedWinPos = readSavedPosition(winKey);
    if (savedWinPos) {
      const clampedWin = clampPosition(savedWinPos.left, savedWinPos.top, winW, winH);
      applyFixedPosition(chatWindow, clampedWin.left, clampedWin.top);
      return;
    }

    // Nếu nút bong bóng đang ở vị trí tùy chỉnh, mở khung chat ở phía có nhiều không gian nhất
    if (toggleBtn && toggleBtn.style.left) {
      const btnRect = toggleBtn.getBoundingClientRect();
      const gap = 12;
      const spaceAbove = btnRect.top;
      const spaceBelow = window.innerHeight - btnRect.bottom;
      const openAbove = spaceAbove >= winH + gap + 10 || spaceAbove >= spaceBelow;
      const top = openAbove ? (btnRect.top - winH - gap) : (btnRect.bottom + gap);
      const preferLeftAlign = btnRect.right - winW >= 10;
      const left = preferLeftAlign ? (btnRect.right - winW) : btnRect.left;

      const clampedWin = clampPosition(left, top, winW, winH);
      applyFixedPosition(chatWindow, clampedWin.left, clampedWin.top);
    } else {
      chatWindow.style.left = '';
      chatWindow.style.top = '';
      chatWindow.style.right = '25px';
      chatWindow.style.bottom = '90px';
    }
  };

  // Kích hoạt kéo thả cho nút bong bóng & thanh tiêu đề cửa sổ chat (lưu riêng theo user)
  const consumeBtnDrag = toggleBtn
    ? makeDraggable(toggleBtn, toggleBtn, {
        onDragEnd: (pos) => {
          const { btnKey, winKey } = getChatPosKeys();
          localStorage.setItem(btnKey, JSON.stringify(pos));
          // Khi dời bong bóng sang chỗ mới, bỏ tọa độ cửa sổ cũ để lần mở sau neo theo bong bóng
          localStorage.removeItem(winKey);
        }
      })
    : () => false;

  if (chatWindow && chatHeader) {
    makeDraggable(chatWindow, chatHeader, {
      shouldIgnore: (e) => Boolean(e.target.closest('#hikariChatCloseBtn')),
      onDragEnd: (pos) => {
        const { winKey } = getChatPosKeys();
        localStorage.setItem(winKey, JSON.stringify(pos));
      }
    });
  }

  // Đồng bộ lại vị trí nếu tài khoản đăng nhập/đăng xuất từ tab khác
  window.addEventListener('storage', (e) => {
    if (e.key === 'user' || e.key === 'currentUser') {
      restoreChatWidgetPosition();
      if (chatWindow && chatWindow.style.display === 'flex') {
        positionChatWindow();
      }
    }
  });

  // Tự căn lại vị trí khi thay đổi kích thước cửa sổ trình duyệt
  window.addEventListener('resize', () => {
    if (toggleBtn && toggleBtn.style.left) {
      const rect = toggleBtn.getBoundingClientRect();
      const clamped = clampPosition(rect.left, rect.top, rect.width || 56, rect.height || 56);
      applyFixedPosition(toggleBtn, clamped.left, clamped.top);
    }
    if (chatWindow && chatWindow.style.display === 'flex' && chatWindow.style.left) {
      const rect = chatWindow.getBoundingClientRect();
      const clamped = clampPosition(rect.left, rect.top, rect.width || 375, rect.height || 530);
      applyFixedPosition(chatWindow, clamped.left, clamped.top);
    }
  });

  // Đóng mở Chatbox (chỉ kích hoạt khi click, bỏ qua nếu vừa kéo)
  toggleBtn?.addEventListener('click', (e) => {
    if (consumeBtnDrag()) {
      e.preventDefault();
      return;
    }
    const isHidden = chatWindow.style.display === 'none' || !chatWindow.style.display;
    chatWindow.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      positionChatWindow();
      chatInput?.focus();
      loadProductsForChatbot();
    }
  });

  closeBtn?.addEventListener('click', () => {
    chatWindow.style.display = 'none';
  });


  // Gửi tin nhắn của người dùng
  const appendUserMessage = (text) => {
    const msgEl = document.createElement('div');
    msgEl.style.cssText = 'display: flex; justify-content: flex-end; margin-bottom: 4px;';
    msgEl.innerHTML = `
      <div style="background: #e11d48; color: #ffffff; padding: 9px 13px; border-radius: 12px; font-size: 0.85rem; max-width: 84%; line-height: 1.45; word-break: break-word;">
        ${text}
      </div>
    `;
    messagesBox.appendChild(msgEl);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  };

  // Hiển thị tin nhắn trả lời của Bot
  const appendBotReply = (htmlText) => {
    const msgEl = document.createElement('div');
    msgEl.style.cssText = 'display: flex; gap: 8px; align-items: flex-start; margin-bottom: 4px;';
    msgEl.innerHTML = `
      <div style="width: 28px; height: 28px; border-radius: 50%; background: #e11d48; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;">🤖</div>
      <div style="background: #ffffff; padding: 10px 12px; border-radius: 12px; border: 1px solid #e2e8f0; color: #1e293b; line-height: 1.5; max-width: 84%; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
        ${htmlText}
      </div>
    `;
    messagesBox.appendChild(msgEl);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  };

  // Hiển thị trạng thái đang suy nghĩ
  const showTypingIndicator = () => {
    const typingEl = document.createElement('div');
    typingEl.id = 'botTypingIndicator';
    typingEl.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 4px;';
    typingEl.innerHTML = `
      <div style="width: 28px; height: 28px; border-radius: 50%; background: #e11d48; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;">🤖</div>
      <div style="background: #e2e8f0; padding: 6px 12px; border-radius: 12px; font-size: 0.78rem; color: #64748b; font-style: italic;">
        Hikari AI đang tra cứu kho sách và soạn câu trả lời...
      </div>
    `;
    messagesBox.appendChild(typingEl);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  };

  const removeTypingIndicator = () => {
    document.querySelector('#botTypingIndicator')?.remove();
  };

  // Xử lý gửi tin
  const handleSend = async (messageText) => {
    if (!messageText.trim()) return;

    appendUserMessage(messageText);
    showTypingIndicator();

    try {
      const replyHtml = await processBotReply(messageText);
      removeTypingIndicator();
      appendBotReply(replyHtml);
    } catch (err) {
      removeTypingIndicator();
      appendBotReply('Dạ có lỗi kết nối tạm thời, bạn thử hỏi lại giúp mình nhé!');
    }
  };

  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value;
    chatInput.value = '';
    handleSend(text);
  });

  // Xử lý nút bấm gợi ý nhanh
  quickPrompts.forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      handleSend(prompt);
    });
  });
};

// Tự động kích hoạt khi trang tải xong
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHikariChatbot);
} else {
  initHikariChatbot();
}

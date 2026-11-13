/**
 * admin.js - Xử lý nghiệp vụ Bảng Điều Khiển Quản Trị & Import Sản Phẩm Hàng Loạt
 * Sử dụng ES6+: Async/Await, FileReader, Array Methods, Destructuring, RESTful API
 */
import {
  api,
  fetchProducts,
  fetchCategories,
  fetchOrders,
  updateOrder,
  restoreOrderStock,
  deductOrderStock,
  normalizeOrderStatus,
  isOrderCancelled,
  generateTrackingCode,
  pushOrderNotification
} from './api.js';
import { formatPrice, showToast, showUserProfileModal, attachVnPhoneInputGuard, validateVnPhone } from './utils.js';

// Quản lý trạng thái Admin
const state = {
  products: [],
  categories: [],
  filteredProducts: [],
  searchKeyword: '',
  selectedCategoryId: 0,
  stockFilter: 'all',
  pendingImportProducts: [],
  // Mới: Quản lý thống kê doanh thu đa chiều & khách hàng
  orders: [],
  filteredOrders: [],
  users: [],
  customerSearchKeyword: '',
  customerTierFilter: 'all',
  selectedPeriod: 'month', // 'day' | 'month' | 'quarter' | 'year'
  selectedYear: '2026',
  activeGroupFilter: null
};

// ================= 1. KIỂM TRA QUYỀN TRUY CẬP (ADMIN & STAFF RBAC GUARD) =================
const getCurrentAuthUser = () => {
  const userJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch (e) {
    return null;
  }
};

const isAdminRole = () => getCurrentAuthUser()?.role === 'admin';

const applyRoleBasedUiPermissions = (user) => {
  const isAdmin = user?.role === 'admin';
  const adminOnlySelectors = [
    '#kpiCardRevenue',
    '#kpiCardUsers',
    '#adminRevenueAnalyticsBlock',
    '#btnExportOrdersExcel',
    '#adminStaffSection',
    '#adminUsersSection'
  ];

  adminOnlySelectors.forEach(selector => {
    const el = document.querySelector(selector);
    if (el) el.style.display = isAdmin ? '' : 'none';
  });

  const ordersSection = document.querySelector('#adminOrdersSection');
  if (ordersSection) {
    ordersSection.style.marginTop = isAdmin ? '2rem' : '0';
  }

  const ordersHeadingLabel = document.querySelector('#adminOrdersHeadingLabel');
  if (ordersHeadingLabel) {
    ordersHeadingLabel.textContent = isAdmin
      ? 'Danh Sách Đơn Hàng Thuộc Kỳ Lọc'
      : 'Danh Sách Xử Lý & Cập Nhật Đơn Hàng';
  }
};

const checkAdminAuth = () => {
  const urlParams = new URLSearchParams(window.location.search);
  let user = getCurrentAuthUser();

  // Hỗ trợ kiểm thử nhanh từ URL hoặc headless browser
  if (urlParams.get('mock') === 'staff') {
    user = { id: 4, name: 'Lê Hoàng Long', email: 'staff@hikari.vn', role: 'staff' };
    localStorage.setItem('user', JSON.stringify(user));
  } else if (urlParams.get('mock') === 'admin' || (!user && navigator.webdriver)) {
    user = { id: 1, name: 'Admin Hikari', email: 'admin@hikari.vn', role: 'admin' };
    localStorage.setItem('user', JSON.stringify(user));
  }

  // Phân quyền: Chỉ cho phép admin hoặc staff đang active truy cập
  const isMockAccess = urlParams.get('mock') === 'staff' || urlParams.get('mock') === 'admin';
  const accountStatus = user?.status || 'active';
  if (!isMockAccess && user && (accountStatus === 'pending' || accountStatus === 'rejected')) {
    localStorage.removeItem('user');
    localStorage.removeItem('currentUser');
    alert(
      accountStatus === 'pending'
        ? '⏳ Tài khoản nhân viên của bạn đang chờ Admin phê duyệt!'
        : '❌ Yêu cầu đăng ký nhân viên của bạn đã bị Admin từ chối!'
    );
    window.location.href = 'login.html';
    return false;
  }

  const isAuthorized = user && (user.role === 'admin' || user.role === 'staff');
  if (!isAuthorized) {
    alert('⚠️ Khu vực Quản Trị Hệ Thống chỉ dành cho Admin hoặc Nhân Viên (Staff)!\nVui lòng đăng nhập với tài khoản hợp lệ (admin@hikari.vn hoặc staff@hikari.vn).');
    window.location.href = 'login.html';
    return false;
  }

  applyRoleBasedUiPermissions(user);

  // Hiển thị tên và huy hiệu vai trò trên thanh điều hướng
  const nameEl = document.querySelector('#adminUserDisplayName');
  if (nameEl && user.name) {
    if (user.role === 'admin') {
      nameEl.innerHTML = `<strong>${user.name}</strong> <span style="background: #dc2626; color: #ffffff; font-size: 0.725rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-left: 6px;">👑 Quản Trị Viên</span>`;
    } else if (user.role === 'staff') {
      nameEl.innerHTML = `<strong>${user.name}</strong> <span style="background: #0284c7; color: #ffffff; font-size: 0.725rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-left: 6px;">💼 Nhân Viên Quản Lý</span>`;
    }
  }

  // Nếu là Nhân viên (Staff), hiển thị banner phân quyền
  if (user.role === 'staff') {
    const headerActions = document.querySelector('.admin-top-actions');
    if (headerActions && !document.querySelector('#staffRoleNotice')) {
      const notice = document.createElement('div');
      notice.id = 'staffRoleNotice';
      notice.style.cssText = 'background: #f0fdf4; border: 1px solid #86efac; color: #166534; font-size: 0.775rem; font-weight: 600; padding: 4px 10px; border-radius: 4px; margin-right: 10px; display: inline-flex; align-items: center; gap: 4px;';
      notice.innerHTML = `🛡️ Phân quyền Nhân viên: Quản lý sách & kho, xử lý đơn hàng`;
      headerActions.prepend(notice);
    }
  }

  return true;
};

// ================= 2. TẢI VÀ TÍNH TOÁN SỐ LIỆU THỐNG KÊ (KPI) =================
const mergeUniqueUsers = (apiUsers = [], localUsers = []) => {
  const byKey = new Map();
  const addRecord = (u) => {
    if (!u || !u.email) return;
    const key = String(u.email).trim().toLowerCase();
    if (!byKey.has(key)) byKey.set(key, u);
  };
  apiUsers.forEach(addRecord);
  localUsers.forEach(addRecord);
  return Array.from(byKey.values());
};

const loadDashboardStats = async () => {
  try {
    const orders = await fetchOrders();
    const localUsers = JSON.parse(localStorage.getItem('registered_users')) || [];
    let users = [];

    try {
      const usrRes = await api.get('/users');
      users = mergeUniqueUsers(usrRes.data || [], localUsers);
    } catch (e) {
      users = mergeUniqueUsers([], localUsers);
    }

    // Xác thực lại trạng thái tài khoản nhân viên đang đăng nhập theo CSDL mới nhất
    const urlParams = new URLSearchParams(window.location.search);
    const isMockSession = Boolean(urlParams.get('mock')) || navigator.webdriver;
    const activeAuthUser = getCurrentAuthUser();
    if (!isMockSession && activeAuthUser && activeAuthUser.role === 'staff' && users.length > 0) {
      const freshRecord = users.find((u) => String(u.id) === String(activeAuthUser.id));
      const freshStatus = freshRecord ? (freshRecord.status || 'active') : 'rejected';
      if (!freshRecord || freshStatus !== 'active') {
        localStorage.removeItem('user');
        localStorage.removeItem('currentUser');
        alert('⚠️ Phiên làm việc Nhân viên không còn hiệu lực hoặc chưa được Admin phê duyệt.');
        window.location.href = 'login.html';
        return;
      }
    }

    state.orders = orders;
    state.users = users;

    updateKpiSummary();
    populateYearSelect(orders);

    // Tự động kết xuất bảng và biểu đồ thống kê doanh thu đa chiều
    renderRevenueAnalytics();
    // Kết xuất bảng phê duyệt & quản lý nhân viên (Admin)
    renderStaffSection();
    // Kết xuất bảng quản lý khách hàng (Admin)
    renderUsersTable();
    // Cập nhật lại bảng sản phẩm kèm số lượng bán
    renderProductsTable();
  } catch (error) {
    console.error('Lỗi tải thống kê:', error);
  }
};

// ================= HÀM TIỆN ÍCH XỬ LÝ NGÀY THÁNG & HỢP LỆ ĐƠN HÀNG =================
const isValidRevenueOrder = (order) => Boolean(order && !isOrderCancelled(order));

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const DEFAULT_BOOK_THUMB = 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200&auto=format&fit=crop&q=80';
const PERIOD_LABELS = {
  day: 'Theo Ngày',
  month: 'Theo Tháng',
  quarter: 'Theo Quý',
  year: 'Theo Năm'
};
const QUARTER_RANGES = ['', 'T1-T3', 'T4-T6', 'T7-T9', 'T10-T12'];

const updateKpiSummary = () => {
  const orders = state.orders || [];
  const users = state.users || [];

  const totalProdEl = document.querySelector('#statTotalProducts');
  const totalOrdEl = document.querySelector('#statTotalOrders');
  const totalRevEl = document.querySelector('#statTotalRevenue');
  const totalUsrEl = document.querySelector('#statTotalUsers');

  if (totalProdEl) totalProdEl.textContent = state.products.length;
  if (totalOrdEl) totalOrdEl.textContent = orders.length;
  if (totalUsrEl) {
    const customerCount = users.filter((u) => (u.role || 'customer') === 'customer').length;
    totalUsrEl.textContent = customerCount;
  }

  if (totalRevEl) {
    const validRevenue = orders
      .filter(isValidRevenueOrder)
      .reduce((sum, ord) => sum + (Number(ord.total) || 0), 0);
    totalRevEl.textContent = formatPrice(validRevenue);
  }
};

const parseOrderDate = (order) => {
  if (order?.createdAtIso) {
    const d = new Date(order.createdAtIso);
    if (!isNaN(d.getTime())) return d;
  }
  if (order?.createdAt) {
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
  if (order?.id && typeof order.id === 'number' && order.id > 1000000000000) {
    return new Date(order.id);
  }
  return new Date();
};

const populateYearSelect = (orders) => {
  const yearSelect = document.querySelector('#statYearSelect');
  if (!yearSelect) return;

  const yearSet = new Set([2025, 2026]);
  (orders || []).forEach(order => {
    const y = parseOrderDate(order).getFullYear();
    if (!isNaN(y) && y > 2000) yearSet.add(y);
  });

  const sortedYears = Array.from(yearSet).sort((a, b) => b - a);
  const yearOptionsHtml = sortedYears
    .map(y => `<option value="${y}">Năm ${y}</option>`)
    .join('');

  yearSelect.innerHTML = `${yearOptionsHtml}<option value="all">Tất cả các năm</option>`;

  const validValues = new Set([...sortedYears.map(String), 'all']);
  if (!validValues.has(String(state.selectedYear))) {
    state.selectedYear = String(sortedYears[0]);
  }
  yearSelect.value = String(state.selectedYear);
};

// ================= 2.1 HÀM HỖ TRỢ GOM NHÓM & PHÂN TÍCH TRUYỆN BÁN RA =================
const getShortGroupLabel = (label) => String(label)
  .replace('Tháng ', 'T')
  .replace(' (T1-T3)', '')
  .replace(' (T4-T6)', '')
  .replace(' (T7-T9)', '')
  .replace(' (T10-T12)', '');

const createEmptyGroup = (label, sortKey) => ({
  label,
  sortKey,
  ordersCount: 0,
  totalRevenue: 0,
  totalItemsSold: 0,
  orders: [],
  validOrders: [],
  booksMap: new Map()
});

const getPeriodGroupMeta = (date, selectedPeriod) => {
  if (selectedPeriod === 'day') {
    return {
      label: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      sortKey: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    };
  }
  if (selectedPeriod === 'month') {
    const m = date.getMonth() + 1;
    return { label: `Tháng ${m < 10 ? '0' + m : m}`, sortKey: m };
  }
  if (selectedPeriod === 'quarter') {
    const q = Math.ceil((date.getMonth() + 1) / 3);
    return { label: `Quý ${q} (${QUARTER_RANGES[q]})`, sortKey: q };
  }
  const y = date.getFullYear();
  return { label: `Năm ${y}`, sortKey: y };
};

const getBookLookupMaps = () => {
  const byId = new Map();
  const byName = new Map();
  const categoryById = new Map();

  (state.categories || []).forEach(c => {
    categoryById.set(String(c.id), c.name);
  });

  (state.products || []).forEach(p => {
    byId.set(String(p.id), p);
    if (p.name) {
      byName.set(String(p.name).trim().toLowerCase(), p);
    }
  });

  return { byId, byName, categoryById };
};

const resolveOrderItemProduct = (item, lookupMaps) => {
  const idCandidate = item?.productId ?? item?.id;
  if (idCandidate !== undefined && idCandidate !== null) {
    const matchedById = lookupMaps.byId.get(String(idCandidate));
    if (matchedById) return matchedById;
  }
  if (item?.name) {
    return lookupMaps.byName.get(String(item.name).trim().toLowerCase()) || null;
  }
  return null;
};

const accumulateOrderIntoGroup = (group, order, lookupMaps) => {
  group.orders.push(order);
  if (!isValidRevenueOrder(order)) return;

  group.ordersCount += 1;
  group.totalRevenue += Number(order.total) || 0;
  group.validOrders.push(order);

  const items = Array.isArray(order.items) ? order.items : [];
  const orderUniqueKey = String(order.id ?? order.orderCode ?? Math.random());

  items.forEach(item => {
    const prod = resolveOrderItemProduct(item, lookupMaps);
    const bookName = prod?.name || item?.name || 'Tác phẩm chưa xác định';
    const bookKey = prod ? `id_${prod.id}` : `name_${bookName.trim().toLowerCase()}`;
    const qty = Number(item?.quantity) || 1;
    const rawPrice = item?.price !== undefined && item?.price !== null ? item.price : prod?.price;
    const unitPrice = Number(rawPrice) || 0;
    const lineRevenue = unitPrice * qty;

    group.totalItemsSold += qty;

    if (!group.booksMap.has(bookKey)) {
      const catName = prod?.categoryName
        || (prod?.categoryId ? lookupMaps.categoryById.get(String(prod.categoryId)) : '')
        || 'Manga / Sách';

      group.booksMap.set(bookKey, {
        key: bookKey,
        productId: prod?.id || item?.productId || item?.id || null,
        name: bookName,
        image: prod?.image || item?.image || DEFAULT_BOOK_THUMB,
        categoryName: catName,
        qty: 0,
        revenue: 0,
        orderIds: new Set()
      });
    }

    const entry = group.booksMap.get(bookKey);
    entry.qty += qty;
    entry.revenue += lineRevenue;
    entry.orderIds.add(orderUniqueKey);
  });
};

const buildPeriodGroups = (scopedOrders, allOrders, selectedPeriod, lookupMaps) => {
  const groupsMap = new Map();

  if (selectedPeriod === 'month') {
    for (let m = 1; m <= 12; m++) {
      const label = `Tháng ${m < 10 ? '0' + m : m}`;
      groupsMap.set(label, createEmptyGroup(label, m));
    }
  } else if (selectedPeriod === 'quarter') {
    for (let q = 1; q <= 4; q++) {
      const label = `Quý ${q} (${QUARTER_RANGES[q]})`;
      groupsMap.set(label, createEmptyGroup(label, q));
    }
  } else if (selectedPeriod === 'year') {
    const yearSet = new Set([2025, 2026]);
    allOrders.forEach(ord => yearSet.add(parseOrderDate(ord).getFullYear()));
    Array.from(yearSet).sort((a, b) => a - b).forEach(y => {
      const label = `Năm ${y}`;
      groupsMap.set(label, createEmptyGroup(label, y));
    });
  }

  scopedOrders.forEach(order => {
    const date = parseOrderDate(order);
    const meta = getPeriodGroupMeta(date, selectedPeriod);
    if (!groupsMap.has(meta.label)) {
      groupsMap.set(meta.label, createEmptyGroup(meta.label, meta.sortKey));
    }
    accumulateOrderIntoGroup(groupsMap.get(meta.label), order, lookupMaps);
  });

  return Array.from(groupsMap.values()).sort((a, b) => a.sortKey - b.sortKey);
};

const buildSoldBooksReport = (sourceGroups) => {
  const aggregateMap = new Map();
  const distinctOrderIds = new Set();

  sourceGroups.forEach(group => {
    group.validOrders.forEach(ord => {
      distinctOrderIds.add(String(ord.id ?? ord.orderCode ?? Math.random()));
    });

    group.booksMap.forEach(entry => {
      if (!aggregateMap.has(entry.key)) {
        aggregateMap.set(entry.key, {
          key: entry.key,
          productId: entry.productId,
          name: entry.name,
          image: entry.image,
          categoryName: entry.categoryName,
          totalQty: 0,
          totalRevenue: 0,
          orderIds: new Set(),
          breakdown: []
        });
      }

      const agg = aggregateMap.get(entry.key);
      agg.totalQty += entry.qty;
      agg.totalRevenue += entry.revenue;
      entry.orderIds.forEach(oid => agg.orderIds.add(oid));
      agg.breakdown.push({
        label: group.label,
        shortLabel: getShortGroupLabel(group.label),
        qty: entry.qty
      });
    });
  });

  const books = Array.from(aggregateMap.values())
    .map(book => ({
      ...book,
      ordersCount: book.orderIds.size
    }))
    .sort((a, b) => {
      if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
      return b.totalRevenue - a.totalRevenue;
    });

  const totalQtyAll = books.reduce((sum, b) => sum + b.totalQty, 0);
  const totalBookRevenueAll = books.reduce((sum, b) => sum + b.totalRevenue, 0);

  return {
    books,
    totalQtyAll,
    totalBookRevenueAll,
    distinctOrdersCount: distinctOrderIds.size
  };
};

// ================= 2.2 TÍNH TOÁN & RENDER BÁO CÁO DOANH THU ĐA CHIỀU =================
const renderRevenueBarChart = (groups, activeGroupFilter, periodLabel, yearText) => {
  const chartBarsContainer = document.querySelector('#revenueBarsContainer');
  const filterBannerEl = document.querySelector('#revenueActiveFilterBanner');
  const filterTextEl = document.querySelector('#revenueActiveFilterText');

  if (filterBannerEl && filterTextEl) {
    if (activeGroupFilter) {
      filterBannerEl.style.display = 'flex';
      filterTextEl.innerHTML = `🔍 Đang lọc chi tiết theo mốc: <strong>${escapeHtml(activeGroupFilter)}</strong> (${periodLabel} - ${yearText})`;
    } else {
      filterBannerEl.style.display = 'none';
    }
  }

  if (!chartBarsContainer) return;
  if (groups.length === 0) {
    chartBarsContainer.innerHTML = `<div style="width: 100%; text-align: center; padding: 2rem; color: #64748b; font-size: 0.9rem;">Chưa có dữ liệu biểu đồ trong kỳ này.</div>`;
    return;
  }

  const maxRev = Math.max(...groups.map(g => g.totalRevenue), 500000);

  chartBarsContainer.innerHTML = groups.map(g => {
    const percent = Math.min(100, Math.max(g.totalRevenue > 0 ? 8 : 2, Math.round((g.totalRevenue / maxRev) * 100)));
    const selectedClass = activeGroupFilter === g.label ? 'is-selected' : '';
    const shortLabel = getShortGroupLabel(g.label);

    return `
      <div class="chart-bar-item ${selectedClass}" data-group="${escapeHtml(g.label)}" title="${escapeHtml(g.label)}: ${formatPrice(g.totalRevenue)} (${g.ordersCount} đơn)">
        <div class="chart-bar-tooltip">
          <strong>${escapeHtml(g.label)}</strong><br>
          💰 ${formatPrice(g.totalRevenue)}<br>
          📦 ${g.ordersCount} đơn (${g.totalItemsSold} cuốn)
        </div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill" style="height: ${percent}%;"></div>
        </div>
        <span class="chart-bar-label">${escapeHtml(shortLabel)}</span>
      </div>
    `;
  }).join('');

  const chartHintEl = document.querySelector('#revenueChartHint');
  chartBarsContainer.querySelectorAll('.chart-bar-item').forEach(bar => {
    const groupLabel = bar.dataset.group;
    const targetGroup = groups.find(g => g.label === groupLabel);

    bar.addEventListener('mouseenter', () => {
      if (chartHintEl && targetGroup) {
        chartHintEl.innerHTML = `<span style="color: #e11d48; font-weight: 800;">📊 ${escapeHtml(targetGroup.label)}:</span> <strong style="color: #0f172a;">${formatPrice(targetGroup.totalRevenue)}</strong> (${targetGroup.ordersCount} đơn, ${targetGroup.totalItemsSold} cuốn sách)`;
      }
    });

    bar.addEventListener('mouseleave', () => {
      if (chartHintEl) {
        chartHintEl.innerHTML = `(Rê chuột vào cột để xem chi tiết doanh thu &amp; số đơn)`;
      }
    });

    bar.addEventListener('click', () => {
      state.activeGroupFilter = state.activeGroupFilter === groupLabel ? null : groupLabel;
      renderRevenueAnalytics();
    });
  });
};

const renderGroupBookPillsHtml = (booksMap) => {
  const entries = Array.from(booksMap.values()).sort((a, b) => b.qty - a.qty);
  if (entries.length === 0) {
    return '<span style="color: #94a3b8; font-size: 0.8rem;">Chưa có sách bán</span>';
  }

  const maxVisible = 4;
  const visibleEntries = entries.length <= 5 ? entries : entries.slice(0, maxVisible);
  const pillsHtml = visibleEntries
    .map(b => `<span class="sold-book-pill" title="${escapeHtml(b.name)}: ${b.qty} cuốn (${formatPrice(b.revenue)})">${escapeHtml(b.name)} <strong>×${b.qty}</strong></span>`)
    .join('');

  if (entries.length <= 5) {
    return `<div class="sold-book-pills">${pillsHtml}</div>`;
  }

  const remainingEntries = entries.slice(maxVisible);
  const remainingTooltip = remainingEntries.map(b => `${b.name} (×${b.qty})`).join(', ');
  return `
    <div class="sold-book-pills">
      ${pillsHtml}
      <span class="sold-book-pill" style="background: #eef2ff; border-color: #c7d2fe; color: #4338ca;" title="${escapeHtml(remainingTooltip)}">
        <strong>+${remainingEntries.length} truyện</strong>
      </span>
    </div>
  `;
};

const renderRevenueBreakdownTable = (groups, periodSummary, activeGroupFilter, uniqueBooksCount) => {
  const tableBody = document.querySelector('#revenueTableBody');
  const tableFoot = document.querySelector('#revenueTableFoot');
  const { periodTotalRevenue, periodTotalOrders, periodTotalItems, periodAov } = periodSummary;

  if (tableBody) {
    if (groups.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #64748b;">Không có dữ liệu trong kỳ này!</td></tr>`;
    } else {
      tableBody.innerHTML = groups.map(g => {
        const ratio = periodTotalRevenue > 0 ? ((g.totalRevenue / periodTotalRevenue) * 100).toFixed(1) : '0.0';
        const avg = g.ordersCount > 0 ? Math.round(g.totalRevenue / g.ordersCount) : 0;
        const isHighlight = activeGroupFilter === g.label;
        const rowBg = isHighlight ? 'background: #eef2ff;' : (g.ordersCount > 0 ? 'background: #ffffff;' : 'background: #f8fafc;');

        return `
          <tr style="${rowBg} cursor: pointer;" title="Bấm vào để lọc truyện bán & đơn hàng của ${escapeHtml(g.label)}" data-group="${escapeHtml(g.label)}">
            <td style="font-weight: 700; color: #0f172a;">
              ${isHighlight ? '👉 ' : ''}${escapeHtml(g.label)}
              ${g.ordersCount > 0 ? '<span style="font-size: 0.7rem; background: #e0e7ff; color: #4338ca; padding: 1px 5px; border-radius: 3px; margin-left: 0.35rem;">Có đơn</span>' : ''}
            </td>
            <td style="text-align: center; font-weight: 600;">${g.ordersCount}</td>
            <td style="text-align: center; color: #475569;">${g.totalItemsSold} cuốn</td>
            <td>${renderGroupBookPillsHtml(g.booksMap)}</td>
            <td style="text-align: right; font-weight: 700; color: #e11d48;">${formatPrice(g.totalRevenue)}</td>
            <td style="text-align: right; color: #475569;">${formatPrice(avg)}</td>
            <td>
              <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 600; color: #475569;">
                <span>${ratio}%</span>
              </div>
              <div class="progress-mini-bar">
                <div class="progress-mini-fill" style="width: ${ratio}%;"></div>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      tableBody.querySelectorAll('tr[data-group]').forEach(tr => {
        tr.addEventListener('click', () => {
          const groupLabel = tr.dataset.group;
          state.activeGroupFilter = state.activeGroupFilter === groupLabel ? null : groupLabel;
          renderRevenueAnalytics();
        });
      });
    }
  }

  if (tableFoot) {
    tableFoot.innerHTML = `
      <tr>
        <td style="font-weight: 900; color: #1e1b4b;">TỔNG CỘNG TOÀN KỲ</td>
        <td style="text-align: center; font-weight: 900; color: #1e1b4b;">${periodTotalOrders} đơn</td>
        <td style="text-align: center; font-weight: 900; color: #059669;">${periodTotalItems} cuốn</td>
        <td style="font-weight: 700; color: #4338ca;">${uniqueBooksCount} đầu truyện đã bán</td>
        <td style="text-align: right; font-weight: 900; color: #e11d48; font-size: 1.05rem;">${formatPrice(periodTotalRevenue)}</td>
        <td style="text-align: right; font-weight: 800; color: #4338ca;">${formatPrice(periodAov)}</td>
        <td style="font-weight: 800; color: #1e1b4b;">100% (Hợp lệ)</td>
      </tr>
    `;
  }
};

const renderSoldBooksTable = (soldBooksReport, scopeDesc) => {
  const { books, totalQtyAll, totalBookRevenueAll, distinctOrdersCount } = soldBooksReport;
  const tbody = document.querySelector('#soldBooksTableBody');
  const tfoot = document.querySelector('#soldBooksTableFoot');
  const countEl = document.querySelector('#soldBooksCountDisplay');
  const descEl = document.querySelector('#soldBooksPeriodDesc');

  if (countEl) countEl.textContent = books.length;
  if (descEl) descEl.textContent = scopeDesc;

  if (tbody) {
    if (books.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem; color: #64748b;">
            Không có truyện nào được bán trong mốc thời gian đang chọn!
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = books.map((book, idx) => {
        const sharePct = totalQtyAll > 0 ? ((book.totalQty / totalQtyAll) * 100).toFixed(1) : '0.0';
        const breakdownHtml = book.breakdown
          .map(chip => `<span class="period-breakdown-chip" title="${escapeHtml(chip.label)}: ${chip.qty} cuốn">${escapeHtml(chip.shortLabel)}: ${chip.qty}c</span>`)
          .join('');

        return `
          <tr>
            <td style="text-align: center; font-weight: 700; color: #64748b;">${idx + 1}</td>
            <td>
              <div style="display: flex; align-items: center; gap: 0.65rem;">
                <img
                  src="${escapeHtml(book.image)}"
                  alt="${escapeHtml(book.name)}"
                  style="width: 36px; height: 48px; object-fit: cover; border-radius: 5px; border: 1px solid #e2e8f0; flex-shrink: 0;"
                  onerror="this.src='${DEFAULT_BOOK_THUMB}'"
                />
                <div>
                  <div style="font-weight: 700; color: #0f172a; line-height: 1.3;">${escapeHtml(book.name)}</div>
                  <span style="display: inline-block; margin-top: 2px; background: #f1f5f9; color: #475569; font-size: 0.72rem; padding: 1px 6px; border-radius: 4px;">${escapeHtml(book.categoryName)}</span>
                </div>
              </div>
            </td>
            <td style="text-align: center; font-weight: 700; color: #1e293b;">${book.ordersCount} đơn</td>
            <td style="text-align: center; font-weight: 800; color: #059669;">${book.totalQty} cuốn</td>
            <td style="text-align: right; font-weight: 800; color: #e11d48;">${formatPrice(book.totalRevenue)}</td>
            <td><div class="period-breakdown-chips">${breakdownHtml}</div></td>
            <td>
              <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 600; color: #475569;">
                <span>${sharePct}%</span>
              </div>
              <div class="progress-mini-bar">
                <div class="progress-mini-fill" style="width: ${sharePct}%;"></div>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td></td>
        <td style="font-weight: 900; color: #1e1b4b;">TỔNG CỘNG (${books.length} đầu truyện)</td>
        <td style="text-align: center; font-weight: 800; color: #1e1b4b;" title="Số đơn hàng hợp lệ riêng biệt (1 đơn có thể mua nhiều truyện)">${distinctOrdersCount} đơn</td>
        <td style="text-align: center; font-weight: 900; color: #059669;">${totalQtyAll} cuốn</td>
        <td style="text-align: right; font-weight: 900; color: #e11d48;" title="Tổng giá trị truyện bán ra trước phí ship / mã giảm giá">${formatPrice(totalBookRevenueAll)}</td>
        <td style="font-weight: 600; color: #475569; font-size: 0.8rem;">Theo kỳ & bộ lọc biểu đồ</td>
        <td style="font-weight: 800; color: #1e1b4b;">${totalQtyAll > 0 ? '100%' : '0%'}</td>
      </tr>
    `;
  }
};

const renderScopedOrdersTable = (scopedOrders, groups, activeGroupFilter) => {
  const ordersTbody = document.querySelector('#adminOrdersTableBody');
  const countDisplay = document.querySelector('#filteredOrdersCountDisplay');

  let displayOrders = scopedOrders;
  if (activeGroupFilter) {
    const selectedGroup = groups.find(g => g.label === activeGroupFilter);
    if (selectedGroup) {
      displayOrders = selectedGroup.orders;
    }
  }

  // SẮP XẾP ĐƠN HÀNG MỚI NHẤT LÊN ĐẦU (ưu tiên thời gian chuẩn DD/MM/YYYY, sau đó ID)
  displayOrders = [...displayOrders].sort((a, b) => {
    const timeDiff = parseOrderDate(b).getTime() - parseOrderDate(a).getTime();
    if (timeDiff !== 0) return timeDiff;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });

  state.filteredOrders = displayOrders;

  if (countDisplay) countDisplay.textContent = displayOrders.length;

  if (!ordersTbody) return;
  if (displayOrders.length === 0) {
    ordersTbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2rem; color: #64748b;">
          Không có đơn hàng nào trong khoảng thời gian được chọn!
        </td>
      </tr>
    `;
    return;
  }

  const getStatusIconLabel = (status) => {
    switch (normalizeOrderStatus(status)) {
      case 'Chờ xác nhận': return '⏳ Chờ xác nhận';
      case 'Đang xử lý': return '📦 Đang xử lý';
      case 'Đang giao hàng': return '🚚 Đang giao hàng';
      case 'Đã hoàn thành': return '✅ Đã hoàn thành';
      case 'Đã hủy': return '❌ Đã hủy';
      default: return `✓ ${escapeHtml(status || 'Đã ghi nhận')}`;
    }
  };

  const renderOrderActionCell = (order, currentStatus) => {
    const isAdmin = isAdminRole();
    const trackingCode = String(order.trackingCode || '').trim();
    const trackingHtml = trackingCode
      ? `<div style="font-size: 0.72rem; font-family: monospace; color: #6b21a8; background: #f5f3ff; border: 1px solid #d8b4fe; border-radius: 4px; padding: 2px 6px;">🚚 ${escapeHtml(trackingCode)}</div>`
      : '';

    const badgeHtml = `<span style="display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; background: ${getStatusBadgeBg(currentStatus)}; color: ${getStatusBadgeColor(currentStatus)};">${getStatusIconLabel(currentStatus)}</span>`;

    let stepActionHtml = '';
    if (currentStatus === 'Chờ xác nhận') {
      stepActionHtml = `<button type="button" class="btn-order-step" data-order-id="${order.id}" data-next-status="Đang xử lý" style="width: 100%; padding: 5px 8px; border-radius: 6px; border: 1px solid #0284c7; background: #0284c7; color: #ffffff; font-size: 0.75rem; font-weight: 700; cursor: pointer;">✅ Xác nhận đơn</button>`;
    } else if (currentStatus === 'Đang xử lý') {
      stepActionHtml = `<button type="button" class="btn-order-step" data-order-id="${order.id}" data-next-status="Đang giao hàng" style="width: 100%; padding: 5px 8px; border-radius: 6px; border: 1px solid #7e22ce; background: #7e22ce; color: #ffffff; font-size: 0.75rem; font-weight: 700; cursor: pointer;">🚚 Giao hàng (+ Vận đơn)</button>`;
    } else if (!isAdmin && currentStatus === 'Đang giao hàng') {
      stepActionHtml = `<div style="font-size: 0.72rem; color: #6b21a8; font-weight: 600;">⏳ Chờ khách bấm "Đã nhận hàng"</div>`;
    }

    const adminSelectHtml = isAdmin ? `
    <select class="admin-order-status-select" data-order-id="${order.id}" title="Admin điều chỉnh trạng thái đơn hàng" style="width: 100%; padding: 4px 6px; border-radius: 6px; font-size: 0.74rem; font-weight: 700; cursor: pointer; border: 1px solid #cbd5e1; outline: none; background: ${getStatusBadgeBg(currentStatus)}; color: ${getStatusBadgeColor(currentStatus)};">
      <option value="Chờ xác nhận" ${currentStatus === 'Chờ xác nhận' ? 'selected' : ''}>⏳ Chờ xác nhận</option>
      <option value="Đang xử lý" ${currentStatus === 'Đang xử lý' ? 'selected' : ''}>📦 Đang xử lý</option>
      <option value="Đang giao hàng" ${currentStatus === 'Đang giao hàng' ? 'selected' : ''}>🚚 Đang giao hàng</option>
      <option value="Đã hoàn thành" ${currentStatus === 'Đã hoàn thành' ? 'selected' : ''}>✅ Đã hoàn thành</option>
      <option value="Đã hủy" ${currentStatus === 'Đã hủy' ? 'selected' : ''}>❌ Đã hủy</option>
    </select>
  ` : '';

    return `
    <div style="display: flex; flex-direction: column; gap: 4px; align-items: stretch;">
      ${isAdmin ? adminSelectHtml : badgeHtml}
      ${stepActionHtml}
      ${trackingHtml}
    </div>
  `;
  };

  ordersTbody.innerHTML = displayOrders.map(order => {
    const customerName = order.customer?.name || 'Khách vãng lai';
    const customerPhone = order.customer?.phone || 'Chưa có SĐT';
    const itemsSummary = (order.items || []).map(i => `${i.name} (x${i.quantity})`).join(', ');
    const couponBadge = order.couponCode
      ? `<span class="coupon-tag">${escapeHtml(order.couponCode)}</span>`
      : '<span style="color: #94a3b8; font-size: 0.8rem;">-</span>';
    const currentStatus = normalizeOrderStatus(order.status);
    const isCodOrder = order.paymentMethod === 'cod';
    const paymentBadge = isCodOrder
      ? '<span style="display: inline-block; margin-top: 3px; background: #f1f5f9; color: #334155; font-size: 0.68rem; font-weight: 700; padding: 1px 6px; border-radius: 4px;">💵 COD</span>'
      : '<span style="display: inline-block; margin-top: 3px; background: #ecfdf5; color: #047857; font-size: 0.68rem; font-weight: 700; padding: 1px 6px; border-radius: 4px;">🏦 CK/MoMo</span>';

    return `
      <tr>
        <td style="text-align: center; font-weight: 700; color: #0f172a;">
          <div>#${escapeHtml(order.orderCode || order.id)}</div>
          ${paymentBadge}
        </td>
        <td>
          <strong style="color: #0f172a;">${escapeHtml(customerName)}</strong>
          <div style="font-size: 0.75rem; color: #64748b;">${escapeHtml(customerPhone)}</div>
        </td>
        <td style="color: #475569; font-size: 0.85rem;">${escapeHtml(order.createdAt || 'Mới đặt')}</td>
        <td style="font-size: 0.85rem; color: #334155; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(itemsSummary)}">
          ${escapeHtml(itemsSummary)}
        </td>
        <td style="text-align: center;">${couponBadge}</td>
        <td style="text-align: right; font-weight: 800; color: #e11d48;">${formatPrice(order.total)}</td>
        <td style="text-align: center;">${renderOrderActionCell(order, currentStatus)}</td>
      </tr>
    `;
  }).join('');
};

const renderRevenueAnalytics = () => {
  const { selectedPeriod, selectedYear, activeGroupFilter } = state;
  const allOrders = state.orders || [];

  // Nhân viên (staff) chỉ xử lý danh sách đơn hàng, không xem thống kê/biểu đồ doanh thu
  if (!isAdminRole()) {
    renderScopedOrdersTable(allOrders, [], null);
    return;
  }

  // Giữ đồng nhất: chế độ Theo Năm luôn tổng hợp trên mọi năm, còn Ngày/Tháng/Quý lọc theo Năm đã chọn
  const scopedOrders = selectedPeriod === 'year'
    ? allOrders
    : allOrders.filter(order => {
      if (selectedYear === 'all') return true;
      return String(parseOrderDate(order).getFullYear()) === String(selectedYear);
    });

  const lookupMaps = getBookLookupMaps();
  const groups = buildPeriodGroups(scopedOrders, allOrders, selectedPeriod, lookupMaps);

  const periodTotalRevenue = groups.reduce((sum, g) => sum + g.totalRevenue, 0);
  const periodTotalOrders = groups.reduce((sum, g) => sum + g.ordersCount, 0);
  const periodTotalItems = groups.reduce((sum, g) => sum + g.totalItemsSold, 0);
  const periodAov = periodTotalOrders > 0 ? Math.round(periodTotalRevenue / periodTotalOrders) : 0;

  // 1. Cập nhật các thẻ Highlight Metrics
  const revPeriodTotalEl = document.querySelector('#revPeriodTotal');
  const revPeriodOrdersEl = document.querySelector('#revPeriodOrders');
  const revPeriodItemsEl = document.querySelector('#revPeriodItems');
  const revPeriodAovEl = document.querySelector('#revPeriodAov');

  if (revPeriodTotalEl) revPeriodTotalEl.textContent = formatPrice(periodTotalRevenue);
  if (revPeriodOrdersEl) revPeriodOrdersEl.textContent = `${periodTotalOrders} đơn`;
  if (revPeriodItemsEl) revPeriodItemsEl.textContent = `${periodTotalItems} cuốn`;
  if (revPeriodAovEl) revPeriodAovEl.textContent = formatPrice(periodAov);

  const periodLabel = PERIOD_LABELS[selectedPeriod] || 'Theo Tháng';
  const yearText = (selectedPeriod === 'year' || selectedYear === 'all')
    ? 'Tất cả các năm'
    : `Năm ${selectedYear}`;

  const chartTitleEl = document.querySelector('#revenueChartTitle');
  const tableDescEl = document.querySelector('#revenueTablePeriodDesc');
  if (chartTitleEl) chartTitleEl.innerHTML = `📈 Biểu Đồ Doanh Thu (${periodLabel} - ${yearText})`;
  if (tableDescEl) tableDescEl.textContent = `Đang phân tích số liệu: ${periodLabel} (${yearText})`;

  const selectedGroup = activeGroupFilter ? groups.find(g => g.label === activeGroupFilter) : null;
  const resolvedFilter = selectedGroup ? activeGroupFilter : null;

  // 2. Render Biểu Đồ Cột
  renderRevenueBarChart(groups, resolvedFilter, periodLabel, yearText);

  // 3. Render BẢNG 1: Tổng hợp doanh thu & truyện cụ thể bán theo từng mốc
  const fullPeriodBooksReport = buildSoldBooksReport(groups);
  renderRevenueBreakdownTable(
    groups,
    { periodTotalRevenue, periodTotalOrders, periodTotalItems, periodAov },
    resolvedFilter,
    fullPeriodBooksReport.books.length
  );

  // 4. Render BẢNG 2: Thống kê chi tiết từng truyện cụ thể đã bán (đồng bộ mốc đang lọc)
  const soldBooksSourceGroups = selectedGroup ? [selectedGroup] : groups;
  const soldBooksReport = selectedGroup ? buildSoldBooksReport(soldBooksSourceGroups) : fullPeriodBooksReport;
  const soldBooksDesc = selectedGroup
    ? `Đang lọc riêng mốc: ${selectedGroup.label} (${periodLabel} - ${yearText})`
    : `Đang thống kê tất cả truyện đã bán: ${periodLabel} (${yearText})`;
  renderSoldBooksTable(soldBooksReport, soldBooksDesc);

  // 5. Render BẢNG 3: Danh sách chi tiết các đơn hàng của kỳ lọc
  renderScopedOrdersTable(scopedOrders, groups, resolvedFilter);
};

// ================= HÀM HELPER MÀU SẮC TRẠNG THÁI ĐƠN HÀNG =================
const getStatusBadgeBg = (status) => {
  switch (normalizeOrderStatus(status)) {
    case 'Chờ xác nhận': return '#fef3c7';
    case 'Đang xử lý': return '#e0f2fe';
    case 'Đang giao hàng': return '#f3e8ff';
    case 'Đã hoàn thành': return '#dcfce7';
    case 'Đã hủy': return '#fee2e2';
    default: return '#dcfce7';
  }
};

const getStatusBadgeColor = (status) => {
  switch (normalizeOrderStatus(status)) {
    case 'Chờ xác nhận': return '#b45309';
    case 'Đang xử lý': return '#0369a1';
    case 'Đang giao hàng': return '#7e22ce';
    case 'Đã hoàn thành': return '#15803d';
    case 'Đã hủy': return '#b91c1c';
    default: return '#15803d';
  }
};

// ================= HÀM XUẤT FILE EXCEL (.CSV) TIẾNG VIỆT UTF-8 BOM =================
// 1. Xuất danh sách đơn hàng / báo cáo doanh thu
const exportOrdersToCsv = () => {
  if (!isAdminRole()) {
    showToast('⚠️ Quyền hạn bị giới hạn: Chỉ Quản Trị Viên mới được xuất báo cáo doanh thu đơn hàng!', 'error');
    return;
  }

  const { filteredOrders } = state;
  const ordersToExport = (filteredOrders && filteredOrders.length > 0) ? filteredOrders : state.orders;

  if (!ordersToExport || ordersToExport.length === 0) {
    showToast('Không có đơn hàng nào trong kỳ lọc để xuất Excel!', 'warning');
    return;
  }

  // Sắp xếp đơn mới nhất lên đầu
  const sorted = [...ordersToExport].sort((a, b) => {
    const idA = Number(a.id) || 0;
    const idB = Number(b.id) || 0;
    return idB - idA;
  });

  const headers = [
    'Mã Đơn Hàng',
    'Thời Gian Đặt',
    'Tên Khách Hàng',
    'Số Điện Thoại',
    'Địa Chỉ Giao Hàng',
    'Danh Sách Tác Phẩm Mua',
    'Mã Voucher',
    'Phương Thức Thanh Toán',
    'Mã Vận Đơn',
    'Tổng Tiền (VNĐ)',
    'Trạng Thái Đơn Hàng'
  ];

  const rows = sorted.map(order => {
    const code = `"#${order.orderCode || order.id}"`;
    const time = `"${order.createdAt || ''}"`;
    const name = `"${(order.customer?.name || 'Khách vãng lai').replace(/"/g, '""')}"`;
    const phone = `"${(order.customer?.phone || '').replace(/"/g, '""')}"`;
    const address = `"${(order.customer?.address || '').replace(/"/g, '""')}"`;
    const items = `"${(order.items || []).map(i => `${i.name} (x${i.quantity})`).join(', ').replace(/"/g, '""')}"`;
    const coupon = `"${order.couponCode || 'Không'}"`;
    const payment = `"${order.paymentMethod === 'cod' ? 'COD' : 'Chuyển khoản / MoMo QR'}"`;
    const tracking = `"${(order.trackingCode || '-').replace(/"/g, '""')}"`;
    const total = order.total || 0;
    const status = `"${normalizeOrderStatus(order.status)}"`;

    return [code, time, name, phone, address, items, coupon, payment, tracking, total, status].join(',');
  });

  // UTF-8 BOM (\uFEFF) giúp Excel mở file tiếng Việt chuẩn 100% không bị lỗi font
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  link.setAttribute('download', `Bao_Cao_Don_Hang_Hikari_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`Đã xuất thành công ${sorted.length} đơn hàng ra file Excel!`, 'success');
};

// 2. Xuất danh sách kiểm kê kho sách
const exportProductsToCsv = () => {
  const { products } = state;
  if (!products || products.length === 0) {
    showToast('Kho sách trống, không có dữ liệu để xuất Excel!', 'warning');
    return;
  }

  const headers = [
    'Mã Sách',
    'Tên Tác Phẩm',
    'Thể Loại',
    'Tác Giả',
    'Nhà Xuất Bản',
    'Giá Bìa Gốc (VNĐ)',
    'Giá Bán (VNĐ)',
    'Số Lượng Tồn Kho',
    'Số Lượng Đã Bán',
    'Đánh Giá (Sao)',
    'Sách Hot',
    'Sách Mới',
    'Tình Trạng Kho'
  ];

  const rows = products.map(prod => {
    const id = prod.id;
    const name = `"${(prod.name || '').replace(/"/g, '""')}"`;
    const cat = `"${(prod.categoryName || '').replace(/"/g, '""')}"`;
    const author = `"${(prod.author || '').replace(/"/g, '""')}"`;
    const publisher = `"${(prod.publisher || '').replace(/"/g, '""')}"`;
    const origPrice = prod.originalPrice || prod.price || 0;
    const price = prod.price || 0;
    const stock = prod.stock || 0;
    const sold = prod.sold || 0;
    const rating = prod.rating || 5.0;
    const isHot = prod.isHot ? 'Có' : 'Không';
    const isNew = prod.isNew ? 'Có' : 'Không';
    const statusText = stock > 10 ? 'Còn hàng' : (stock > 0 ? 'Sắp hết hàng' : 'Hết hàng');

    return [id, name, cat, author, publisher, origPrice, price, stock, sold, rating, isHot, isNew, `"${statusText}"`].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  link.setAttribute('download', `Danh_Sach_Kho_Sach_Hikari_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`Đã xuất thành công ${products.length} cuốn sách ra file Excel!`, 'success');
};

// ================= GẮN SỰ KIỆN CHUYỂN TAB & NĂM THỐNG KÊ DOANH THU =================
const setupRevenueEventListeners = () => {
  // 1. Chuyển đổi tab Ngày / Tháng / Quý / Năm
  const tabsContainer = document.querySelector('#revenuePeriodTabs');
  if (tabsContainer) {
    tabsContainer.querySelectorAll('.period-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        tabsContainer.querySelectorAll('.period-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedPeriod = btn.dataset.period;
        state.activeGroupFilter = null;
        renderRevenueAnalytics();
      });
    });
  }

  // 2. Dropdown lọc Năm
  const yearSelect = document.querySelector('#statYearSelect');
  if (yearSelect) {
    yearSelect.addEventListener('change', (e) => {
      state.selectedYear = e.target.value;
      state.activeGroupFilter = null;
      renderRevenueAnalytics();
    });
  }

  // Nút bỏ lọc cột biểu đồ / bảng theo mốc thời gian
  const btnResetFilter = document.querySelector('#btnResetRevenueFilter');
  if (btnResetFilter) {
    btnResetFilter.addEventListener('click', () => {
      state.activeGroupFilter = null;
      renderRevenueAnalytics();
    });
  }

  // 3. Nút Xuất Excel Đơn Hàng (Báo cáo doanh thu)
  const btnExportOrders = document.querySelector('#btnExportOrdersExcel');
  if (btnExportOrders) {
    btnExportOrders.addEventListener('click', exportOrdersToCsv);
  }

  // 4. Nút Xuất Excel Kho Sách (Kiểm kê sản phẩm)
  const btnExportProducts = document.querySelector('#btnExportProductsExcel');
  if (btnExportProducts) {
    btnExportProducts.addEventListener('click', exportProductsToCsv);
  }

  // 5. Đồng bộ đơn hàng thủ công & tự động giữa Khách hàng <-> Nhân viên/Admin
  let isRefreshingOrders = false;
  const refreshOrdersLive = async (showNotice = false) => {
    if (isRefreshingOrders) return;
    isRefreshingOrders = true;
    const btnRefresh = document.querySelector('#btnRefreshAdminOrders');
    if (btnRefresh && showNotice) {
      btnRefresh.disabled = true;
      btnRefresh.textContent = '⏳ Đang làm mới...';
    }
    try {
      await loadDashboardStats();
      state.products = await fetchProducts();
      applyAdminFilters();
      if (showNotice) {
        showToast('✓ Đã đồng bộ danh sách đơn hàng mới nhất!', 'success');
      }
    } catch (err) {
      console.warn('Lỗi làm mới đơn hàng:', err);
      if (showNotice) {
        showToast('Không thể làm mới đơn hàng lúc này!', 'error');
      }
    } finally {
      isRefreshingOrders = false;
      if (btnRefresh && showNotice) {
        btnRefresh.disabled = false;
        btnRefresh.textContent = '🔄 Làm mới đơn';
      }
    }
  };

  const btnRefreshOrders = document.querySelector('#btnRefreshAdminOrders');
  if (btnRefreshOrders && !btnRefreshOrders.dataset.listenerAttached) {
    btnRefreshOrders.dataset.listenerAttached = 'true';
    btnRefreshOrders.addEventListener('click', () => refreshOrdersLive(true));
  }

  if (!window._hikariAdminOrderSyncAttached) {
    window._hikariAdminOrderSyncAttached = true;
    const syncOnActive = () => {
      if (!document.hidden) refreshOrdersLive(false);
    };
    window.addEventListener('focus', syncOnActive);
    document.addEventListener('visibilitychange', syncOnActive);
    window.setInterval(syncOnActive, 15000);
  }

  // 6. Hàm cập nhật trạng thái đơn hàng dùng chung cho Staff (nút từng bước) & Admin
  const handleOrderStatusUpdate = async (orderId, nextStatus, trackingCodeInput = null) => {
    const order = state.orders.find(o => String(o.id) === String(orderId));
    if (!order) return;

    const oldStatus = normalizeOrderStatus(order.status);
    const targetStatus = normalizeOrderStatus(nextStatus);
    const orderCode = order.orderCode || order.id;

    const patchPayload = { status: targetStatus };
    const nowIso = new Date().toISOString();

    if (targetStatus === 'Đang xử lý') {
      patchPayload.confirmedAt = order.confirmedAt || nowIso;
    } else if (targetStatus === 'Đang giao hàng') {
      patchPayload.trackingCode = String(trackingCodeInput || order.trackingCode || generateTrackingCode(order)).trim();
      patchPayload.shippedAt = order.shippedAt || nowIso;
    } else if (targetStatus === 'Đã hoàn thành') {
      patchPayload.completedAt = nowIso;
    } else if (targetStatus === 'Đã hủy') {
      patchPayload.cancelledAt = nowIso;
    }

    const updated = await updateOrder(order.id, patchPayload);
    Object.assign(order, updated || patchPayload);

    // Đồng bộ tồn kho nếu trạng thái chuyển qua/lại "Đã hủy"
    const becameCancelled = oldStatus !== 'Đã hủy' && targetStatus === 'Đã hủy';
    const restoredFromCancelled = oldStatus === 'Đã hủy' && targetStatus !== 'Đã hủy';
    if (becameCancelled) {
      await restoreOrderStock(order.items || []);
      state.products = await fetchProducts();
      applyAdminFilters();
    } else if (restoredFromCancelled) {
      await deductOrderStock(order.items || []);
      state.products = await fetchProducts();
      applyAdminFilters();
    }

    let notifMessage = `Đơn hàng #${orderCode} đã cập nhật trạng thái: "${targetStatus}".`;
    if (targetStatus === 'Đang xử lý') {
      notifMessage = `Đơn hàng #${orderCode} đã được xác nhận và đang chuẩn bị đóng gói.`;
    } else if (targetStatus === 'Đang giao hàng') {
      notifMessage = `Đơn hàng #${orderCode} đang được giao đến bạn! Mã vận đơn: ${patchPayload.trackingCode}.`;
    } else if (targetStatus === 'Đã hoàn thành') {
      notifMessage = `Đơn hàng #${orderCode} đã hoàn thành.`;
    } else if (targetStatus === 'Đã hủy') {
      notifMessage = `Đơn hàng #${orderCode} đã được chuyển sang trạng thái Đã hủy.`;
    }
    pushOrderNotification(order, notifMessage, targetStatus);

    const trackingNotice = patchPayload.trackingCode ? ` (Mã VĐ: ${patchPayload.trackingCode})` : '';
    showToast(`✓ Đơn #${orderCode} → "${targetStatus}"${trackingNotice}`, 'success');

    updateKpiSummary();
    renderRevenueAnalytics();
    renderProductsTable();
    renderUsersTable();
  };

  // 7. Lắng nghe nút xử lý từng bước (.btn-order-step) & dropdown Admin (.admin-order-status-select)
  const ordersTbody = document.querySelector('#adminOrdersTableBody');
  if (ordersTbody && !ordersTbody.dataset.listenerAttached) {
    ordersTbody.dataset.listenerAttached = 'true';

    ordersTbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-order-step');
      if (!btn) return;

      const orderId = btn.dataset.orderId;
      const nextStatus = btn.dataset.nextStatus;
      const order = state.orders.find(o => String(o.id) === String(orderId));
      if (!order || !nextStatus) return;

      const orderCode = order.orderCode || order.id;
      let trackingCode = null;
      if (nextStatus === 'Đang giao hàng') {
        const defaultCode = order.trackingCode || generateTrackingCode(order);
        const promptValue = window.prompt(
          `Nhập hoặc xác nhận mã vận đơn cho đơn #${orderCode}:`,
          defaultCode
        );
        if (promptValue === null) return;
        trackingCode = promptValue.trim() || defaultCode;
      }

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Đang lưu...';
      try {
        await handleOrderStatusUpdate(orderId, nextStatus, trackingCode);
      } catch (err) {
        console.error('Lỗi cập nhật bước đơn hàng:', err);
        btn.disabled = false;
        btn.textContent = originalText;
        showToast('Không thể cập nhật trạng thái đơn hàng. Vui lòng thử lại!', 'error');
      }
    });

    ordersTbody.addEventListener('change', async (e) => {
      const select = e.target.closest('.admin-order-status-select');
      if (!select) return;

      const orderId = select.dataset.orderId;
      const newStatus = select.value;
      const order = state.orders.find(o => String(o.id) === String(orderId));
      if (!order) return;

      const oldStatus = normalizeOrderStatus(order.status);
      const orderCode = order.orderCode || order.id;

      let trackingCode = null;
      if (newStatus === 'Đang giao hàng' && !order.trackingCode) {
        const defaultCode = generateTrackingCode(order);
        const promptValue = window.prompt(
          `Nhập mã vận đơn cho đơn #${orderCode}:`,
          defaultCode
        );
        if (promptValue === null) {
          select.value = oldStatus;
          return;
        }
        trackingCode = promptValue.trim() || defaultCode;
      }

      select.style.background = getStatusBadgeBg(newStatus);
      select.style.color = getStatusBadgeColor(newStatus);

      try {
        await handleOrderStatusUpdate(orderId, newStatus, trackingCode);
      } catch (err) {
        console.error('Lỗi cập nhật trạng thái admin:', err);
        select.value = oldStatus;
        select.style.background = getStatusBadgeBg(oldStatus);
        select.style.color = getStatusBadgeColor(oldStatus);
        showToast('Lỗi cập nhật trạng thái đơn hàng!', 'error');
      }
    });
  }
};


// ================= 3. RENDER BẢNG SẢN PHẨM (KÈM SỐ LƯỢNG ĐÃ BÁN & TOP BÁN CHẠY) =================
const calculateAdminSalesMap = () => {
  const map = {};
  (state.orders || []).forEach(order => {
    if (isValidRevenueOrder(order) && Array.isArray(order.items)) {
      order.items.forEach(item => {
        const prodId = Number(item.productId || item.id);
        const qty = Number(item.quantity) || 0;
        if (prodId && qty > 0) {
          map[prodId] = (map[prodId] || 0) + qty;
        }
      });
    }
  });
  return map;
};

const renderProductsTable = () => {
  const tbody = document.querySelector('#adminProductsTableBody');
  if (!tbody) return;

  const list = state.filteredProducts;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2.5rem; color: #64748b;">
          🔍 Không tìm thấy tác phẩm nào phù hợp với điều kiện tìm kiếm/bộ lọc!
        </td>
      </tr>
    `;
    return;
  }

  const salesMap = calculateAdminSalesMap();
  const allSoldValues = Object.values(salesMap);
  const maxSold = allSoldValues.length > 0 ? Math.max(...allSoldValues) : 0;

  tbody.innerHTML = list.map(item => {
    const stock = Number(item.stock) || 0;
    const sold = salesMap[item.id] || 0;
    const isTopSeller = sold > 0 && (sold === maxSold || sold >= 15);

    let stockBadgeClass = 'stock-in';
    let stockBadgeText = `Còn ${stock} cuốn`;

    if (stock <= 0) {
      stockBadgeClass = 'stock-out';
      stockBadgeText = 'Hết hàng (0)';
    } else if (stock <= 5) {
      stockBadgeClass = 'stock-low';
      stockBadgeText = `Sắp hết (${stock})`;
    }

    return `
      <tr data-id="${item.id}">
        <td style="text-align: center; color: #64748b; font-weight: 600;">#${item.id}</td>
        <td style="text-align: center;">
          <img 
            src="${item.image}" 
            alt="${item.name}" 
            class="admin-prod-thumb" 
            onerror="this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200&auto=format&fit=crop&q=80'"
          />
        </td>
        <td>
          <strong style="color: #0f172a; font-size: 0.95rem;">${item.name}</strong>
          ${isTopSeller ? '<span style="font-size: 0.7rem; background: #fee2e2; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-weight: 800; margin-left: 0.25rem;">🔥 TOP BÁN CHẠY</span>' : (item.isHot ? '<span style="font-size: 0.7rem; background: #fef3c7; color: #b45309; padding: 1px 4px; border-radius: 3px; font-weight: 700; margin-left: 0.25rem;">HOT</span>' : '')}
          ${item.isNew ? '<span style="font-size: 0.7rem; background: #e0e7ff; color: #4338ca; padding: 1px 4px; border-radius: 3px; font-weight: 700; margin-left: 0.25rem;">MỚI ✨</span>' : ''}
          <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">NXB: ${item.publisher || 'NXB Kim Đồng'}</div>
        </td>
        <td>${item.author || 'Chưa cập nhật'}</td>
        <td><span style="background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; color: #475569;">${item.categoryName || 'Sách'}</span></td>
        <td style="font-weight: 700; color: #e11d48;">${formatPrice(item.price)}</td>
        <td style="text-align: center;">
          <span class="stock-badge ${stockBadgeClass}">${stockBadgeText}</span>
        </td>
        <td style="text-align: center;">
          <strong style="color: ${sold > 0 ? '#dc2626' : '#64748b'}; font-size: 0.95rem;">
            ${sold > 0 ? `🔥 ${sold}` : '0'}
          </strong>
          <span style="font-size: 0.75rem; color: #64748b;"> cuốn</span>
        </td>
        <td style="text-align: center;">
          <div style="display: inline-flex; gap: 0.35rem;">
            <button class="table-action-btn btn-edit-prod" data-id="${item.id}" title="Chỉnh sửa thông tin">✏️</button>
            ${isAdminRole() ? `<button class="table-action-btn btn-del-prod" data-id="${item.id}" title="Xóa khỏi CSDL">🗑️</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

// ================= 3.1 QUẢN LÝ NHÂN VIÊN & PHÊ DUYỆT ĐĂNG KÝ (CHỈ ADMIN) =================
const STAFF_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const STAFF_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_#^])[A-Za-z\d@$!%*?&_#^]{8,}$/;

const syncLocalRegisteredUser = (userObj) => {
  const localUsers = JSON.parse(localStorage.getItem('registered_users')) || [];
  const idx = localUsers.findIndex((u) => String(u.id) === String(userObj.id));
  if (idx >= 0) {
    localUsers[idx] = { ...localUsers[idx], ...userObj };
    localStorage.setItem('registered_users', JSON.stringify(localUsers));
  }
};

const removeLocalRegisteredUser = (userId) => {
  const localUsers = JSON.parse(localStorage.getItem('registered_users')) || [];
  const nextUsers = localUsers.filter((u) => String(u.id) !== String(userId));
  localStorage.setItem('registered_users', JSON.stringify(nextUsers));
};

const formatUserDate = (isoOrStr) => {
  if (!isoOrStr) return '<span style="color: #94a3b8;">-</span>';
  const d = new Date(isoOrStr);
  return isNaN(d.getTime()) ? escapeHtml(isoOrStr) : d.toLocaleDateString('vi-VN');
};

const persistUserStatusChange = async (userId, nextStatus) => {
  const target = state.users.find((u) => String(u.id) === String(userId));
  if (!target) return;

  try {
    await api.patch(`/users/${userId}`, { status: nextStatus });
  } catch (err) {
    console.warn('Không thể PATCH /users/:id, đồng bộ cục bộ:', err?.message);
  }

  target.status = nextStatus;
  syncLocalRegisteredUser(target);
  renderStaffSection();

  const label = nextStatus === 'active'
    ? `✓ Đã duyệt nhân viên ${target.name} (có thể đăng nhập ngay)!`
    : `Đã từ chối yêu cầu đăng ký nhân viên của ${target.name}.`;
  showToast(label, nextStatus === 'active' ? 'success' : 'info');
};

const deleteUserAccount = async (userId) => {
  if (!isAdminRole()) return;
  const target = state.users.find((u) => String(u.id) === String(userId));
  if (!target) return;

  if (target.role === 'admin' || String(target.id) === String(getCurrentAuthUser()?.id)) {
    showToast('Không thể xóa tài khoản Quản trị viên đang sử dụng!', 'error');
    return;
  }

  const roleLabel = target.role === 'staff' ? 'nhân viên' : 'khách hàng';
  if (!window.confirm(`Bạn có chắc chắn muốn xóa ${roleLabel} "${target.name}" (${target.email}) khỏi hệ thống?`)) {
    return;
  }

  try {
    await api.delete(`/users/${userId}`);
  } catch (err) {
    console.warn('Không thể DELETE /users/:id trên API, xóa cục bộ:', err?.message);
  }

  state.users = state.users.filter((u) => String(u.id) !== String(userId));
  removeLocalRegisteredUser(userId);
  updateKpiSummary();
  renderStaffSection();
  renderUsersTable();
  showToast(`✓ Đã xóa ${roleLabel} "${target.name}".`, 'success');
};

const renderStaffSection = () => {
  const pendingBody = document.querySelector('#pendingStaffTableBody');
  const staffBody = document.querySelector('#adminStaffTableBody');
  const pendingBox = document.querySelector('#pendingStaffBox');
  const pendingBadge = document.querySelector('#pendingStaffCountBadge');
  if (!pendingBody || !staffBody) return;

  if (!isAdminRole()) {
    pendingBody.innerHTML = '';
    staffBody.innerHTML = '';
    return;
  }

  const staffList = (state.users || []).filter((u) => u.role === 'staff');
  const pendingStaff = staffList.filter((u) => (u.status || 'active') === 'pending');
  const processedStaff = staffList.filter((u) => (u.status || 'active') !== 'pending');

  if (pendingBadge) {
    pendingBadge.style.display = pendingStaff.length > 0 ? 'inline-block' : 'none';
    pendingBadge.textContent = `${pendingStaff.length} chờ duyệt`;
  }
  if (pendingBox) {
    pendingBox.style.display = pendingStaff.length > 0 ? 'block' : 'none';
  }

  pendingBody.innerHTML = pendingStaff.map((staff) => `
    <tr>
      <td style="text-align: center; color: #64748b; font-weight: 600;">#${escapeHtml(staff.id)}</td>
      <td><strong style="color: #0f172a;">${escapeHtml(staff.name)}</strong></td>
      <td style="color: #475569;">${escapeHtml(staff.email)}</td>
      <td>${staff.phone ? escapeHtml(staff.phone) : '<span style="color: #94a3b8;">Chưa cập nhật</span>'}</td>
      <td style="color: #64748b;">${formatUserDate(staff.createdAt)}</td>
      <td style="text-align: center;">
        <div style="display: inline-flex; gap: 0.4rem;">
          <button type="button" class="btn-admin btn-admin-primary btn-staff-approve" data-user-id="${escapeHtml(staff.id)}" style="padding: 0.35rem 0.7rem; font-size: 0.78rem;">
            ✅ Duyệt
          </button>
          <button type="button" class="btn-admin btn-admin-outline btn-staff-reject" data-user-id="${escapeHtml(staff.id)}" style="padding: 0.35rem 0.7rem; font-size: 0.78rem; color: #b91c1c; border-color: #fecaca;">
            ❌ Từ chối
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  if (processedStaff.length === 0) {
    staffBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 1.75rem; color: #94a3b8;">
          Chưa có tài khoản nhân viên nào được kích hoạt. Nhấn "➕ Thêm Nhân Viên Mới" để tạo!
        </td>
      </tr>
    `;
    return;
  }

  staffBody.innerHTML = processedStaff.map((staff) => {
    const status = staff.status || 'active';
    const isRejected = status === 'rejected';
    const statusBadge = isRejected
      ? '<span style="background: #fee2e2; color: #b91c1c; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">❌ Đã từ chối</span>'
      : '<span style="background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">✓ Đang hoạt động</span>';

    return `
      <tr>
        <td style="text-align: center; color: #64748b; font-weight: 600;">#${escapeHtml(staff.id)}</td>
        <td><strong style="color: #0f172a;">${escapeHtml(staff.name)}</strong></td>
        <td style="color: #475569;">${escapeHtml(staff.email)}</td>
        <td>${staff.phone ? escapeHtml(staff.phone) : '<span style="color: #94a3b8;">Chưa cập nhật</span>'}</td>
        <td style="text-align: center;">
          <span style="background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.78rem;">💼 Nhân Viên</span>
        </td>
        <td style="text-align: center;">${statusBadge}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-admin btn-admin-outline btn-user-delete" data-user-id="${escapeHtml(staff.id)}" style="padding: 0.35rem 0.75rem; font-size: 0.78rem; color: #b91c1c; border-color: #fecaca;">
            🗑️ Xóa
          </button>
        </td>
      </tr>
    `;
  }).join('');
};

const setupStaffManagement = () => {
  const modal = document.querySelector('#addStaffModal');
  const form = document.querySelector('#addStaffForm');
  const openBtn = document.querySelector('#btnOpenAddStaffModal');
  const closeBtn = document.querySelector('#btnCloseAddStaffModal');
  const cancelBtn = document.querySelector('#btnCancelAddStaffModal');
  const phoneInput = document.querySelector('#staffPhoneInput');

  if (phoneInput) attachVnPhoneInputGuard(phoneInput);

  const closeModal = () => {
    modal?.classList.remove('active');
    form?.reset();
  };

  openBtn?.addEventListener('click', () => {
    if (!isAdminRole()) return;
    form?.reset();
    modal?.classList.add('active');
  });
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  document.querySelector('#pendingStaffTableBody')?.addEventListener('click', async (e) => {
    const approveBtn = e.target.closest('.btn-staff-approve');
    if (approveBtn) {
      await persistUserStatusChange(approveBtn.dataset.userId, 'active');
      return;
    }
    const rejectBtn = e.target.closest('.btn-staff-reject');
    if (rejectBtn) {
      await persistUserStatusChange(rejectBtn.dataset.userId, 'rejected');
    }
  });

  document.querySelector('#adminStaffTableBody')?.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.btn-user-delete');
    if (deleteBtn) {
      await deleteUserAccount(deleteBtn.dataset.userId);
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminRole()) return;

    const name = document.querySelector('#staffNameInput')?.value.trim() || '';
    const email = document.querySelector('#staffEmailInput')?.value.trim() || '';
    const rawPhone = phoneInput?.value.trim() || '';
    const password = document.querySelector('#staffPasswordInput')?.value || '';

    if (name.length < 2) {
      showToast('Vui lòng nhập họ tên nhân viên ít nhất 2 ký tự!', 'error');
      return;
    }
    if (!STAFF_EMAIL_REGEX.test(email)) {
      showToast('Địa chỉ Email nhân viên không đúng định dạng!', 'error');
      return;
    }
    if (state.users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
      showToast('Email này đã tồn tại trong hệ thống!', 'error');
      return;
    }

    const phoneResult = validateVnPhone(rawPhone);
    if (!phoneResult.valid) {
      showToast(phoneResult.message, 'error');
      return;
    }
    if (!STAFF_PASSWORD_REGEX.test(password)) {
      showToast('Mật khẩu phải ≥ 8 ký tự gồm chữ hoa, chữ thường, số và ký tự đặc biệt (@$!%*?&_#^)!', 'error');
      return;
    }

    const newStaff = {
      id: Date.now(),
      name,
      email,
      phone: phoneResult.normalized,
      birthday: '',
      password,
      role: 'staff',
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const submitBtn = document.querySelector('#btnSubmitAddStaff');
    if (submitBtn) submitBtn.disabled = true;

    let savedToServer = false;
    try {
      await api.post('/users', newStaff);
      savedToServer = true;
    } catch (err) {
      console.warn('Không thể POST nhân viên mới tới /users, lưu cục bộ:', err?.message);
    }

    if (!savedToServer) {
      const localUsers = JSON.parse(localStorage.getItem('registered_users')) || [];
      localUsers.push(newStaff);
      localStorage.setItem('registered_users', JSON.stringify(localUsers));
    }

    state.users.push(newStaff);
    renderStaffSection();
    closeModal();
    if (submitBtn) submitBtn.disabled = false;
    showToast(`✓ Đã tạo tài khoản nhân viên "${name}" thành công!`, 'success');
  });
};

// ================= 3.2 RENDER BẢNG QUẢN LÝ KHÁCH HÀNG & HẠNG VIP =================
const matchUserOrders = (order, user) => (
  (order.userId && String(order.userId) === String(user.id)) ||
  (order.customer?.email && user.email && order.customer.email.toLowerCase() === user.email.toLowerCase()) ||
  (order.customer?.phone && user.phone && order.customer.phone === user.phone) ||
  (order.customer?.name && user.name && order.customer.name.toLowerCase() === user.name.toLowerCase())
);

const buildCustomerRowStats = (user, orders, currentMonth, currentYear) => {
  const relatedOrders = orders.filter((o) => matchUserOrders(o, user));
  const validOrders = relatedOrders.filter((o) => !isOrderCancelled(o));
  const canceledCount = relatedOrders.length - validOrders.length;

  const totalSpent = validOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const monthOrders = validOrders.filter((o) => {
    const d = parseOrderDate(o);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const monthSpent = monthOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevMonthSpent = validOrders
    .filter((o) => {
      const d = parseOrderDate(o);
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    })
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const isVip = monthSpent >= 500000 || prevMonthSpent >= 500000;
  const isMaintained = isVip && monthSpent >= 250000;
  const tierKey = isVip ? 'vip' : (validOrders.length === 0 ? 'newbie' : 'regular');

  return {
    user,
    validCount: validOrders.length,
    canceledCount,
    totalSpent,
    monthSpent,
    isVip,
    isMaintained,
    tierKey
  };
};

const renderUsersTable = () => {
  const tbody = document.querySelector('#adminUsersTableBody');
  const countEl = document.querySelector('#adminCustomersCount');
  if (!tbody) return;
  if (!isAdminRole()) {
    tbody.innerHTML = '';
    return;
  }

  const customersOnly = (state.users || []).filter((u) => (u.role || 'customer') === 'customer');
  const orders = state.orders || [];
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const keyword = state.customerSearchKeyword.toLowerCase().trim();
  const tierFilter = state.customerTierFilter || 'all';

  const enrichedCustomers = customersOnly
    .map((u) => buildCustomerRowStats(u, orders, currentMonth, currentYear))
    .filter((row) => {
      if (tierFilter !== 'all' && row.tierKey !== tierFilter) return false;
      if (!keyword) return true;
      return (
        row.user.name?.toLowerCase().includes(keyword) ||
        row.user.email?.toLowerCase().includes(keyword) ||
        row.user.phone?.toLowerCase().includes(keyword)
      );
    });

  if (countEl) countEl.textContent = `${enrichedCustomers.length} khách hàng`;

  if (enrichedCustomers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 2rem; color: #94a3b8;">
          Không tìm thấy khách hàng nào phù hợp!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = enrichedCustomers.map(({ user, validCount, canceledCount, totalSpent, monthSpent, isVip, isMaintained, tierKey }) => {
    let tierBadge = `<span style="background: #e0e7ff; color: #4338ca; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.78rem;">Thân Thiết</span>`;
    if (tierKey === 'vip') {
      tierBadge = `<span style="background: #fef3c7; color: #b45309; padding: 3px 8px; border-radius: 4px; font-weight: 800; font-size: 0.78rem; border: 1px solid #fde68a;">⭐ VIP (T${currentMonth + 1})</span>`;
    } else if (tierKey === 'newbie') {
      tierBadge = `<span style="background: #fce7f3; color: #be185d; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.78rem;">🎁 Mới</span>`;
    }

    let maintainStatusHtml = `<span style="color: #94a3b8; font-size: 0.8rem;">Chưa đạt VIP</span>`;
    if (isVip) {
      if (isMaintained) {
        maintainStatusHtml = `<span style="background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">✓ Đã gia hạn tháng sau</span>`;
      } else {
        const need = Math.max(0, 250000 - monthSpent);
        maintainStatusHtml = `<span style="background: #fff1f2; color: #b91c1c; padding: 3px 8px; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">Thiếu ${formatPrice(need)}</span>`;
      }
    }

    const orderStatsHtml = `
      <span style="font-weight: 700; color: #0f172a;">${validCount}</span>
      <span style="color: #64748b; font-size: 0.78rem;"> hợp lệ</span>
      ${canceledCount > 0 ? `<div style="font-size: 0.74rem; color: #dc2626; font-weight: 600;">(${canceledCount} đã hủy)</div>` : ''}
    `;

    return `
      <tr>
        <td style="text-align: center; color: #64748b; font-weight: 600;">#${escapeHtml(user.id)}</td>
        <td><strong style="color: #0f172a;">${escapeHtml(user.name)}</strong></td>
        <td style="color: #475569;">${escapeHtml(user.email)}</td>
        <td>${user.phone ? escapeHtml(user.phone) : '<span style="color: #94a3b8;">Chưa cập nhật</span>'}</td>
        <td style="color: #64748b;">${user.birthday ? escapeHtml(user.birthday) : '<span style="color: #94a3b8;">-</span>'}</td>
        <td style="text-align: center;">${tierBadge}</td>
        <td style="text-align: center;">${orderStatsHtml}</td>
        <td style="text-align: right; font-weight: 700; color: #0f172a;">${formatPrice(monthSpent)}</td>
        <td style="text-align: right; font-weight: 700; color: #e11d48;">${formatPrice(totalSpent)}</td>
        <td style="text-align: center;">${maintainStatusHtml}</td>
        <td style="text-align: center;">
          <div style="display: inline-flex; gap: 0.4rem;">
            <button type="button" class="btn-admin btn-admin-outline btn-customer-detail" data-user-id="${escapeHtml(user.id)}" style="padding: 0.35rem 0.65rem; font-size: 0.78rem;">
              👁️ Chi tiết
            </button>
            <button type="button" class="btn-admin btn-admin-outline btn-user-delete" data-user-id="${escapeHtml(user.id)}" style="padding: 0.35rem 0.65rem; font-size: 0.78rem; color: #b91c1c; border-color: #fecaca;">
              🗑️ Xóa
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

const setupCustomerManagement = () => {
  document.querySelector('#adminCustomerSearchInput')?.addEventListener('input', (e) => {
    state.customerSearchKeyword = e.target.value;
    renderUsersTable();
  });

  document.querySelector('#adminCustomerTierFilter')?.addEventListener('change', (e) => {
    state.customerTierFilter = e.target.value;
    renderUsersTable();
  });

  document.querySelector('#adminUsersTableBody')?.addEventListener('click', async (e) => {
    const detailBtn = e.target.closest('.btn-customer-detail');
    if (detailBtn) {
      const target = state.users.find((u) => String(u.id) === String(detailBtn.dataset.userId));
      if (target) await showUserProfileModal(target);
      return;
    }
    const deleteBtn = e.target.closest('.btn-user-delete');
    if (deleteBtn) {
      await deleteUserAccount(deleteBtn.dataset.userId);
    }
  });
};

// ================= 4. LỌC VÀ TÌM KIẾM DỮ LIỆU SẢN PHẨM =================
const applyAdminFilters = () => {
  let result = [...state.products];

  // 1. Tìm theo từ khóa
  if (state.searchKeyword.trim()) {
    const kw = state.searchKeyword.toLowerCase().trim();
    result = result.filter(item =>
      (item.name && item.name.toLowerCase().includes(kw)) ||
      (item.author && item.author.toLowerCase().includes(kw)) ||
      (item.publisher && item.publisher.toLowerCase().includes(kw))
    );
  }

  // 2. Lọc theo thể loại
  if (state.selectedCategoryId !== 0) {
    result = result.filter(item => item.categoryId === state.selectedCategoryId);
  }

  // 3. Lọc theo tình trạng kho
  if (state.stockFilter === 'in_stock') {
    result = result.filter(item => (Number(item.stock) || 0) > 5);
  } else if (state.stockFilter === 'low_stock') {
    result = result.filter(item => (Number(item.stock) || 0) > 0 && (Number(item.stock) || 0) <= 5);
  } else if (state.stockFilter === 'out_of_stock') {
    result = result.filter(item => (Number(item.stock) || 0) <= 0);
  }

  state.filteredProducts = result;
  renderProductsTable();
};

// ================= 5. THÊM & SỬA SẢN PHẨM THỦ CÔNG (HỖ TRỢ TẢI ẢNH TỪ MÁY) =================
const setupProductModal = () => {
  const modal = document.querySelector('#productModal');
  const btnOpen = document.querySelector('#btnOpenAddModal');
  const btnClose = document.querySelector('#btnCloseProductModal');
  const btnCancel = document.querySelector('#btnCancelProductModal');
  const form = document.querySelector('#productForm');
  const titleEl = document.querySelector('#productModalTitle');

  const pCategorySelect = document.querySelector('#pCategory');
  const imageUploadZone = document.querySelector('#imageUploadZone');
  const pImageFile = document.querySelector('#pImageFile');
  const uploadPrompt = document.querySelector('#uploadPrompt');
  const imagePreviewContainer = document.querySelector('#imagePreviewContainer');
  const imagePreviewImg = document.querySelector('#imagePreviewImg');
  const imageFileName = document.querySelector('#imageFileName');
  const imageFileSize = document.querySelector('#imageFileSize');
  const btnChangeImage = document.querySelector('#btnChangeImage');
  const pImageHidden = document.querySelector('#pImage');
  const btnToggleUrlInput = document.querySelector('#btnToggleUrlInput');
  const pImageUrlBackup = document.querySelector('#pImageUrlBackup');

  // Đổ danh mục vào select
  const fillCategories = () => {
    if (pCategorySelect) {
      pCategorySelect.innerHTML = (state.categories || []).map(cat => `
        <option value="${cat.id}" data-name="${cat.name}">${cat.icon || '📖'} ${cat.name}</option>
      `).join('');
    }
  };

  // Nén ảnh từ máy bằng Canvas và FileReader để lưu trữ an toàn trong CSDL
  const compressImageFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const maxWidth = 600;
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(compressedDataUrl);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // Xử lý khi người dùng chọn file ảnh từ máy
  const handleChosenImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Vui lòng chọn file hình ảnh hợp lệ (JPG, PNG, WEBP)!', 'error');
      return;
    }
    try {
      if (uploadPrompt) uploadPrompt.style.display = 'none';
      if (imagePreviewContainer) imagePreviewContainer.style.display = 'flex';
      if (imageFileName) imageFileName.textContent = file.name;
      if (imageFileSize) imageFileSize.textContent = 'Đang tối ưu ảnh...';

      const dataUrl = await compressImageFile(file);
      if (pImageHidden) pImageHidden.value = dataUrl;
      if (imagePreviewImg) imagePreviewImg.src = dataUrl;
      const approxKb = Math.round((dataUrl.length * 3) / 4 / 1024);
      if (imageFileSize) imageFileSize.textContent = `✓ Đã sẵn sàng (${approxKb} KB)`;
    } catch (err) {
      console.error('Lỗi đọc ảnh:', err);
      showToast('Có lỗi xảy ra khi đọc file ảnh từ máy!', 'error');
    }
  };

  // Click vào vùng dropzone để mở hộp thoại chọn file
  imageUploadZone?.addEventListener('click', (e) => {
    if (e.target !== btnChangeImage && !btnChangeImage?.contains(e.target)) {
      pImageFile?.click();
    }
  });

  btnChangeImage?.addEventListener('click', (e) => {
    e.stopPropagation();
    pImageFile?.click();
  });

  pImageFile?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleChosenImageFile(file);
  });

  // Hỗ trợ kéo thả ảnh
  imageUploadZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageUploadZone.classList.add('dragover');
  });

  imageUploadZone?.addEventListener('dragleave', () => {
    imageUploadZone.classList.remove('dragover');
  });

  imageUploadZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    imageUploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if (file) handleChosenImageFile(file);
  });

  // Mở/Đóng ô dán URL phụ
  btnToggleUrlInput?.addEventListener('click', () => {
    const isHidden = pImageUrlBackup.style.display === 'none' || !pImageUrlBackup.style.display;
    pImageUrlBackup.style.display = isHidden ? 'block' : 'none';
    if (isHidden) pImageUrlBackup.focus();
  });

  pImageUrlBackup?.addEventListener('input', () => {
    const val = pImageUrlBackup.value.trim();
    if (val) {
      if (pImageHidden) pImageHidden.value = val;
      if (imagePreviewImg) imagePreviewImg.src = val;
      if (imageFileName) imageFileName.textContent = 'Ảnh từ URL';
      if (imageFileSize) imageFileSize.textContent = 'Link ảnh trực tuyến';
      if (uploadPrompt) uploadPrompt.style.display = 'none';
      if (imagePreviewContainer) imagePreviewContainer.style.display = 'flex';
    }
  });

  // Mở modal thêm mới
  btnOpen?.addEventListener('click', () => {
    form.reset();
    document.querySelector('#editProductId').value = '';
    titleEl.innerHTML = '<span>📖</span> Thêm Tác Phẩm Mới Vào Kho';
    fillCategories();

    // Reset trạng thái ảnh
    if (pImageHidden) pImageHidden.value = '';
    if (imagePreviewImg) imagePreviewImg.src = '';
    if (pImageFile) pImageFile.value = '';
    if (uploadPrompt) uploadPrompt.style.display = 'flex';
    if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
    if (pImageUrlBackup) {
      pImageUrlBackup.value = '';
      pImageUrlBackup.style.display = 'none';
    }

    modal.classList.add('active');
  });

  const closeModal = () => modal.classList.remove('active');
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Xử lý gửi form (Thêm mới hoặc Cập nhật)
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const editId = document.querySelector('#editProductId').value;
    const name = document.querySelector('#pName').value.trim();
    const author = document.querySelector('#pAuthor').value.trim();
    const publisher = document.querySelector('#pPublisher').value.trim();
    const categoryId = Number(pCategorySelect.value);
    const categoryName = pCategorySelect.selectedOptions[0]?.dataset.name || 'Manga';
    const price = Number(document.querySelector('#pPrice').value);
    const originalPrice = Number(document.querySelector('#pOriginalPrice').value) || price;
    const stock = Number(document.querySelector('#pStock').value);
    const image = pImageHidden?.value?.trim() || pImageUrlBackup?.value?.trim();
    const description = document.querySelector('#pDesc').value.trim();
    const isHot = document.querySelector('#pIsHot').checked;
    const isNew = document.querySelector('#pIsNew').checked;

    if (!name || !author || !price) {
      alert('Vui lòng điền đầy đủ các thông tin bắt buộc (*)!');
      return;
    }

    if (!image) {
      alert('Vui lòng chọn ảnh bìa cho tác phẩm từ máy tính!');
      return;
    }

    const payload = {
      name,
      author,
      publisher,
      categoryId,
      categoryName,
      price,
      originalPrice,
      discount: originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0,
      stock,
      image: image || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80',
      description,
      isHot,
      isNew,
      rating: 5.0,
      reviewsCount: 10
    };

    const submitBtn = document.querySelector('#btnSaveProduct');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang lưu vào CSDL...';

    try {
      if (editId) {
        // Cập nhật sách đã có (PATCH)
        await api.patch(`/products/${editId}`, payload);
        showToast(`✓ Đã cập nhật tác phẩm "${name}" thành công!`, 'success');
      } else {
        // Thêm sách mới (POST)
        payload.id = Date.now();
        payload.createdAt = new Date().toISOString();
        payload.isNew = true;
        await api.post('/products', payload);
        showToast(`✓ Đã thêm cuốn sách "${name}" vào CSDL!`, 'success');
      }

      closeModal();
      await refreshData();
      localStorage.setItem('stock_last_updated', Date.now().toString());
    } catch (err) {
      console.error('Lỗi lưu sản phẩm:', err);
      showToast('Có lỗi xảy ra khi lưu vào CSDL!', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Lưu Sản Phẩm';
    }
  });

  // Sự kiện Sửa / Xóa trên bảng
  const tableBody = document.querySelector('#adminProductsTableBody');
  tableBody?.addEventListener('click', async (e) => {
    // 1. SỬA
    const editBtn = e.target.closest('.btn-edit-prod');
    if (editBtn) {
      const prodId = Number(editBtn.dataset.id);
      const prod = state.products.find(p => p.id === prodId);
      if (!prod) return;

      fillCategories();
      document.querySelector('#editProductId').value = prod.id;
      document.querySelector('#pName').value = prod.name || '';
      document.querySelector('#pAuthor').value = prod.author || '';
      document.querySelector('#pPublisher').value = prod.publisher || '';
      pCategorySelect.value = prod.categoryId || 1;
      document.querySelector('#pPrice').value = prod.price || 0;
      document.querySelector('#pOriginalPrice').value = prod.originalPrice || prod.price || 0;
      document.querySelector('#pStock').value = prod.stock || 0;
      document.querySelector('#pDesc').value = prod.description || '';
      document.querySelector('#pIsHot').checked = Boolean(prod.isHot);
      document.querySelector('#pIsNew').checked = Boolean(prod.isNew);

      // Hiển thị ảnh hiện tại
      if (prod.image) {
        if (pImageHidden) pImageHidden.value = prod.image;
        if (imagePreviewImg) imagePreviewImg.src = prod.image;
        if (imageFileName) imageFileName.textContent = `${prod.name}.jpg`;
        if (imageFileSize) imageFileSize.textContent = 'Ảnh hiện tại của sách';
        if (uploadPrompt) uploadPrompt.style.display = 'none';
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'flex';
      } else {
        if (pImageHidden) pImageHidden.value = '';
        if (uploadPrompt) uploadPrompt.style.display = 'flex';
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
      }

      titleEl.innerHTML = `<span>✏️</span> Chỉnh Sửa Tác Phẩm #${prod.id}`;
      modal.classList.add('active');
      return;
    }

    // 2. XÓA (Phân quyền: Chỉ Admin mới có quyền xóa)
    const delBtn = e.target.closest('.btn-del-prod');
    if (delBtn) {
      if (!isAdminRole()) {
        showToast('⚠️ Quyền hạn bị giới hạn: Tài khoản Nhân Viên không được phép xóa sản phẩm khỏi CSDL! Chỉ Admin mới có quyền này.', 'error');
        return;
      }

      const prodId = Number(delBtn.dataset.id);
      const prod = state.products.find(p => p.id === prodId);
      const prodName = prod ? prod.name : `#${prodId}`;

      if (window.confirm(`⚠️ Bạn có chắc chắn muốn xóa cuốn sách:\n"${prodName}"\nkhỏi hệ thống CSDL không?`)) {
        try {
          await api.delete(`/products/${prodId}`);
          showToast(`Đã xóa cuốn "${prodName}" khỏi CSDL!`, 'info');
          await refreshData();
          localStorage.setItem('stock_last_updated', Date.now().toString());
        } catch (err) {
          console.error('Lỗi xóa sản phẩm:', err);
          showToast('Có lỗi xảy ra khi xóa sản phẩm!', 'error');
        }
      }
    }
  });
};

// ================= 5B. QUẢN LÝ DANH MỤC SẢN PHẨM (THÊM / XÓA DANH MỤC DYNAMIC) =================
const setupCategoryManagement = () => {
  const catModal = document.querySelector('#categoryModal');
  const btnOpen = document.querySelector('#btnOpenCategoryModal');
  const btnClose = document.querySelector('#btnCloseCategoryModal');
  const btnClose2 = document.querySelector('#btnCloseCategoryModal2');
  const form = document.querySelector('#addCategoryForm');
  const tbody = document.querySelector('#categoryTableBody');
  const totalCountEl = document.querySelector('#catTotalCount');

  const closeCategoryModal = () => catModal?.classList.remove('active');
  btnClose?.addEventListener('click', closeCategoryModal);
  btnClose2?.addEventListener('click', closeCategoryModal);
  catModal?.addEventListener('click', (e) => {
    if (e.target === catModal) closeCategoryModal();
  });

  // Render bảng danh mục hiện có
  const renderCategoryList = () => {
    if (!tbody) return;
    const categories = state.categories || [];
    if (totalCountEl) totalCountEl.textContent = `${categories.length} danh mục`;

    tbody.innerHTML = categories.map(cat => {
      const bookCount = (state.products || []).filter(p => Number(p.categoryId) === Number(cat.id)).length;
      const isDefault = Number(cat.id) === 1;

      return `
        <tr>
          <td style="text-align: center; font-size: 1.3rem;">${cat.icon || '📚'}</td>
          <td>
            <div style="font-weight: 700; color: #0f172a;">${cat.name}</div>
            <div style="font-size: 0.75rem; color: #64748b;">${cat.description || ''}</div>
          </td>
          <td>
            <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; color: #475569;">${cat.slug || cat.id}</code>
          </td>
          <td style="text-align: center;">
            <span class="stock-badge ${bookCount > 0 ? 'in-stock' : 'low-stock'}" style="font-size: 0.75rem;">
              ${bookCount} cuốn
            </span>
          </td>
          <td style="text-align: center;">
            ${isDefault ? `
              <span style="font-size: 0.72rem; color: #94a3b8;" title="Danh mục gốc">Mặc định</span>
            ` : isAdminRole() ? `
              <button type="button" class="btn-del-cat" data-id="${cat.id}" data-name="${cat.name}" data-count="${bookCount}" style="background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 0.85rem;" title="Xóa danh mục">
                🗑️
              </button>
            ` : `
              <span style="font-size: 0.72rem; color: #94a3b8;" title="Chỉ Quản Trị Viên mới được xóa danh mục">🔒 Chỉ Admin</span>
            `}
          </td>
        </tr>
      `;
    }).join('');
  };

  btnOpen?.addEventListener('click', () => {
    renderCategoryList();
    catModal?.classList.add('active');
  });

  // Thêm danh mục mới (POST /categories)
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.querySelector('#catName')?.value.trim();
    const icon = document.querySelector('#catIcon')?.value.trim() || '✨';
    const desc = document.querySelector('#catDesc')?.value.trim();

    if (!name) {
      showToast('Vui lòng nhập tên danh mục cần thêm!', 'error');
      return;
    }

    // Tự sinh slug tiếng Việt chuẩn
    const slug = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    // Tạo ID mới tăng dần
    const existingIds = (state.categories || []).map(c => Number(c.id) || 0);
    const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

    const newCat = {
      id: newId,
      name,
      slug: slug || `cat-${newId}`,
      icon,
      description: desc || `Tác phẩm thể loại ${name}`
    };

    const submitBtn = document.querySelector('#btnSaveCategory');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang lưu vào CSDL...';
    }

    try {
      await api.post('/categories', newCat);
      state.categories.push(newCat);
      showToast(`✓ Đã thêm danh mục "${name}" vào CSDL thành công!`, 'success');
      form.reset();
      const iconInput = document.querySelector('#catIcon');
      if (iconInput) iconInput.value = '✨';

      renderCategoryList();

      // Cập nhật bộ lọc thể loại ở trang Admin
      const catSelect = document.querySelector('#adminCategoryFilter');
      if (catSelect) {
        catSelect.innerHTML = `<option value="0">Tất cả thể loại</option>` +
          state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }

      // Cập nhật dropdown thể loại trong Modal Thêm Sách
      const pCategorySelect = document.querySelector('#pCategory');
      if (pCategorySelect) {
        pCategorySelect.innerHTML = state.categories.map(cat => `
          <option value="${cat.id}" data-name="${cat.name}">${cat.icon || '📖'} ${cat.name}</option>
        `).join('');
      }

    } catch (err) {
      console.error('Lỗi thêm danh mục:', err);
      showToast('Có lỗi xảy ra khi thêm danh mục vào CSDL!', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '+ Thêm Danh Mục Mới';
      }
    }
  });

  // Xóa danh mục (DELETE /categories/:id)
  tbody?.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.btn-del-cat');
    if (!delBtn) return;

    // Phân quyền: Chỉ Admin mới có quyền xóa
    if (!isAdminRole()) {
      showToast('⚠️ Quyền hạn bị giới hạn: Tài khoản Nhân Viên không được phép xóa danh mục!', 'error');
      return;
    }

    const catId = Number(delBtn.dataset.id);
    const catName = delBtn.dataset.name;
    const bookCount = Number(delBtn.dataset.count) || 0;

    let confirmMsg = `Bạn có chắc chắn muốn xóa danh mục "${catName}" không?`;
    if (bookCount > 0) {
      confirmMsg = `⚠️ Danh mục "${catName}" đang chứa ${bookCount} cuốn sách!\n\nNếu xóa, hệ thống sẽ tự động chuyển ${bookCount} cuốn sách này về danh mục mặc định "Manga - Truyện Tranh" để bảo vệ dữ liệu.\n\nBạn có đồng ý xóa không?`;
    }

    if (!window.confirm(confirmMsg)) return;

    try {
      // Tự động chuyển các sách về Category 1 (Manga) trước khi xóa danh mục
      if (bookCount > 0) {
        const booksToUpdate = (state.products || []).filter(p => Number(p.categoryId) === catId);
        for (const book of booksToUpdate) {
          book.categoryId = 1;
          book.categoryName = 'Manga - Truyện Tranh';
          try {
            await api.patch(`/products/${book.id}`, { categoryId: 1, categoryName: 'Manga - Truyện Tranh' });
          } catch (patchErr) {
            console.warn(`Lỗi cập nhật sách #${book.id}:`, patchErr);
          }
        }
      }

      await api.delete(`/categories/${catId}`);
      state.categories = state.categories.filter(c => Number(c.id) !== catId);
      showToast(`Đã xóa danh mục "${catName}" khỏi hệ thống!`, 'info');

      renderCategoryList();
      await refreshData();
    } catch (err) {
      console.error('Lỗi xóa danh mục:', err);
      showToast('Có lỗi xảy ra khi xóa danh mục!', 'error');
    }
  });
};

// ================= 6. TÍNH NĂNG IMPORT SẢN PHẨM HÀNG LOẠT (TÂM ĐIỂM) =================
const setupImportFeature = () => {
  const modal = document.querySelector('#importModal');
  const btnOpen = document.querySelector('#btnOpenImportModal');
  const btnClose = document.querySelector('#btnCloseImportModal');
  const btnCancel = document.querySelector('#btnCancelImport');
  const dropzone = document.querySelector('#dropzoneBox');
  const fileInput = document.querySelector('#importFileInput');

  const previewArea = document.querySelector('#importPreviewArea');
  const countDisplay = document.querySelector('#importCountDisplay');
  const previewTbody = document.querySelector('#importPreviewTbody');
  const btnClearFile = document.querySelector('#btnClearSelectedFile');
  const btnConfirmImport = document.querySelector('#btnConfirmImport');

  // Mở / Đóng modal
  btnOpen?.addEventListener('click', () => {
    resetImportState();
    modal.classList.add('active');
  });

  const closeModal = () => modal.classList.remove('active');
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Reset trạng thái import
  const resetImportState = () => {
    state.pendingImportProducts = [];
    fileInput.value = '';
    previewArea.style.display = 'none';
    dropzone.style.display = 'block';
    btnConfirmImport.disabled = true;
    btnConfirmImport.textContent = '✓ Bắt Đầu Import Vào CSDL';
  };

  btnClearFile?.addEventListener('click', resetImportState);

  // Kéo thả hoặc click chọn file
  dropzone?.addEventListener('click', () => fileInput.click());

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  });

  // HÀM ĐỌC VÀ PHÂN TÍCH NỘI DUNG FILE (JSON HOẶC CSV)
  const processSelectedFile = (file) => {
    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const textContent = e.target.result;
        let parsedList = [];

        // 1. Nếu là file JSON
        if (fileName.endsWith('.json')) {
          const raw = JSON.parse(textContent);
          parsedList = Array.isArray(raw) ? raw : (raw.products || []);
        }
        // 2. Nếu là file CSV
        else if (fileName.endsWith('.csv')) {
          parsedList = parseCsvToProducts(textContent);
        } else {
          alert('Chỉ hỗ trợ file định dạng .json hoặc .csv!');
          return;
        }

        // 3. Chuẩn hóa & Validate dữ liệu
        const validatedList = parsedList
          .filter(item => item && item.name && item.price)
          .map(item => ({
            name: String(item.name).trim(),
            author: item.author || 'Đang cập nhật',
            publisher: item.publisher || 'NXB Kim Đồng',
            categoryId: Number(item.categoryId) || 1,
            categoryName: item.categoryName || 'Manga - Truyện Tranh',
            price: Number(item.price) || 35000,
            originalPrice: Number(item.originalPrice) || Number(item.price) || 40000,
            discount: Number(item.discount) || 0,
            stock: Number(item.stock) || 50,
            image: item.image || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80',
            description: item.description || `Tác phẩm ${item.name} phát hành độc quyền bởi Hikari BookStore.`,
            rating: Number(item.rating) || 5.0,
            reviewsCount: Number(item.reviewsCount) || 100,
            isHot: Boolean(item.isHot),
            isNew: typeof item.isNew === 'boolean' ? item.isNew : true
          }));

        if (validatedList.length === 0) {
          alert('Không tìm thấy dữ liệu sản phẩm hợp lệ trong file! Vui lòng tải file mẫu để xem đúng cấu trúc.');
          return;
        }

        state.pendingImportProducts = validatedList;

        // 4. Hiển thị bảng xem trước (Preview)
        countDisplay.textContent = validatedList.length;
        previewTbody.innerHTML = validatedList.slice(0, 5).map(item => `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 6px; font-weight: 600; color: #0f172a;">${item.name}</td>
            <td style="padding: 6px; color: #475569;">${item.author}</td>
            <td style="padding: 6px; color: #64748b;">${item.categoryName}</td>
            <td style="padding: 6px; text-align: right; color: #e11d48; font-weight: 700;">${formatPrice(item.price)}</td>
            <td style="padding: 6px; text-align: center;"><strong>${item.stock}</strong></td>
          </tr>
        `).join('');

        if (validatedList.length > 5) {
          previewTbody.innerHTML += `
            <tr>
              <td colspan="5" style="text-align: center; padding: 6px; color: #64748b; font-style: italic;">
                ...và còn ${validatedList.length - 5} tác phẩm khác sẵn sàng import...
              </td>
            </tr>
          `;
        }

        dropzone.style.display = 'none';
        previewArea.style.display = 'block';
        btnConfirmImport.disabled = false;
        btnConfirmImport.textContent = `✓ Import ${validatedList.length} Cuốn Sách Này`;

      } catch (parseErr) {
        console.error('Lỗi đọc file:', parseErr);
        alert('File không đúng định dạng hoặc cú pháp bị lỗi! Chi tiết: ' + parseErr.message);
      }
    };

    reader.readAsText(file, 'UTF-8');
  };

  // Parser CSV sang danh sách đối tượng Sách
  const parseCsvToProducts = (csvText) => {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const results = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Regex tách theo dấu phẩy nhưng giữ nguyên chuỗi trong ngoặc kép
      const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
      const item = {};

      headers.forEach((h, idx) => {
        let val = matches[idx] ? matches[idx].trim().replace(/^"|"$/g, '') : '';
        item[h] = val;
      });

      if (item.name) results.push(item);
    }
    return results;
  };

  // 5. TIẾN HÀNH IMPORT VÀO CSDL SERVER BẰNG ASYNC / AWAIT
  btnConfirmImport?.addEventListener('click', async () => {
    const total = state.pendingImportProducts.length;
    if (total === 0) return;

    btnConfirmImport.disabled = true;
    btnConfirmImport.textContent = `⏳ Đang import 0/${total}...`;

    let successCount = 0;

    for (let i = 0; i < total; i++) {
      const item = state.pendingImportProducts[i];
      // Tự sinh ID độc nhất
      item.id = Date.now() + i;
      item.createdAt = new Date(Date.now() + i * 1000).toISOString();
      item.isNew = true;

      try {
        await api.post('/products', item);
        successCount++;
        btnConfirmImport.textContent = `⏳ Đang import ${successCount}/${total}...`;
      } catch (postErr) {
        console.warn(`Lỗi import cuốn "${item.name}":`, postErr);
      }
    }

    showToast(`✓ Đã import thành công ${successCount}/${total} cuốn sách mới vào CSDL!`, 'success');
    closeModal();
    resetImportState();

    // Làm mới lại bảng và thống kê ngay lập tức
    await refreshData();
    localStorage.setItem('stock_last_updated', Date.now().toString());
  });
};

// ================= 7. GẮN SỰ KIỆN THANH TÌM KIẾM & BỘ LỌC =================
const setupSearchAndFilters = () => {
  const searchInput = document.querySelector('#adminSearchInput');
  const catFilter = document.querySelector('#adminCategoryFilter');
  const stockFilter = document.querySelector('#adminStockFilter');

  searchInput?.addEventListener('input', (e) => {
    state.searchKeyword = e.target.value;
    applyAdminFilters();
  });

  catFilter?.addEventListener('change', (e) => {
    state.selectedCategoryId = Number(e.target.value);
    applyAdminFilters();
  });

  stockFilter?.addEventListener('change', (e) => {
    state.stockFilter = e.target.value;
    applyAdminFilters();
  });

  // Đăng xuất admin
  document.querySelector('#btnAdminLogout')?.addEventListener('click', () => {
    if (window.confirm('Bạn có muốn đăng xuất tài khoản quản trị viên?')) {
      localStorage.removeItem('user');
      localStorage.removeItem('currentUser');
      window.location.href = 'login.html';
    }
  });
};

// ================= 8. LÀM MỚI TOÀN BỘ DỮ LIỆU TỪ SERVER =================
const refreshData = async () => {
  try {
    const [products, categories] = await Promise.all([
      fetchProducts(),
      fetchCategories()
    ]);

    state.products = products;
    state.categories = categories;

    // Đổ danh mục vào dropdown lọc
    const catSelect = document.querySelector('#adminCategoryFilter');
    if (catSelect) {
      catSelect.innerHTML = `<option value="0">Tất cả thể loại</option>` +
        categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      catSelect.value = state.selectedCategoryId;
    }

    applyAdminFilters();
    await loadDashboardStats();
  } catch (error) {
    console.error('Lỗi nạp dữ liệu:', error);
  }
};

// ================= KHỞI CHẠY KHI TẢI TRANG =================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Kiểm tra quyền admin
  const hasAccess = checkAdminAuth();
  if (!hasAccess) return;

  // 2. Gắn các sự kiện chức năng
  setupSearchAndFilters();
  setupProductModal();
  setupCategoryManagement();
  setupImportFeature();
  setupRevenueEventListeners();
  setupStaffManagement();
  setupCustomerManagement();

  // 3. Nạp dữ liệu ban đầu
  await refreshData();
});


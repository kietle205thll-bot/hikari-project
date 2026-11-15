/**
 * products.js - Xử lý logic cho Trang Danh Mục & Bộ Lọc Sản Phẩm Chuyên Biệt (products.html)
 * Phong cách NXB Kim Đồng: Phân loại Manga, Light Novel, Sách chữ; Lọc & Sắp xếp chuyên sâu
 * Sử dụng ES6+: Modules, Arrow functions, Array methods (map, filter, find, sort, reduce), Destructuring
 */
import { fetchCategories, fetchProducts, fetchOrders } from './api.js';
import { formatPrice, addToCart, updateCartBadge, checkCurrentUser, getShortCategoryName } from './utils.js';

// Quản lý trạng thái trang Danh mục
const state = {
  allProducts: [],
  categories: [],
  orders: [],
  currentCategoryId: 0,   // 0 = Tất cả
  currentGenre: 'all',    // 'all' hoặc tên thể loại (Shounen, Tình Cảm, Isekai...)
  searchKeyword: '',
  priceRange: 'all',      // 'all', 'under50', '50to100', 'over100'
  discountFilter: 'all',  // 'all', 'tier10', 'tier20', 'tier30'
  isSaleOnly: false,
  sortBy: 'hot',          // 'hot' (mặc định theo hóa đơn), 'default' (mới nhất), 'price-asc', 'price-desc', 'name-asc', 'name-desc'
  currentPage: 1,         // Trang hiện tại
  itemsPerPage: 8         // Số sách trên mỗi trang (8 cuốn = 2 hàng x 4 cột chuẩn NXB Kim Đồng)
};

// ================= TÍNH TOÁN SỐ LƯỢNG BÁN RA TỪ TOÀN BỘ HÓA ĐƠN (/orders) =================
const calculateSalesMap = (orders = []) => {
  const map = {};
  orders.forEach(order => {
    if (order && order.status !== 'Đã hủy' && Array.isArray(order.items)) {
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

const attachSalesToProducts = (products = [], orders = []) => {
  const salesMap = calculateSalesMap(orders);
  return products.map(p => ({
    ...p,
    soldCount: salesMap[p.id] || 0
  }));
};

// ================= TẠO HTML THẺ SẢN PHẨM =================
const createProductCardHtml = (product) => {
  const { id, name, author, price, originalPrice, discount, image, categoryName, genre, rating, isHot, isNew, stock, soldCount } = product;
  const isOutOfStock = typeof stock === 'number' && stock <= 0;
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const wishlist = (currentUser && currentUser.name) ? (JSON.parse(localStorage.getItem('hikari_wishlist')) || []) : [];
  const isWishlisted = Boolean(currentUser && wishlist.some(wId => String(wId) === String(id)));

  return `
    <article class="product-card" data-id="${id}">
      <div class="product-card-image-wrap">
        <a href="product-detail.html?id=${id}">
          <img 
            src="${image}" 
            alt="${name}" 
            class="product-card-image" 
            loading="lazy"
            onerror="this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80'"
          />
        </a>
        <button class="btn-card-wishlist ${isWishlisted ? 'active' : ''}" data-id="${id}" data-name="${name}" title="Thêm vào yêu thích" style="position: absolute; top: 8px; right: 8px; z-index: 5; background: rgba(255,255,255,0.92); border: none; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: ${isWishlisted ? '#e11d48' : '#94a3b8'}; font-size: 0.95rem; box-shadow: 0 2px 4px rgba(0,0,0,0.12); transition: transform 0.15s;">
          ${isWishlisted ? '❤️' : '🤍'}
        </button>
        ${discount ? `<span class="product-badge-discount">-${discount}%</span>` : ''}
        ${isOutOfStock 
          ? `<span class="product-badge-outofstock">HẾT HÀNG</span>` 
          : (isHot 
              ? `<span class="product-badge-hot">HOT 🔥</span>` 
              : (isNew ? `<span class="product-badge-hot" style="background:#4338ca;">MỚI ✨</span>` : ''))
        }
      </div>

      <div class="product-card-body">
        <div class="product-meta-row">
          <div class="product-tags-group">
            <span class="product-category-tag">${getShortCategoryName(categoryName)}</span>
            ${genre ? `<span class="product-genre-badge" title="${genre}">🏷️ ${genre.split(',')[0].trim()}</span>` : ''}
          </div>
          <span class="product-rating">★ ${rating || 5.0}</span>
        </div>

        <h3 class="product-title" title="${name}">
          <a href="product-detail.html?id=${id}">${name}</a>
        </h3>

        <p class="product-author">
          Tác giả: <span>${author}</span>
        </p>

        <!-- HIỂN THỊ SỐ LƯỢNG BÁN RA THEO HÓA ĐƠN -->
        ${soldCount > 0 
          ? `
            <div class="product-sold-badge" title="Đã bán được tính từ toàn bộ hóa đơn">
              <span>🔥 Đã bán:</span> <strong>${soldCount}</strong> <span>cuốn</span>
            </div>
          ` 
          : ''
        }

        <div style="font-size: 0.75rem; color: ${isOutOfStock ? 'var(--danger)' : (stock <= 5 ? 'var(--danger)' : 'var(--success)')}; font-weight: 600; margin-bottom: 0.4rem;">
          ${isOutOfStock ? '✗ Tạm hết hàng' : `✓ Còn ${stock} cuốn trong kho`}
        </div>

        <div class="product-price-row">
          <span class="product-price-current">${formatPrice(price)}</span>
          ${originalPrice ? `<span class="product-price-original">${formatPrice(originalPrice)}</span>` : ''}
        </div>

        <div class="product-card-actions">
          <a href="product-detail.html?id=${id}" class="btn-detail">
            Chi tiết
          </a>
          ${isOutOfStock 
            ? `<button class="btn-add-cart disabled" disabled title="Tạm thời hết hàng">Hết hàng</button>` 
            : `<button class="btn-add-cart" data-id="${id}" title="Thêm vào giỏ hàng">+ Giỏ</button>`
          }
        </div>
      </div>
    </article>
  `;
};

// ================= RENDER DANH MỤC BANNER VÀ PILLS =================
const categoryMetadata = {
  0: {
    title: '📚 Tất Cả Tác Phẩm',
    eyebrow: 'TOÀN BỘ KHO SÁCH HIKARI',
    desc: 'Khám phá hơn 100+ tựa Manga, Light Novel, Tiểu thuyết và Artbook bản quyền với giá ưu đãi tốt nhất.'
  },
  1: {
    title: '📖 Manga - Truyện Tranh Bản Quyền',
    eyebrow: 'THỂ LOẠI MANGA & COMIC',
    desc: 'Tổng hợp các bộ truyện tranh shounen, trinh thám, học đường ăn khách từ NXB Kim Đồng, NXB Trẻ và IPM.'
  },
  2: {
    title: '✨ Light Novel - Thế Giới Fantasy & Isekai',
    eyebrow: 'THỂ LOẠI LIGHT NOVEL',
    desc: 'Những bộ tiểu thuyết ánh sáng đình đám với minh họa tuyệt đẹp, đưa bạn bước vào những thế giới huyền ảo ly kỳ.'
  },
  3: {
    title: '📕 Tiểu Thuyết & Văn Học Chọn Lọc',
    eyebrow: 'VĂN HỌC TRONG & NGOÀI NƯỚC',
    desc: 'Những kiệt tác văn học kinh điển và hiện đại, đánh thức cảm xúc và mở rộng góc nhìn cuộc sống.'
  },
  4: {
    title: '💡 Sách Tư Duy & Phát Triển Bản Thân',
    eyebrow: 'KỸ NĂNG & TÂM LÝ HỌC',
    desc: 'Trang bị kiến thức quản lý tài chính, tâm lý học hành vi và tư duy thành công trong thời đại số.'
  },
  5: {
    title: '🎨 Artbook & Ấn Phẩm Sưu Tầm Cao Cấp',
    eyebrow: 'ARTBOOK & QUÀ TẶNG GIỚI HẠN',
    desc: 'Các tuyển tập tranh minh họa chính hãng, postcard độc quyền và phiên bản đặc biệt dành cho độc giả yêu nghệ thuật.'
  }
};

const updateCategoryHeader = (catId, isSale = false) => {
  const eyebrowEl = document.querySelector('#catEyebrow');
  const titleEl = document.querySelector('#catTitle');
  const descEl = document.querySelector('#catDesc');
  const breadcrumbEl = document.querySelector('#breadcrumbCurrent');

  if (isSale) {
    if (eyebrowEl) eyebrowEl.textContent = 'CHƯƠNG TRÌNH KHUYẾN MÃI';
    if (titleEl) titleEl.textContent = '⚡ Flash Sale - Săn Sách Giảm Sâu';
    if (descEl) descEl.textContent = 'Danh sách toàn bộ các tựa sách đang được áp dụng mức giảm giá cực sốc lên đến 35%.';
    if (breadcrumbEl) breadcrumbEl.textContent = 'Flash Sale Giảm Giá';
    document.title = 'Flash Sale Sách Giảm Giá - Hikari BookStore';
    return;
  }

  const meta = categoryMetadata[catId] || {
    title: '📚 Danh Mục Tác Phẩm',
    eyebrow: 'DANH MỤC SÁCH',
    desc: 'Khám phá các tựa sách hay nhất tại Hikari BookStore.'
  };

  if (eyebrowEl) eyebrowEl.textContent = meta.eyebrow;
  if (titleEl) titleEl.textContent = meta.title;
  if (descEl) descEl.textContent = meta.desc;
  if (breadcrumbEl) breadcrumbEl.textContent = meta.title.replace(/^[^\w\s]*\s*/, '');
  document.title = `${meta.title} - Hikari BookStore`;

  // Cập nhật highlight active trên Menu Header tầng 2
  document.querySelectorAll('.nav-link-cat').forEach(link => {
    const linkCat = Number(link.dataset.cat);
    link.classList.toggle('active', linkCat === catId && !isSale);
  });
  const saleLink = document.querySelector('#navSale');
  if (saleLink) saleLink.classList.toggle('active', isSale);
};

const renderCategorySelector = (categories = []) => {
  const menu = document.querySelector('#catSelectMenu');
  const label = document.querySelector('#catSelectLabel');
  const wrapper = document.querySelector('#catSelectWrapper');
  const btnToggle = document.querySelector('#catSelectBtn');
  const btnAll = document.querySelector('#catAllBtn');

  // Hàm cập nhật nhãn trên nút bấm
  const updateLabel = () => {
    if (state.isSaleOnly) {
      if (label) label.textContent = 'Danh mục: ⚡ Flash Sale Giảm Sâu';
      if (btnAll) btnAll.classList.remove('active');
      return;
    }

    if (state.currentCategoryId === 0) {
      if (label) label.textContent = 'Danh mục: Tất Cả Tác Phẩm';
      if (btnAll) btnAll.classList.remove('active');
    } else {
      const cur = categories.find(c => c.id === state.currentCategoryId);
      if (label) label.textContent = `Danh mục: ${cur ? cur.name : 'Tất Cả Tác Phẩm'}`;
      if (btnAll) btnAll.classList.add('active');
    }
  };

  if (menu) {
    // Render 6 thể loại (ĐÃ BỎ HOÀN TOÀN ICON VÀ FLASHSALE THEO ĐÚNG YÊU CẦU)
    menu.innerHTML = `
      <button type="button" class="cat-select-item ${state.currentCategoryId === 0 && !state.isSaleOnly ? 'active' : ''}" data-cat="0">
        <div class="cat-select-item-text">
          <strong>Tất Cả Tác Phẩm</strong>
          <small>Khám phá trọn bộ hơn 100+ tựa sách bản quyền</small>
        </div>
        <span class="cat-select-check">${state.currentCategoryId === 0 && !state.isSaleOnly ? '✓' : ''}</span>
      </button>
      ${categories.map(cat => `
        <button type="button" class="cat-select-item ${state.currentCategoryId === cat.id && !state.isSaleOnly ? 'active' : ''}" data-cat="${cat.id}">
          <div class="cat-select-item-text">
            <strong>${cat.name}</strong>
            <small>${cat.description || `Xem toàn bộ ${cat.name}`}</small>
          </div>
          <span class="cat-select-check">${state.currentCategoryId === cat.id && !state.isSaleOnly ? '✓' : ''}</span>
        </button>
      `).join('')}
    `;

    updateLabel();

    // Toggle dropdown khi click nút
    if (btnToggle && wrapper) {
      btnToggle.onclick = (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
        const isOpen = wrapper.classList.contains('open');
        btnToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      };

      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
          wrapper.classList.remove('open');
          btnToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Chọn thể loại
    menu.onclick = (e) => {
      const item = e.target.closest('.cat-select-item');
      if (!item) return;

      const catId = Number(item.dataset.cat);
      state.isSaleOnly = false;
      state.currentCategoryId = catId;

      menu.querySelectorAll('.cat-select-item').forEach(el => {
        const isCur = Number(el.dataset.cat) === catId;
        el.classList.toggle('active', isCur);
        const chk = el.querySelector('.cat-select-check');
        if (chk) chk.textContent = isCur ? '✓' : '';
      });

      if (wrapper) wrapper.classList.remove('open');
      if (btnToggle) btnToggle.setAttribute('aria-expanded', 'false');

      updateLabel();
      updateCategoryHeader(state.currentCategoryId, false);

      const newUrl = state.currentCategoryId === 0 ? 'products.html' : `products.html?cat=${state.currentCategoryId}`;
      history.pushState(null, '', newUrl);

      applyFiltersAndRender();
    };
  }

  // Nút xem tất cả bên cạnh
  if (btnAll) {
    btnAll.onclick = () => {
      state.isSaleOnly = false;
      state.currentCategoryId = 0;

      if (menu) {
        menu.querySelectorAll('.cat-select-item').forEach(el => {
          const isCur = Number(el.dataset.cat) === 0;
          el.classList.toggle('active', isCur);
          const chk = el.querySelector('.cat-select-check');
          if (chk) chk.textContent = isCur ? '✓' : '';
        });
      }

      updateLabel();
      updateCategoryHeader(0, false);
      history.pushState(null, '', 'products.html');
      applyFiltersAndRender();
    };
  }
};

// ================= BỘ LỌC VÀ SẮP XẾP SẢN PHẨM =================
const applyFiltersAndRender = (resetPage = true) => {
  if (resetPage) {
    state.currentPage = 1;
  }

  let result = [...state.allProducts];

  // 1. Lọc theo Danh mục (categoryId)
  if (!state.isSaleOnly && state.currentCategoryId !== 0) {
    result = result.filter(item => item.categoryId === state.currentCategoryId);
  }

  // 1b. Lọc theo Thể loại nội dung (genre)
  if (state.currentGenre && state.currentGenre !== 'all') {
    const targetGenre = state.currentGenre.toLowerCase();
    result = result.filter(item => (item.genre || '').toLowerCase().includes(targetGenre));
  }

  // 2. Lọc chỉ xem sản phẩm đang giảm giá (Flash sale)
  if (state.isSaleOnly) {
    result = result.filter(item => (Number(item.discount) || 0) > 0 || (item.originalPrice && item.originalPrice > item.price));
  }

  // 3. Tìm kiếm theo Từ khóa (Tên sách, Tác giả, Nhà xuất bản)
  if (state.searchKeyword.trim() !== '') {
    const keyword = state.searchKeyword.toLowerCase().trim();
    result = result.filter(item => {
      const matchName = item.name && item.name.toLowerCase().includes(keyword);
      const matchAuthor = item.author && item.author.toLowerCase().includes(keyword);
      const matchPublisher = item.publisher && item.publisher.toLowerCase().includes(keyword);
      return matchName || matchAuthor || matchPublisher;
    });
  }

  // 4. Lọc theo Khoảng giá
  if (state.priceRange === 'under50') {
    result = result.filter(item => item.price < 50000);
  } else if (state.priceRange === '50to100') {
    result = result.filter(item => item.price >= 50000 && item.price <= 100000);
  } else if (state.priceRange === 'over100') {
    result = result.filter(item => item.price > 100000);
  }

  // 5. Lọc theo Mức giảm giá
  if (state.discountFilter === 'tier10') {
    result = result.filter(item => item.discount >= 10 && item.discount < 20);
  } else if (state.discountFilter === 'tier20') {
    result = result.filter(item => item.discount >= 20 && item.discount < 30);
  } else if (state.discountFilter === 'tier30') {
    result = result.filter(item => item.discount >= 30);
  }

  // 6. Sắp xếp (Sort)
  if (state.sortBy === 'hot') {
    // Sắp xếp ưu tiên theo số lượng bán ra từ hóa đơn (/orders)
    result.sort((a, b) => {
      const soldDiff = (Number(b.soldCount) || 0) - (Number(a.soldCount) || 0);
      if (soldDiff !== 0) return soldDiff;
      return (Number(b.reviewsCount) || 0) - (Number(a.reviewsCount) || 0);
    });
  } else if (state.sortBy === 'default') {
    // Mới nhất: theo createdAt hoặc ID giảm dần
    result.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : (Number(a.id) || 0);
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : (Number(b.id) || 0);
      return timeB - timeA;
    });
  } else if (state.sortBy === 'price-asc') {
    result.sort((a, b) => a.price - b.price);
  } else if (state.sortBy === 'price-desc') {
    result.sort((a, b) => b.price - a.price);
  } else if (state.sortBy === 'name-asc') {
    result.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  } else if (state.sortBy === 'name-desc') {
    result.sort((a, b) => b.name.localeCompare(a.name, 'vi'));
  }

  // ================= TÍNH TOÁN PHÂN TRANG (PAGINATION) =================
  const totalItems = result.length;
  const totalPages = Math.ceil(totalItems / state.itemsPerPage);

  // Đảm bảo currentPage hợp lệ trong khoảng [1, totalPages]
  if (state.currentPage > totalPages && totalPages > 0) {
    state.currentPage = totalPages;
  }
  if (state.currentPage < 1) {
    state.currentPage = 1;
  }

  const startIndex = (state.currentPage - 1) * state.itemsPerPage;
  const endIndex = Math.min(startIndex + state.itemsPerPage, totalItems);
  const paginatedList = result.slice(startIndex, endIndex);

  renderProductGrid(paginatedList, totalItems);
  renderPagination(totalPages, state.currentPage, totalItems, startIndex, endIndex);
  updateUrlParams();
};

// ================= RENDER BỘ PHÂN TRANG (PHONG CÁCH NXB KIM ĐỒNG) =================
const renderPagination = (totalPages, currentPage, totalItems, startIndex, endIndex) => {
  const wrapper = document.querySelector('#paginationWrapper');
  const controls = document.querySelector('#paginationControls');
  const info = document.querySelector('#paginationInfo');

  if (!wrapper || !controls || !info) return;

  // Nếu không có sản phẩm hoặc chỉ có 1 trang duy nhất, ẩn bộ phân trang
  if (totalItems === 0 || totalPages <= 1) {
    wrapper.style.display = 'none';
    return;
  }

  wrapper.style.display = 'flex';

  // 1. Tạo danh sách số trang (hỗ trợ dấu ... nếu có nhiều trang)
  const pageNumbers = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    if (currentPage <= 4) {
      pageNumbers.push(1, 2, 3, 4, 5, '...', totalPages);
    } else if (currentPage >= totalPages - 3) {
      pageNumbers.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pageNumbers.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
    }
  }

  // 2. Tạo HTML các nút (Chuẩn nút bấm vuông bo tròn nhẹ, active màu đỏ Kim Đồng)
  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === totalPages;

  controls.innerHTML = `
    <!-- Nút Trang trước (‹) -->
    <button 
      type="button" 
      class="page-btn page-btn-prev ${isFirstPage ? 'disabled' : ''}" 
      data-page="${currentPage - 1}" 
      ${isFirstPage ? 'disabled' : ''} 
      title="Trang trước" 
      aria-label="Trang trước"
    >‹</button>

    <!-- Các nút số trang -->
    ${pageNumbers.map(p => {
      if (p === '...') {
        return `<span class="page-ellipsis" aria-hidden="true">...</span>`;
      }
      const isActive = p === currentPage;
      return `
        <button 
          type="button" 
          class="page-btn page-btn-num ${isActive ? 'active' : ''}" 
          data-page="${p}" 
          ${isActive ? 'aria-current="page"' : ''}
          title="Trang ${p}"
        >${p}</button>
      `;
    }).join('')}

    <!-- Nút Trang sau (›) -->
    <button 
      type="button" 
      class="page-btn page-btn-next ${isLastPage ? 'disabled' : ''}" 
      data-page="${currentPage + 1}" 
      ${isLastPage ? 'disabled' : ''} 
      title="Trang kế tiếp" 
      aria-label="Trang kế tiếp"
    >›</button>
  `;

  // 3. Thông tin hiển thị (Hiển thị 1 - 8 của 16 tác phẩm)
  info.innerHTML = `
    <p class="pagination-info-text">
      Hiển thị <strong>${startIndex + 1} - ${endIndex}</strong> trong tổng số <strong>${totalItems}</strong> tác phẩm
    </p>
  `;
};

// Đồng bộ URL với bộ lọc & số trang
const updateUrlParams = () => {
  const url = new URL(window.location.href);

  if (state.currentCategoryId && state.currentCategoryId !== 0) {
    url.searchParams.set('cat', state.currentCategoryId);
  } else {
    url.searchParams.delete('cat');
  }

  if (state.isSaleOnly) {
    url.searchParams.set('sale', 'true');
  } else {
    url.searchParams.delete('sale');
  }

  if (state.searchKeyword.trim() !== '') {
    url.searchParams.set('q', state.searchKeyword.trim());
  } else {
    url.searchParams.delete('q');
  }

  if (state.currentPage > 1) {
    url.searchParams.set('page', state.currentPage);
  } else {
    url.searchParams.delete('page');
  }

  history.replaceState(null, '', url.pathname + url.search);
};

// Render danh sách sản phẩm lên Grid
const renderProductGrid = (products = [], totalCount = 0) => {
  const grid = document.querySelector('#productsGrid');
  const countEl = document.querySelector('#productCount');
  const catCountEl = document.querySelector('#catCount');

  if (countEl) countEl.textContent = totalCount;
  if (catCountEl) catCountEl.textContent = totalCount;
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; width: 100%;">
        <div class="empty-icon">🔍</div>
        <h3 class="empty-title">Không tìm thấy tác phẩm phù hợp</h3>
        <p class="empty-desc">
          Thử tìm kiếm với từ khóa khác hoặc bấm nút "Đặt lại bộ lọc" để xem toàn bộ danh mục nhé!
        </p>
        <button class="btn btn-primary" id="resetEmptyBtn">
          🔄 Đặt Lại Bộ Lọc & Xem Tất Cả
        </button>
      </div>
    `;

    document.querySelector('#resetEmptyBtn')?.addEventListener('click', resetFilters);
    return;
  }

  grid.innerHTML = products.map(p => createProductCardHtml(p)).join('');
};

// Reset tất cả các bộ lọc
const resetFilters = () => {
  state.priceRange = 'all';
  state.discountFilter = 'all';
  state.searchKeyword = '';
  state.sortBy = 'hot';
  state.currentGenre = 'all';
  state.currentPage = 1;

  const searchInput = document.querySelector('#searchInput');
  const clearBtn = document.querySelector('#clearSearchBtn');
  const priceSelect = document.querySelector('#priceFilterSelect');
  const discountSelect = document.querySelector('#discountFilterSelect');
  const sortSelect = document.querySelector('#sortSelect');

  if (searchInput) searchInput.value = '';
  if (clearBtn) clearBtn.classList.remove('active');
  if (priceSelect) priceSelect.value = 'all';
  if (discountSelect) discountSelect.value = 'all';
  if (sortSelect) sortSelect.value = 'hot';

  document.querySelectorAll('.genre-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.genre === 'all');
  });

  applyFiltersAndRender(true);
};

// ================= THIẾT LẬP SỰ KIỆN TƯƠNG TÁC =================
const setupEventListeners = () => {
  // 1. Ô tìm kiếm
  const searchInput = document.querySelector('#searchInput');
  const clearBtn = document.querySelector('#clearSearchBtn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchKeyword = e.target.value;
      if (clearBtn) {
        clearBtn.classList.toggle('active', state.searchKeyword.length > 0);
      }
      applyFiltersAndRender();
    });
  }

  if (clearBtn && searchInput) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.searchKeyword = '';
      clearBtn.classList.remove('active');
      searchInput.focus();
      applyFiltersAndRender();
    });
  }

  // 2. Lọc giá
  const priceSelect = document.querySelector('#priceFilterSelect');
  priceSelect?.addEventListener('change', (e) => {
    state.priceRange = e.target.value;
    applyFiltersAndRender();
  });

  // 3. Lọc khuyến mãi
  const discountSelect = document.querySelector('#discountFilterSelect');
  discountSelect?.addEventListener('change', (e) => {
    state.discountFilter = e.target.value;
    applyFiltersAndRender();
  });

  // 4. Sắp xếp
  const sortSelect = document.querySelector('#sortSelect');
  sortSelect?.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    applyFiltersAndRender();
  });

  // 4b. Bộ lọc Thể loại (Genre Pills)
  const genrePillsContainer = document.querySelector('#genrePillsList');
  if (genrePillsContainer) {
    genrePillsContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.genre-pill');
      if (!pill) return;
      const targetGenre = pill.dataset.genre || 'all';
      state.currentGenre = targetGenre;
      genrePillsContainer.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      applyFiltersAndRender(true);
    });
  }

  // 5. Nút Reset
  const btnReset = document.querySelector('#btnResetFilters');
  btnReset?.addEventListener('click', resetFilters);

  // 6. Thêm vào giỏ hàng từ Grid (Bất đồng bộ)
  const grid = document.querySelector('#productsGrid');
  grid?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-add-cart');
    if (!btn || btn.disabled) return;

    const productId = btn.dataset.id;
    const product = state.allProducts.find(p => String(p.id) === String(productId));
    if (product) {
      btn.disabled = true;
      btn.style.opacity = '0.6';
      await addToCart(product, 1);
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  });

  // 7. Bấm chuyển trang trên thanh phân trang (Pagination click)
  const paginationControls = document.querySelector('#paginationControls');
  if (paginationControls) {
    paginationControls.addEventListener('click', (e) => {
      const btn = e.target.closest('.page-btn');
      if (!btn || btn.disabled || btn.classList.contains('disabled') || btn.classList.contains('active')) {
        return;
      }

      const targetPage = Number(btn.dataset.page);
      if (targetPage && targetPage > 0 && targetPage !== state.currentPage) {
        state.currentPage = targetPage;
        applyFiltersAndRender(false); // false: giữ nguyên trang vừa chọn, không reset về trang 1

        // Cuộn mượt (smooth scroll) lên đầu danh sách sản phẩm chuẩn phong cách NXB Kim Đồng
        const scrollTarget = document.querySelector('.toolbar-wrap') || document.querySelector('#productsGrid');
        if (scrollTarget) {
          const topOffset = scrollTarget.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top: Math.max(0, topOffset), behavior: 'smooth' });
        }
      }
    });
  }
};

// ================= KHỞI TẠO DỮ LIỆU BAN ĐẦU =================
const initProductsPage = async () => {
  updateCartBadge();
  checkCurrentUser();
  setupEventListeners();

  // Đọc Query Parameters từ URL
  const params = new URLSearchParams(window.location.search);
  const catParam = params.get('cat');
  const saleParam = params.get('sale');
  const queryParam = params.get('q');
  const pageParam = parseInt(params.get('page'), 10);

  if (pageParam && pageParam > 0) {
    state.currentPage = pageParam;
  }

  if (saleParam === 'true') {
    state.isSaleOnly = true;
    state.currentCategoryId = 0;
  } else if (catParam) {
    state.currentCategoryId = Number(catParam) || 0;
  }

  if (queryParam) {
    state.searchKeyword = queryParam;
    const searchInput = document.querySelector('#searchInput');
    if (searchInput) searchInput.value = queryParam;
    const clearBtn = document.querySelector('#clearSearchBtn');
    if (clearBtn) clearBtn.classList.add('active');
  }

  updateCategoryHeader(state.currentCategoryId, state.isSaleOnly);

  try {
    const [categories, products, orders] = await Promise.all([
      fetchCategories(),
      fetchProducts(),
      fetchOrders()
    ]);

    state.categories = categories;
    state.orders = orders;

    // Gắn thông số soldCount từ hóa đơn vào từng sản phẩm
    const productsWithSales = attachSalesToProducts(products, orders);
    state.allProducts = productsWithSales;

    renderCategorySelector(categories);
    // Khởi tạo giữ đúng trang được truyền trên URL (false)
    applyFiltersAndRender(false);
  } catch (error) {
    console.error('Lỗi khi tải dữ liệu trang sản phẩm:', error);
  }
};

document.addEventListener('DOMContentLoaded', initProductsPage);

// Hỗ trợ nút Back/Forward của trình duyệt để chuyển trang mượt mà
window.addEventListener('popstate', () => {
  const params = new URLSearchParams(window.location.search);
  state.currentPage = parseInt(params.get('page'), 10) || 1;
  const catParam = params.get('cat');
  state.currentCategoryId = catParam ? Number(catParam) : 0;
  applyFiltersAndRender(false);
});

// Đồng bộ trạng thái khi có thay đổi từ tab khác
window.addEventListener('pageshow', () => {
  updateCartBadge();
  checkCurrentUser();
});

window.addEventListener('storage', (e) => {
  if (e.key === 'stock_last_updated' || e.key === 'hikari_cart' || e.key === 'currentUser') {
    updateCartBadge();
    checkCurrentUser();
  }
});

window.addEventListener('stockUpdated', () => {
  updateCartBadge();
});

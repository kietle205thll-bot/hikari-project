/**
 * app.js - Xử lý logic nghiệp vụ cho Trang Chủ (index.html)
 * Sử dụng ES6+: Modules, Arrow functions, Array methods (map, filter, find, sort, reduce), Destructuring
 */
import { fetchCategories, fetchProducts, fetchBanners, fetchOrders } from './api.js';
import { formatPrice, addToCart, updateCartBadge, checkCurrentUser } from './utils.js';

// Quản lý trạng thái ứng dụng (Application State)
const state = {
  allProducts: [],
  categories: [],
  banners: [],
  orders: [],
  currentCategoryId: 0,   // 0 = Tất cả
  searchKeyword: '',
  priceRange: 'all',      // 'all', 'under50', '50to100', 'over100'
  discountFilter: 'all',  // 'all', 'tier10', 'tier20', 'tier30'
  sortBy: 'default',      // 'default', 'price-asc', 'price-desc', 'name-asc', 'name-desc', 'hot'
  currentSlideIndex: 0,
  sliderTimer: null,
  flashSaleTimer: null
};

// ================= TẠO HTML THẺ SẢN PHẨM (TÁI SỬ DỤNG) =================
const createProductCardHtml = (product, options = {}) => {
  const { id, name, author, price, originalPrice, discount, image, categoryName, genre, rating, isHot, isNew, stock, soldCount } = product;
  const isOutOfStock = typeof stock === 'number' && stock <= 0;
  const { showSalesBadge = false, isFlashSale = false, isToday = false } = options;

  // Tính % tiến độ flash sale mô phỏng dựa theo id và số lượng tồn kho
  const flashSalePercent = Math.min(95, Math.max(55, ((id * 17) % 35) + 60));
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
          : (isToday 
              ? `<span class="product-badge-today">⚡ VỪA VỀ HÔM NAY</span>` 
              : (isHot 
                  ? `<span class="product-badge-hot">HOT 🔥</span>` 
                  : (isNew ? `<span class="product-badge-hot" style="background:#4338ca;">MỚI ✨</span>` : ''))
            )
        }
      </div>

      <div class="product-card-body">
        <div class="product-meta-row">
          <span class="product-category-tag">${categoryName || 'Sách'}</span>
          ${genre ? `<span class="product-genre-badge" style="background: #fdf2f8; color: #db2777; font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${genre}">🏷️ ${genre.split(',')[0]}</span>` : ''}
          <span class="product-rating">★ ${rating || 5.0}</span>
        </div>

        <h3 class="product-title" title="${name}">
          <a href="product-detail.html?id=${id}">${name}</a>
        </h3>

        <p class="product-author">
          Tác giả: <span>${author}</span>
        </p>

        <!-- HIỂN THỊ SỐ LƯỢNG BÁN RA ĐẾM THEO HÓA ĐƠN THỰC TẾ -->
        ${showSalesBadge 
          ? `
            <div class="product-sold-badge" title="Được tính tự động từ toàn bộ các hóa đơn trong CSDL">
              <span>🔥 Đã bán:</span> <strong>${soldCount || 0}</strong> <span>cuốn (theo hóa đơn)</span>
            </div>
          ` 
          : ''
        }

        <!-- THANH TIẾN ĐỘ CHO FLASH SALE -->
        ${isFlashSale 
          ? `
            <div class="flash-sale-bar-box" title="Đang bán chạy trong khung giờ Flash Sale">
              <div class="flash-sale-progress" style="width: ${flashSalePercent}%"></div>
              <div class="flash-sale-bar-text">🔥 Đã bán ${flashSalePercent}%</div>
            </div>
          ` 
          : `
            <div style="font-size: 0.75rem; color: ${isOutOfStock ? 'var(--danger)' : (stock <= 5 ? 'var(--danger)' : 'var(--success)')}; font-weight: 600; margin-bottom: 0.4rem;">
              ${isOutOfStock ? '✗ Tạm hết hàng' : `✓ Còn ${stock} cuốn trong kho`}
            </div>
          `
        }

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
            : `<button class="btn-add-cart ${isFlashSale ? 'btn-flash-buy' : ''}" data-id="${id}" title="Thêm vào giỏ hàng">${isFlashSale ? '⚡ Săn Ngay' : '+ Giỏ'}</button>`
          }
        </div>
      </div>
    </article>
  `;
};

// ================= HERO BANNER SLIDER DYNAMIC =================
const renderHeroSlider = (banners = []) => {
  const container = document.querySelector('#heroSliderContainer');
  if (!container || banners.length === 0) return;

  state.banners = banners;

  // Tạo cấu trúc HTML Slider
  container.innerHTML = `
    <div class="hero-slider-track" id="sliderTrack">
      ${banners.map((b) => `
        <div class="hero-slide" style="background-image: url('${b.hinhbanner}')">
          <div class="hero-slide-overlay"></div>
          <div class="hero-slide-content">
            <div class="hero-tag" style="background: rgba(225, 29, 72, 0.25); border-color: rgba(253, 164, 175, 0.4);">
              <span>${b.tag || '✨ Phát Hành Mới'}</span>
            </div>
            <h1 class="hero-title" style="font-size: 2.1rem; line-height: 1.3; margin: 0.85rem 0;">
              ${b.tenbanner}
            </h1>
            <p class="hero-desc" style="font-size: 0.95rem; line-height: 1.5; color: #f1f5f9; margin-bottom: 1.5rem; max-width: 520px;">
              ${b.mota || 'Tác phẩm mới được phát hành chính ngạch với quà tặng độc quyền chỉ có tại Hikari BookStore.'}
            </p>
            <div class="hero-buttons">
              <a href="product-detail.html?id=${b.productId || 1}" class="btn btn-primary" style="font-weight: 700;">
                📖 Xem Chi Tiết Tác Phẩm
              </a>
              <button class="btn btn-outline btn-slide-buy" data-id="${b.productId || 1}" style="background: rgba(255,255,255,0.15); color: #fff;">
                ⚡ Mua Nhanh
              </button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Nút điều hướng Slider Trước / Sau -->
    <button class="slider-nav-btn slider-nav-prev" id="sliderPrevBtn" aria-label="Slide trước">&#10094;</button>
    <button class="slider-nav-btn slider-nav-next" id="sliderNextBtn" aria-label="Slide sau">&#10095;</button>

    <!-- Điểm chuyển Slider (Dots) -->
    <div class="slider-dots" id="sliderDots">
      ${banners.map((_, idx) => `
        <div class="slider-dot ${idx === 0 ? 'active' : ''}" data-index="${idx}"></div>
      `).join('')}
    </div>
  `;

  const track = document.querySelector('#sliderTrack');
  const dots = document.querySelectorAll('.slider-dot');
  const prevBtn = document.querySelector('#sliderPrevBtn');
  const nextBtn = document.querySelector('#sliderNextBtn');

  // Hàm chuyển slide
  const goToSlide = (index) => {
    if (index < 0) index = banners.length - 1;
    if (index >= banners.length) index = 0;
    state.currentSlideIndex = index;

    if (track) {
      track.style.transform = `translateX(-${index * 100}%)`;
    }

    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === index);
    });
  };

  // Khởi động Interval tự động chuyển slide (mỗi 4.5 giây)
  const startAutoSlide = () => {
    stopAutoSlide();
    state.sliderTimer = setInterval(() => {
      goToSlide(state.currentSlideIndex + 1);
    }, 4500);
  };

  const stopAutoSlide = () => {
    if (state.sliderTimer) {
      clearInterval(state.sliderTimer);
      state.sliderTimer = null;
    }
  };

  // Gắn sự kiện các nút
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      goToSlide(state.currentSlideIndex - 1);
      startAutoSlide();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      goToSlide(state.currentSlideIndex + 1);
      startAutoSlide();
    });
  }

  dots.forEach(dot => {
    dot.addEventListener('click', (e) => {
      const idx = Number(e.target.dataset.index);
      goToSlide(idx);
      startAutoSlide();
    });
  });

  // Tạm dừng khi di chuột vào slider, chạy tiếp khi rời
  container.addEventListener('mouseenter', stopAutoSlide);
  container.addEventListener('mouseleave', startAutoSlide);

  // Sự kiện mua nhanh trên banner slide (Bất đồng bộ)
  container.addEventListener('click', async (e) => {
    const buyBtn = e.target.closest('.btn-slide-buy');
    if (!buyBtn) return;
    const prodId = buyBtn.dataset.id;
    const prod = state.allProducts.find(p => String(p.id) === String(prodId));
    if (prod) {
      buyBtn.disabled = true;
      await addToCart(prod, 1);
      buyBtn.disabled = false;
    }
  });

  startAutoSlide();
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

// Gắn thông số soldCount (tổng số lượng đã bán theo hóa đơn) vào từng sản phẩm
const attachSalesToProducts = (products = [], orders = []) => {
  const salesMap = calculateSalesMap(orders);
  return products.map(p => ({
    ...p,
    soldCount: salesMap[p.id] || 0
  }));
};

// ================= KIỂM TRA LỊCH TRÌNH SALE THEO NGÀY (EVENT & HOLIDAY SCHEDULE) =================
// Quy tắc deadline: "ngày 20 sale nhưng khi đến ngày 21 tự động hết sale (tự động đến ngày lễ là sale)"
const checkSaleSchedule = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const mockDay = urlParams.get('sale_day'); // Hỗ trợ test linh hoạt: ?sale_day=20 hoặc ?sale_day=21
  const now = new Date();
  const currentDay = mockDay ? parseInt(mockDay, 10) : now.getDate();
  const currentMonth = now.getMonth() + 1;

  // Danh sách các ngày lễ tự động kích hoạt Sale
  const holidays = [
    { day: 1, month: 1, name: 'Tết Dương Lịch 2026' },
    { day: 14, month: 2, name: 'Lễ Tình Nhân Valentine' },
    { day: 8, month: 3, name: 'Quốc Tế Phụ Nữ 8/3' },
    { day: 21, month: 4, name: 'Ngày Sách Việt Nam' },
    { day: 30, month: 4, name: 'Đại Lễ 30/4 - 1/5' },
    { day: 1, month: 5, name: 'Quốc Tế Lao Động 1/5' },
    { day: 1, month: 6, name: 'Quốc Tế Thiếu Nhi' },
    { day: 2, month: 9, name: 'Quốc Khánh 2/9' },
    { day: 20, month: 10, name: 'Ngày Phụ Nữ VN 20/10' },
    { day: 20, month: 11, name: 'Ngày Nhà Giáo VN 20/11' },
    { day: 24, month: 12, name: 'Lễ Giáng Sinh' },
    { day: 25, month: 12, name: 'Lễ Giáng Sinh' }
  ];

  const matchedHoliday = holidays.find(h => h.day === currentDay && h.month === currentMonth);

  let isSaleActive = true;
  let eventName = 'FLASH SALE GIỜ VÀNG HÔM NAY';
  let eventDesc = 'Ưu đãi giảm sâu đến 35% - Tự động áp dụng theo thời gian thực!';
  let isDay21Expired = false;

  if (currentDay === 21) {
    // Ngày 21: Tự động hết sale của đợt ngày 20
    isSaleActive = false;
    isDay21Expired = true;
    eventName = '⏰ ĐÃ KẾT THÚC ĐỢT SALE NGÀY 20';
    eventDesc = 'Đợt siêu sale ngày 20 đã tự động đóng lúc 00:00:00 ngày 21. Hẹn gặp lại quý độc giả vào ngày 20 tháng sau!';
  } else if (currentDay === 20) {
    isSaleActive = true;
    eventName = '🔥 SIÊU SALE HIKARI NGÀY 20 (DUY NHẤT HÔM NAY)';
    eventDesc = '⚡ Đang diễn ra ngày hội giảm giá độc quyền ngày 20. Tự động kết thúc lúc 00:00:00 ngày 21!';
  } else if (matchedHoliday) {
    isSaleActive = true;
    eventName = `🎉 ĐẠI TIỆC SALE NGÀY LỄ: ${matchedHoliday.name.toUpperCase()}`;
    eventDesc = `Chào mừng ${matchedHoliday.name} - Giảm giá toàn diện cho độc giả thân yêu!`;
  }

  return { isSaleActive, eventName, eventDesc, isDay21Expired, currentDay };
};

// ================= RENDER PHÂN KHU FLASH SALE (SẢN PHẨM KHUYẾN MÃI) =================
const renderFlashSaleProducts = (products = []) => {
  const container = document.querySelector('#flashSaleGrid');
  if (!container) return;

  const schedule = checkSaleSchedule();

  // Nếu đợt sale ngày 20 đã hết hạn vào ngày 21
  if (!schedule.isSaleActive && schedule.isDay21Expired) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: var(--radius-md); padding: 2rem; text-align: center; color: #64748b;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⏰</div>
        <h3 style="color: #334155; font-size: 1.15rem; margin-bottom: 0.25rem;">Đợt Siêu Sale Ngày 20 Đã Tự Động Kết Thúc</h3>
        <p style="font-size: 0.875rem; margin-bottom: 1rem;">Chương trình đã tự động đóng lúc 00:00:00 ngày 21. Giá các tác phẩm đã trở về mức tiêu chuẩn.</p>
        <a href="products.html" class="btn btn-outline" style="display: inline-block;">📚 Khám Phá Toàn Bộ Kệ Sách</a>
      </div>
    `;
    return;
  }

  // Lọc các tác phẩm có mức giảm giá cao nhất (discount >= 10 hoặc originalPrice > price)
  const saleList = [...products]
    .filter(p => (Number(p.discount) || 0) > 0 || (p.originalPrice && p.originalPrice > p.price))
    .sort((a, b) => (Number(b.discount) || 0) - (Number(a.discount) || 0))
    .slice(0, 4);

  container.innerHTML = saleList.map(p => createProductCardHtml(p, { isFlashSale: true })).join('');
};

// Đồng hồ đếm ngược Flash Sale (Countdown Timer thời gian thực & Tự động theo sự kiện)
const startFlashSaleCountdown = () => {
  if (state.flashSaleTimer) clearInterval(state.flashSaleTimer);

  const hoursEl = document.querySelector('#timerHours');
  const minutesEl = document.querySelector('#timerMinutes');
  const secondsEl = document.querySelector('#timerSeconds');
  const titleEl = document.querySelector('.flashsale-title');
  const subtitleEl = document.querySelector('.flashsale-subtitle');
  const badgeEl = document.querySelector('.flashsale-badge');
  const countdownWrap = document.querySelector('.flashsale-countdown-wrap');
  if (!hoursEl || !minutesEl || !secondsEl) return;

  const schedule = checkSaleSchedule();

  if (titleEl && schedule.eventName) {
    titleEl.textContent = schedule.eventName;
  }
  if (subtitleEl && schedule.eventDesc) {
    subtitleEl.textContent = schedule.eventDesc;
  }
  if (badgeEl) {
    if (schedule.isDay21Expired) {
      badgeEl.textContent = '❌ ĐÃ HẾT ĐỢT SALE';
      badgeEl.style.background = '#64748b';
    } else if (schedule.currentDay === 20) {
      badgeEl.textContent = '🔥 SIÊU SALE NGÀY 20';
      badgeEl.style.background = '#dc2626';
    }
  }

  // Nếu là ngày 21 (đã tự động hết hạn)
  if (!schedule.isSaleActive && schedule.isDay21Expired) {
    hoursEl.textContent = '00';
    minutesEl.textContent = '00';
    secondsEl.textContent = '00';
    if (countdownWrap) {
      const label = countdownWrap.querySelector('.countdown-label');
      if (label) label.textContent = 'Trạng thái: Đã hết hạn lúc 00:00';
    }
    return;
  }

  const updateClock = () => {
    const now = new Date();
    // Đếm ngược đến thời khắc chuyển giao kết thúc (23:59:59 của ngày sale hiện tại)
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let diff = Math.max(0, Math.floor((endOfDay - now) / 1000));

    if (diff <= 0) {
      // Đúng lúc sang ngày 21: Tự động hết sale
      hoursEl.textContent = '00';
      minutesEl.textContent = '00';
      secondsEl.textContent = '00';
      if (titleEl) titleEl.textContent = '⏰ ĐÃ KẾT THÚC ĐỢT SALE NGÀY 20';
      if (subtitleEl) subtitleEl.textContent = 'Chương trình đã tự động đóng lúc 00:00 ngày 21. Hẹn gặp lại quý độc giả!';
      clearInterval(state.flashSaleTimer);
      return;
    }

    const hours = Math.floor(diff / 3600);
    diff %= 3600;
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;

    hoursEl.textContent = String(hours).padStart(2, '0');
    minutesEl.textContent = String(minutes).padStart(2, '0');
    secondsEl.textContent = String(seconds).padStart(2, '0');
  };

  updateClock();
  state.flashSaleTimer = setInterval(updateClock, 1000);
};

// ================= RENDER PHÂN KHU BÁN CHẠY (BEST SELLERS) THEO HÓA ĐƠN =================
const renderHotProducts = (products = []) => {
  const container = document.querySelector('#hotProductsGrid');
  if (!container) return;

  // Sắp xếp ưu tiên dựa trên số lượng bán ra đếm theo các hóa đơn (/orders) giảm dần
  const sortedBySales = [...products].sort((a, b) => {
    const soldDiff = (Number(b.soldCount) || 0) - (Number(a.soldCount) || 0);
    if (soldDiff !== 0) return soldDiff;
    return (Number(b.reviewsCount) || 0) - (Number(a.reviewsCount) || 0);
  });

  const hotList = sortedBySales.slice(0, 4);
  container.innerHTML = hotList.map(p => createProductCardHtml(p, { showSalesBadge: true })).join('');
};

// ================= RENDER PHÂN KHU SẢN PHẨM MỚI (NEW ARRIVALS - ĐẨY HÀNG CŨ) =================
const renderNewProducts = (products = []) => {
  const container = document.querySelector('#newProductsGrid');
  if (!container) return;

  // Sắp xếp theo ngày tạo / ID giảm dần: Đảm bảo hàng mới về hôm nay luôn đứng đầu và đẩy hàng hôm trước ra
  const sortedNewest = [...products].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : (Number(a.id) || 0);
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : (Number(b.id) || 0);
    return timeB - timeA;
  });

  // Chỉ lấy đúng top 4 sản phẩm mới nhất
  const newList = sortedNewest.slice(0, 4);

  // Cuốn mới nhất (vị trí đầu) hoặc cuốn nhập trong 24h được gắn huy hiệu "VỪA VỀ HÔM NAY"
  container.innerHTML = newList.map((p, idx) => {
    const isToday = idx === 0 || (p.createdAt && (Date.now() - new Date(p.createdAt).getTime() < 24 * 60 * 60 * 1000));
    return createProductCardHtml(p, { isToday });
  }).join('');
};

// ================= RENDER DANH MỤC (CATEGORIES) =================
const renderCategories = (categories = []) => {
  const container = document.querySelector('#categoryTabs');
  if (!container) return;

  container.innerHTML = `
    <button class="category-tab-btn active" data-id="0">
      <span>📚</span> Tất cả
    </button>
  `;

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-tab-btn';
    btn.dataset.id = cat.id;
    btn.innerHTML = `<span>${cat.icon || '📖'}</span> ${cat.name}`;
    container.appendChild(btn);
  });

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-tab-btn');
    if (!btn) return;

    container.querySelectorAll('.category-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    state.currentCategoryId = Number(btn.dataset.id);
    applyFiltersAndRender();
  });
};

// ================= RENDER DANH SÁCH SÁCH TỔNG HỢP (PRODUCTS) =================
const renderProducts = (products = []) => {
  const grid = document.querySelector('#productGrid');
  const countEl = document.querySelector('#productCount');
  if (!grid) return;

  if (countEl) {
    countEl.textContent = products.length;
  }

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3 class="empty-title">Không tìm thấy sách phù hợp</h3>
        <p class="empty-desc">Thử tìm kiếm với từ khóa khác hoặc xóa bớt bộ lọc để xem thêm nhiều sách hay nhé!</p>
        <button class="btn btn-primary" id="resetFilterBtn">
          🔄 Xóa bộ lọc & Xem tất cả
        </button>
      </div>
    `;

    const resetBtn = document.querySelector('#resetFilterBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetAllFilters);
    }
    return;
  }

  grid.innerHTML = products.map(p => createProductCardHtml(p)).join('');
};

// ================= BỘ LỌC VÀ SẮP XẾP (FILTER & SORT) =================
const applyFiltersAndRender = () => {
  let result = [...state.allProducts];

  // 1. Lọc theo Danh mục (categoryId)
  if (state.currentCategoryId !== 0) {
    result = result.filter(item => item.categoryId === state.currentCategoryId);
  }

  // 2. Tìm kiếm theo Từ khóa (Tên sách hoặc Tác giả hoặc NXB)
  if (state.searchKeyword.trim() !== '') {
    const keyword = state.searchKeyword.toLowerCase().trim();
    result = result.filter(item => {
      const matchName = item.name && item.name.toLowerCase().includes(keyword);
      const matchAuthor = item.author && item.author.toLowerCase().includes(keyword);
      const matchPublisher = item.publisher && item.publisher.toLowerCase().includes(keyword);
      return matchName || matchAuthor || matchPublisher;
    });
  }

  // 3. Lọc theo Khoảng giá
  if (state.priceRange === 'under50') {
    result = result.filter(item => item.price < 50000);
  } else if (state.priceRange === '50to100') {
    result = result.filter(item => item.price >= 50000 && item.price <= 100000);
  } else if (state.priceRange === 'over100') {
    result = result.filter(item => item.price > 100000);
  }

  // 4. Lọc theo Mức giảm giá (Khuyến mãi)
  if (state.discountFilter === 'tier10') {
    result = result.filter(item => item.discount >= 10 && item.discount < 20);
  } else if (state.discountFilter === 'tier20') {
    result = result.filter(item => item.discount >= 20 && item.discount < 30);
  } else if (state.discountFilter === 'tier30') {
    result = result.filter(item => item.discount >= 30);
  }

  // 5. Sắp xếp (Sort)
  if (state.sortBy === 'price-asc') {
    result.sort((a, b) => a.price - b.price);
  } else if (state.sortBy === 'price-desc') {
    result.sort((a, b) => b.price - a.price);
  } else if (state.sortBy === 'name-asc') {
    result.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  } else if (state.sortBy === 'name-desc') {
    result.sort((a, b) => b.name.localeCompare(a.name, 'vi'));
  } else if (state.sortBy === 'hot') {
    result.sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0));
  }

  renderProducts(result);
};

// Reset toàn bộ bộ lọc
const resetAllFilters = () => {
  state.currentCategoryId = 0;
  state.searchKeyword = '';
  state.priceRange = 'all';
  state.discountFilter = 'all';
  state.sortBy = 'default';

  const searchInput = document.querySelector('#searchInput');
  const clearBtn = document.querySelector('#clearSearchBtn');
  const priceSelect = document.querySelector('#priceFilterSelect');
  const discountSelect = document.querySelector('#discountFilterSelect');
  const sortSelect = document.querySelector('#sortSelect');
  const categoryTabs = document.querySelector('#categoryTabs');

  if (searchInput) searchInput.value = '';
  if (clearBtn) clearBtn.classList.remove('active');
  if (priceSelect) priceSelect.value = 'all';
  if (discountSelect) discountSelect.value = 'all';
  if (sortSelect) sortSelect.value = 'default';

  if (categoryTabs) {
    categoryTabs.querySelectorAll('.category-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.id === '0');
    });
  }

  applyFiltersAndRender();
};

// ================= KIỂM TRA & TẶNG MÃ SINH NHẬT =================
const checkBirthdayReward = () => {
  const userJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
  if (!userJson) return;

  try {
    const user = JSON.parse(userJson);
    if (!user || !user.birthday) return;

    // Lấy tháng sinh của người dùng và tháng hiện tại
    const birthDate = new Date(user.birthday);
    const birthMonth = birthDate.getMonth() + 1; // 1-12
    const currentMonth = new Date().getMonth() + 1;

    // Nếu trùng tháng sinh và chưa hiển thị modal trong phiên làm việc hiện tại
    const dismissedKey = `birthday_dismissed_${user.id}_m${currentMonth}`;
    if (birthMonth === currentMonth && !sessionStorage.getItem(dismissedKey)) {
      const modal = document.querySelector('#birthdayModal');
      const copyBtn = document.querySelector('#copyBirthdayCodeBtn');
      const closeBtn = document.querySelector('#closeBirthdayModalBtn');
      const useBtn = document.querySelector('#useBirthdayCodeBtn');
      const codeText = document.querySelector('#birthdayCodeText');

      if (!modal) return;
      modal.style.display = 'flex';

      const dismissModal = () => {
        modal.style.display = 'none';
        sessionStorage.setItem(dismissedKey, 'true');
      };

      if (copyBtn && codeText) {
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(codeText.textContent.trim());
            copyBtn.textContent = 'Đã chép! ✓';
            copyBtn.style.background = 'var(--success)';
            setTimeout(() => {
              copyBtn.textContent = 'Sao chép';
              copyBtn.style.background = '';
            }, 2500);
          } catch (err) {
            alert('Mã giảm giá sinh nhật của bạn: ' + codeText.textContent.trim());
          }
        });
      }

      if (closeBtn) {
        closeBtn.addEventListener('click', dismissModal);
      }

      if (useBtn) {
        useBtn.addEventListener('click', dismissModal);
      }
    }
  } catch (err) {
    console.warn('Lỗi kiểm tra sinh nhật:', err);
  }
};

// ================= GẮN SỰ KIỆN TƯƠNG TÁC (EVENT LISTENERS) =================
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

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
          window.location.href = `products.html?q=${encodeURIComponent(query)}`;
        }
      }
    });
  }

  // 2. Nút xóa ô tìm kiếm
  if (clearBtn && searchInput) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.searchKeyword = '';
      clearBtn.classList.remove('active');
      searchInput.focus();
      applyFiltersAndRender();
    });
  }

  // 3. Lọc khoảng giá
  const priceSelect = document.querySelector('#priceFilterSelect');
  if (priceSelect) {
    priceSelect.addEventListener('change', (e) => {
      state.priceRange = e.target.value;
      applyFiltersAndRender();
    });
  }

  // 4. Lọc mức giảm giá
  const discountSelect = document.querySelector('#discountFilterSelect');
  if (discountSelect) {
    discountSelect.addEventListener('change', (e) => {
      state.discountFilter = e.target.value;
      applyFiltersAndRender();
    });
  }

  // 5. Sắp xếp
  const sortSelect = document.querySelector('#sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      applyFiltersAndRender();
    });
  }

  // 6. Thêm vào giỏ hàng từ bất kỳ grid nào (Bất đồng bộ)
  const handleAddToCartClick = async (e) => {
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
  };

  const grid = document.querySelector('#productGrid');
  if (grid) grid.addEventListener('click', handleAddToCartClick);

  const flashGrid = document.querySelector('#flashSaleGrid');
  if (flashGrid) flashGrid.addEventListener('click', handleAddToCartClick);

  const hotGrid = document.querySelector('#hotProductsGrid');
  if (hotGrid) hotGrid.addEventListener('click', handleAddToCartClick);

  const newGrid = document.querySelector('#newProductsGrid');
  if (newGrid) newGrid.addEventListener('click', handleAddToCartClick);
};

// Tải lại dữ liệu sản phẩm và hóa đơn mới nhất từ CSDL và render lại view
const refreshProductsData = async () => {
  try {
    const [products, orders] = await Promise.all([
      fetchProducts(),
      fetchOrders()
    ]);
    state.orders = orders;
    const productsWithSales = attachSalesToProducts(products, orders);
    state.allProducts = productsWithSales;

    renderFlashSaleProducts(productsWithSales);
    renderHotProducts(productsWithSales);
    renderNewProducts(productsWithSales);
    applyFiltersAndRender();
    updateCartBadge();
    checkCurrentUser();
    checkBirthdayReward();
  } catch (error) {
    console.error('Lỗi làm mới danh sách sản phẩm:', error);
  }
};

// ================= KHỞI TẠO ỨNG DỤNG (INIT) =================
let isInitialized = false;

const initApp = async () => {
  updateCartBadge();
  checkCurrentUser();

  if (!isInitialized) {
    setupEventListeners();
    isInitialized = true;
  }

  try {
    const [categories, products, banners, orders] = await Promise.all([
      fetchCategories(),
      fetchProducts(),
      fetchBanners(),
      fetchOrders()
    ]);

    state.categories = categories;
    state.banners = banners;
    state.orders = orders;

    const productsWithSales = attachSalesToProducts(products, orders);
    state.allProducts = productsWithSales;

    renderHeroSlider(banners);
    renderFlashSaleProducts(productsWithSales);
    startFlashSaleCountdown();
    renderHotProducts(productsWithSales);
    renderNewProducts(productsWithSales);
    renderCategories(categories);
    applyFiltersAndRender();
    checkBirthdayReward();
  } catch (error) {
    console.error('Lỗi khi khởi tạo ứng dụng:', error);
  }
};

// Chạy khi DOM đã sẵn sàng
document.addEventListener('DOMContentLoaded', initApp);

// Tự động cập nhật tồn kho khi quay lại trang bằng nút Back (pageshow)
window.addEventListener('pageshow', () => {
  refreshProductsData();
});

// Tự động cập nhật khi người dùng chuyển lại tab Trang chủ (focus)
window.addEventListener('focus', () => {
  refreshProductsData();
});

// Lắng nghe tín hiệu cập nhật tồn kho từ trang Giỏ hàng hoặc trang Chi tiết
window.addEventListener('storage', (e) => {
  if (e.key === 'stock_last_updated' || e.key === 'hikari_cart' || e.key === 'currentUser') {
    refreshProductsData();
  }
});

window.addEventListener('stockUpdated', () => {
  refreshProductsData();
});

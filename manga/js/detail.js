/**
 * detail.js - Xử lý logic nghiệp vụ cho Trang Chi Tiết Sản Phẩm (product-detail.html)
 * Áp dụng ES6+: URLSearchParams, async/await, Array methods, Destructuring, Template literals
 */
import { fetchProductById, fetchProducts } from './api.js';
import { formatPrice, addToCart, updateCartBadge, checkCurrentUser } from './utils.js';

let currentProduct = null;
let currentQuantity = 1;

// Lấy tham số 'id' từ đường dẫn URL (Query String)
const getProductIdFromUrl = () => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('id');
};

// Render Breadcrumb điều hướng
const renderBreadcrumb = (product) => {
  const breadcrumbEl = document.querySelector('#breadcrumb');
  if (!breadcrumbEl) return;

  breadcrumbEl.innerHTML = `
    <a href="index.html">Trang chủ</a>
    <span class="breadcrumb-separator">/</span>
    <a href="products.html">${product.categoryName || 'Sách'}</a>
    ${product.genre ? `
      <span class="breadcrumb-separator">/</span>
      <span style="color: #64748b; font-weight: 500;">${product.genre}</span>
    ` : ''}
    <span class="breadcrumb-separator">/</span>
    <span class="breadcrumb-current">${product.name}</span>
  `;
};

// Render Chi tiết sản phẩm
const renderProductDetail = (product) => {
  const container = document.querySelector('#productDetailContent');
  if (!container) return;

  currentProduct = product;
  document.title = `${product.name} - Hikari BookStore`;

  const {
    id,
    name,
    author,
    publisher,
    translator,
    price,
    originalPrice,
    discount,
    image,
    categoryName,
    genre,
    description,
    pages,
    publishYear,
    format,
    rating,
    reviewsCount,
    stock
  } = product;

  const currentUser = JSON.parse(localStorage.getItem('user'));
  const wishlist = (currentUser && currentUser.name) ? (JSON.parse(localStorage.getItem('hikari_wishlist')) || []) : [];
  const isWishlisted = Boolean(currentUser && wishlist.some(wId => String(wId) === String(product.id)));

  container.innerHTML = `
    <div class="product-detail-card">
      <!-- CỘT TRÁI: HÌNH ẢNH SẢN PHẨM -->
      <div class="detail-media-wrap">
        <div class="detail-image-box">
          <img 
            src="${image}" 
            alt="${name}" 
            id="mainBookImage"
            onerror="this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80'"
          />
          ${discount ? `<span class="detail-badge-sale">GIẢM ${discount}%</span>` : ''}
        </div>

        <div class="detail-guarantee-box">
          <div class="guarantee-item">
            <span>🛡️</span>
            <div><strong>Cam kết 100% sách thật:</strong> Bồi thường 200% nếu phát hiện sách lậu.</div>
          </div>
          <div class="guarantee-item">
            <span>🎁</span>
            <div><strong>Dịch vụ đặc biệt:</strong> Bọc màng Plastic & tặng kèm Bookmark.</div>
          </div>
          <div class="guarantee-item">
            <span>⚡</span>
            <div><strong>Giao hàng hỏa tốc:</strong> Nhận hàng ngay trong 2h tại TP.HCM & Hà Nội.</div>
          </div>
        </div>
      </div>

      <!-- CỘT PHẢI: THÔNG TIN CHI TIẾT SÁCH -->
      <div class="detail-info-wrap">
        <div class="detail-tags-row" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 0.85rem;">
          <span class="detail-category-badge" style="margin-bottom: 0;">${categoryName || 'Sách chính hãng'}</span>
          ${genre ? `<span class="detail-genre-badge" style="background: #fdf2f8; color: #db2777; font-size: 0.8125rem; font-weight: 700; padding: 0.3rem 0.75rem; border-radius: 9999px; border: 1px solid #fbcfe8; display: inline-flex; align-items: center; gap: 4px;">🏷️ Thể loại: ${genre}</span>` : ''}
        </div>
        <h1 class="detail-title">${name}</h1>

        <div class="detail-meta-list">
          <div>Tác giả: <strong>${author || 'Đang cập nhật'}</strong></div>
          <div>NXB: <strong>${publisher || 'Đang cập nhật'}</strong></div>
          <div>Dịch giả: <strong>${translator || 'Nguyên tác'}</strong></div>
          <div>Năm XB: <strong>${publishYear || 2024}</strong></div>
          ${genre ? `<div>Thể loại: <strong style="color: #db2777;">${genre}</strong></div>` : ''}
        </div>

        <!-- KHỐI GIÁ BÁN -->
        <div class="detail-price-box">
          <span class="detail-price-current">${formatPrice(price)}</span>
          ${originalPrice ? `<span class="detail-price-original">${formatPrice(originalPrice)}</span>` : ''}
          ${discount ? `<span class="detail-save-badge">Tiết kiệm ${formatPrice(originalPrice - price)}</span>` : ''}
        </div>

        <!-- CHỌN SỐ LƯỢNG & NÚT HÀNH ĐỘNG -->
        <div class="detail-action-section">
          ${stock > 0 ? `
            <div class="quantity-row">
              <span class="quantity-label">Số lượng:</span>
              <div class="quantity-selector">
                <button class="qty-btn" id="btnDecreaseQty" type="button">-</button>
                <input type="number" id="qtyInput" class="qty-input" value="1" min="1" max="${stock}" readonly />
                <button class="qty-btn" id="btnIncreaseQty" type="button">+</button>
              </div>
              <span class="stock-indicator in-stock">
                ✓ Còn <strong>${stock}</strong> cuốn trong kho
              </span>
            </div>

            <div class="btn-group-actions" style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
              <button class="btn-add-detail" id="btnAddToCart">
                🛒 Thêm Vào Giỏ Hàng
              </button>
              <button class="btn-buy-now" id="btnBuyNow">
                ⚡ Mua Ngay
              </button>
              <button class="btn-card-wishlist ${isWishlisted ? 'active' : ''}" data-id="${id}" data-name="${name}" title="Thêm vào danh sách yêu thích" style="border: 2px solid #e2e8f0; border-radius: 8px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; font-size: 1.35rem; cursor: pointer; background: #fff; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                ${isWishlisted ? '❤️' : '🤍'}
              </button>
            </div>
          ` : `
            <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: var(--radius-md); padding: 1.25rem; text-align: center;">
              <span style="font-size: 1.1rem; font-weight: 800; color: var(--danger); display: block; margin-bottom: 0.35rem;">
                ✗ SẢN PHẨM TẠM THỜI HẾT HÀNG
              </span>
              <p style="font-size: 0.875rem; color: var(--gray-600); margin: 0;">
                Tác phẩm này hiện đã hết hàng trong kho. Vui lòng quay lại sau khi nhà sách nhập thêm bản in mới!
              </p>
            </div>
          `}
        </div>
      </div>
    </div>

    <!-- TABS MÔ TẢ & THÔNG SỐ SẢN PHẨM -->
    <div class="product-tabs-section">
      <div class="tabs-header">
        <div class="tab-title">
          <span>📖</span> Giới Thiệu Tác Phẩm
        </div>
      </div>

      <div class="product-description-content">
        <p>${description || 'Chưa có mô tả cho tác phẩm này.'}</p>
      </div>

      <div class="tabs-header" style="margin-top: 2rem;">
        <div class="tab-title">
          <span>📋</span> Thông Tin Chi Tiết
        </div>
      </div>

      <table class="product-specs-table">
        <tbody>
          <tr>
            <th>Công ty phát hành</th>
            <td>${publisher || 'NXB Kim Đồng / Trẻ / IPM'}</td>
          </tr>
          <tr>
            <th>Tác giả</th>
            <td>${author}</td>
          </tr>
          <tr>
            <th>Người dịch</th>
            <td>${translator || 'Nguyên tác'}</td>
          </tr>
          <tr>
            <th>Năm xuất bản</th>
            <td>${publishYear || 2024}</td>
          </tr>
          <tr>
            <th>Danh mục</th>
            <td>${categoryName || 'Sách'}</td>
          </tr>
          <tr>
            <th>Thể loại</th>
            <td><strong style="color: #db2777;">${genre || 'Đang cập nhật'}</strong></td>
          </tr>
          <tr>
            <th>Số trang</th>
            <td>${pages || 200} trang</td>
          </tr>
          <tr>
            <th>Hình thức bìa</th>
            <td>${format || 'Bìa mềm cao cấp'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  // Gắn sự kiện tăng/giảm số lượng và thêm giỏ hàng
  setupDetailInteractions(product);
};

// Gắn sự kiện cho các nút trên trang chi tiết
const setupDetailInteractions = (product) => {
  const qtyInput = document.querySelector('#qtyInput');
  const btnDec = document.querySelector('#btnDecreaseQty');
  const btnInc = document.querySelector('#btnIncreaseQty');
  const btnAdd = document.querySelector('#btnAddToCart');
  const btnBuy = document.querySelector('#btnBuyNow');

  if (btnDec && qtyInput) {
    btnDec.addEventListener('click', () => {
      let val = Number(qtyInput.value);
      if (val > 1) {
        val -= 1;
        qtyInput.value = val;
        currentQuantity = val;
      }
    });
  }

  if (btnInc && qtyInput) {
    btnInc.addEventListener('click', () => {
      let val = Number(qtyInput.value);
      const maxStock = product.stock || 99;
      if (val < maxStock) {
        val += 1;
        qtyInput.value = val;
        currentQuantity = val;
      } else {
        showToast(`Đã đạt số lượng tồn kho tối đa (${maxStock} cuốn)!`, 'info');
      }
    });
  }

  if (btnAdd) {
    btnAdd.addEventListener('click', async () => {
      btnAdd.disabled = true;
      btnAdd.style.opacity = '0.7';
      await addToCart(product, currentQuantity);
      btnAdd.disabled = false;
      btnAdd.style.opacity = '1';
    });
  }

  if (btnBuy) {
    btnBuy.addEventListener('click', async () => {
      btnBuy.disabled = true;
      const added = await addToCart(product, currentQuantity);
      if (added) {
        window.location.href = 'cart.html';
      } else {
        btnBuy.disabled = false;
      }
    });
  }
};

// Render Sách cùng thể loại (Related Books)
const renderRelatedBooks = async (currentProduct) => {
  const relatedGrid = document.querySelector('#relatedGrid');
  if (!relatedGrid || !currentProduct) return;

  try {
    const allProducts = await fetchProducts();
    // Dùng filter lọc các sách cùng categoryId trừ cuốn hiện tại
    const relatedList = allProducts
      .filter(item => item.categoryId === currentProduct.categoryId && item.id !== currentProduct.id)
      .slice(0, 4); // Lấy tối đa 4 cuốn

    if (relatedList.length === 0) {
      relatedGrid.parentElement.style.display = 'none';
      return;
    }

    relatedGrid.innerHTML = relatedList.map(item => `
      <article class="product-card" data-id="${item.id}">
        <div class="product-card-image-wrap" style="height: 240px;">
          <a href="product-detail.html?id=${item.id}">
            <img 
              src="${item.image}" 
              alt="${item.name}" 
              class="product-card-image"
              onerror="this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80'"
            />
          </a>
          ${item.discount ? `<span class="product-badge-discount">-${item.discount}%</span>` : ''}
        </div>
        <div class="product-card-body">
          <h4 class="product-title" style="height: 2.5rem; font-size: 0.9375rem;">
            <a href="product-detail.html?id=${item.id}">${item.name}</a>
          </h4>
          <p class="product-author" style="margin-bottom: 0.5rem;">${item.author}</p>
          <div class="product-price-row">
            <span class="product-price-current" style="font-size: 1.05rem;">${formatPrice(item.price)}</span>
          </div>
          <div class="product-card-actions">
            <a href="product-detail.html?id=${item.id}" class="btn-detail" style="width: 100%;">
              Xem chi tiết →
            </a>
          </div>
        </div>
      </article>
    `).join('');
  } catch (error) {
    console.error('Lỗi khi tải sách cùng thể loại:', error);
  }
};

// Hiển thị trạng thái lỗi nếu không tìm thấy ID sản phẩm
const renderNotFound = () => {
  const container = document.querySelector('#productDetailContent');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📕</div>
      <h2 class="empty-title">Không tìm thấy thông tin sản phẩm</h2>
      <p class="empty-desc">Cuốn sách bạn đang tìm không tồn tại hoặc đã ngừng kinh doanh.</p>
      <a href="index.html" class="btn btn-primary">
        ← Quay lại trang chủ
      </a>
    </div>
  `;
};

// Khởi tạo trang chi tiết
const initDetailPage = async () => {
  updateCartBadge();
  checkCurrentUser();

  const productId = getProductIdFromUrl();
  if (!productId) {
    renderNotFound();
    return;
  }

  const loadingEl = document.querySelector('#loadingIndicator');
  if (loadingEl) loadingEl.style.display = 'block';

  try {
    const product = await fetchProductById(productId);
    if (loadingEl) loadingEl.style.display = 'none';

    if (!product) {
      renderNotFound();
      return;
    }

    renderBreadcrumb(product);
    renderProductDetail(product);
    renderRelatedBooks(product);
  } catch (error) {
    if (loadingEl) loadingEl.style.display = 'none';
    console.error('Lỗi khi tải chi tiết sản phẩm:', error);
    renderNotFound();
  }
};

// 1. Chạy khi DOM đã sẵn sàng
document.addEventListener('DOMContentLoaded', initDetailPage);

// 2. Tự động cập nhật lại tồn kho khi quay lại trang từ nút Back (pageshow)
window.addEventListener('pageshow', () => {
  initDetailPage();
});

// 3. Tự động cập nhật khi chuyển tab trình duyệt (focus)
window.addEventListener('focus', () => {
  initDetailPage();
});

// 4. Lắng nghe tín hiệu cập nhật tồn kho khi đơn hàng được đặt (storage & custom event)
window.addEventListener('storage', (e) => {
  if (e.key === 'stock_last_updated' || e.key === 'hikari_cart') {
    initDetailPage();
  }
});

window.addEventListener('stockUpdated', () => {
  initDetailPage();
});

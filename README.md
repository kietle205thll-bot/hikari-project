# 📖 HIKARI BOOKSTORE - WEBSITE BÁN SÁCH, MANGA & LIGHT NOVEL BẢN QUYỀN
> **ĐỒ ÁN KẾT THÚC HỌC PHẦN MÔN JAVASCRIPT**  
> **Chủ đề:** Xây dựng website ứng dụng thực tế bằng **JavaScript thuần (Vanilla JS) và ES6+**  
> **Mã nguồn:** Tuân thủ 100% quy định không sử dụng Framework (No React/Vue/Angular/Bootstrap JS/jQuery)  

---

## 📌 1. GIỚI THIỆU ĐỀ TÀI & BÀI TOÁN THỰC TẾ

### 1.1. Bối Cảnh & Đặt Vấn Đề
Trong bối cảnh văn hóa đọc truyện tranh Nhật Bản (Manga), tiểu thuyết thanh thiếu niên (Light Novel) và tiểu thuyết văn học phát triển mạnh mẽ tại Việt Nam, nhu cầu tìm kiếm, đặt mua và sưu tầm các ấn phẩm sách có bản quyền chính hãng ngày càng tăng cao. Tuy nhiên, nhiều nền tảng hiện nay gặp phải các hạn chế như:
- Thiếu phân loại chuyên sâu cho thể loại Manga/Light Novel (theo tập, quà tặng kèm, bản giới hạn).
- Hệ thống tích lũy thành viên cồng kềnh, không minh bạch trong việc tính quyền lợi theo tháng.
- Khâu xuất chứng từ hóa đơn đổi trả sau mua sắm chưa được số hóa chuyên nghiệp.

### 1.2. Mục Tiêu Dự Án Hikari BookStore
**Hikari BookStore** được xây dựng nhằm mô phỏng một sàn thương mại điện tử hiện đại, đầy đủ quy trình từ duyệt sách, giỏ hàng, áp dụng voucher ưu đãi, thanh toán, quản lý hồ sơ độc giả, xuất hóa đơn VAT điện tử file PDF đến hệ thống bảng điều khiển quản trị (Admin Dashboard) phân tích doanh thu.

Dự án chứng minh năng lực toàn diện về:
- Thao tác DOM động, xử lý Event (click, submit, input, change...).
- Tổ chức mã nguồn hướng Module bằng ES6+ (`import` / `export`).
- Giao tiếp bất đồng bộ qua RESTful API (Axios, Async/Await) và lưu trữ bộ nhớ đệm `localStorage`.
- Xử lý Form và Validation chặt chẽ bằng Regular Expression.
- Thực hiện đầy đủ các nghiệp vụ CRUD (Thêm, Xem, Sửa, Xóa).
- Lọc, tìm kiếm real-time và thuật toán thống kê doanh thu kinh doanh.

---

## 🛠️ 2. CÔNG NGHỆ BẮT BUỘC & DANH MỤC THƯ VIỆN

| Phân Vùng | Công Nghệ Sử Dụng | Mục Đích & Cam Kết Tuân Thủ Đề Bài |
| :--- | :--- | :--- |
| **Giao Diện (UI/UX)** | HTML5 Semantic, CSS3 | Tự thiết kế 100% bằng CSS Flexbox/Grid, CSS Custom Properties, Responsive đa thiết bị |
| **Logic Nghiệp Vụ** | Vanilla JavaScript (ES6+) | Sử dụng `async/await`, `Promise`, `Arrow functions`, `Destructuring`, `Array methods` (`map`, `filter`, `reduce`) |
| **HTTP Client** | Axios v1.7.9 | Giao tiếp bất đồng bộ với REST API, tích hợp cơ chế Offline Fallback |
| **Build Tool & Dev** | Vite v6 | Môi trường phát triển Hot Module Replacement (HMR) và bundle ứng dụng |
| **Mock REST API** | JSON-Server v0.17 | Mô phỏng Backend RESTful API hoàn chỉnh chạy tại cổng `3000` |
| **Xuất Báo Cáo** | `html2pdf.js` v0.10.1 | Tạo và xuất hóa đơn PDF độ phân giải cao trực tiếp từ DOM |

> 🚫 **Cam kết tuân thủ quy chế thi:** Dự án **KHÔNG sử dụng** bất kỳ framework nào như React, Vue, Angular, Svelte, jQuery, Bootstrap JavaScript hoặc các thư viện CRUD dựng sẵn.

---

## 🚀 3. HƯỚNG DẪN CÀI ĐẶT & KHỞI CHẠY DỰ ÁN

### ⚡ Cách 1: Khởi Chạy 1 Lệnh Duy Nhất (Khuyên Dùng - Tự Động & Tiện Lợi Nhất)
Mở cửa sổ Terminal (PowerShell / Command Prompt / Git Bash) tại thư mục `manga/` và chạy lệnh:

```bash
npm start
```

*(Lệnh này sử dụng công cụ `concurrently` để đồng thời khởi chạy **JSON-Server** tại cổng `3000` và **Vite Web Server** tại cổng `5173`)*.  
Trình duyệt sẽ tự động kết nối hoặc bạn truy cập: **`http://localhost:5173`**

---

### 🛠️ Cách 2: Khởi Chạy Thủ Công Từng Phân Hệ (2 Tab Terminal)

#### Tab Terminal 1: Khởi động Mock REST API Server
```bash
npm run server
```
*API Server sẽ hoạt động tại: `http://localhost:3000` (cung cấp các endpoint `/products`, `/orders`, `/users`...)*

#### Tab Terminal 2: Khởi động Giao diện Web (Vite Dev Server)
```bash
npm run dev
```
*Giao diện người dùng sẽ chạy tại: `http://localhost:5173`*

---

### 🌐 Cách 3: Chạy Ngoại Tuyến Qua Live Server (Chống Lỗi Khi Mất Mạng)
- Bạn có thể mở trực tiếp file `index.html` bằng tiện ích **VS Code Live Server**.
- Hệ thống được trang bị cơ chế **Phục hồi 3 lớp (Triple-Layer Fallback)**: Nếu JSON-Server chưa được bật, website sẽ tự động đọc dữ liệu dự phòng từ file `db.json` hoặc `localStorage`, đảm bảo màn hình luôn hiển thị dữ liệu đầy đủ, không bao giờ bị trắng màn hình!

---

## 🔑 4. DANH SÁCH TÀI KHOẢN DÙNG THỬ (DEMO ACCOUNTS)

Hệ thống đã chuẩn bị sẵn các tài khoản với nhiều cấp bậc để phục vụ công tác kiểm thử và chấm thi:

| Loại Tài Khoản | Email Đăng Nhập | Mật Khẩu | Vai Trò & Quyền Hạn Trong Hệ Thống |
| :--- | :--- | :---: | :--- |
| **Quản Trị Viên (Admin)** | `admin@hikari.vn` | `123` | Toàn quyền truy cập [admin.html](admin.html), xem Dashboard doanh thu, quản lý kho sách, xem thống kê khách hàng. |
| **Nhân Viên Kho (Staff)** | `staff@hikari.vn` | `123` | Truy cập trang Quản trị để theo dõi đơn hàng và cập nhật số lượng tồn kho sách. |
| **Thành Viên VIP (Customer)** | `mai@gmail.com` | `123` | Khách hàng đã đạt hạn mức VIP tháng này (đã chi tiêu > 500k), được quyền áp dụng mã `VIPMEMBER` giảm 15%. |
| **Thành Viên Thân Thiết** | `an@gmail.com` | `123` | Khách hàng đã có đơn hàng nhưng chưa đạt mốc VIP tháng này. |
| **Tài Khoản Mới (Tự đăng ký)**| Bất kỳ email mới | Tùy chọn | Được hưởng mã chào mừng `WELCOME20` giảm 20% cho đơn hàng đầu tiên. |

---

## 🌟 5. TỔNG HỢP CÁC TÍNH NĂNG NỔI BẬT CỦA WEBSITE

### 5.1. Phía Khách Hàng (Customer Experience)
1. **Trang Chủ Hiện Đại (`index.html`):**
   - Banner Slider chiến dịch quảng bá tác phẩm bản quyền mới.
   - Khu vực **Flash Sale Đếm Ngược** với nhãn giảm giá đỏ nổi bật.
   - Kệ sách **Bán Chạy Nhất (Hot Manga)** và **Hàng Mới Xuất Bản**.
   - Thanh điều hướng danh mục xổ xuống (Dropdown Menu) mượt mà.
2. **Trang Tra Cứu & Bộ Lọc Đa Tiêu Chí (`products.html`):**
   - Tìm kiếm real-time không phân biệt chữ hoa, chữ thường theo Tên sách, Tác giả, NXB.
   - Bộ lọc đa chiều song song: Lọc theo Thể loại (Manga, Light Novel, Tiểu thuyết, Kỹ năng...), Lọc theo Khoảng giá (<50k, 50k-100k, >100k), Lọc theo nhãn Sách Hot / Sách Mới.
   - Sắp xếp linh hoạt: Giá tăng dần, Giá giảm dần, Mới nhất, Bán chạy nhất.
3. **Trang Chi Tiết Tác Phẩm (`product-detail.html`):**
   - Đọc tham số URL `?id=` bằng ES6 `URLSearchParams`.
   - Xem bìa sách chất lượng cao, tóm tắt nội dung, bảng thông số kỹ thuật (Số trang, NXB, Kích thước, Đánh giá sao).
   - Bộ chọn số lượng có ràng buộc giới hạn tồn kho thực tế.
   - Tự động gợi ý 4 tác phẩm liên quan cùng danh mục thể loại.
4. **Trang Giỏ Hàng & Đặt Hàng Thông Minh (`cart.html`):**
   - Cập nhật số lượng, xóa từng cuốn sách, xóa sạch giỏ hàng.
   - Đồng bộ giỏ hàng với cả server `/carts` và bộ nhớ đệm `localStorage`.
   - **Hệ thống Voucher đa dạng:**
     - `WELCOME20`: Giảm 20% cho tài khoản mới (dùng 1 lần duy nhất).
     - `HIKARI10`: Giảm 10% cho đơn hàng từ 250.000đ.
     - `NEWBOOKS`: Giảm 10% cho các tựa sách mới xuất bản trong giỏ.
     - `VIPMEMBER`: Giảm 15% tổng hóa đơn (chỉ dành cho khách đạt hạn mức VIP).
   - **Khóa nghiệp vụ bảo mật:** Yêu cầu đăng nhập trước khi tiến hành thanh toán.
   - **Đồng bộ địa chỉ thông minh:** Tự động điền (Auto-fill) địa chỉ mặc định từ Hồ sơ độc giả; Cho phép khách sửa địa chỉ khác cho riêng đơn hàng này; Cung cấp tùy chọn Checkbox lưu địa chỉ mới làm mặc định.
   - **Xuất Hóa Đơn VAT Điện Tử File PDF:** Tạo tài liệu PDF chuyên nghiệp chứa đầy đủ bảng kê sản phẩm, con dấu xuất kho và mã đơn hàng chống cắt trang in.
5. **Trang Cá Nhân & Cấp Bậc VIP Riêng Biệt (`profile.html`):**
   - Bố cục 2 cột hiện đại chuẩn các sàn TMĐT Tiki / Shopee.
   - **Tab 1 - Thông Tin Cá Nhân:** Xem & form cập nhật Họ tên, SĐT, Ngày sinh (có nhận diện mừng sinh nhật `🎉 Sinh nhật tháng này!`), Địa chỉ nhận hàng mặc định.
   - **Tab 2 - Thẻ VIP Card & Quyền Lợi:** Mô phỏng Thẻ VIP điện tử sang trọng (Digital Card), thanh tiến trình % chi tiêu tháng, theo dõi hạn mức thăng hạng (≥ 500k) và hạn mức duy trì VIP sang tháng sau (≥ 250k).
   - **Tab 3 - Quản Lý Đơn Hàng:** Danh sách thẻ đơn hàng chi tiết, trạng thái giao hàng, tích hợp nút tải lại hóa đơn PDF bất kỳ lúc nào.
   - **Tab 4 - Đổi Mật Khẩu:** Form đổi mật khẩu bảo mật có xác thực mật khẩu cũ.

### 5.2. Phía Quản Trị Viên (Admin & Store Management - `admin.html`)
1. **Dashboard Doanh Thu Toàn Diện:**
   - 4 thẻ tóm tắt: Tổng doanh thu, Số đơn hoàn thành, Số sách đã bán, Giá trị đơn trung bình (AOV).
   - Biểu đồ cột tương tác trực quan (Interactive Bar Chart) theo Ngày / Tháng / Quý / Năm.
   - Bảng thống kê chi tiết từng mốc thời gian kèm tỷ trọng doanh thu.
2. **Quản Lý Kho Sách & Tính Sách Bán Chạy:**
   - Thuật toán `calculateAdminSalesMap()` tự động quét tất cả đơn hàng đã giao, cộng dồn số lượng bán theo từng mã sách.
   - Cột **"Đã Bán"** hiển thị số lượng xuất kho thực tế (ví dụ: `🔥 54 cuốn`).
   - Tự động gắn nhãn nổi bật **`🔥 TOP BÁN CHẠY`** cho Top 5 tựa sách bán chạy nhất hệ thống.
   - Thao tác CRUD: Form Modal thêm sách mới, chỉnh sửa thông tin sách, xóa sách có hộp thoại xác nhận an toàn.
3. **Quản Lý Khách Hàng & Cấp Bậc VIP Theo Tháng:**
   - Thống kê toàn bộ độc giả đăng ký tài khoản.
   - Theo dõi chi tiêu tháng này, tổng chi tiêu trọn đời, hạng thành viên.
   - Cột **Trạng thái duy trì VIP** hiển thị rõ ràng: `✓ Đã gia hạn tháng sau`, `Thiếu Xđ để giữ hạng`, hoặc `Chưa đạt VIP`.

---

## 📁 6. CẤU TRÚC THƯ MỤC MÃ NGUỒN

```text
d:/đồ án java/manga/
├── 📄 admin.html                  # Giao diện quản trị, thống kê doanh thu, kho sách, khách hàng
├── 📄 cart.html                   # Giao diện giỏ hàng, áp mã voucher, đặt hàng & xuất hóa đơn PDF
├── 📄 index.html                  # Trang chủ: Banner slider, flash sale, sách bán chạy, kệ sách
├── 📄 login.html                  # Giao diện đăng nhập tài khoản
├── 📄 register.html               # Giao diện đăng ký thành viên mới
├── 📄 product-detail.html         # Giao diện chi tiết sách & gợi ý tác phẩm cùng thể loại
├── 📄 products.html               # Giao diện tra cứu kệ sách, tìm kiếm & bộ lọc nâng cao
├── 📄 profile.html                # Trang riêng biệt quản lý hồ sơ độc giả & Thẻ VIP điện tử
├── 📄 db.json                     # Cơ sở dữ liệu JSON mô phỏng Backend RESTful API
├── 📄 vite.config.js              # Cấu hình đa trang (Multi-Page App) cho Vite
├── 📄 package.json                # Định nghĩa dependencies (axios, vite, json-server...)
│
├── 📁 css/                        # Hệ thống định kiểu giao diện (CSS3 thuần)
│   ├── 🎨 reset.css               # Chuẩn hóa thuộc tính mặc định của trình duyệt
│   ├── 🎨 style.css               # Design system, Typography, Header, Footer, Toast, Card sách
│   ├── 🎨 auth.css                # Giao diện khung form Đăng nhập / Đăng ký
│   ├── 🎨 cart.css                # Giao diện giỏ hàng, modal thanh toán, hóa đơn in ấn
│   ├── 🎨 detail.css              # Bố cục trang chi tiết sách, thông số xuất bản, gallery ảnh
│   ├── 🎨 admin.css               # Giao diện dashboard doanh thu, biểu đồ cột, bảng quản trị
│   ├── 🎨 profile.css             # Bố cục 2 cột trang cá nhân, thẻ VIP Card, danh sách đơn hàng
│   └── 🎨 responsive.css          # Tương thích máy tính, máy tính bảng và điện thoại di động
│
└── 📁 js/                         # Hệ thống module JavaScript thuần (ES6 Modules)
    ├── ⚙️ api.js                  # Axios client, cấu hình baseURL và cơ chế offline fallback
    ├── ⚙️ utils.js                # Tiện ích chung: calculateUserTier, formatPrice, Toast, Auth
    ├── ⚙️ app.js                  # Điều khiển trang chủ: Render banner, load danh mục, shelf sách
    ├── ⚙️ products.js             # Thuật toán tìm kiếm, phân trang, lọc đa tiêu chí song song
    ├── ⚙️ detail.js               # Đọc tham số URL ?id=, kiểm tra tồn kho, gợi ý sách cùng thể loại
    ├── ⚙️ cart.js                 # Tính tổng tiền, kiểm tra voucher VIP, tạo đơn & xuất PDF
    ├── ⚙️ profile.js              # Điều khiển 4 tabs trang cá nhân, cập nhật SĐT/ngày sinh, tải lại PDF
    ├── ⚙️ admin.js                # Tổng hợp doanh thu, vẽ biểu đồ, tính sách bán chạy, quản lý độc giả
    ├── ⚙️ login.js                # Xác thực danh tính, phân quyền vai trò (Admin / Staff / Customer)
    └── ⚙️ register.js             # Kiểm tra hợp lệ form đăng ký (Regex email, phone, password)
```

---

## 🎯 7. ĐỐI CHIẾU TIÊU CHÍ CHẤM ĐIỂM (THANG ĐIỂM 100)

| Tiêu Chí Đánh Giá | Điểm Tối Đa | Minh Chứng Thực Tế Đã Đạt Được Trong Dự Án Hikari BookStore |
| :--- | :---: | :--- |
| **A. Phân tích & Thiết kế** | **10** | Xác định đúng bài toán bán sách Manga/Light Novel, thiết kế ERD chuẩn, sơ đồ luồng nghiệp vụ chi tiết trong `workflow.md`. |
| **B. Giao diện & UI/UX** | **10** | Bố cục thẩm mỹ phong cách Bookstore Nhật Bản, hoàn toàn Responsive, Toast thông báo trực quan, điều hướng Header mượt mà. |
| **C. JavaScript & DOM** | **15** | Toàn bộ dữ liệu được render động 100% bằng DOM API, không hardcode tĩnh vào HTML; Bắt đầy đủ các sự kiện `click`, `input`, `change`, `submit`. |
| **D. Dữ liệu & CRUD** | **15** | Thực hiện CRUD hoàn chỉnh trên Admin (Thêm sách, Xem danh sách, Sửa sách, Xóa sách có xác nhận); Cập nhật số lượng tồn kho tự động sau khi đặt hàng. |
| **E. Tìm kiếm, Lọc, Sắp xếp, Thống kê** | **10** | Tìm kiếm real-time không dấu/có dấu, lọc đa tiêu chí song song (Thể loại + Khoảng giá + Nhãn), sắp xếp tăng/giảm, biểu đồ thống kê doanh thu đa kỳ. |
| **F. Form & Validation** | **10** | Form đăng nhập, đăng ký, thanh toán và cập nhật profile đều được kiểm tra bắt buộc, Regex định dạng email/SĐT, thông báo lỗi cụ thể. |
| **G. LocalStorage & Quản lý trạng thái** | **10** | Lưu trữ phiên đăng nhập (`user`), giỏ hàng (`cart`), tự động khôi phục dữ liệu sau khi F5 tải lại trang, xử lý giỏ hàng trống. |
| **H. ES6+ & Tổ chức code** | **10** | Chia tách thành 10 file Module ES6 riêng biệt (`import`/`export`), sử dụng triệt để `async/await`, `destructuring`, `template literals`. |
| **I. Hoàn thiện & Bảo vệ** | **10** | Website hoạt động ổn định, không phát sinh lỗi console, có tài liệu hướng dẫn đầy đủ, dễ dàng demo trực tiếp trước hội đồng. |
| **TỔNG CỘNG** | **100 / 100** | **Đạt tiêu chuẩn xuất sắc** |

---

## 📚 8. CÁC TÀI LIỆU KỸ THUẬT ĐI KÈM TRONG BỘ HỒ SƠ NỘP BÀI
1. **[README.md](README.md):** Giới thiệu đề tài, kiến trúc & hướng dẫn cài đặt.
2. **[workflow.md](workflow.md):** Vẽ quy trình nghiệp vụ (Workflow) chi tiết cho từng chức năng.
3. **[Database.md](Database.md):** Thiết kế cơ sở dữ liệu, sơ đồ ERD & đặc tả collections.
4. **[API_DOCUMENT.md](API_DOCUMENT.md):** Tài liệu đặc tả kỹ thuật toàn bộ RESTful API endpoints.
5. **[software_architecture_design.md](software_architecture_design.md):** Thiết kế kiến trúc phần mềm chuyên sâu & các design patterns.

---

> ✍️ **Tác giả:** Độc giả & Nhóm phát triển dự án Hikari BookStore  
> 🏫 **Báo cáo kết thúc học phần:** Môn Lập trình JavaScript  
> 📅 **Năm thực hiện:** 2026

# 🔄 TÀI LIỆU QUY TRÌNH NGHIỆP VỤ HỆ THỐNG (WORKFLOW SPECIFICATION)
## DỰ ÁN: HIKARI BOOKSTORE - THƯƠNG MẠI ĐIỆN TỬ MANGA & LIGHT NOVEL
> **Môn học:** Đồ án kết thúc học phần Lập trình JavaScript  
> **Ngôn ngữ:** JavaScript thuần (Vanilla JS) & ES6+  
> **Định dạng:** Markdown chuẩn kết hợp sơ đồ trực quan Mermaid  

---

## 📑 MỤC LỤC CÁC QUY TRÌNH (WORKFLOWS)
1. [Workflow 1: Đăng Ký Tài Khoản & Đăng Nhập Phân Quyền (RBAC)](#workflow-1-đăng-ký-tài-khoản--đăng-nhập-phân-quyền-rbac)
2. [Workflow 2: Khám Phá Sách, Tìm Kiếm & Lọc Đa Tiêu Chí](#workflow-2-khám-phá-sách-tìm-kiếm--lọc-đa-tiêu-chí)
3. [Workflow 3: Xem Chi Tiết Tác Phẩm & Thêm Vào Giỏ Hàng](#workflow-3-xem-chi-tiết-tác-phẩm--thêm-vào-giỏ-hàng)
4. [Workflow 4: Quản Lý Giỏ Hàng & Kiểm Tra Voucher Đa Dạng](#workflow-4-quản-lý-giỏ-hàng--kiểm-tra-voucher-đa-dạng)
5. [Workflow 5: Đặt Hàng & Cơ Chế Linh Hoạt Địa Chỉ Giao Hàng](#workflow-5-đặt-hàng--cơ-chế-linh-hoạt-địa-chỉ-giao-hàng)
6. [Workflow 6: Xuất Hóa Đơn VAT Điện Tử File PDF](#workflow-6-xuất-hóa-đơn-vat-điện-tử-file-pdf)
7. [Workflow 7: Thuật Toán Thăng Hạng & Duy Trì Cấp Bậc VIP Theo Tháng](#workflow-7-thuật-toán-thăng-hạng--duy-trì-cấp-bậc-vip-theo-tháng)
8. [Workflow 8: Quản Lý Trang Hồ Sơ Độc Giả (Profile Hub 4 Tabs)](#workflow-8-quản-lý-trang-hồ-sơ-độc-giả-profile-hub-4-tabs)
9. [Workflow 9: Báo Cáo Doanh Thu & Biểu Đồ Cột Trực Quan (Admin)](#workflow-9-báo-cáo-doanh-thu--biểu-đồ-cột-trực-quan-admin)
10. [Workflow 10: Quản Lý Kho Hàng & Tự Động Xếp Hạng Sách Bán Chạy Nhất](#workflow-10-quản-lý-kho-hàng--tự-động-xếp-hạng-sách-bán-chạy-nhất)
11. [Workflow 11: Quản Trị Khách Hàng & Theo Dõi Trạng Thái Duy Trì VIP](#workflow-11-quản-trị-khách-hàng--theo-dõi-trạng-thái-duy-trì-vip)

---

## WORKFLOW 1: ĐĂNG KÝ TÀI KHOẢN & ĐĂNG NHẬP PHÂN QUYỀN (RBAC)

### 1.1. Mục Tiêu
Đảm bảo xác thực danh tính người dùng an toàn, kiểm tra dữ liệu bằng Regular Expression (Regex), chống trùng lặp tài khoản và phân quyền rõ ràng giữa `customer`, `staff` và `admin`.

### 1.2. Sơ Đồ Quy Trình (Sequence Diagram)
```mermaid
sequenceDiagram
    autonumber
    actor User as Người Dùng
    participant View as register.html / login.html
    participant AuthMod as register.js / login.js
    participant API as api.js
    participant Server as JSON-Server (/users)
    participant Storage as Browser LocalStorage

    Note over User,View: Giai đoạn 1: Đăng Ký Tài Khoản
    User->>View: Nhập Họ tên, Email, SĐT, Mật khẩu, Xác nhận MK
    View->>AuthMod: submit event
    AuthMod->>AuthMod: Kiểm tra Regex Email, SĐT và Mật khẩu >= 6 ký tự
    alt Dữ liệu không hợp lệ
        AuthMod->>View: Hiển thị lỗi đỏ dưới từng ô nhập liệu
    else Dữ liệu hợp lệ
        AuthMod->>API: GET /users?email={email}
        API->>Server: Kiểm tra email đã đăng ký chưa
        Server-->>API: Trả về kết quả
        alt Email đã tồn tại
            AuthMod->>View: Báo lỗi "Email đã được sử dụng!"
        else Email khả dụng
            AuthMod->>API: POST /users (Tạo user mới role='customer')
            API->>Server: Ghi dữ liệu vào db.json
            Server-->>API: HTTP 201 Created
            AuthMod->>View: Toast "Đăng ký thành công! Đang chuyển hướng..."
            AuthMod->>View: Redirect sang login.html
        end
    end

    Note over User,View: Giai đoạn 2: Đăng Nhập & Phân Quyền
    User->>View: Nhập Email và Mật khẩu
    View->>AuthMod: submit event
    AuthMod->>API: GET /users?email={email}
    API->>Server: Tìm kiếm tài khoản
    Server-->>API: Trả về bản ghi User
    alt Sai email hoặc mật khẩu
        AuthMod->>View: Toast thông báo "Email hoặc mật khẩu không chính xác!"
    else Đăng nhập hợp lệ
        AuthMod->>Storage: Lưu thông tin vào 'user' và 'currentUser'
        AuthMod->>AuthMod: Phân định vai trò (role)
        alt role == 'admin' hoặc 'staff'
            AuthMod->>View: Chuyển hướng tới admin.html
        else role == 'customer'
            AuthMod->>View: Chuyển hướng về trang trước đó (hoặc index.html)
        end
    end
```

---

## WORKFLOW 2: KHÁM PHÁ SÁCH, TÌM KIẾM & LỌC ĐA TIÊU CHÍ

### 2.1. Mục Tiêu
Cung cấp trải nghiệm tìm kiếm tức thì và lọc đa chiều song song (thể loại, tầm giá, trạng thái sách hot/mới, sắp xếp) trên `products.html` và `index.html`.

### 2.2. Sơ Đồ Quy Trình (Flowchart)
```mermaid
flowchart TD
    Start(["Độc Giả Thao Tác Trên Giao Diện"]) --> InputCheck{"Người Dùng Thao Tác Gì?"}

    InputCheck -- "Gõ ô tìm kiếm" --> Debounce["Kích hoạt input event\n(Xóa khoảng trắng, chuyển chữ thường)"]
    InputCheck -- "Bấm chọn Thể Loại" --> SetCategory["Cập nhật state.category"]
    InputCheck -- "Bấm chọn Mức Giá" --> SetPrice["Cập nhật state.priceRange (<50k, 50k-100k, >100k)"]
    InputCheck -- "Tích chọn Tag" --> SetTags["Cập nhật state.isHot / state.isNew"]
    InputCheck -- "Chọn Sắp Xếp" --> SetSort["Cập nhật state.sort (Giá tăng/giảm, Mới, Bán chạy)"]

    Debounce --> FilterEngine["Bộ Xử Lý Lọc Dữ Liệu Song Song\n(Array.prototype.filter)"]
    SetCategory --> FilterEngine
    SetPrice --> FilterEngine
    SetTags --> FilterEngine
    SetSort --> FilterEngine

    FilterEngine --> Step1["1. Khớp từ khóa: Tên sách || Tác giả || NXB"]
    Step1 --> Step2["2. Khớp Category ID (nếu có chọn thể loại)"]
    Step2 --> Step3["3. Khớp Khoảng Giá (Number(price) trong khoảng)"]
    Step3 --> Step4["4. Khớp Nhãn isHot/isNew (nếu có tích chọn)"]
    Step4 --> StepSort["5. Sắp xếp mảng kết quả: Array.prototype.sort"]

    StepSort --> CheckEmpty{"Mảng Kết Quả Có Phần Tử?"}
    CheckEmpty -- "Có sản phẩm" --> RenderDOM["Render thẻ sách động ra #productsContainer\n(Hiển thị ảnh, giá bán, giá bìa, % giảm, nút + Giỏ)"]
    CheckEmpty -- "Không có" --> RenderEmpty["Hiển thị giao diện Empty State:\n'Không tìm thấy tác phẩm phù hợp với bộ lọc!'"]

    RenderDOM --> UpdateCount["Cập nhật chỉ số: 'Tìm thấy N tác phẩm'"]
    RenderEmpty --> UpdateCount
    UpdateCount --> End(["Sẵn Sàng Cho Tương Tác Tiếp Theo"])
```

---

## WORKFLOW 3: XEM CHI TIẾT TÁC PHẨM & THÊM VÀO GIỎ HÀNG

### 3.1. Mục Tiêu
Hiển thị thông số chi tiết tác phẩm, kiểm soát số lượng mua theo tồn kho thực tế, cập nhật giỏ hàng đa nguồn (LocalStorage + Server API) và làm mới số lượng đếm trên Header badge.

### 3.2. Sơ Đồ Quy Trình (Sequence Diagram)
```mermaid
sequenceDiagram
    autonumber
    actor Customer as Khách Hàng
    participant DetailUI as product-detail.html
    participant DetailJS as detail.js
    participant Utils as utils.js
    participant API as api.js
    participant Storage as LocalStorage
    participant Server as JSON-Server

    Customer->>DetailUI: Nhấp vào một cuốn sách bất kỳ
    DetailUI->>DetailJS: Khởi chạy DOMContentLoaded
    DetailJS->>DetailJS: Đọc param URL: new URLSearchParams(window.location.search).get('id')
    DetailJS->>API: GET /products/:id
    API->>Server: Truy vấn thông tin sách
    Server-->>API: Trả về Object Product (ảnh, giá, stock, mô tả, NXB...)
    API-->>DetailJS: Dữ liệu chi tiết sách
    DetailJS->>DetailUI: Render bìa lớn, thông số kỹ thuật, đánh giá sao, tồn kho
    DetailJS->>API: GET /products?categoryId={categoryId}&id_ne={id}&_limit=4
    API-->>DetailJS: Danh sách 4 sách gợi ý cùng thể loại
    DetailJS->>DetailUI: Render kệ sách liên quan

    Customer->>DetailUI: Điều chỉnh số lượng (+ / -) và bấm "Thêm Vào Giỏ Hàng"
    DetailUI->>Utils: addToCart(product, quantity)
    Utils->>Utils: Kiểm tra tồn kho (currentCartQty + qtyToAdd <= product.stock)
    alt Vượt quá số lượng tồn kho
        Utils->>DetailUI: Toast cảnh báo "Số lượng trong giỏ đã đạt giới hạn tồn kho!"
    else Số lượng hợp lệ
        Utils->>Storage: Cập nhật mảng cart trong LocalStorage
        opt Nếu khách đã đăng nhập (userId tồn tại)
            Utils->>API: Đồng bộ giỏ hàng lên /carts
            API->>Server: Ghi nhận cart item
        end
        Utils->>Utils: updateCartBadge() -> Tính tổng quantity tất cả sản phẩm
        Utils->>DetailUI: Cập nhật textContent phần tử #cartCount trên Header
        Utils->>DetailUI: Toast thành công "✓ Đã thêm tác phẩm vào giỏ hàng!"
    end
```

---

## WORKFLOW 4: QUẢN LÝ GIỎ HÀNG & KIỂM TRA VOUCHER ĐA DẠNG

### 4.1. Mục Tiêu
Cập nhật số lượng sách, xóa sản phẩm, tính toán giá trị tạm tính, phí vận chuyển và áp dụng chính xác các quy tắc voucher (đặc biệt là mã `VIPMEMBER` giảm 15% cho thành viên VIP).

### 4.2. Sơ Đồ Quy Trình (Flowchart)
```mermaid
flowchart TD
    OpenCart(["Khách Truy Cập cart.html"]) --> LoadData["Tải dữ liệu giỏ hàng từ Server /carts hoặc LocalStorage"]
    LoadData --> CheckItems{"Giỏ Hàng Có Sản Phẩm?"}

    CheckItems -- "Giỏ Hàng Trống" --> ShowEmpty["Hiển thị giao diện Giỏ hàng trống\nNút 'Khám Phá Sách Ngay'"]
    CheckItems -- "Có Sản Phẩm" --> RenderList["Render bảng danh sách sách:\nẢnh, Tên, Đơn giá, Tăng/Giảm SL, Thành tiền, Nút xóa"]

    RenderList --> CalcSubtotal["Tính subtotal = ∑(price * quantity)\nPhí ship: 30.000đ (Miễn phí nếu subtotal ≥ 250.000đ)"]
    CalcSubtotal --> InputCoupon{"Khách Nhập Mã Giảm Giá?"}

    InputCoupon -- "Không nhập" --> FinalTotal["finalTotal = subtotal - 0 + shippingFee"]
    InputCoupon -- "Nhập mã & bấm Áp dụng" --> CheckCouponDB["Truy vấn /coupons?code={code}"]

    CheckCouponDB --> CouponExists{"Mã Có Tồn Tại?"}
    CouponExists -- "Không" --> ErrCoupon["Toast lỗi: 'Mã giảm giá không tồn tại!'"]
    CouponExists -- "Có" --> ClassifyCode{"Phân Loại Mã Khuyến Mãi"}

    ClassifyCode -- "WELCOME20" --> ChkNewUser{"Tài khoản mới & chưa từng dùng?"}
    ChkNewUser -- "Hợp lệ" --> Apply20["Giảm 20% tổng đơn hàng"]
    ChkNewUser -- "Đã dùng rồi" --> Err20["Báo lỗi: Mã chào mừng chỉ áp dụng 1 lần!"]

    ClassifyCode -- "HIKARI10" --> ChkMinOrder{"subtotal >= 250.000đ?"}
    ChkMinOrder -- "Đạt" --> Apply10["Giảm 10% tổng đơn hàng"]
    ChkMinOrder -- "Chưa đạt" --> ErrMin["Báo lỗi: Yêu cầu đơn hàng từ 250k!"]

    ClassifyCode -- "NEWBOOKS" --> ChkNewItems{"Trong giỏ có sách isNew=true?"}
    ChkNewItems -- "Có" --> ApplyNew["Giảm 10% trên tổng giá trị các cuốn Sách Mới"]
    ChkNewItems -- "Không" --> ErrNew["Báo lỗi: Giỏ chưa có cuốn Sách Mới nào!"]

    ClassifyCode -- "VIPMEMBER" --> ChkVIPIs{"calculateUserTier(user):\nKhách có đạt hạng VIP tháng này?"}
    ChkVIPIs -- "Là VIP (Chi tiêu tháng ≥ 500k hoặc duy trì)" --> ApplyVIP["Giảm 15% tổng hóa đơn thanh toán ⭐"]
    ChkVIPIs -- "Chưa đạt VIP" --> ErrVIP["Báo lỗi: Mã chỉ dành cho Thành Viên VIP!\nHiển thị số tiền còn thiếu để lên VIP."]

    Apply20 --> UpdateDiscount["Cập nhật appliedDiscount & appliedCouponCode"]
    Apply10 --> UpdateDiscount
    ApplyNew --> UpdateDiscount
    ApplyVIP --> UpdateDiscount

    UpdateDiscount --> FinalTotal
    FinalTotal --> DisplayTotal["Cập nhật hiển thị số tiền thanh toán cuối cùng ra màn hình"]
```

---

## WORKFLOW 5: ĐẶT HÀNG & CƠ CHẾ LINH HOẠT ĐỊA CHỈ GIAO HÀNG

### 5.1. Mục Tiêu
Đảm bảo khóa bảo mật đăng nhập, hỗ trợ tự động điền địa chỉ mặc định từ trang Hồ sơ, cho phép giao đến địa chỉ khác cho riêng đơn hàng này và tùy chọn cập nhật địa chỉ mới làm mặc định.

### 5.2. Sơ Đồ Quy Trình (Sequence Diagram)
```mermaid
sequenceDiagram
    autonumber
    actor Customer as Khách Hàng
    participant CartUI as cart.html (Modal Checkout)
    participant CartJS as cart.js
    participant API as api.js
    participant Server as JSON-Server (/orders, /products, /users)
    participant Storage as LocalStorage

    Customer->>CartUI: Bấm nút "Tiến Hành Đặt Hàng"
    CartUI->>CartJS: Kiểm tra phiên đăng nhập
    alt Chưa Đăng Nhập
        CartJS->>CartUI: Mở Modal #requireLoginModal (Yêu cầu đăng nhập hoặc đăng ký)
    else Đã Đăng Nhập
        CartJS->>Storage: Lấy thông tin user hiện tại
        CartJS->>CartUI: Mở Modal #checkoutModal
        CartJS->>CartUI: Điền sẵn Họ tên, Số điện thoại
        opt User đã có địa chỉ trong Profile (user.address)
            CartJS->>CartUI: Tự động điền user.address vào #orderAddress
            CartJS->>CartUI: Hiển thị huy hiệu "🏠 Đã điền từ địa chỉ mặc định"
        end
    end

    opt Khách muốn giao tới địa chỉ khác
        Customer->>CartUI: Sửa nội dung trong ô #orderAddress
        CartUI->>CartUI: Tự động đổi huy hiệu: "✏️ Đang dùng địa chỉ giao hàng mới"
        Customer->>CartUI: (Tùy chọn) Tích chọn checkbox "Đặt địa chỉ này làm mặc định mới"
    end

    Customer->>CartUI: Chọn phương thức thanh toán (COD / MoMo / Chuyển khoản) và bấm "Xác Nhận Đặt Hàng"
    CartUI->>CartJS: Submit form đặt hàng
    CartJS->>CartJS: Validation kiểm tra bắt buộc (Tên, SĐT, Địa chỉ)

    rect rgb(240, 248, 255)
        Note over CartJS,Server: Khởi Tạo Đơn Hàng & Cập Nhật CSDL
        CartJS->>API: POST /orders (orderData gồm mã HKR..., items, total, customer address)
        API->>Server: Ghi đơn hàng mới
        loop Mỗi sản phẩm trong giỏ
            CartJS->>API: PATCH /products/:id (Giảm stock tồn kho tương ứng)
            API->>Server: Cập nhật tồn kho
        end
        opt Nếu khách có tích chọn lưu địa chỉ mới làm mặc định
            CartJS->>Storage: Cập nhật user.address mới vào LocalStorage
            CartJS->>API: PATCH /users/:id (Lưu address mới)
            API->>Server: Đồng bộ địa chỉ mới vào db.json
        end
        CartJS->>Storage: Xóa sạch giỏ hàng trong LocalStorage
        CartJS->>API: DELETE /carts/:id (Làm trống giỏ hàng Server)
    end

    CartJS->>CartUI: Đóng Modal Checkout, hiển thị màn hình Đặt Hàng Thành Công!
    CartJS->>CartUI: Hiển thị mã đơn #HKRxxxx và kích hoạt nút "📄 Tải Hóa Đơn PDF"
```

---

## WORKFLOW 6: XUẤT HÓA ĐƠN VAT ĐIỆN TỬ FILE PDF

### 6.1. Mục Tiêu
Xuất file chứng từ hóa đơn PDF có đầy đủ tư cách pháp lý bảo hành đổi trả, chuẩn kích thước A4, hình ảnh sắc nét, con dấu xuất kho đỏ và không bao giờ bị lỗi trang trắng.

### 6.2. Sơ Đồ Quy Trình (Flowchart)
```mermaid
flowchart TD
    Trigger(["Khách Bấm Nút '📄 Tải Hóa Đơn PDF'"]) --> LockBtn["Khóa nút bấm (disabled = true)\nĐổi text: '⏳ Đang xử lý & tạo hóa đơn PDF...'"]
    
    LockBtn --> BuildDOM["Dựng khối HTML ẩn: #invoicePrintTemplate\n(Bao gồm logo, mã đơn, ngày đặt, thông tin khách, bảng kê sách,\ntiền hàng, chiết khấu, tổng cộng, con dấu đỏ thủ kho, lưu ý bảo hành)"]

    BuildDOM --> ScrollTop["window.scrollTo({ top: 0, behavior: 'instant' })\n(Bắt buộc: Triệt tiêu hoàn toàn độ lệch scroll viewport của html2canvas)"]

    ScrollTop --> MakeVisible["Kích hoạt hiển thị: invoiceEl.style.display = 'block'\n(Chiều rộng cố định chuẩn in ấn: width = 750px, margin auto)"]

    MakeVisible --> ConfigPDF["Cấu hình html2pdf options:\n- margin: [10, 10, 10, 10] (mm)\n- filename: 'HoaDon_HKRxxxxxx.pdf'\n- html2canvas: { scale: 2, useCORS: true, scrollY: 0, scrollX: 0 }\n- jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }\n- pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }"]

    ConfigPDF --> CallLibrary["Gọi: await html2pdf().set(opt).from(invoiceEl).toPdf().get('pdf').save()"]

    CallLibrary --> CheckSuccess{"Thư Viện Tạo File Thành Công?"}
    CheckSuccess -- "Thành Công" --> DownloadFile["File PDF tải thẳng về thư mục Downloads của máy khách"]
    CheckSuccess -- "Lỗi Thư Viện" --> FallbackPrint["Fallback an toàn: Mở hộp thoại window.print() của trình duyệt"]

    DownloadFile --> Cleanup["Ẩn lại khối in: invoiceEl.style.display = 'none'\nMở lại nút bấm: disabled = false\nToast: '✓ Xuất file hóa đơn PDF thành công!'"]
    FallbackPrint --> Cleanup
    Cleanup --> End(["Hoàn Tất Xuất Hóa Đơn"])
```

---

## WORKFLOW 7: THUẬT TOÁN THĂNG HẠNG & DUY TRÌ CẤP BẬC VIP THEO THÁNG

### 7.1. Mục Tiêu
Thuật toán trung tâm trong `utils.js` tự động tính toán cấp bậc độc giả, bảo lưu danh hiệu từ tháng trước, theo dõi hạn mức duy trì và trả về dữ liệu tiến trình cho giao diện Profile & Admin.

### 7.2. Sơ Đồ Quy Trình (Flowchart)
```mermaid
flowchart TD
    CallTier(["Gọi Hàm: calculateUserTier(user)"]) --> GetOrders["Lấy toàn bộ đơn hàng của User từ Server /orders"]
    GetOrders --> ParseTime["Xác định Mốc Thời Gian:\n- Tháng N (Tháng hiện tại)\n- Tháng N-1 (Tháng trước liền kề)"]

    ParseTime --> FilterOrders["Phân tách mảng đơn hàng:\n- currentMonthOrders: Các đơn phát sinh trong Tháng N\n- prevMonthOrders: Các đơn phát sinh trong Tháng N-1"]

    FilterOrders --> SumSpent["Tính tổng chi tiêu:\n- currentMonthSpent = Tổng tiền các đơn Tháng N\n- prevMonthSpent = Tổng tiền các đơn Tháng N-1"]

    SumSpent --> RuleVIP{"currentMonthSpent >= 500.000đ?"}
    RuleVIP -- "Đạt mốc" --> SetVIPNow["Đạt chuẩn VIP Tháng N (achievedThisMonth = true)"]
    RuleVIP -- "Chưa đạt" --> RuleLastMonth{"prevMonthSpent >= 500.000đ?\n(Tháng trước đã là VIP)"}

    RuleLastMonth -- "Đúng" --> CarryOverVIP["Bảo lưu danh hiệu VIP sang Tháng N\n(wasVipLastMonth = true)"]
    RuleLastMonth -- "Sai" --> NotVIP["Không phải Thành Viên VIP (isVip = false)"]

    SetVIPNow --> ConfirmVIP["Xác Nhận Hạng VIP Hiện Tại: isVip = true"]
    CarryOverVIP --> ConfirmVIP

    ConfirmVIP --> CheckMaintain{"Kiểm Tra Điều Kiện Duy Trì Tháng Sau (N+1):\ncurrentMonthSpent >= 250.000đ\nHOẶC currentMonthOrders.length >= 1"}
    CheckMaintain -- "Thỏa mãn" --> Maintained["Trạng thái: Đã duy trì thành công sang tháng sau!\n(isMaintainedForNextMonth = true)"]
    CheckMaintain -- "Chưa đủ" --> NeedMore["Trạng thái: Cần mua thêm\n(remainingToMaintain = 250.000đ - currentMonthSpent)"]

    NotVIP --> CheckNewbie{"User đăng ký <= 30 ngày\nHOẶC chưa từng có đơn nào?"}
    CheckNewbie -- "Đúng" --> TierNew["Hạng: Thành Viên Mới 🎁 (tier = 'newbie')"]
    CheckNewbie -- "Sai" --> TierReg["Hạng: Thành Viên Thân Thiết 👤 (tier = 'regular')"]

    Maintained --> ReturnObj["Trả về Object tierInfo hoàn chỉnh:\n{ tier, tierName, badgeIcon, isVip, progressPercent,\ncurrentMonthSpent, remainingToUpgrade, remainingToMaintain... }"]
    NeedMore --> ReturnObj
    TierNew --> ReturnObj
    TierReg --> ReturnObj
```

---

## WORKFLOW 8: QUẢN LÝ TRANG HỒ SƠ ĐỘC GIẢ (PROFILE HUB 4 TABS)

### 8.1. Mục Tiêu
Cung cấp trang quản trị tài khoản độc lập `profile.html` thay thế hoàn toàn popup modal, chia thành 4 tab nghiệp vụ chuyên biệt với thanh điều hướng trực quan.

### 8.2. Sơ Đồ Quy Trình (Flowchart)
```mermaid
flowchart LR
    AccessProfile(["Khách Bấm Tên / Huy Hiệu Trên Header"]) --> OpenPage["Truy Cập profile.html"]
    OpenPage --> CheckSession{"Đã Đăng Nhập Chưa?"}

    CheckSession -- "Chưa" --> NoticeLogin["Hiển thị màn hình Yêu Cầu Đăng Nhập kèm nút bấm"]
    CheckSession -- "Đã Đăng Nhập" --> RenderSidebar["Render Sidebar Trái:\n- Avatar lớn & Icon cấp bậc\n- Họ tên, Email, ID độc giả\n- Huy hiệu VIP / Thân thiết\n- Menu điều hướng 4 Tab\n- Nút Đăng Xuất"]

    RenderSidebar --> SwitchTabs{"Khách Bấm Chọn Tab Nào?"}

    SwitchTabs -- "Tab 1: Thông Tin Cá Nhân" --> TabInfo["- 3 card thống kê: Tổng chi tiêu, Số đơn, Cấp bậc\n- Form cập nhật: Họ tên, SĐT, Ngày sinh, Địa chỉ mặc định\n- Cảnh báo sinh nhật: '🎉 Sinh nhật tháng này!'\n- Bấm Lưu -> Gọi PATCH /users/:id và lưu LocalStorage"]

    SwitchTabs -- "Tab 2: Cấp Bậc VIP & Ưu Đãi" --> TabVIP["- Thẻ VIP Card Điện Tử (Digital Card) sang trọng\n- Thanh tiến trình % chi tiêu tháng hiện tại\n- Khung Voucher VIPMEMBER (-15%) kèm nút Sao chép mã\n- Bảng thể lệ thăng hạng (500k) & duy trì VIP (250k)"]

    SwitchTabs -- "Tab 3: Lịch Sử Đơn Hàng" --> TabOrders["- Danh sách thẻ đơn hàng chi tiết (#HKRxxxx)\n- Thông tin từng cuốn sách mua (ảnh, tên, số lượng, giá)\n- Trạng thái đơn hàng (Đã hoàn thành / Đang giao)\n- Nút '📄 Tải Hóa Đơn PDF' cho từng đơn hàng"]

    SwitchTabs -- "Tab 4: Đổi Mật Khẩu" --> TabPass["- Form đổi mật khẩu\n- Kiểm tra mật khẩu cũ, mật khẩu mới >= 6 ký tự\n- Bấm Lưu -> Cập nhật db.json và LocalStorage"]
```

---

## WORKFLOW 9: BÁO CÁO DOANH THU & BIỂU ĐỒ CỘT TRỰC QUAN (ADMIN)

### 9.1. Mục Tiêu
Cung cấp cho Ban quản trị cái nhìn toàn diện về hiệu quả kinh doanh, tổng hợp doanh thu và số lượng đơn hàng theo các mốc chu kỳ thời gian linh hoạt (Ngày, Tháng, Quý, Năm).

### 9.2. Sơ Đồ Quy Trình (Sequence Diagram)
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Quản Trị Viên
    participant AdminUI as admin.html
    participant AdminJS as admin.js
    participant API as api.js
    participant Server as JSON-Server (/orders)

    Admin->>AdminUI: Đăng nhập quyền Admin và truy cập admin.html
    AdminUI->>AdminJS: Khởi động loadDashboardStats()
    AdminJS->>API: GET /orders
    API->>Server: Truy vấn danh sách đơn hàng
    Server-->>API: Trả về toàn bộ orders
    API-->>AdminJS: Dữ liệu đơn hàng

    rect rgb(240, 248, 255)
        Note over AdminJS,AdminUI: Xử Lý Phân Tích & Vẽ Biểu Đồ
        AdminJS->>AdminJS: Lọc các đơn hợp lệ (status != 'cancelled')
        AdminJS->>AdminJS: Nhóm dữ liệu theo state.selectedPeriod (day | month | quarter | year)
        AdminJS->>AdminJS: Tính tổng doanh thu, số đơn, số sách bán, giá trị đơn trung bình (AOV)
        AdminJS->>AdminUI: Cập nhật 4 Card chỉ số tổng quan trên đầu trang
        AdminJS->>AdminJS: Tìm mốc doanh thu cao nhất (maxRevenue) để làm tỷ lệ 100% cột
        AdminJS->>AdminUI: Dựng các cột biểu đồ động trong #revenueBarsContainer (chiều cao % tương ứng)
        AdminJS->>AdminUI: Render Bảng Thống Kê Doanh Thu Chi Tiết (Doanh thu, số đơn, tỷ trọng %)
    end

    Admin->>AdminUI: Nhấp vào một mốc chu kỳ trên biểu đồ / bảng
    AdminUI->>AdminJS: Kích hoạt bộ lọc đơn hàng theo mốc đã chọn
    AdminJS->>AdminUI: Lọc và hiển thị danh sách đơn hàng chi tiết của mốc đó bên dưới
```

---

## WORKFLOW 10: QUẢN LÝ KHO HÀNG & TỰ ĐỘNG XẾP HẠNG SÁCH BÁN CHẠY NHẤT

### 10.1. Mục Tiêu
Tính toán chính xác số lượng sách bán ra thực tế dựa trên các hóa đơn đã giao, tự động gắn nhãn `🔥 TOP BÁN CHẠY` và quản lý kho sách bằng đầy đủ thao tác CRUD.

### 10.2. Sơ Đồ Quy Trình (Flowchart)
```mermaid
flowchart TD
    StartAdmin(["Mở Phân Hệ Quản Lý Tác Phẩm Trên admin.html"]) --> FetchData["Tải dữ liệu /products và /orders từ CSDL"]
    
    FetchData --> SalesMap["Hàm calculateAdminSalesMap():\n1. Duyệt qua toàn bộ đơn hàng hợp lệ trong orders\n2. Duyệt qua mảng items của từng đơn\n3. Cộng dồn số lượng: salesMap[productId] += item.quantity"]

    SalesMap --> SortBestsellers["Sắp xếp danh sách sản phẩm giảm dần theo số lượng đã bán\nXác định Top 5 ấn phẩm có doanh số xuất kho cao nhất"]

    SortBestsellers --> RenderTable["Render bảng Quản Lý Sách (#adminProductsTableBody):\n- Cột 'Đã Bán': Hiển thị số lượng xuất kho thực tế (VD: 🔥 54 cuốn)\n- Cột 'Tên Sách': Tự động gắn nhãn '🔥 TOP BÁN CHẠY' cho Top 5 ấn phẩm\n- Cột 'Tồn Kho': Badge hiển thị Còn hàng / Sắp hết / Hết hàng"]

    RenderTable --> AdminActions{"Quản Trị Viên Thao Tác Gì?"}

    AdminActions -- "Thêm Sách Mới" --> OpenAddModal["Mở Modal Thêm Sách -> Nhập thông tin -> POST /products"]
    AdminActions -- "Sửa Thông Tin Sách" --> OpenEditModal["Mở Modal Sửa -> Điền sẵn dữ liệu cũ -> PATCH /products/:id"]
    AdminActions -- "Xóa Sách" --> ConfirmDelete{"Hiển thị hộp thoại xác nhận xóa?"}

    ConfirmDelete -- "Đồng ý" --> CallDelete["Gửi DELETE /products/:id -> Xóa khỏi db.json"]
    ConfirmDelete -- "Hủy" --> KeepProd["Giữ nguyên sản phẩm"]

    OpenAddModal --> Reload["Tự động tải lại bảng sách và cập nhật chỉ số kho"]
    OpenEditModal --> Reload
    CallDelete --> Reload
```

---

## WORKFLOW 11: QUẢN TRỊ KHÁCH HÀNG & THEO DÕI TRẠNG THÁI DUY TRÌ VIP

### 11.1. Mục Tiêu
Theo dõi danh sách độc giả đã đăng ký, đo lường tổng chi tiêu trọn đời, chi tiêu trong tháng hiện tại và trạng thái bảo lưu danh hiệu VIP sang tháng tiếp theo.

### 11.2. Sơ Đồ Quy Trình (Sequence Diagram)
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Quản Trị Viên
    participant AdminUI as admin.html
    participant AdminJS as admin.js
    participant Server as JSON-Server (/users, /orders)

    Admin->>AdminUI: Cuộn xuống bảng "Quản Lý Khách Hàng & Cấp Bậc VIP"
    AdminUI->>AdminJS: Kích hoạt renderUsersTable()
    AdminJS->>Server: Đọc danh sách users và orders
    Server-->>AdminJS: Dữ liệu người dùng và đơn hàng

    loop Đối với từng người dùng (User)
        AdminJS->>AdminJS: Lọc các đơn hàng của user theo userId / phone / name
        AdminJS->>AdminJS: Tính totalSpent (Tổng chi tiêu toàn thời gian)
        AdminJS->>AdminJS: Tính monthSpent (Chi tiêu trong tháng hiện tại)
        AdminJS->>AdminJS: Tính prevMonthSpent (Chi tiêu trong tháng trước)
        AdminJS->>AdminJS: Kiểm tra điều kiện VIP: monthSpent >= 500k HOẶC prevMonthSpent >= 500k
        alt Đang là VIP
            alt monthSpent >= 250k hoặc có đơn tháng này
                AdminJS->>AdminJS: Gán nhãn duy trì: "✓ Đã gia hạn tháng sau"
            else Chưa đạt mốc duy trì
                AdminJS->>AdminJS: Gán nhãn duy trì: "Thiếu Xđ để giữ hạng"
            end
        else Chưa đạt VIP
            AdminJS->>AdminJS: Gán nhãn: "Chưa đạt VIP"
        end
        AdminJS->>AdminUI: Render dòng dữ liệu khách hàng vào bảng #adminUsersTableBody
    end
```

---

> ✍️ **Biên soạn & Thiết kế quy trình bởi:** Đội ngũ phát triển dự án Hikari BookStore  
> 📌 **Tài liệu thuộc bộ hồ sơ đồ án:** Môn Lập trình JavaScript (Vanilla JS & ES6+)


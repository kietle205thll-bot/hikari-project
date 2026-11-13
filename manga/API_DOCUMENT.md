# 🌐 TÀI LIỆU ĐẶC TẢ KỸ THUẬT RESTFUL API (API DOCUMENTATION)
## DỰ ÁN: HIKARI BOOKSTORE - THƯƠNG MẠI ĐIỆN TỬ MANGA & LIGHT NOVEL
> **Môn học:** Đồ án kết thúc học phần Lập trình JavaScript  
> **Kiến trúc:** RESTful API chuẩn hóa trên nền tảng `JSON-Server`  
> **Giao thức:** HTTP/1.1 bất đồng bộ (Axios & Fetch API)  
> **Base URL:** `http://localhost:3000`  

---

## 📑 MỤC LỤC
1. [Quy Chuẩn Chung & Mã Trạng Thái HTTP (Status Codes)](#1-quy-chuẩn-chung--mã-trạng-thái-http-status-codes)
2. [Chi Tiết Các Nhóm API Endpoints](#2-chi-tiết-các-nhóm-api-endpoints)
   - [2.1. Products API (Quản Lý Sản Phẩm & Tồn Kho)](#21-products-api-quản-lý-sản-phẩm--tồn-kho)
   - [2.2. Categories API (Danh Mục Thể Loại)](#22-categories-api-danh-mục-thể-loại)
   - [2.3. Banners API (Quảng Bá Trang Chủ)](#23-banners-api-quảng-bá-trang-chủ)
   - [2.4. Coupons API (Mã Phiếu Giảm Giá & Hạn Mức VIP)](#24-coupons-api-mã-phiếu-giảm-giá--hạn-mức-vip)
   - [2.5. Users API (Tài Khoản & Thông Tin Khách Hàng)](#25-users-api-tài-khoản--thông-tin-khách-hàng)
   - [2.6. Orders API (Đơn Hàng & Thống Kê Doanh Thu)](#26-orders-api-đơn-hàng--thống-kê-doanh-thu)
   - [2.7. Carts API (Đồng Bộ Giỏ Hàng Máy Chủ)](#27-carts-api-đồng-bộ-giỏ-hàng-máy-chủ)
3. [Cơ Chế Phục Hồi Dữ Liệu Ngoại Tuyến (Offline Fallback Strategy)](#3-cơ-chế-phục-hồi-dữ-liệu-ngoại-tuyến-offline-fallback-strategy)

---

## 1. QUY CHUẨN CHUNG & MÃ TRẠNG THÁI HTTP (STATUS CODES)

### 1.1. Tiêu Đề Yêu Cầu (Headers Quy Chuẩn)
Mọi yêu cầu gửi dữ liệu lên Server thông qua phương thức `POST`, `PUT`, `PATCH` đều bắt buộc phải đính kèm Header:
```http
Content-Type: application/json
Accept: application/json
```

### 1.2. Bảng Mã Phản Hồi Chuẩn (HTTP Response Status Codes)
| Mã HTTP | Tên Trạng Thái | Ý Nghĩa Trong Hệ Thống Hikari BookStore |
| :---: | :--- | :--- |
| **`200 OK`** | Thành công | Yêu cầu `GET`, `PATCH`, `DELETE` được máy chủ xử lý trọn vẹn. |
| **`201 Created`**| Khởi tạo thành công | Bản ghi mới đã được tạo vào cơ sở dữ liệu (`POST /orders`, `POST /users`, `POST /products`). |
| **`400 Bad Request`**| Yêu cầu không hợp lệ | Dữ liệu gửi lên sai định dạng hoặc thiếu các trường bắt buộc. |
| **`404 Not Found`**| Không tìm thấy | Không tồn tại tài nguyên tương ứng với ID hoặc tham số truy vấn. |
| **`500 Internal Error`**| Lỗi máy chủ | JSON-Server gặp sự cố hoặc tệp CSDL `db.json` bị khóa truy cập. |

---

## 2. CHI TIẾT CÁC NHÓM API ENDPOINTS

### 2.1. Products API (Quản Lý Sản Phẩm & Tồn Kho)

#### 🔹 2.1.1. Lấy danh sách tác phẩm (Hỗ trợ tìm kiếm, lọc & phân trang)
- **Phương thức:** `GET`
- **Đường dẫn:** `/products`
- **Tham số truy vấn (Query Parameters):**
  - `q`: Từ khóa tìm kiếm toàn văn không phân biệt hoa thường (`name`, `author`, `publisher`).
  - `categoryId`: Lọc theo mã danh mục thể loại (Ví dụ: `?categoryId=1`).
  - `isHot`: Lọc các tác phẩm nổi bật (`?isHot=true`).
  - `isNew`: Lọc các tác phẩm mới phát hành (`?isNew=true`).
  - `price_gte`: Lọc giá bán từ mức tối thiểu (Ví dụ: `?price_gte=50000`).
  - `price_lte`: Lọc giá bán đến mức tối đa (Ví dụ: `?price_lte=100000`).
  - `_sort`: Trường sắp xếp (`price`, `id`, `sold`).
  - `_order`: Chiều sắp xếp (`asc` cho tăng dần, `desc` cho giảm dần).
  - `_page` & `_limit`: Phân trang kết quả (Ví dụ: `?_page=1&_limit=12`).

**Ví Dụ Request cURL:**
```bash
curl -X GET "http://localhost:3000/products?categoryId=1&_sort=price&_order=asc"
```

**Ví Dụ Response `200 OK`:**
```json
[
  {
    "id": 1,
    "name": "One Piece - Tập 108",
    "categoryId": 1,
    "price": 36000,
    "originalPrice": 40000,
    "author": "Eiichiro Oda",
    "publisher": "NXB Kim Đồng",
    "image": "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600",
    "stock": 42,
    "sold": 28,
    "isHot": true,
    "isNew": false,
    "description": "Chuyến hành trình tại hòn đảo Egghead đầy kịch tính của băng Mũ Rơm..."
  }
]
```

---

#### 🔹 2.1.2. Xem thông tin chi tiết một cuốn sách
- **Phương thức:** `GET`
- **Đường dẫn:** `/products/:id`
- **Ví Dụ Request:** `GET http://localhost:3000/products/2`
- **Response `200 OK`:** Trả về Object thông tin chi tiết của sách.
- **Response `404 Not Found`:** `{}`, khi không tồn tại ID tương ứng.

---

#### 🔹 2.1.3. Thêm tác phẩm mới vào kho sách (Admin)
- **Phương thức:** `POST`
- **Đường dẫn:** `/products`
- **Request Body (JSON):**
```json
{
  "name": "Chainsaw Man - Tập 15",
  "categoryId": 1,
  "price": 45000,
  "originalPrice": 50000,
  "author": "Tatsuki Fujimoto",
  "publisher": "NXB Trẻ",
  "image": "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600",
  "stock": 50,
  "sold": 0,
  "isHot": false,
  "isNew": true,
  "description": "Cuộc chiến nghẹt thở tiếp diễn của Denji và Quỷ Cưa..."
}
```
- **Response `201 Created`:** Trả về bản ghi vừa tạo kèm thuộc tính `id` tự động sinh.

---

#### 🔹 2.1.4. Cập nhật thông tin hoặc trừ tồn kho sách
- **Phương thức:** `PATCH`
- **Đường dẫn:** `/products/:id`
- **Mục đích nghiệp vụ:** Dùng để chỉnh sửa sách trong Admin HOẶC trừ tồn kho tự động sau khi đặt hàng (`stock = currentStock - quantity`).
- **Request Body (JSON):**
```json
{
  "stock": 35,
  "sold": 35
}
```
- **Response `200 OK`:** Trả về Object sản phẩm sau khi đã cập nhật giá trị mới.

---

#### 🔹 2.1.5. Xóa tác phẩm khỏi kho
- **Phương thức:** `DELETE`
- **Đường dẫn:** `/products/:id`
- **Response `200 OK`:** `{}`, xác nhận đã xóa thành công.

---

### 2.2. Categories API (Danh Mục Thể Loại)

#### 🔹 2.2.1. Lấy danh sách thể loại
- **Phương thức:** `GET`
- **Đường dẫn:** `/categories`
- **Response `200 OK`:**
```json
[
  { "id": 1, "name": "Manga - Truyện Tranh", "slug": "manga", "icon": "📚" },
  { "id": 2, "name": "Light Novel", "slug": "light-novel", "icon": "✨" },
  { "id": 3, "name": "Tiểu Thuyết & Văn Học", "slug": "tieu-thuyet", "icon": "📖" },
  { "id": 4, "name": "Sách Kỹ Năng & Tư Duy", "slug": "ky-nang", "icon": "💡" },
  { "id": 5, "name": "Artbook & Sưu Tầm", "slug": "artbook", "icon": "🎨" }
]
```

---

### 2.3. Banners API (Quảng Bá Trang Chủ)

#### 🔹 2.3.1. Lấy danh sách banner
- **Phương thức:** `GET`
- **Đường dẫn:** `/banners`
- **Response `200 OK`:** Trả về mảng các banner slide có đầy đủ `tenbanner`, `hinhbanner`, `productId`.

---

### 2.4. Coupons API (Mã Phiếu Giảm Giá & Hạn Mức VIP)

#### 🔹 2.4.1. Tra cứu mã phiếu giảm giá khi checkout
- **Phương thức:** `GET`
- **Đường dẫn:** `/coupons?code={CODE}`
- **Ví Dụ:** `GET http://localhost:3000/coupons?code=VIPMEMBER`
- **Response `200 OK`:**
```json
[
  {
    "id": 4,
    "code": "VIPMEMBER",
    "discountType": "percent",
    "discountValue": 15,
    "minOrderAmount": 0,
    "target": "vip",
    "monthlyMinSpent": 500000,
    "maintainMinSpent": 250000,
    "description": "Giảm 15% tổng hóa đơn dành riêng cho Thành Viên VIP"
  }
]
```

---

### 2.5. Users API (Tài Khoản & Thông Tin Khách Hàng)

#### 🔹 2.5.1. Tra cứu người dùng theo email (Dùng cho Đăng Nhập / Đăng Ký)
- **Phương thức:** `GET`
- **Đường dẫn:** `/users?email={email}`
- **Response `200 OK`:** Trả về mảng người dùng khớp email (rỗng nếu chưa có).

---

#### 🔹 2.5.2. Đăng ký tài khoản độc giả mới
- **Phương thức:** `POST`
- **Đường dẫn:** `/users`
- **Request Body (JSON):**
```json
{
  "name": "Lê Bảo Anh",
  "email": "baoanh@gmail.com",
  "phone": "0912345678",
  "birthday": "2002-11-15",
  "address": "123 Cách Mạng Tháng 8, Q10, TP.HCM",
  "password": "hashed_or_plain_password",
  "role": "customer",
  "usedCoupons": [],
  "createdAt": "2026-11-05T08:00:00.000Z"
}
```
- **Response `201 Created`:** Khởi tạo thành công bản ghi tài khoản.

---

#### 🔹 2.5.3. Cập nhật thông tin cá nhân & địa chỉ mặc định
- **Phương thức:** `PATCH`
- **Đường dẫn:** `/users/:id`
- **Mục đích nghiệp vụ:** Cập nhật SĐT, ngày sinh, địa chỉ mặc định từ trang `profile.html` hoặc từ tùy chọn lưu địa chỉ tại giỏ hàng.
- **Request Body (JSON):**
```json
{
  "phone": "0988776655",
  "birthday": "1998-11-20",
  "address": "456 Nguyễn Huệ, Quận 1, TP.HCM"
}
```
- **Response `200 OK`:** Trả về Object thông tin User sau khi đã lưu.

---

### 2.6. Orders API (Đơn Hàng & Thống Kê Doanh Thu)

#### 🔹 2.6.1. Lấy toàn bộ đơn hàng (Dùng cho Admin Analytics & Tính VIP)
- **Phương thức:** `GET`
- **Đường dẫn:** `/orders`
- **Query Parameters bổ trợ:**
  - `userId`: Lọc các đơn của một độc giả cụ thể (`?userId=3`).
  - `_sort=createdAtIso&_order=desc`: Sắp xếp đơn mới nhất lên trước.
- **Response `200 OK`:** Trả về danh sách toàn bộ các hóa đơn đã phát sinh.

---

#### 🔹 2.6.2. Tạo đơn đặt hàng mới (Sau khi Checkout)
- **Phương thức:** `POST`
- **Đường dẫn:** `/orders`
- **Request Body (JSON):**
```json
{
  "id": 1793758226999,
  "orderCode": "HKR882314",
  "userId": 3,
  "customer": {
    "name": "Nguyễn Thị Mai",
    "phone": "0988776655",
    "address": "123 Đường Sách Nguyễn Huệ, Quận 1, TP.HCM",
    "note": "Giao giờ hành chính"
  },
  "items": [
    {
      "productId": 1,
      "name": "One Piece - Tập 108",
      "price": 36000,
      "quantity": 2
    }
  ],
  "subtotal": 72000,
  "discount": 10800,
  "couponCode": "VIPMEMBER",
  "shippingFee": 30000,
  "total": 91200,
  "paymentMethod": "cod",
  "status": "Đã hoàn thành",
  "createdAt": "14:20:00 05/11/2026",
  "createdAtIso": "2026-11-05T07:20:00.000Z"
}
```
- **Response `201 Created`:** Đơn hàng đã ghi nhận thành công vào CSDL.

---

### 2.7. Carts API (Đồng Bộ Giỏ Hàng Máy Chủ)

#### 🔹 2.7.1. Lấy danh sách sản phẩm trong giỏ của người dùng
- **Phương thức:** `GET`
- **Đường dẫn:** `/carts?userId={userId}`
- **Response `200 OK`:** Mảng các mục sản phẩm có trong giỏ hàng.

#### 🔹 2.7.2. Thêm hoặc cập nhật giỏ hàng máy chủ
- **Phương thức:** `POST` hoặc `PATCH /carts/:id`
- **Request Body:** `{ "userId": 3, "productId": 1, "quantity": 2 }`

#### 🔹 2.7.3. Xóa sản phẩm khỏi giỏ máy chủ
- **Phương thức:** `DELETE`
- **Đường dẫn:** `/carts/:id`

---

## 3. CƠ CHẾ PHỤC HỒI DỮ LIỆU NGOẠI TUYẾN (OFFLINE FALLBACK STRATEGY)

Trong tệp `js/api.js`, mọi lời gọi REST API đều được bao bọc trong cấu trúc `try...catch` thông minh:

```javascript
export const fetchProducts = async () => {
  try {
    // 1. Cố gắng lấy dữ liệu thực tế từ REST API Server (cổng 3000)
    const response = await axios.get('http://localhost:3000/products');
    return response.data;
  } catch (serverError) {
    console.warn('REST API ngoại tuyến, kích hoạt cơ chế Fallback tĩnh...');
    try {
      // 2. Tự động chuyển hướng đọc file db.json cục bộ
      const fallbackRes = await fetch('./db.json');
      const staticData = await fallbackRes.json();
      return staticData.products || [];
    } catch (localError) {
      // 3. Đọc từ bộ nhớ đệm LocalStorage nếu cả 2 phương án trên đều lỗi
      return JSON.parse(localStorage.getItem('cached_products')) || [];
    }
  }
};
```

Cơ chế này bảo đảm website **luôn hoạt động ổn định 100%** trong mọi điều kiện bảo vệ đồ án trước giảng viên, không bao giờ bị gián đoạn do lỗi kết nối cổng mạng hay server chưa kịp bật.

---

> ✍️ **Biên soạn tài liệu bởi:** Nhóm phát triển dự án Hikari BookStore  
> 📌 **Tài liệu thuộc bộ hồ sơ đồ án:** Môn Lập trình JavaScript (Vanilla JS & ES6+)


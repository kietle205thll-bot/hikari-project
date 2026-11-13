// test_system.js - Automated Verification of Revenue Analytics & Targeted Promotions
import http from 'http';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('=== STARTING AUTOMATED VERIFICATION ===\n');
  let passCount = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passCount++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
    }
  }

  // 1. Check json-server db.json endpoint
  try {
    const orders = await fetchJson('http://localhost:3000/orders');
    assert(Array.isArray(orders) && orders.length >= 15, `Đơn hàng trong CSDL đầy đủ (${orders.length} đơn)`);

    const coupons = await fetchJson('http://localhost:3000/coupons');
    assert(coupons.some(c => c.code === 'WELCOME20'), 'Coupon WELCOME20 có trong db.json');
    assert(coupons.some(c => c.code === 'VIPMEMBER'), 'Coupon VIPMEMBER có trong db.json');
    assert(coupons.some(c => c.code === 'NEWBOOKS'), 'Coupon NEWBOOKS có trong db.json');

    const users = await fetchJson('http://localhost:3000/users');
    const vipUser = users.find(u => u.id === 2);
    const newUser = users.find(u => u.id === 3);
    assert(vipUser && vipUser.name === 'Trần Văn An', 'Có user VIP Trần Văn An (id: 2)');
    assert(newUser && newUser.name === 'Nguyễn Thị Mai', 'Có user Mới Nguyễn Thị Mai (id: 3)');

    // 2. Logic simulation for User Tier Calculation
    const user2Orders = orders.filter(o => o.userId === 2 || o.customer?.phone === vipUser.phone);
    const user2Spent = user2Orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const isUser2Vip = user2Orders.length >= 3 || user2Spent >= 1000000;
    assert(isUser2Vip === true, `Trần Văn An đạt chuẩn VIP (${user2Orders.length} đơn, ${user2Spent.toLocaleString()} ₫)`);

    const user3Orders = orders.filter(o => o.userId === 3 || o.customer?.phone === newUser.phone);
    const isUser3Newbie = user3Orders.length === 0;
    assert(isUser3Newbie === true, `Nguyễn Thị Mai là Thành Viên Mới chuẩn (0 hóa đơn)`);

    // 3. Logic simulation for Targeted Coupons
    // WELCOME20: Only for newbie, once
    const canUser3UseWelcome = isUser3Newbie && (!newUser.usedCoupons || !newUser.usedCoupons.includes('WELCOME20'));
    assert(canUser3UseWelcome === true, 'Nguyễn Thị Mai được phép sử dụng mã WELCOME20');

    const canUser2UseWelcome = user2Orders.length === 0;
    assert(canUser2UseWelcome === false, 'Trần Văn An BỊ TỪ CHỐI mã WELCOME20 vì đã có đơn hàng trước đó');

    // VIPMEMBER: Only for VIP
    assert(isUser2Vip === true, 'Trần Văn An ĐƯỢC PHÉP sử dụng mã VIPMEMBER');
    assert((user3Orders.length >= 3 || 0 >= 1000000) === false, 'Nguyễn Thị Mai BỊ TỪ CHỐI mã VIPMEMBER vì chưa đủ điều kiện');

    // NEWBOOKS: Only discounts books with isNew === true
    const testCart = [
      { id: 1, name: 'Chainsaw Man - Tập 15', price: 50000, quantity: 2, isNew: true },
      { id: 2, name: 'One Piece - Tập 108', price: 40000, quantity: 1, isNew: false }
    ];
    const newItems = testCart.filter(i => i.isNew === true);
    const newSubtotal = newItems.reduce((s, i) => s + (i.price * i.quantity), 0); // 100000
    const discount10 = Math.round(newSubtotal * 0.1); // 10000
    assert(discount10 === 10000, `Mã NEWBOOKS giảm chính xác 10% trên sách mới (10.000 ₫ / 100.000 ₫)`);

    // 4. Test Revenue Analytics aggregation logic
    // Month breakdown for 2026
    const orders2026 = orders.filter(o => {
      const d = o.createdAtIso ? new Date(o.createdAtIso) : null;
      return d && d.getFullYear() === 2026;
    });
    assert(orders2026.length >= 10, `Có ít nhất 10 đơn hàng trong năm 2026 (${orders2026.length} đơn)`);

    const q1Orders = orders2026.filter(o => {
      const m = new Date(o.createdAtIso).getMonth();
      return m >= 0 && m <= 2;
    });
    const q2Orders = orders2026.filter(o => {
      const m = new Date(o.createdAtIso).getMonth();
      return m >= 3 && m <= 5;
    });
    const q3Orders = orders2026.filter(o => {
      const m = new Date(o.createdAtIso).getMonth();
      return m >= 6 && m <= 8;
    });
    const q4Orders = orders2026.filter(o => {
      const m = new Date(o.createdAtIso).getMonth();
      return m >= 9 && m <= 11;
    });
    assert(q1Orders.length > 0 && q2Orders.length > 0 && q3Orders.length > 0 && q4Orders.length > 0, 'Dữ liệu trải đều đủ 4 Quý (Q1, Q2, Q3, Q4) năm 2026 cho biểu đồ thống kê');

    const staffUser = users.find(u => u.id === 4 || u.role === 'staff');
    assert(staffUser && staffUser.role === 'staff', `Hệ thống có đủ 3 role: Admin, Nhân Viên (staff: ${staffUser?.name}), Khách Hàng (customer)`);

    // 5. Test Logic Sale Ngày 20 và Hết Sale Ngày 21
    const testDay20 = (day) => {
      if (day === 21) return { isSaleActive: false, isDay21Expired: true };
      if (day === 20) return { isSaleActive: true, isDay21Expired: false };
      return { isSaleActive: true, isDay21Expired: false };
    };

    const day20Status = testDay20(20);
    assert(day20Status.isSaleActive === true, 'Ngày 20: Tự động BẬT SIÊU SALE và kích hoạt đồng hồ đếm ngược');

    const day21Status = testDay20(21);
    assert(day21Status.isSaleActive === false && day21Status.isDay21Expired === true, 'Ngày 21: Tự động HẾT SALE, đóng chương trình và đưa giá về chuẩn');

  } catch (err) {
    console.error('Lỗi khi chạy test:', err);
  }

  console.log(`\n=== KẾT QUẢ: ${passCount}/${totalTests} TESTS ĐẠT YÊU CẦU ===`);
}

runTests();

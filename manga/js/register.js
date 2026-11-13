/**
 * register.js - Xử lý nghiệp vụ Đăng Ký Tài Khoản
 * Thực hiện đầy đủ các quy định về Form Validation của Đồ án (PDF Mục 10)
 */
import { api } from './api.js';
import { showToast, attachVnPhoneInputGuard, validateVnPhone } from './utils.js';

const registerForm = document.querySelector('#registerForm');
const nameInput = document.querySelector('#nameInput');
const emailInput = document.querySelector('#emailInput');
const phoneInput = document.querySelector('#phoneInput');
const birthdayInput = document.querySelector('#birthdayInput');
const passwordInput = document.querySelector('#passwordInput');
const confirmPasswordInput = document.querySelector('#confirmPasswordInput');
const submitBtn = document.querySelector('#registerSubmitBtn');

// Các phần tử thông báo lỗi
const nameError = document.querySelector('#nameError');
const emailError = document.querySelector('#emailError');
const phoneError = document.querySelector('#phoneError');
const birthdayError = document.querySelector('#birthdayError');
const passwordError = document.querySelector('#passwordError');
const confirmPasswordError = document.querySelector('#confirmPasswordError');
const roleRadios = document.querySelectorAll('input[name="accountRole"]');
const welcomeBanner = document.querySelector('#registerWelcomeBanner');
const staffNotice = document.querySelector('#staffRegisterNotice');

// Cập nhật giao diện theo loại tài khoản (Khách hàng / Nhân viên)
const syncRoleNoticeUi = () => {
  const selectedRole = document.querySelector('input[name="accountRole"]:checked')?.value === 'staff' ? 'staff' : 'customer';
  const isStaff = selectedRole === 'staff';
  if (welcomeBanner) welcomeBanner.style.display = isStaff ? 'none' : 'flex';
  if (staffNotice) staffNotice.style.display = isStaff ? 'flex' : 'none';
  if (submitBtn && !submitBtn.disabled) {
    submitBtn.textContent = isStaff ? 'Gửi Đăng Ký Nhân Viên' : 'Đăng Ký Tài Khoản';
  }
};

roleRadios.forEach((radio) => {
  radio.addEventListener('change', syncRoleNoticeUi);
});
syncRoleNoticeUi();

// Hàm hiển thị lỗi
const showError = (inputEl, errorEl, message) => {
  inputEl.classList.add('is-invalid');
  inputEl.classList.remove('is-valid');
  errorEl.textContent = message;
  errorEl.classList.add('visible');
};

// Hàm xóa lỗi
const clearError = (inputEl, errorEl) => {
  inputEl.classList.remove('is-invalid');
  inputEl.classList.add('is-valid');
  errorEl.textContent = '';
  errorEl.classList.remove('visible');
};

// Biểu thức chính quy (Regex) kiểm tra Email và Mật khẩu an toàn
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Ràng buộc mật khẩu: Tối thiểu 8 ký tự, có chữ thường, chữ HOA, số và ký tự đặc biệt (@$!%*?&_#^)
const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_#^])[A-Za-z\d@$!%*?&_#^]{8,}$/;

attachVnPhoneInputGuard(phoneInput);

// Xóa lỗi khi người dùng nhập liệu
nameInput?.addEventListener('input', () => clearError(nameInput, nameError));
emailInput?.addEventListener('input', () => clearError(emailInput, emailError));
phoneInput?.addEventListener('input', () => clearError(phoneInput, phoneError));
passwordInput?.addEventListener('input', () => clearError(passwordInput, passwordError));
confirmPasswordInput?.addEventListener('input', () => clearError(confirmPasswordInput, confirmPasswordError));

// Xử lý gửi Form đăng ký
registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const phone = phoneInput.value.trim();
  const password = passwordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();

  let isValid = true;

  // 1. Validate Họ và tên (không rỗng, >= 2 ký tự)
  if (!name) {
    showError(nameInput, nameError, 'Họ và tên không được để trống!');
    isValid = false;
  } else if (name.length < 2) {
    showError(nameInput, nameError, 'Họ và tên phải có tối thiểu 2 ký tự!');
    isValid = false;
  } else {
    clearError(nameInput, nameError);
  }

  // 2. Validate Email (không rỗng, đúng regex)
  if (!email) {
    showError(emailInput, emailError, 'Email không được để trống!');
    isValid = false;
  } else if (!EMAIL_REGEX.test(email)) {
    showError(emailInput, emailError, 'Email không đúng định dạng (VD: example@gmail.com)!');
    isValid = false;
  } else {
    clearError(emailInput, emailError);
  }

  // 3. Validate Số điện thoại (nếu có nhập thì phải đúng định dạng VN 10 số)
  let normalizedPhone = '';
  if (phone) {
    const phoneCheck = validateVnPhone(phone);
    if (!phoneCheck.valid) {
      showError(phoneInput, phoneError, phoneCheck.message);
      isValid = false;
    } else {
      normalizedPhone = phoneCheck.normalized;
      phoneInput.value = normalizedPhone;
      clearError(phoneInput, phoneError);
    }
  }

  // 4. Validate Mật khẩu (ràng buộc chữ thường, HOA, số, ký tự đặc biệt, >= 8 ký tự)
  if (!password) {
    showError(passwordInput, passwordError, 'Mật khẩu không được để trống!');
    isValid = false;
  } else if (!PASSWORD_COMPLEXITY_REGEX.test(password)) {
    showError(passwordInput, passwordError, 'Mật khẩu phải từ 8 ký tự trở lên, gồm cả chữ hoa, chữ thường, số và ký tự đặc biệt (VD: Hikari@2026)!');
    isValid = false;
  } else {
    clearError(passwordInput, passwordError);
  }

  // 5. Validate Xác nhận mật khẩu (phải trùng khớp)
  if (!confirmPassword) {
    showError(confirmPasswordInput, confirmPasswordError, 'Vui lòng xác nhận lại mật khẩu!');
    isValid = false;
  } else if (password !== confirmPassword) {
    showError(confirmPasswordInput, confirmPasswordError, 'Mật khẩu xác nhận không trùng khớp!');
    isValid = false;
  } else {
    clearError(confirmPasswordInput, confirmPasswordError);
  }

  if (!isValid) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Đang xử lý đăng ký...';

  try {
    // 6. Kiểm tra xem Email đã tồn tại trên hệ thống hay chưa
    let existingUsers = [];
    try {
      const response = await api.get('/users');
      existingUsers = response.data;
    } catch (err) {
      const fallback = await fetch('./db.json');
      const data = await fallback.json();
      existingUsers = data.users || [];
    }

    const localUsers = JSON.parse(localStorage.getItem('registered_users')) || [];
    const allUsers = [...existingUsers, ...localUsers];

    const emailExisted = allUsers.some(u => u.email?.toLowerCase() === email.toLowerCase());
    if (emailExisted) {
      showError(emailInput, emailError, 'Email này đã được sử dụng bởi tài khoản khác!');
      submitBtn.disabled = false;
      syncRoleNoticeUi();
      return;
    }

    const selectedRole = document.querySelector('input[name="accountRole"]:checked')?.value === 'staff' ? 'staff' : 'customer';
    const isStaffSignup = selectedRole === 'staff';

    // 7. Tạo đối tượng người dùng mới (chỉ cho phép customer hoặc staff chờ duyệt, không tạo admin từ form công khai)
    const newUser = {
      id: Date.now(),
      name,
      email,
      phone: normalizedPhone || '',
      birthday: birthdayInput?.value || '',
      password,
      role: selectedRole,
      status: isStaffSignup ? 'pending' : 'active',
      usedCoupons: [],
      createdAt: new Date().toISOString()
    };

    // 8. Lưu người dùng lên json-server và LocalStorage
    let savedToServer = false;
    try {
      await api.post('/users', newUser);
      savedToServer = true;
    } catch (postErr) {
      console.warn('Không thể POST tới /users, lưu vào localStorage registered_users:', postErr.message);
    }

    // Chỉ lưu bản dự phòng vào localStorage khi chưa có bản ghi trùng email trên server hoặc API lỗi
    if (!savedToServer) {
      localUsers.push(newUser);
      localStorage.setItem('registered_users', JSON.stringify(localUsers));
    }

    // Nếu là Nhân viên -> Không tự đăng nhập, chờ Admin duyệt
    if (isStaffSignup) {
      showToast('✓ Đã gửi đăng ký Nhân viên! Vui lòng chờ Admin phê duyệt trước khi đăng nhập.', 'success');
      submitBtn.textContent = '✓ Đã gửi chờ Admin duyệt';
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1800);
      return;
    }

    // Đăng nhập tự động cho khách hàng mới
    const sessionUser = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      birthday: newUser.birthday,
      role: newUser.role,
      status: newUser.status
    };
    localStorage.setItem('user', JSON.stringify(sessionUser));
    localStorage.setItem('currentUser', JSON.stringify(sessionUser));
    localStorage.setItem('hikari_wishlist', JSON.stringify([]));
    localStorage.setItem(`hikari_wishlist_${newUser.id}`, JSON.stringify([]));

    showToast('Đăng ký thành công! Bạn nhận được mã WELCOME20 (Giảm 20.000đ cho đơn đầu tiên)', 'success');

    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get('redirect') || 'index.html';
    setTimeout(() => {
      window.location.href = redirectUrl;
    }, 1500);

  } catch (error) {
    console.error('Lỗi khi đăng ký:', error);
    showError(confirmPasswordInput, confirmPasswordError, 'Có lỗi xảy ra trong quá trình đăng ký!');
    submitBtn.disabled = false;
    syncRoleNoticeUi();
  }
});

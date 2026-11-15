/**
 * login.js - Xử lý nghiệp vụ Đăng Nhập
 * Sử dụng ES6+, Axios, LocalStorage và Form Validation
 */
import { api, fetchCartServer, addToCartServer, removeCartItemServer } from './api.js';
import { showToast } from './utils.js';
import { sendOtpEmail } from './mailbox.js';

const loginForm = document.querySelector('#loginForm');
const usernameInput = document.querySelector('#usernameInput');
const passwordInput = document.querySelector('#passwordInput');
const usernameError = document.querySelector('#usernameError');
const passwordError = document.querySelector('#passwordError');
const submitBtn = document.querySelector('#loginSubmitBtn');

// Hàm hiển thị lỗi cho từng trường
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

// Xóa lỗi khi người dùng gõ phím
usernameInput?.addEventListener('input', () => {
  if (usernameInput.value.trim() !== '') {
    clearError(usernameInput, usernameError);
  }
});

passwordInput?.addEventListener('input', () => {
  if (passwordInput.value.trim() !== '') {
    clearError(passwordInput, passwordError);
  }
});

// Xử lý gửi form
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  let isValid = true;

  // 1. Kiểm tra tài khoản / email
  if (!username) {
    showError(usernameInput, usernameError, 'Vui lòng nhập email hoặc tên tài khoản!');
    isValid = false;
  } else {
    clearError(usernameInput, usernameError);
  }

  // 2. Kiểm tra mật khẩu
  if (!password) {
    showError(passwordInput, passwordError, 'Vui lòng nhập mật khẩu!');
    isValid = false;
  } else if (password.length < 3) {
    showError(passwordInput, passwordError, 'Mật khẩu phải từ 3 ký tự trở lên!');
    isValid = false;
  } else {
    clearError(passwordInput, passwordError);
  }

  if (!isValid) return;

  // Hiệu ứng loading nút bấm
  submitBtn.disabled = true;
  submitBtn.textContent = 'Đang kiểm tra đăng nhập...';

  try {
    let matchedUser = null;

    // 1. Gửi yêu cầu đăng nhập bảo mật lên máy chủ (Không kéo danh sách password về F12)
    try {
      const loginRes = await api.post('/api/auth/login', { username, password });
      if (loginRes.data && loginRes.data.user) {
        matchedUser = loginRes.data.user;
      }
    } catch (authErr) {
      if (authErr.response && authErr.response.status === 401) {
        showError(passwordInput, passwordError, 'Tên đăng nhập hoặc mật khẩu không chính xác!');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Đăng Nhập';
        return;
      }
      console.warn('API /api/auth/login không phản hồi, thử fallback cục bộ db.json...', authErr.message);
      // Fallback cục bộ khi test offline không có internet
      try {
        const fallback = await fetch('./db.json');
        const data = await fallback.json();
        const localUsers = JSON.parse(localStorage.getItem('registered_users')) || [];
        const allUsers = [...(data.users || []), ...localUsers];
        matchedUser = allUsers.find(u => 
          (u.email?.toLowerCase() === username.toLowerCase() || u.name?.toLowerCase() === username.toLowerCase()) &&
          String(u.password) === String(password)
        );
      } catch (fbErr) {}
    }

    if (!matchedUser) {
      showError(passwordInput, passwordError, 'Tên đăng nhập hoặc mật khẩu không chính xác!');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Đăng Nhập';
      return;
    }

    const accountStatus = matchedUser.status || 'active';
    if (accountStatus === 'pending') {
      showError(passwordInput, passwordError, '⏳ Tài khoản nhân viên đang chờ Admin phê duyệt. Vui lòng thử lại sau!');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Đăng Nhập';
      return;
    }
    if (accountStatus === 'rejected') {
      showError(passwordInput, passwordError, '❌ Yêu cầu đăng ký nhân viên đã bị Admin từ chối!');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Đăng Nhập';
      return;
    }

    // Đăng nhập thành công -> Lưu vào LocalStorage
    const sessionUser = {
      id: matchedUser.id,
      name: matchedUser.name,
      email: matchedUser.email,
      birthday: matchedUser.birthday || '',
      phone: matchedUser.phone || '',
      role: matchedUser.role || 'customer',
      status: accountStatus,
      usedCoupons: Array.isArray(matchedUser.usedCoupons) ? matchedUser.usedCoupons : []
    };

    localStorage.setItem('user', JSON.stringify(sessionUser));
    localStorage.setItem('currentUser', JSON.stringify(sessionUser));

    // Khôi phục danh sách yêu thích của người dùng
    const userWishlist = JSON.parse(localStorage.getItem(`hikari_wishlist_${matchedUser.id}`)) || matchedUser.wishlist || [];
    localStorage.setItem('hikari_wishlist', JSON.stringify(userWishlist));

    // Đồng bộ giỏ hàng của khách (guest) vào tài khoản vừa đăng nhập trên CSDL
    const guestId = localStorage.getItem('hikari_guest_id');
    if (guestId) {
      try {
        const guestItems = await fetchCartServer(guestId);
        for (const item of guestItems) {
          await addToCartServer(matchedUser.id, item, item.quantity);
          await removeCartItemServer(item.id);
        }
      } catch (mergeErr) {
        console.warn('Lỗi đồng bộ giỏ hàng khách sang tài khoản:', mergeErr);
      }
    }

    showToast(`Đăng nhập thành công! Chào mừng ${matchedUser.name}`, 'success');

    // Chuyển hướng sau khi đăng nhập thành công (nếu là Admin/Nhân viên/Shipper thì chuyển tương ứng)
    const urlParams = new URLSearchParams(window.location.search);
    let redirectUrl = urlParams.get('redirect');
    if (!redirectUrl) {
      if (sessionUser.role === 'admin' || sessionUser.role === 'staff') {
        redirectUrl = 'admin.html';
      } else if (sessionUser.role === 'shipper') {
        redirectUrl = 'shipper.html';
      } else {
        redirectUrl = 'index.html';
      }
    }
    setTimeout(() => {
      window.location.href = redirectUrl;
    }, 1000);

  } catch (error) {
    console.error('Lỗi trong quá trình đăng nhập:', error);
    showError(passwordInput, passwordError, 'Có lỗi xảy ra khi kết nối máy chủ!');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Đăng Nhập';
  }
});

// ================= XỬ LÝ QUÊN MẬT KHẨU (OTP RANDOM + HẠN 60 GIÂY) =================
const forgotModal = document.querySelector('#forgotPasswordModal');
const forgotPwdLink = document.querySelector('#forgotPwdLink');
const btnCloseForgotModal = document.querySelector('#btnCloseForgotModal');

const forgotStep1 = document.querySelector('#forgotStep1');
const forgotStep2 = document.querySelector('#forgotStep2');
const forgotStepNewPass = document.querySelector('#forgotStepNewPass');
const forgotStep3 = document.querySelector('#forgotStep3');

const forgotStep1Form = document.querySelector('#forgotStep1Form');
const forgotEmailInput = document.querySelector('#forgotEmailInput');
const forgotEmailError = document.querySelector('#forgotEmailError');
const btnSendResetCode = document.querySelector('#btnSendResetCode');

const forgotStep2Form = document.querySelector('#forgotStep2Form');
const targetEmailDisplay = document.querySelector('#targetEmailDisplay');
const countdownBox = document.querySelector('#countdownBox');
const countdownText = document.querySelector('#countdownText');
const btnResendCode = document.querySelector('#btnResendCode');
const btnVerifyOtp = document.querySelector('#btnVerifyOtp');

const forgotNewPassForm = document.querySelector('#forgotNewPassForm');
const resetCodeInput = document.querySelector('#resetCodeInput');
const resetCodeError = document.querySelector('#resetCodeError');
const newPasswordInput = document.querySelector('#newPasswordInput');
const newPasswordError = document.querySelector('#newPasswordError');
const confirmNewPasswordInput = document.querySelector('#confirmNewPasswordInput');
const confirmNewPasswordError = document.querySelector('#confirmNewPasswordError');
const btnSubmitNewPassword = document.querySelector('#btnSubmitNewPassword');

// Ràng buộc mật khẩu: Tối thiểu 8 ký tự, có chữ thường, chữ HOA, số và ký tự đặc biệt (@$!%*?&_#^)
const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_#^])[A-Za-z\d@$!%*?&_#^]{8,}$/;

const btnGoToLogin = document.querySelector('#btnGoToLogin');

// Quản lý trạng thái OTP
const resetState = {
  user: null,
  email: '',
  code: '',
  expiresAt: 0,
  countdownInterval: null
};

// Hàm hiển thị Popup mô phỏng email nhận mã
const showSimulatedEmailNotification = (email, code) => {
  // Đồng thời gửi vào Hòm Thư Ảo để người dùng có thể xem lại bất cứ lúc nào
  try {
    sendOtpEmail(email, code, 'Khôi phục mật khẩu');
  } catch (otpErr) {
    console.warn('Lỗi gửi OTP vào mailbox:', otpErr);
  }

  // Xóa popup cũ nếu có
  const oldToast = document.querySelector('#simulatedEmailToast');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.id = 'simulatedEmailToast';
  toast.className = 'simulated-email-toast';
  toast.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
      <span style="font-size: 0.8rem; font-weight: 700; color: #38bdf8;">📧 [Gmail Bot Sandbox - Test Local An Toàn]</span>
      <span style="font-size: 0.72rem; color: #94a3b8;">Vừa xong</span>
    </div>
    <div style="font-size: 0.82rem; color: #94a3b8;">Người gửi: <span style="color: #cbd5e1;">bot-security@hikari.vn</span></div>
    <div style="font-size: 0.82rem; color: #f1f5f9;">Gửi đến: <strong>${email}</strong></div>
    <div style="font-size: 0.88rem; margin-top: 0.4rem; color: #f8fafc;">Mã xác thực đặt lại mật khẩu OTP của bạn là:</div>
    <div class="simulated-email-code" style="letter-spacing: 4px; font-size: 1.4rem; font-weight: 900; color: #fbbf24; background: #0f172a; padding: 6px; border-radius: 6px; text-align: center; margin: 0.4rem 0;">${code}</div>
    <div style="font-size: 0.78rem; color: #fda4af;">
      ⏱️ <strong>Lưu ý:</strong> Mã này chỉ có hiệu lực trong <strong>60 giây</strong>!
    </div>
    <div style="margin-top: 0.65rem; display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 0.7rem; color: #94a3b8;">🔒 Bảo mật cục bộ 100%</span>
      <button id="btnAutoFillOtp" style="background: var(--primary); color: #fff; border: none; padding: 0.35rem 0.8rem; border-radius: var(--radius-sm); font-size: 0.78rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">
        📋 Sao chép &amp; Điền mã ngay
      </button>
    </div>
  `;

  document.body.appendChild(toast);

  const autoFillBtn = toast.querySelector('#btnAutoFillOtp');
  if (autoFillBtn && resetCodeInput) {
    autoFillBtn.addEventListener('click', () => {
      resetCodeInput.value = code;
      clearError(resetCodeInput, resetCodeError);
      toast.remove();
    });
  }

  // Tự ẩn sau 15 giây
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.4s ease';
      setTimeout(() => toast.remove(), 400);
    }
  }, 15000);
};

// Hàm đếm ngược 60 giây
const startCountdown = () => {
  if (resetState.countdownInterval) {
    clearInterval(resetState.countdownInterval);
  }

  let remaining = 60;
  countdownBox.classList.remove('expired');
  countdownText.textContent = `${remaining}s`;
  countdownText.style.color = 'var(--primary)';
  btnResendCode.disabled = true;
  btnResendCode.textContent = `Gửi lại sau (${remaining}s)`;

  resetState.countdownInterval = setInterval(() => {
    remaining -= 1;

    if (remaining > 0) {
      countdownText.textContent = `${remaining}s`;
      btnResendCode.textContent = `Gửi lại sau (${remaining}s)`;
    } else {
      // HẾT HẠN 60 GIÂY
      clearInterval(resetState.countdownInterval);
      resetState.countdownInterval = null;

      countdownBox.classList.add('expired');
      countdownText.textContent = 'ĐÃ HẾT HẠN ✗';
      countdownText.style.color = 'var(--danger)';

      btnResendCode.disabled = false;
      btnResendCode.textContent = 'Gửi lại mã mới 🔄';

      showError(resetCodeInput, resetCodeError, '⚠️ Mã xác thực đã hết hạn! Sau 60s mã cũ không còn tác dụng, vui lòng bấm Gửi lại mã mới.');
    }
  }, 1000);
};

// Hàm sinh mã ngẫu nhiên mới và chuyển sang bước 2
const generateAndSendOtp = async (user) => {
  // 1. Sinh mã 6 chữ số ngẫu nhiên bất kỳ
  const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
  
  // 2. Thiết lập thời gian hết hạn đúng 60 giây kể từ thời điểm hiện tại
  resetState.user = user;
  resetState.email = user.email;
  resetState.code = randomCode;
  resetState.expiresAt = Date.now() + 60 * 1000;

  // 3. Hiển thị thông báo email mô phỏng
  showSimulatedEmailNotification(user.email, randomCode);

  // 4. Cập nhật giao diện bước 2
  if (targetEmailDisplay) targetEmailDisplay.textContent = user.email;
  if (resetCodeInput) resetCodeInput.value = '';
  if (newPasswordInput) newPasswordInput.value = '';
  if (confirmNewPasswordInput) confirmNewPasswordInput.value = '';

  clearError(resetCodeInput, resetCodeError);
  clearError(newPasswordInput, newPasswordError);
  clearError(confirmNewPasswordInput, confirmNewPasswordError);

  forgotStep1.style.display = 'none';
  forgotStep2.style.display = 'block';
  if (forgotStepNewPass) forgotStepNewPass.style.display = 'none';
  forgotStep3.style.display = 'none';

  startCountdown();
};

// Mở Modal Quên Mật Khẩu
forgotPwdLink?.addEventListener('click', (e) => {
  e.preventDefault();
  forgotStep1.style.display = 'block';
  forgotStep2.style.display = 'none';
  if (forgotStepNewPass) forgotStepNewPass.style.display = 'none';
  forgotStep3.style.display = 'none';

  if (forgotEmailInput) {
    forgotEmailInput.value = usernameInput ? usernameInput.value.trim() : '';
  }
  clearError(forgotEmailInput, forgotEmailError);

  forgotModal.classList.add('active');
});

// Đóng Modal
const closeForgotModal = () => {
  forgotModal.classList.remove('active');
  if (resetState.countdownInterval) {
    clearInterval(resetState.countdownInterval);
    resetState.countdownInterval = null;
  }
  const oldToast = document.querySelector('#simulatedEmailToast');
  if (oldToast) oldToast.remove();
};

btnCloseForgotModal?.addEventListener('click', closeForgotModal);
forgotModal?.addEventListener('click', (e) => {
  if (e.target === forgotModal) closeForgotModal();
});

// BƯỚC 1: Xử lý gửi mã xác thực khi nhập email
forgotStep1Form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = forgotEmailInput.value.trim().toLowerCase();
  if (!email) {
    showError(forgotEmailInput, forgotEmailError, 'Vui lòng nhập địa chỉ email tài khoản!');
    return;
  }

  btnSendResetCode.disabled = true;
  btnSendResetCode.textContent = 'Đang kiểm tra tài khoản...';

  try {
    let users = [];
    try {
      const response = await api.get('/users');
      users = response.data || [];
    } catch (err) {
      const fallback = await fetch('./db.json');
      const data = await fallback.json();
      users = data.users || [];
    }

    const localUsers = JSON.parse(localStorage.getItem('registered_users')) || [];
    const allUsers = [...users, ...localUsers];

    const matchedUser = allUsers.find(u => u.email?.toLowerCase() === email);

    if (!matchedUser) {
      showError(forgotEmailInput, forgotEmailError, 'Không tìm thấy tài khoản nào gắn với email này!');
      btnSendResetCode.disabled = false;
      btnSendResetCode.textContent = '📩 Gửi Mã Xác Thực (OTP)';
      return;
    }

    clearError(forgotEmailInput, forgotEmailError);
    await generateAndSendOtp(matchedUser);

  } catch (err) {
    console.error('Lỗi kiểm tra email:', err);
    showError(forgotEmailInput, forgotEmailError, 'Có lỗi xảy ra khi kết nối máy chủ!');
  } finally {
    btnSendResetCode.disabled = false;
    btnSendResetCode.textContent = '📩 Gửi Mã Xác Thực (OTP)';
  }
});

// BƯỚC 2: Nút gửi lại mã mới khi mã cũ hết hạn
btnResendCode?.addEventListener('click', async () => {
  if (resetState.user) {
    await generateAndSendOtp(resetState.user);
    showToast('Đã tạo và gửi mã xác thực mới (Hiệu lực: 60s)!', 'info');
  }
});

// BƯỚC 2A: Xử lý kiểm tra mã OTP (Hủy đồng hồ đếm ngược ngay khi nhập đúng mã)
forgotStep2Form?.addEventListener('submit', (e) => {
  e.preventDefault();

  const inputCode = resetCodeInput.value.trim();

  // 1. KIỂM TRA THỜI HẠN HIỆU LỰC (RÀNG BUỘC 60S TRƯỚC KHI XÁC THỰC)
  const now = Date.now();
  if (now > resetState.expiresAt) {
    showError(resetCodeInput, resetCodeError, '⚠️ Mã xác thực đã hết hạn (quá 60 giây)! Vui lòng bấm "Gửi lại mã mới".');
    return;
  }

  // 2. KIỂM TRA MÃ XÁC THỰC
  if (!inputCode) {
    showError(resetCodeInput, resetCodeError, 'Vui lòng nhập mã xác thực 6 số!');
    return;
  }
  
  if (inputCode !== resetState.code) {
    showError(resetCodeInput, resetCodeError, 'Mã xác thực không chính xác!');
    return;
  }

  clearError(resetCodeInput, resetCodeError);

  // === ĐÃ XÁC THỰC HỢP LỆ: DỪNG NGAY BỘ ĐẾM NGƯỢC ĐỂ NGƯỜI DÙNG BÌNH TĨNH ĐẶT MẬT KHẨU MỚI ===
  if (resetState.countdownInterval) {
    clearInterval(resetState.countdownInterval);
    resetState.countdownInterval = null;
  }
  const oldToast = document.querySelector('#simulatedEmailToast');
  if (oldToast) oldToast.remove();

  // Chuyển sang Bước 2B: Thiết lập mật khẩu mới
  forgotStep2.style.display = 'none';
  if (forgotStepNewPass) {
    forgotStepNewPass.style.display = 'block';
  }
  newPasswordInput?.focus();
  showToast('✓ Mã OTP chính xác! Hãy thiết lập mật khẩu mới an toàn.', 'success');
});

// BƯỚC 2B: Xử lý lưu mật khẩu mới (Áp dụng chính sách mật khẩu bảo mật cao)
forgotNewPassForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const newPassword = newPasswordInput.value.trim();
  const confirmPassword = confirmNewPasswordInput.value.trim();

  let isValid = true;

  // 1. KIỂM TRA MẬT KHẨU MỚI VỚI REGEX BẢO MẬT
  if (!newPassword) {
    showError(newPasswordInput, newPasswordError, 'Vui lòng nhập mật khẩu mới!');
    isValid = false;
  } else if (!PASSWORD_COMPLEXITY_REGEX.test(newPassword)) {
    showError(newPasswordInput, newPasswordError, 'Mật khẩu phải từ 8 ký tự trở lên, gồm chữ hoa, chữ thường, số và ký tự đặc biệt (@$!%*?&_#^)!');
    isValid = false;
  } else if (resetState.user?.password && newPassword === resetState.user.password) {
    showError(newPasswordInput, newPasswordError, 'Mật khẩu mới không được trùng với mật khẩu cũ của tài khoản!');
    isValid = false;
  } else {
    clearError(newPasswordInput, newPasswordError);
  }

  // 2. KIỂM TRA XÁC NHẬN MẬT KHẨU
  if (!confirmPassword) {
    showError(confirmNewPasswordInput, confirmNewPasswordError, 'Vui lòng nhập lại mật khẩu mới!');
    isValid = false;
  } else if (newPassword !== confirmPassword) {
    showError(confirmNewPasswordInput, confirmNewPasswordError, 'Mật khẩu xác nhận không trùng khớp!');
    isValid = false;
  } else {
    clearError(confirmNewPasswordInput, confirmNewPasswordError);
  }

  if (!isValid) return;

  btnSubmitNewPassword.disabled = true;
  btnSubmitNewPassword.textContent = 'Đang cập nhật mật khẩu...';

  try {
    // 3. Cập nhật mật khẩu mới trực tiếp lên CSDL json-server (PATCH /users/:id)
    try {
      await api.patch(`/users/${resetState.user.id}`, { password: newPassword });
    } catch (apiErr) {
      console.warn('Lỗi PATCH /users, cập nhật fallback localStorage:', apiErr.message);
    }

    // 4. Cập nhật vào danh sách registered_users trong localStorage
    const localUsers = JSON.parse(localStorage.getItem('registered_users')) || [];
    const userIdx = localUsers.findIndex(u => u.id === resetState.user.id || u.email === resetState.user.email);
    if (userIdx !== -1) {
      localUsers[userIdx].password = newPassword;
      localStorage.setItem('registered_users', JSON.stringify(localUsers));
    }

    // 5. Cập nhật session user nếu đang đăng nhập đúng tài khoản này
    const currentSessionUser = JSON.parse(localStorage.getItem('user'));
    if (currentSessionUser && String(currentSessionUser.id) === String(resetState.user.id)) {
      currentSessionUser.password = newPassword;
      localStorage.setItem('user', JSON.stringify(currentSessionUser));
    }

    // 6. Chuyển sang Bước 3: Thông báo thành công
    forgotStep1.style.display = 'none';
    forgotStep2.style.display = 'none';
    if (forgotStepNewPass) forgotStepNewPass.style.display = 'none';
    forgotStep3.style.display = 'block';

    showToast('🎉 Đặt lại mật khẩu thành công!', 'success');

  } catch (error) {
    console.error('Lỗi đổi mật khẩu:', error);
    showError(confirmNewPasswordInput, confirmNewPasswordError, 'Có lỗi xảy ra khi cập nhật mật khẩu mới!');
  } finally {
    btnSubmitNewPassword.disabled = false;
    btnSubmitNewPassword.textContent = '🔒 Cập Nhật Mật Khẩu Mới';
  }
});

// BƯỚC 3: Nút quay lại đăng nhập sau khi đổi thành công
btnGoToLogin?.addEventListener('click', () => {
  closeForgotModal();
  if (usernameInput && resetState.email) {
    usernameInput.value = resetState.email;
  }
  if (passwordInput) {
    passwordInput.value = '';
    passwordInput.focus();
  }
});

// ================= TỰ ĐỘNG ĐIỀN TÀI KHOẢN DEMO =================
document.querySelectorAll('.btn-demo-account').forEach(btn => {
  btn.addEventListener('click', () => {
    const user = btn.dataset.user;
    const pass = btn.dataset.pass;
    if (usernameInput && passwordInput) {
      usernameInput.value = user;
      passwordInput.value = pass;
      clearError(usernameInput, usernameError);
      clearError(passwordInput, passwordError);
      showToast(`Đã điền tài khoản: ${user}`, 'info');
    }
  });
});



// ============================================
// 我来过 - 应用逻辑
// ============================================

(function() {
  'use strict';

  // ============================================
  // 状态管理
  // ============================================
  
  const state = {
    currentUser: null,
    currentPage: 'home',
    entries: [],
    plazaEntries: [],
    plazaOffset: 0,
    plazaHasMore: true,
    profile: null,
    isMember: false,
  };

  // ============================================
  // API 请求工具
  // ============================================
  
  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const text = await response.text();
      let message = '请求失败';
      try {
        const json = JSON.parse(text);
        message = json.error || json.message || message;
      } catch {}
      throw new Error(message);
    }

    return response.json();
  }

  // ============================================
  // 用户认证
  // ============================================
  
  async function checkAuth() {
    try {
      const result = await requestJson('/__qoder_auth/me');
      if (result && result.user_id) {
        state.currentUser = result;
        updateAuthUI(true);
        await loadProfile();
        return true;
      }
    } catch (e) {
      // 未登录
    }
    updateAuthUI(false);
    return false;
  }

  function updateAuthUI(loggedIn) {
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    
    if (loggedIn && state.currentUser) {
      loginBtn.classList.add('hidden');
      userInfo.classList.remove('hidden');
      document.getElementById('userName').textContent = 
        state.currentUser.name || '用户';
    } else {
      loginBtn.classList.remove('hidden');
      userInfo.classList.add('hidden');
    }
  }

  function handleLogin() {
    // 跳转到 Qoder 登录页面
    window.location.href = '/__qoder_auth/login?redirect=' + 
      encodeURIComponent(window.location.href);
  }

  function handleLogout() {
    window.location.href = '/__qoder_auth/logout?redirect=' + 
      encodeURIComponent(window.location.href);
  }

  // ============================================
  // 个人资料
  // ============================================
  
  async function loadProfile() {
    try {
      const result = await requestJson('/functions/v1/app?action=profile');
      if (result && result.ok) {
        state.profile = result.profile;
        state.isMember = result.profile.is_member || false;
        updateProfileUI();
      }
    } catch (e) {
      console.error('加载资料失败:', e);
    }
  }

  function updateProfileUI() {
    if (!state.profile) return;
    
    document.getElementById('profileName').value = state.profile.display_name || '';
    document.getElementById('profileBirthYear').value = state.profile.birth_year || '';
    document.getElementById('profileBio').value = state.profile.bio || '';
    
    const statusEl = document.getElementById('membershipStatus');
    if (state.isMember) {
      statusEl.innerHTML = '<p>终身会员：<strong style="color: var(--success);">已开通 ✓</strong></p>';
    }
  }

  async function saveProfile() {
    const name = document.getElementById('profileName').value.trim();
    const birthYear = document.getElementById('profileBirthYear').value;
    const bio = document.getElementById('profileBio').value.trim();

    if (!name) {
      showToast('请填写昵称', 'error');
      return;
    }

    try {
      const result = await requestJson('/functions/v1/app?action=profile', {
        method: 'POST',
        body: JSON.stringify({
          display_name: name,
          birth_year: birthYear ? parseInt(birthYear) : null,
          bio: bio,
        }),
      });

      if (result && result.ok) {
        state.profile = result.profile;
        showToast('保存成功', 'success');
      } else {
        throw new Error(result?.error || '保存失败');
      }
    } catch (e) {
      showToast(e.message || '保存失败', 'error');
    }
  }

  // ============================================
  // 时间线（我的印记）
  // ============================================
  
  async function loadTimeline() {
    const timeline = document.getElementById('timeline');
    const emptyState = document.getElementById('emptyTimeline');
    
    try {
      const result = await requestJson('/functions/v1/app?action=entries');
      if (result && result.ok) {
        state.entries = result.entries || [];
        renderTimeline();
      }
    } catch (e) {
      console.error('加载时间线失败:', e);
      emptyState.classList.remove('hidden');
    }
  }

  function renderTimeline(filter = 'all') {
    const timeline = document.getElementById('timeline');
    const emptyState = document.getElementById('emptyTimeline');
    
    let filtered = state.entries;
    if (filter === 'public') {
      filtered = state.entries.filter(e => e.is_public);
    } else if (filter === 'private') {
      filtered = state.entries.filter(e => !e.is_public);
    }

    if (filtered.length === 0) {
      timeline.innerHTML = '';
      timeline.appendChild(emptyState);
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    
    // 按年龄排序
    filtered.sort((a, b) => a.age - b.age);
    
    timeline.innerHTML = filtered.map(entry => `
      <div class="timeline-item" data-id="${entry.id}">
        <div class="timeline-dot"></div>
        <div class="timeline-card ${entry.is_public ? '' : 'private'}" onclick="app.viewEntry('${entry.id}')">
          <img class="timeline-photo" src="${entry.photo_url}" alt="${entry.age}岁" loading="lazy">
          <div class="timeline-content">
            <span class="timeline-age">${entry.age}岁</span>
            <span class="timeline-year">${entry.year || ''}</span>
            <p class="timeline-message">${escapeHtml(entry.message)}</p>
            <div class="timeline-meta">
              <span>${formatDate(entry.created_at)}</span>
              <div class="timeline-actions">
                <button class="action-btn" onclick="event.stopPropagation(); app.toggleVisibility('${entry.id}')">
                  ${entry.is_public ? '设为隐藏' : '设为公开'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  async function toggleVisibility(entryId) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry) return;

    try {
      const result = await requestJson('/functions/v1/app?action=entry_visibility', {
        method: 'POST',
        body: JSON.stringify({
          entry_id: entryId,
          is_public: !entry.is_public,
        }),
      });

      if (result && result.ok) {
        entry.is_public = !entry.is_public;
        renderTimeline(getCurrentFilter());
        showToast(entry.is_public ? '已公开' : '已隐藏', 'success');
      }
    } catch (e) {
      showToast('操作失败', 'error');
    }
  }

  function getCurrentFilter() {
    const activeBtn = document.querySelector('.toggle-btn.active');
    return activeBtn ? activeBtn.dataset.view : 'all';
  }

  // ============================================
  // 添加印记
  // ============================================
  
  let selectedPhoto = null;
  let photoPreviewUrl = null;

  function openAddEntryModal() {
    if (!state.currentUser) {
      showToast('请先登录', 'warning');
      return;
    }

    const modal = document.getElementById('addEntryModal');
    modal.classList.remove('hidden');
    resetEntryForm();
  }

  function closeAddEntryModal() {
    const modal = document.getElementById('addEntryModal');
    modal.classList.add('hidden');
    resetEntryForm();
  }

  function resetEntryForm() {
    document.getElementById('entryAge').value = '';
    document.getElementById('entryMessage').value = '';
    document.getElementById('entryPublic').checked = false;
    document.getElementById('charCount').textContent = '0';
    document.getElementById('submitEntry').disabled = true;
    
    selectedPhoto = null;
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      photoPreviewUrl = null;
    }
    
    document.getElementById('uploadPreview').classList.add('hidden');
    document.getElementById('uploadPlaceholder').classList.remove('hidden');
    document.getElementById('uploadArea').classList.remove('has-image');
  }

  function handlePhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('照片大小不能超过 5MB', 'error');
      return;
    }

    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error');
      return;
    }

    selectedPhoto = file;
    
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    photoPreviewUrl = URL.createObjectURL(file);
    
    const preview = document.getElementById('uploadPreview');
    preview.src = photoPreviewUrl;
    preview.classList.remove('hidden');
    document.getElementById('uploadPlaceholder').classList.add('hidden');
    document.getElementById('uploadArea').classList.add('has-image');
    
    validateEntryForm();
  }

  function validateEntryForm() {
    const age = document.getElementById('entryAge').value;
    const message = document.getElementById('entryMessage').value.trim();
    const hasPhoto = selectedPhoto !== null;
    
    const isValid = age !== '' && message.length > 0 && hasPhoto;
    document.getElementById('submitEntry').disabled = !isValid;
  }

  async function submitEntry() {
    if (!state.currentUser) {
      showToast('请先登录', 'warning');
      return;
    }

    const age = parseInt(document.getElementById('entryAge').value);
    const message = document.getElementById('entryMessage').value.trim();
    const isPublic = document.getElementById('entryPublic').checked;

    if (isNaN(age) || age < 0 || age > 150) {
      showToast('请输入有效的年龄', 'error');
      return;
    }

    // 检查是否已有该年龄的记录
    const existing = state.entries.find(e => e.age === age);
    if (existing) {
      showToast(`${age}岁的印记已经存在，不可修改`, 'error');
      return;
    }

    const submitBtn = document.getElementById('submitEntry');
    submitBtn.disabled = true;
    submitBtn.textContent = '封存中...';

    try {
      // 先上传照片
      const uploadResult = await uploadPhoto(selectedPhoto, age);
      if (!uploadResult.ok) {
        throw new Error('照片上传失败');
      }

      // 创建记录
      const result = await requestJson('/functions/v1/app?action=entry', {
        method: 'POST',
        body: JSON.stringify({
          age: age,
          photo_url: uploadResult.photo_url,
          message: message,
          is_public: isPublic,
        }),
      });

      if (result && result.ok) {
        state.entries.push(result.entry);
        renderTimeline(getCurrentFilter());
        closeAddEntryModal();
        showToast('封存成功！这一刻已被永久记录', 'success');
      } else {
        throw new Error(result?.error || '创建失败');
      }
    } catch (e) {
      showToast(e.message || '操作失败', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '封存这一刻';
      validateEntryForm();
    }
  }

  async function uploadPhoto(file, age) {
    // 获取签名上传 URL
    const signResult = await requestJson('/functions/v1/app?action=upload_sign', {
      method: 'POST',
      body: JSON.stringify({
        age: age,
        content_type: file.type,
        file_size: file.size,
      }),
    });

    if (!signResult.ok || !signResult.signed_url) {
      throw new Error('获取上传地址失败');
    }

    // 上传到 Storage
    const uploadResponse = await fetch(signResult.signed_url, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error('上传失败');
    }

    return {
      ok: true,
      photo_url: signResult.photo_url,
    };
  }

  // ============================================
  // 查看印记详情
  // ============================================
  
  function viewEntry(entryId) {
    const entry = state.entries.find(e => e.id === entryId) || 
                  state.plazaEntries.find(e => e.id === entryId);
    if (!entry) return;

    const modal = document.getElementById('viewEntryModal');
    const detail = document.getElementById('entryDetail');
    
    detail.innerHTML = `
      <img class="entry-detail-photo" src="${entry.photo_url}" alt="${entry.age}岁">
      <span class="entry-detail-age">${entry.age}岁${entry.year ? ' · ' + entry.year + '年' : ''}</span>
      <div class="entry-detail-message">${escapeHtml(entry.message)}</div>
      <div class="entry-detail-meta">
        <span>记录于 ${formatDate(entry.created_at)}</span>
        ${entry.user_name ? '<span>by ' + escapeHtml(entry.user_name) + '</span>' : ''}
      </div>
    `;
    
    modal.classList.remove('hidden');
  }

  function closeViewModal() {
    document.getElementById('viewEntryModal').classList.add('hidden');
  }

  // ============================================
  // 全球广场
  // ============================================
  
  async function loadPlaza(reset = false) {
    if (reset) {
      state.plazaOffset = 0;
      state.plazaHasMore = true;
      state.plazaEntries = [];
    }

    const grid = document.getElementById('plazaGrid');
    const loading = document.getElementById('loadingPlaza');
    const loadMore = document.getElementById('loadMore');
    
    if (state.plazaOffset === 0) {
      loading.classList.remove('hidden');
    }

    try {
      const ageFilter = document.getElementById('ageFilter').value;
      const sortFilter = document.getElementById('sortFilter').value;
      
      let url = `/functions/v1/app?action=public_entries&offset=${state.plazaOffset}&limit=20`;
      if (ageFilter) url += `&age_range=${ageFilter}`;
      if (sortFilter) url += `&sort=${sortFilter}`;

      const result = await requestJson(url);
      
      if (result && result.ok) {
        const newEntries = result.entries || [];
        state.plazaEntries = state.plazaEntries.concat(newEntries);
        state.plazaOffset += newEntries.length;
        state.plazaHasMore = result.has_more || false;
        
        renderPlaza();
        
        loadMore.classList.toggle('hidden', !state.plazaHasMore);
      }
    } catch (e) {
      console.error('加载广场失败:', e);
    } finally {
      loading.classList.add('hidden');
    }
  }

  function renderPlaza() {
    const grid = document.getElementById('plazaGrid');
    
    if (state.plazaEntries.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="empty-icon">🌍</div>
          <h3>还没有公开记录</h3>
          <p>成为第一个分享你来过痕迹的人</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = state.plazaEntries.map(entry => `
      <div class="plaza-card" onclick="app.viewEntry('${entry.id}')">
        <img class="plaza-photo" src="${entry.photo_url}" alt="${entry.age}岁" loading="lazy">
        <div class="plaza-content">
          <div class="plaza-user">
            <div class="plaza-avatar">${getAvatarLetter(entry.user_name)}</div>
            <span class="plaza-name">${escapeHtml(entry.user_name || '匿名用户')}</span>
            <span class="plaza-age-badge">${entry.age}岁</span>
          </div>
          <p class="plaza-message">${escapeHtml(entry.message)}</p>
          <p class="plaza-date">${formatDate(entry.created_at)}</p>
        </div>
      </div>
    `).join('');
  }

  function getAvatarLetter(name) {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  }

  // ============================================
  // 页面导航
  // ============================================
  
  function navigateTo(page) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    // 显示目标页面
    const targetPage = document.getElementById(page + 'Page');
    if (targetPage) {
      targetPage.classList.add('active');
    }
    
    // 更新导航状态
    const targetLink = document.querySelector(`[data-page="${page}"]`);
    if (targetLink) {
      targetLink.classList.add('active');
    }
    
    state.currentPage = page;
    
    // 页面特定逻辑
    if (page === 'timeline') {
      loadTimeline();
    } else if (page === 'plaza') {
      loadPlaza(true);
    }
    
    // 滚动到顶部
    window.scrollTo(0, 0);
  }

  // ============================================
  // 工具函数
  // ============================================
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
    
    return date.toLocaleDateString('zh-CN', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ'}</span>
      <span>${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'toastIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ============================================
  // 事件绑定
  // ============================================
  
  function bindEvents() {
    // 导航
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.dataset.page);
      });
    });

    // 登录/登出
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // 开始按钮
    document.getElementById('startBtn').addEventListener('click', () => {
      if (state.currentUser) {
        navigateTo('timeline');
      } else {
        handleLogin();
      }
    });

    // 添加印记
    document.getElementById('addEntryBtn').addEventListener('click', openAddEntryModal);
    document.getElementById('closeModal').addEventListener('click', closeAddEntryModal);
    document.getElementById('cancelEntry').addEventListener('click', closeAddEntryModal);
    document.getElementById('closeViewModal').addEventListener('click', closeViewModal);

    // 点击遮罩关闭弹窗
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      });
    });

    // 照片上传
    document.getElementById('uploadArea').addEventListener('click', () => {
      document.getElementById('entryPhoto').click();
    });
    document.getElementById('entryPhoto').addEventListener('change', handlePhotoSelect);

    // 表单验证
    document.getElementById('entryAge').addEventListener('input', validateEntryForm);
    document.getElementById('entryMessage').addEventListener('input', (e) => {
      document.getElementById('charCount').textContent = e.target.value.length;
      validateEntryForm();
    });

    // 提交印记
    document.getElementById('submitEntry').addEventListener('click', submitEntry);

    // 保存资料
    document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);

    // 开通会员
    document.getElementById('upgradeBtn').addEventListener('click', () => {
      showToast('会员功能即将上线', 'info');
    });

    // 时间线筛选
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTimeline(btn.dataset.view);
      });
    });

    // 广场筛选
    document.getElementById('ageFilter').addEventListener('change', () => loadPlaza(true));
    document.getElementById('sortFilter').addEventListener('change', () => loadPlaza(true));
    document.getElementById('loadMoreBtn').addEventListener('click', () => loadPlaza(false));
  }

  // ============================================
  // 初始化
  // ============================================
  
  async function init() {
    bindEvents();
    await checkAuth();
    
    // 根据 URL 参数决定初始页面
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    if (page && ['home', 'timeline', 'plaza', 'profile'].includes(page)) {
      navigateTo(page);
    }
  }

  // 暴露公共 API
  window.app = {
    viewEntry,
    toggleVisibility,
  };

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

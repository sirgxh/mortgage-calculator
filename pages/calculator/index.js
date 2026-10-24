// pages/calculator/index.js
const { compute, validate, navMetrics, STORAGE_KEY } = require('../../utils/calc.js');

Page({
  data: {
    // 导航栏
    navHeight: 88,
    statusBarHeight: 20,
    titleCenterY: 42,

    // 贷款类型：commercial / fund / combo
    loanType: 'commercial',
    loanTypeOptions: [
      { key: 'commercial', label: '商贷' },
      { key: 'fund', label: '公积金' },
      { key: 'combo', label: '组合贷' }
    ],

    // 商贷参数
    commercialAmount: 100,     // 万元
    commercialRate: 3.5,       // 年利率 %

    // 公积金参数
    fundAmount: 40,            // 万元
    fundRate: 2.6,             // 年利率 %

    // 贷款年限
    years: 30,
    yearOptions: [
      { value: 5, label: '5年（60期）' },
      { value: 10, label: '10年（120期）' },
      { value: 15, label: '15年（180期）' },
      { value: 20, label: '20年（240期）' },
      { value: 25, label: '25年（300期）' },
      { value: 30, label: '30年（360期）' }
    ],

    // 开始还贷月份（选填），格式 YYYY-MM
    startMonth: '',
    startMonthDisplay: '未选择',

    // 快捷利率选项
    ratePresetsCommercial: [
      { value: 3.0, label: 'LPR 5年以内 3.00%' },
      { value: 3.5, label: 'LPR 5年以上 3.50%' },
      { value: 3.3, label: 'LPR -20BP 3.30%' },
      { value: 3.7, label: 'LPR +20BP 3.70%' },
      { value: 4.1, label: 'LPR +60BP 4.10%' }
    ],
    ratePresetsFund: [
      { value: 2.1, label: '5年以内 2.10%' },
      { value: 2.6, label: '5年以上 2.60%' }
    ],

    // 弹窗
    showYearPicker: false,
    showRatePicker: false,     // 商贷利率选择
    showFundRatePicker: false, // 公积金利率选择

    // 当前正在编辑的金额字段：commercialAmount / fundAmount
    editingAmountField: 'commercialAmount',
    showAmountInput: false,
    amountInputValue: ''
  },

  onLoad() {
    // 导航栏高度
    const metrics = navMetrics();
    this.setData({
      navHeight: metrics.navHeight,
      statusBarHeight: metrics.statusBarHeight,
      titleCenterY: metrics.titleCenterY
    });

    // 读取本地缓存
    try {
      const cached = wx.getStorageSync(STORAGE_KEY);
      if (cached && typeof cached === 'object') {
        this.setData({
          loanType: cached.loanType || 'commercial',
          commercialAmount: cached.commercialAmount != null ? cached.commercialAmount : 100,
          commercialRate: cached.commercialRate != null ? cached.commercialRate : 3.5,
          fundAmount: cached.fundAmount != null ? cached.fundAmount : 40,
          fundRate: cached.fundRate != null ? cached.fundRate : 2.6,
          years: cached.years || 30,
          startMonth: cached.startMonth || '',
          startMonthDisplay: cached.startMonth ? cached.startMonth : '未选择'
        });
      }
    } catch (e) {}
  },

  // ---------- 贷款类型切换 ----------
  onLoanTypeTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.loanType) return;
    this.setData({ loanType: key });
    this._saveCache();
  },

  // ---------- 金额步进 ----------
  onStepAmount(e) {
    const { field, delta } = e.currentTarget.dataset;
    const current = this.data[field] || 0;
    const next = Math.max(1, Math.min(10000, current + Number(delta)));
    this.setData({ [field]: next });
    this._saveCache();
  },

  // 打开金额输入弹窗
  onOpenAmountInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      editingAmountField: field,
      amountInputValue: String(this.data[field] || ''),
      showAmountInput: true
    });
  },

  onAmountInputChange(e) {
    this.setData({ amountInputValue: e.detail.value });
  },

  onAmountInputConfirm() {
    const val = parseFloat(this.data.amountInputValue);
    if (!isNaN(val) && val > 0 && val <= 10000) {
      this.setData({
        [this.data.editingAmountField]: Math.round(val * 100) / 100,
        showAmountInput: false
      });
      this._saveCache();
    } else {
      wx.showToast({ title: '请输入 1-10000 之间的数字', icon: 'none' });
    }
  },

  onAmountInputCancel() {
    this.setData({ showAmountInput: false });
  },

  // ---------- 利率快捷选择 ----------
  onRatePresetTap(e) {
    const { value, field } = e.currentTarget.dataset;
    this.setData({
      [field]: Number(value),
      showRatePicker: false,
      showFundRatePicker: false
    });
    this._saveCache();
  },

  onOpenRatePicker(e) {
    const field = e.currentTarget.dataset.field;
    if (field === 'commercialRate') {
      this.setData({ showRatePicker: true });
    } else {
      this.setData({ showFundRatePicker: true });
    }
  },

  onCloseRatePicker() {
    this.setData({ showRatePicker: false, showFundRatePicker: false });
  },

  // 利率手动输入
  onRateInputChange(e) {
    const field = e.currentTarget.dataset.field;
    const val = parseFloat(e.detail.value);
    if (!isNaN(val) && val >= 0 && val <= 20) {
      this.setData({ [field]: val });
      this._saveCache();
    }
  },

  // ---------- 年限选择 ----------
  onOpenYearPicker() {
    this.setData({ showYearPicker: true });
  },

  onCloseYearPicker() {
    this.setData({ showYearPicker: false });
  },

  onYearSelect(e) {
    const value = Number(e.currentTarget.dataset.value);
    this.setData({ years: value, showYearPicker: false });
    this._saveCache();
  },

  // ---------- 开始月份 ----------
  onStartMonthChange(e) {
    const val = e.detail.value; // YYYY-MM
    this.setData({
      startMonth: val,
      startMonthDisplay: val
    });
    this._saveCache();
  },

  onClearStartMonth() {
    this.setData({
      startMonth: '',
      startMonthDisplay: '未选择'
    });
    this._saveCache();
  },

  // ---------- 计算并跳转 ----------
  onCalculate() {
    const params = {
      loanType: this.data.loanType,
      commercialAmount: this.data.commercialAmount,
      commercialRate: this.data.commercialRate,
      fundAmount: this.data.fundAmount,
      fundRate: this.data.fundRate,
      years: this.data.years,
      startMonth: this.data.startMonth
    };

    const err = validate(params);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }

    const result = compute(params);

    // 存结果到全局，结果页读取
    getApp().globalData.result = result;
    getApp().globalData.params = params;

    wx.navigateTo({
      url: '/pages/result/index'
    });
  },

  // ---------- 工具方法 ----------
  _saveCache() {
    try {
      wx.setStorageSync(STORAGE_KEY, {
        loanType: this.data.loanType,
        commercialAmount: this.data.commercialAmount,
        commercialRate: this.data.commercialRate,
        fundAmount: this.data.fundAmount,
        fundRate: this.data.fundRate,
        years: this.data.years,
        startMonth: this.data.startMonth
      });
    } catch (e) {}
  }
});

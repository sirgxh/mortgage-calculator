// pages/result/index.js
const { compute, validate, navMetrics } = require('../../utils/calc.js');
const { generatePoster } = require('../../utils/poster.js');

Page({
  data: {
    // 导航栏
    navHeight: 88,
    statusBarHeight: 20,
    titleCenterY: 42,

    // 当前 tab：equalInstallment / equalPrincipal
    activeTab: 'equalInstallment',

    // 参数与结果
    params: null,
    result: null,

    // 明细展开状态（按年分组）
    expandedYears: {},  // { yearIndex: true }

    // 明细显示模式：all / first12 / first36 / first60 / yearly
    detailMode: 'first12',
    detailModeOptions: [
      { value: 'first12', label: '前12期' },
      { value: 'first36', label: '前36期' },
      { value: 'first60', label: '前60期' },
      { value: 'yearly', label: '按年汇总' },
      { value: 'all', label: '全部' }
    ],

    // 利率浮动对比（仅商贷 / 组合贷时展示）
    showRateCompare: true,

    // 提前还款面板
    showPrepay: false,
    prepayAmount: 10,    // 万元
    prepayAfterPeriod: 36, // 第几期后还
    prepayStrategy: 'shorten', // shorten / reduce
    prepayResult: null,

    // 导出图片相关
    showExportSheet: false,
    exportOptions: {
      params: true,
      overview: true,
      remaining: true,
      rateCompare: true,
      prepay: false,
      detail: 'none'  // none / first12 / first36 / first60 / yearly
    },
    detailExportOptions: [
      { value: 'none', label: '不导出' },
      { value: 'first12', label: '前12期' },
      { value: 'first36', label: '前36期' },
      { value: 'first60', label: '前60期' },
      { value: 'yearly', label: '按年汇总' }
    ],

    isGenerating: false,
    showPosterPreview: false,
    posterImagePath: ''
  },

  onLoad() {
    const app = getApp();
    const params = app.globalData.params;
    const result = app.globalData.result;

    if (!params || !result) {
      wx.showToast({ title: '参数异常', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
      return;
    }

    const metrics = navMetrics();

    // 是否展示利率浮动（纯公积金不展示）
    const showRateCompare = params.loanType !== 'fund';

    // 初始化：默认展开第 1 年
    const expandedYears = { 0: true };

    this.setData({
      navHeight: metrics.navHeight,
      statusBarHeight: metrics.statusBarHeight,
      titleCenterY: metrics.titleCenterY,
      params,
      result,
      showRateCompare,
      expandedYears
    });

    // 若有提前还款默认值，先算一次
    if (params.loanType) {
      this._calcPrepay();
    }
  },

  // ---------- Tab 切换 ----------
  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    // 切换 tab 后重置展开状态
    this.setData({ expandedYears: { 0: true } });
  },

  // ---------- 返回 ----------
  onBack() {
    wx.navigateBack();
  },

  // ---------- 明细年份展开 / 折叠 ----------
  onToggleYear(e) {
    const yearIdx = Number(e.currentTarget.dataset.year);
    const expanded = { ...this.data.expandedYears };
    if (expanded[yearIdx]) {
      delete expanded[yearIdx];
    } else {
      expanded[yearIdx] = true;
    }
    this.setData({ expandedYears: expanded });
  },

  // ---------- 明细显示模式切换 ----------
  onDetailModeChange(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ detailMode: value, expandedYears: { 0: true } });
  },

  // ---------- 复制结果摘要 ----------
  onCopySummary() {
    const { result, params, activeTab } = this.data;
    const plan = activeTab === 'equalInstallment' ? result.equalInstallment : result.equalPrincipal;

    let lines = [];
    lines.push(`【房贷计算结果】`);
    lines.push(`贷款类型：${params.loanType === 'commercial' ? '商贷' : params.loanType === 'fund' ? '公积金' : '组合贷'}`);
    lines.push(`贷款总额：${(result.totalPrincipal / 10000).toFixed(2)} 万元`);
    lines.push(`贷款期限：${params.years} 年（${params.years * 12} 期）`);
    if (params.loanType === 'combo') {
      lines.push(`商贷：${params.commercialAmount}万 @ ${params.commercialRate}%`);
      lines.push(`公积金：${params.fundAmount}万 @ ${params.fundRate}%`);
    } else {
      lines.push(`年利率：${activeTab === 'equalInstallment' ? params.commercialRate : (params.loanType === 'fund' ? params.fundRate : params.commercialRate)}%`);
    }
    lines.push(``);
    lines.push(`还款方式：${activeTab === 'equalInstallment' ? '等额本息' : '等额本金'}`);
    if (activeTab === 'equalInstallment') {
      lines.push(`月供：${plan.monthlyPayment.toFixed(2)} 元`);
    } else {
      lines.push(`首月月供：${plan.firstMonthPayment.toFixed(2)} 元`);
      lines.push(`每月递减：${plan.monthlyDecrease.toFixed(2)} 元`);
    }
    lines.push(`总利息：${plan.totalInterest.toFixed(2)} 元`);
    lines.push(`本息总计：${plan.totalPayment.toFixed(2)} 元`);

    if (plan.remaining) {
      lines.push(``);
      lines.push(`【剩余还款】（已还 ${plan.remaining.paidPeriods} 期）`);
      lines.push(`剩余期数：${plan.remaining.remainingPeriods} 期`);
      lines.push(`剩余本金：${plan.remaining.remainingPrincipal.toFixed(2)} 元`);
      lines.push(`剩余利息：${plan.remaining.remainingInterest.toFixed(2)} 元`);
    }

    const text = lines.join('\n');
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
      }
    });
  },

  // ---------- 提前还款 ----------
  onTogglePrepay() {
    const show = !this.data.showPrepay;
    this.setData({ showPrepay: show });
    if (show && !this.data.prepayResult) {
      this._calcPrepay();
    }
  },

  onPrepayAmountInput(e) {
    const val = parseFloat(e.detail.value);
    if (!isNaN(val) && val >= 0) {
      this.setData({ prepayAmount: val }, () => this._calcPrepay());
    }
  },

  onPrepayPeriodInput(e) {
    const val = parseInt(e.detail.value);
    const maxPeriods = this.data.params.years * 12 - 1;
    if (!isNaN(val) && val >= 1 && val <= maxPeriods) {
      this.setData({ prepayAfterPeriod: val }, () => this._calcPrepay());
    } else if (val > maxPeriods) {
      this.setData({ prepayAfterPeriod: maxPeriods }, () => this._calcPrepay());
    }
  },

  onPrepayStrategyChange(e) {
    const strategy = e.currentTarget.dataset.strategy;
    this.setData({ prepayStrategy: strategy }, () => this._calcPrepay());
  },

  _calcPrepay() {
    const { params, prepayAmount, prepayAfterPeriod, prepayStrategy, activeTab } = this.data;
    if (!params) return;

    // 提前还款金额（元）
    const prepayAmountYuan = prepayAmount * 10000;

    // 等额本息和等额本金分别计算，然后取当前 tab 的结果展示
    // 但提前还款面板只展示一份，以当前 tab 为准
    const { calcPrepayment } = require('../../utils/mortgage.js');

    const plan = activeTab === 'equalInstallment' ? 'equalInstallment' : 'equalPrincipal';
    const result = this.data.result;

    if (params.loanType === 'combo') {
      // 组合贷：分别对两笔计算，按剩余本金占比分配
      const ci = result.comboInfo;
      // 先获取两笔在 prepayAfterPeriod 后的剩余本金
      const schedule = result[plan].schedule;
      // 从 schedule 中找出两笔各自的剩余本金
      // 因为 schedule 是合并的，我们需要分别获取
      // 这里直接用 calcPrepayment 对每笔计算再合并
      const { calcPrepayment: _cp } = require('../../utils/mortgage.js');
      
      // 重新分别计算两笔的提前还款结果
      const commercialPrepay = _cp({
        principal: params.commercialAmount * 10000,
        annualRate: params.commercialRate,
        totalMonths: params.years * 12,
        method: plan.replace('equal', '').replace('Installment', 'installment').replace('Principal', 'principal'),
        prepayAmount: 0, // 后面分配
        prepayAfterPeriod: prepayAfterPeriod,
        strategy: prepayStrategy
      });

      const fundPrepay = _cp({
        principal: params.fundAmount * 10000,
        annualRate: params.fundRate,
        totalMonths: params.years * 12,
        method: plan.replace('equal', '').replace('Installment', 'installment').replace('Principal', 'principal'),
        prepayAmount: 0,
        prepayAfterPeriod: prepayAfterPeriod,
        strategy: prepayStrategy
      });

      // 按剩余本金占比分配提前还款额
      const totalRemaining = commercialPrepay.remainingPrincipal + fundPrepay.remainingPrincipal;
      if (totalRemaining <= 0 || prepayAmountYuan <= 0) {
        this.setData({ prepayResult: null });
        return;
      }
      const commercialRatio = commercialPrepay.remainingPrincipal / totalRemaining;
      const commercialPrepayAmount = Math.min(prepayAmountYuan * commercialRatio, commercialPrepay.remainingPrincipal);
      const fundPrepayAmount = Math.min(prepayAmountYuan - commercialPrepayAmount, fundPrepay.remainingPrincipal);

      const cpCommercial = _cp({
        principal: params.commercialAmount * 10000,
        annualRate: params.commercialRate,
        totalMonths: params.years * 12,
        method: plan === 'equalInstallment' ? 'equalInstallment' : 'equalPrincipal',
        prepayAmount: commercialPrepayAmount,
        prepayAfterPeriod: prepayAfterPeriod,
        strategy: prepayStrategy
      });

      const cpFund = _cp({
        principal: params.fundAmount * 10000,
        annualRate: params.fundRate,
        totalMonths: params.years * 12,
        method: plan === 'equalInstallment' ? 'equalInstallment' : 'equalPrincipal',
        prepayAmount: fundPrepayAmount,
        prepayAfterPeriod: prepayAfterPeriod,
        strategy: prepayStrategy
      });

      // 合并结果
      const merged = {
        savedInterest: cpCommercial.savedInterest + cpFund.savedInterest,
        remainingPrincipalBefore: cpCommercial.remainingPrincipal + cpFund.remainingPrincipal,
        remainingPrincipalAfter: cpCommercial.newRemainingPrincipal + cpFund.newRemainingPrincipal,
        strategy: prepayStrategy
      };

      if (prepayStrategy === 'shorten') {
        merged.originalRemainingPeriods = Math.max(cpCommercial.originalRemainingPeriods, cpFund.originalRemainingPeriods);
        merged.newRemainingPeriods = Math.max(cpCommercial.newRemainingPeriods, cpFund.newRemainingPeriods);
        // 月供：两笔新月供相加（但缩短期限下月供基本不变）
        merged.newMonthlyPayment = cpCommercial.newMonthlyPayment + cpFund.newMonthlyPayment;
        merged.originalMonthlyPayment = cpCommercial.originalMonthlyPayment + cpFund.originalMonthlyPayment;
      } else {
        merged.originalRemainingPeriods = cpCommercial.originalRemainingPeriods;
        merged.newRemainingPeriods = cpCommercial.newRemainingPeriods;
        merged.newMonthlyPayment = cpCommercial.newMonthlyPayment + cpFund.newMonthlyPayment;
        merged.originalMonthlyPayment = cpCommercial.originalMonthlyPayment + cpFund.originalMonthlyPayment;
      }

      // 新的剩余利息
      merged.newRemainingInterest = (cpCommercial.newRemainingInterest || 0) + (cpFund.newRemainingInterest || 0);
      merged.originalRemainingInterest = (cpCommercial.originalRemainingInterest || 0) + (cpFund.originalRemainingInterest || 0);

      this.setData({ prepayResult: merged });
    } else {
      // 纯商贷或纯公积金
      const principal = params.loanType === 'fund' ? params.fundAmount * 10000 : params.commercialAmount * 10000;
      const rate = params.loanType === 'fund' ? params.fundRate : params.commercialRate;

      const prepayResult = calcPrepayment({
        principal,
        annualRate: rate,
        totalMonths: params.years * 12,
        method: plan,
        prepayAmount: prepayAmountYuan,
        prepayAfterPeriod,
        strategy: prepayStrategy
      });

      this.setData({ prepayResult });
    }
  },

  // ---------- 导出图片 ----------
  onOpenExportSheet() {
    this.setData({ showExportSheet: true });
  },

  onCloseExportSheet() {
    this.setData({ showExportSheet: false });
  },

  onToggleExportOption(e) {
    const key = e.currentTarget.dataset.key;
    const options = { ...this.data.exportOptions };
    options[key] = !options[key];
    this.setData({ exportOptions: options });
  },

  onExportDetailChange(e) {
    const value = e.currentTarget.dataset.value;
    const options = { ...this.data.exportOptions, detail: value };
    this.setData({ exportOptions: options });
  },

  async onGeneratePoster() {
    if (this.data.isGenerating) return;
    this.setData({ isGenerating: true, showExportSheet: false });

    wx.showLoading({ title: '生成中...', mask: true });

    try {
      const { params, result, activeTab, exportOptions, prepayResult, prepayStrategy, showPrepay, showRateCompare } = this.data;

      const tempFilePath = await generatePoster({
        params,
        result,
        activeTab,
        exportOptions,
        prepayResult: showPrepay ? prepayResult : null,
        prepayStrategy,
        showRateCompare,
        canvasId: 'posterCanvas'
      });

      this.setData({
        posterImagePath: tempFilePath,
        showPosterPreview: true
      });
    } catch (err) {
      console.error('生成海报失败', err);
      wx.showToast({ title: '生成失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ isGenerating: false });
    }
  },

  onSavePoster() {
    const path = this.data.posterImagePath;
    if (!path) return;

    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('auth deny') > -1) {
          wx.showModal({
            title: '提示',
            content: '需要相册权限才能保存图片，是否前往设置？',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting();
              }
            }
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  },

  onClosePosterPreview() {
    this.setData({ showPosterPreview: false });
  },

  // ---------- 分享 ----------
  onShareAppMessage() {
    return {
      title: '房贷计算器 - 等额本息/本金、组合贷、提前还款试算',
      path: '/pages/calculator/index'
    };
  },

  onShareTimeline() {
    return {
      title: '房贷计算器 - 买房贷款一次算清'
    };
  }
});

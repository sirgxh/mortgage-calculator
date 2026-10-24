// utils/calc.js
// 参数编解码、计算入口、表单校验、导航栏高度计算

const {
  calcEqualInstallment,
  calcEqualPrincipal,
  calcCombined,
  calcRateScenarios,
  round2
} = require('./mortgage.js');

const STORAGE_KEY = 'mortgage_calculator_params';

/**
 * 获取导航栏相关高度
 * 返回 { statusBarHeight, navHeight, titleCenterY }
 */
function navMetrics() {
  try {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = info.statusBarHeight || 20;

    // 胶囊按钮位置（小程序在右上角）
    let capsuleHeight = 32;
    let capsuleTop = statusBarHeight + 6;
    try {
      const menu = wx.getMenuButtonBoundingClientRect();
      if (menu && menu.height) {
        capsuleHeight = menu.height;
        capsuleTop = menu.top;
      }
    } catch (e) {}

    // 导航栏总高度 = 胶囊上下间距 + 胶囊高度
    const navPaddingTop = capsuleTop - statusBarHeight;
    const navHeight = statusBarHeight + capsuleHeight + navPaddingTop * 2;

    // 标题垂直居中位置（相对导航栏顶部）
    const titleCenterY = (navHeight - statusBarHeight) / 2 + statusBarHeight;

    return {
      statusBarHeight,
      navHeight: Math.round(navHeight),
      titleCenterY: Math.round(titleCenterY)
    };
  } catch (e) {
    return {
      statusBarHeight: 20,
      navHeight: 88,
      titleCenterY: 44
    };
  }
}

/**
 * 校验参数，返回错误信息字符串；无错误返回 null
 */
function validate(params) {
  const { loanType, commercialAmount, commercialRate, fundAmount, fundRate, years } = params;

  if (!loanType) return '请选择贷款类型';
  if (!years || years < 1 || years > 40) return '贷款年限需在 1-40 年之间';

  if (loanType === 'commercial' || loanType === 'combo') {
    if (!commercialAmount || commercialAmount <= 0) return '请输入商贷金额';
    if (commercialAmount > 10000) return '商贷金额不能超过 10000 万';
    if (commercialRate == null || commercialRate < 0 || commercialRate > 20) return '商贷利率需在 0-20% 之间';
  }

  if (loanType === 'fund' || loanType === 'combo') {
    if (!fundAmount || fundAmount <= 0) return '请输入公积金贷款金额';
    if (fundAmount > 10000) return '公积金贷款金额不能超过 10000 万';
    if (fundRate == null || fundRate < 0 || fundRate > 20) return '公积金利率需在 0-20% 之间';
  }

  if (loanType === 'combo') {
    if (commercialAmount + fundAmount <= 0) return '贷款总额需大于 0';
  }

  return null;
}

/**
 * 计算入口
 * @param {Object} params
 * @param {string} params.loanType - commercial / fund / combo
 * @param {number} params.commercialAmount - 商贷金额（万元）
 * @param {number} params.commercialRate - 商贷年利率（%）
 * @param {number} params.fundAmount - 公积金金额（万元）
 * @param {number} params.fundRate - 公积金年利率（%）
 * @param {number} params.years - 贷款年限
 * @param {string} [params.startMonth] - 开始还贷月份 YYYY-MM
 * @returns {Object}
 */
function compute(params) {
  const { loanType, commercialAmount, commercialRate, fundAmount, fundRate, years, startMonth } = params;
  const totalMonths = years * 12;

  let totalPrincipal = 0;
  let equalInstallment = null;
  let equalPrincipal = null;
  let comboInfo = null;

  if (loanType === 'commercial') {
    totalPrincipal = commercialAmount * 10000;
    equalInstallment = calcEqualInstallment(totalPrincipal, commercialRate, totalMonths, startMonth);
    equalPrincipal = calcEqualPrincipal(totalPrincipal, commercialRate, totalMonths, startMonth);
  } else if (loanType === 'fund') {
    totalPrincipal = fundAmount * 10000;
    equalInstallment = calcEqualInstallment(totalPrincipal, fundRate, totalMonths, startMonth);
    equalPrincipal = calcEqualPrincipal(totalPrincipal, fundRate, totalMonths, startMonth);
  } else {
    // 组合贷
    const commercialPrincipal = commercialAmount * 10000;
    const fundPrincipal = fundAmount * 10000;
    totalPrincipal = commercialPrincipal + fundPrincipal;

    const combined = calcCombined(
      { principal: commercialPrincipal, annualRate: commercialRate, totalMonths },
      { principal: fundPrincipal, annualRate: fundRate, totalMonths },
      startMonth
    );

    equalInstallment = combined.equalInstallment;
    equalPrincipal = combined.equalPrincipal;
    comboInfo = {
      commercial: {
        principal: commercialPrincipal,
        annualRate: commercialRate
      },
      fund: {
        principal: fundPrincipal,
        annualRate: fundRate
      }
    };
  }

  // 利息差
  const interestDiff = round2(equalInstallment.totalInterest - equalPrincipal.totalInterest);

  // 利率浮动对比（仅商贷或组合贷时有意义）
  let rateScenarios = null;
  if (loanType !== 'fund') {
    rateScenarios = calcRateScenarios(
      loanType,
      { commercialAmount, commercialRate, fundAmount, fundRate, years }
    );
  }

  return {
    totalPrincipal,
    totalMonths,
    equalInstallment,
    equalPrincipal,
    interestDiff,
    rateScenarios,
    comboInfo
  };
}

module.exports = {
  STORAGE_KEY,
  navMetrics,
  validate,
  compute
};

// utils/mortgage.js
// 房贷计算核心算法：等额本息、等额本金、组合贷合并、提前还款、利率情景

/** 保留 2 位小数 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** 按月分组：返回二维数组，每 12 期一组 */
function groupByYear(schedule) {
  const years = [];
  for (let i = 0; i < schedule.length; i += 12) {
    years.push(schedule.slice(i, i + 12));
  }
  return years;
}

/** 生成按年汇总数据 */
function buildYearlySummary(schedule) {
  const years = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const yearItems = schedule.slice(i, i + 12);
    let totalPayment = 0, totalPrincipal = 0, totalInterest = 0;
    for (const item of yearItems) {
      totalPayment += item.payment;
      totalPrincipal += item.principal;
      totalInterest += item.interest;
    }
    years.push({
      year: Math.floor(i / 12),
      totalPayment: round2(totalPayment),
      totalPrincipal: round2(totalPrincipal),
      totalInterest: round2(totalInterest),
      remainingPrincipal: yearItems[yearItems.length - 1].remainingPrincipal
    });
  }
  return years;
}

/**
 * 根据开始月份计算已还期数
 * @param {string} startMonth - YYYY-MM
 * @param {number} totalMonths - 总期数
 * @returns {number} 已还期数（0 到 totalMonths）
 */
function calcPaidPeriods(startMonth, totalMonths) {
  if (!startMonth) return 0;
  const [y, m] = startMonth.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const now = new Date();
  const nowMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const months = Math.floor((nowMonth - start) / (1000 * 60 * 60 * 24 * 30.44));
  // 更精确的月数差
  const diffMonths = (now.getFullYear() - y) * 12 + (now.getMonth() - (m - 1));
  // 当前月正在还，算已还 = diffMonths（如果 diffMonths > 0）
  const paid = Math.max(0, diffMonths);
  return Math.min(paid, totalMonths);
}

// ============================================================
// 等额本息
// ============================================================

/**
 * 等额本息计算
 * 月供 = 本金 × 月利率 × (1+月利率)^期数 / ((1+月利率)^期数 − 1)
 * 末期做精确修正，使明细合计与总本息精确闭合
 */
function calcEqualInstallment(principal, annualRate, totalMonths, startMonth) {
  const monthlyRate = annualRate / 100 / 12;
  let monthlyPayment = 0;
  let totalPayment = 0;
  let totalInterest = 0;
  const schedule = [];

  if (monthlyRate === 0) {
    // 零利率：每月本金相等，利息 0
    monthlyPayment = round2(principal / totalMonths);
    let remaining = principal;
    for (let i = 1; i <= totalMonths; i++) {
      let p = monthlyPayment;
      if (i === totalMonths) {
        p = round2(remaining);
      }
      remaining = round2(remaining - p);
      schedule.push({
        period: i,
        payment: p,
        principal: p,
        interest: 0,
        remainingPrincipal: remaining
      });
    }
    totalPayment = principal;
    totalInterest = 0;
  } else {
    const pow = Math.pow(1 + monthlyRate, totalMonths);
    monthlyPayment = principal * monthlyRate * pow / (pow - 1);
    monthlyPayment = round2(monthlyPayment);

    let remaining = principal;
    let sumPayment = 0;
    let sumInterest = 0;

    for (let i = 1; i <= totalMonths; i++) {
      const interest = round2(remaining * monthlyRate);
      let principalPart = round2(monthlyPayment - interest);

      // 末期修正：剩余本金全部还清，利息按实际剩余本金计算
      if (i === totalMonths) {
        principalPart = round2(remaining);
        const finalPayment = round2(principalPart + interest);
        remaining = 0;
        schedule.push({
          period: i,
          payment: finalPayment,
          principal: principalPart,
          interest: interest,
          remainingPrincipal: 0
        });
        sumPayment += finalPayment;
        sumInterest += interest;
      } else {
        // 防止利息 > 月供（极低利率时可能出现舍入问题）
        if (principalPart < 0) principalPart = 0;
        remaining = round2(remaining - principalPart);
        // 确保剩余本金不为负
        if (remaining < 0) remaining = 0;
        schedule.push({
          period: i,
          payment: monthlyPayment,
          principal: principalPart,
          interest: interest,
          remainingPrincipal: remaining
        });
        sumPayment += monthlyPayment;
        sumInterest += interest;
      }
    }

    totalPayment = round2(sumPayment);
    totalInterest = round2(sumInterest);
  }

  const yearlySchedule = groupByYear(schedule);
  const yearlySummary = buildYearlySummary(schedule);

  // 剩余还款
  let remaining = null;
  if (startMonth) {
    const paidPeriods = calcPaidPeriods(startMonth, totalMonths);
    if (paidPeriods > 0 && paidPeriods < totalMonths) {
      const lastPaid = schedule[paidPeriods - 1];
      let remainingPrincipal = lastPaid.remainingPrincipal;
      let remainingInterest = 0;
      for (let i = paidPeriods; i < totalMonths; i++) {
        remainingInterest += schedule[i].interest;
      }
      remaining = {
        paidPeriods,
        remainingPeriods: totalMonths - paidPeriods,
        remainingPrincipal: round2(remainingPrincipal),
        remainingInterest: round2(remainingInterest)
      };
    } else if (paidPeriods >= totalMonths) {
      remaining = {
        paidPeriods: totalMonths,
        remainingPeriods: 0,
        remainingPrincipal: 0,
        remainingInterest: 0
      };
    } else {
      remaining = {
        paidPeriods: 0,
        remainingPeriods: totalMonths,
        remainingPrincipal: principal,
        remainingInterest: totalInterest
      };
    }
  }

  return {
    monthlyPayment,
    totalPayment,
    totalInterest,
    schedule: yearlySchedule,
    yearlySummary,
    remaining
  };
}

// ============================================================
// 等额本金
// ============================================================

/**
 * 等额本金计算
 * 每月本金 = 本金 / 期数
 * 每月利息 = 剩余本金 × 月利率
 * 每月递减 = 固定本金 × 月利率
 * 末期做精确修正
 */
function calcEqualPrincipal(principal, annualRate, totalMonths, startMonth) {
  const monthlyRate = annualRate / 100 / 12;
  const fixedPrincipal = round2(principal / totalMonths);
  const monthlyDecrease = round2(fixedPrincipal * monthlyRate);

  let remaining = principal;
  let totalInterest = 0;
  let totalPayment = 0;
  let firstMonthPayment = 0;
  let lastMonthPayment = 0;
  const schedule = [];

  for (let i = 1; i <= totalMonths; i++) {
    const interest = round2(remaining * monthlyRate);
    let principalPart = fixedPrincipal;
    let payment = round2(principalPart + interest);

    if (i === totalMonths) {
      // 末期：剩余本金全部还清
      principalPart = round2(remaining);
      payment = round2(principalPart + interest);
      remaining = 0;
    } else {
      remaining = round2(remaining - principalPart);
      if (remaining < 0) remaining = 0;
    }

    if (i === 1) firstMonthPayment = payment;
    if (i === totalMonths) lastMonthPayment = payment;

    totalInterest += interest;
    totalPayment += payment;

    schedule.push({
      period: i,
      payment,
      principal: principalPart,
      interest,
      remainingPrincipal: remaining
    });
  }

  totalInterest = round2(totalInterest);
  totalPayment = round2(totalPayment);

  const yearlySchedule = groupByYear(schedule);
  const yearlySummary = buildYearlySummary(schedule);

  // 剩余还款
  let remainingInfo = null;
  if (startMonth) {
    const paidPeriods = calcPaidPeriods(startMonth, totalMonths);
    if (paidPeriods > 0 && paidPeriods < totalMonths) {
      const lastPaid = schedule[paidPeriods - 1];
      let remainingPrincipal = lastPaid.remainingPrincipal;
      let remainingInterest = 0;
      for (let i = paidPeriods; i < totalMonths; i++) {
        remainingInterest += schedule[i].interest;
      }
      remainingInfo = {
        paidPeriods,
        remainingPeriods: totalMonths - paidPeriods,
        remainingPrincipal: round2(remainingPrincipal),
        remainingInterest: round2(remainingInterest)
      };
    } else if (paidPeriods >= totalMonths) {
      remainingInfo = {
        paidPeriods: totalMonths,
        remainingPeriods: 0,
        remainingPrincipal: 0,
        remainingInterest: 0
      };
    } else {
      remainingInfo = {
        paidPeriods: 0,
        remainingPeriods: totalMonths,
        remainingPrincipal: principal,
        remainingInterest: totalInterest
      };
    }
  }

  return {
    firstMonthPayment,
    lastMonthPayment,
    monthlyDecrease,
    totalPayment,
    totalInterest,
    schedule: yearlySchedule,
    yearlySummary,
    remaining: remainingInfo
  };
}

// ============================================================
// 组合贷合并
// ============================================================

/**
 * 组合贷：两笔贷款逐期合并
 * @param {Object} loanA - { principal, annualRate, totalMonths }
 * @param {Object} loanB - { principal, annualRate, totalMonths }
 * @param {string} startMonth
 */
function calcCombined(loanA, loanB, startMonth) {
  const aInstallment = calcEqualInstallment(loanA.principal, loanA.annualRate, loanA.totalMonths);
  const bInstallment = calcEqualInstallment(loanB.principal, loanB.annualRate, loanB.totalMonths);
  const aPrincipal = calcEqualPrincipal(loanA.principal, loanA.annualRate, loanA.totalMonths);
  const bPrincipal = calcEqualPrincipal(loanB.principal, loanB.annualRate, loanB.totalMonths);

  const mergeSchedules = (aResult, bResult) => {
    // aResult.schedule 和 bResult.schedule 都是按年分组的二维数组
    // 需要先扁平化，逐期合并，再按年分组
    const flatA = aResult.schedule.flat();
    const flatB = bResult.schedule.flat();
    const merged = [];
    for (let i = 0; i < flatA.length && i < flatB.length; i++) {
      merged.push({
        period: flatA[i].period,
        payment: round2(flatA[i].payment + flatB[i].payment),
        principal: round2(flatA[i].principal + flatB[i].principal),
        interest: round2(flatA[i].interest + flatB[i].interest),
        remainingPrincipal: round2(flatA[i].remainingPrincipal + flatB[i].remainingPrincipal)
      });
    }
    return groupByYear(merged);
  };

  const mergeYearly = (aResult, bResult) => {
    const aYearly = aResult.yearlySummary;
    const bYearly = bResult.yearlySummary;
    const merged = [];
    for (let i = 0; i < aYearly.length && i < bYearly.length; i++) {
      merged.push({
        year: aYearly[i].year,
        totalPayment: round2(aYearly[i].totalPayment + bYearly[i].totalPayment),
        totalPrincipal: round2(aYearly[i].totalPrincipal + bYearly[i].totalPrincipal),
        totalInterest: round2(aYearly[i].totalInterest + bYearly[i].totalInterest),
        remainingPrincipal: round2(aYearly[i].remainingPrincipal + bYearly[i].remainingPrincipal)
      });
    }
    return merged;
  };

  const mergeRemaining = (aResult, bResult) => {
    if (!aResult.remaining || !bResult.remaining) return null;
    const a = aResult.remaining;
    const b = bResult.remaining;
    return {
      paidPeriods: Math.max(a.paidPeriods, b.paidPeriods),
      remainingPeriods: Math.max(a.remainingPeriods, b.remainingPeriods),
      remainingPrincipal: round2(a.remainingPrincipal + b.remainingPrincipal),
      remainingInterest: round2(a.remainingInterest + b.remainingInterest)
    };
  };

  // 等额本息合并
  const eiSchedule = mergeSchedules(aInstallment, bInstallment);
  const eiYearly = mergeYearly(aInstallment, bInstallment);
  const eiTotalPayment = round2(aInstallment.totalPayment + bInstallment.totalPayment);
  const eiTotalInterest = round2(aInstallment.totalInterest + bInstallment.totalInterest);
  const eiMonthlyPayment = round2(aInstallment.monthlyPayment + bInstallment.monthlyPayment);

  // 等额本金合并
  const epSchedule = mergeSchedules(aPrincipal, bPrincipal);
  const epYearly = mergeYearly(aPrincipal, bPrincipal);
  const epTotalPayment = round2(aPrincipal.totalPayment + bPrincipal.totalPayment);
  const epTotalInterest = round2(aPrincipal.totalInterest + bPrincipal.totalInterest);
  const epFirstMonthPayment = round2(aPrincipal.firstMonthPayment + bPrincipal.firstMonthPayment);
  const epLastMonthPayment = round2(aPrincipal.lastMonthPayment + bPrincipal.lastMonthPayment);
  const epMonthlyDecrease = round2(aPrincipal.monthlyDecrease + bPrincipal.monthlyDecrease);

  // 剩余还款（如果有开始月份）
  let eiRemaining = null;
  let epRemaining = null;
  if (startMonth) {
    // 重新计算各自带 startMonth 的结果
    const aInstRem = calcEqualInstallment(loanA.principal, loanA.annualRate, loanA.totalMonths, startMonth);
    const bInstRem = calcEqualInstallment(loanB.principal, loanB.annualRate, loanB.totalMonths, startMonth);
    const aPrinRem = calcEqualPrincipal(loanA.principal, loanA.annualRate, loanA.totalMonths, startMonth);
    const bPrinRem = calcEqualPrincipal(loanB.principal, loanB.annualRate, loanB.totalMonths, startMonth);
    eiRemaining = mergeRemaining(aInstRem, bInstRem);
    epRemaining = mergeRemaining(aPrinRem, bPrinRem);
  }

  return {
    equalInstallment: {
      monthlyPayment: eiMonthlyPayment,
      totalPayment: eiTotalPayment,
      totalInterest: eiTotalInterest,
      schedule: eiSchedule,
      yearlySummary: eiYearly,
      remaining: eiRemaining
    },
    equalPrincipal: {
      firstMonthPayment: epFirstMonthPayment,
      lastMonthPayment: epLastMonthPayment,
      monthlyDecrease: epMonthlyDecrease,
      totalPayment: epTotalPayment,
      totalInterest: epTotalInterest,
      schedule: epSchedule,
      yearlySummary: epYearly,
      remaining: epRemaining
    }
  };
}

// ============================================================
// 提前还款
// ============================================================

/**
 * 提前还款试算
 * @param {Object} opts
 * @param {number} opts.principal - 初始本金（元）
 * @param {number} opts.annualRate - 年利率（%）
 * @param {number} opts.totalMonths - 总期数
 * @param {string} opts.method - equalInstallment / equalPrincipal
 * @param {number} opts.prepayAmount - 提前还款金额（元）
 * @param {number} opts.prepayAfterPeriod - 第几期后还（1-based）
 * @param {string} opts.strategy - shorten（缩短期限）/ reduce（减少月供）
 */
function calcPrepayment(opts) {
  const { principal, annualRate, totalMonths, method, prepayAmount, prepayAfterPeriod, strategy } = opts;
  const monthlyRate = annualRate / 100 / 12;

  // 先计算原始计划，找到第 prepayAfterPeriod 期后的剩余本金
  const original = method === 'equalInstallment'
    ? calcEqualInstallment(principal, annualRate, totalMonths)
    : calcEqualPrincipal(principal, annualRate, totalMonths);

  const flatSchedule = original.schedule.flat();
  const afterIdx = Math.min(prepayAfterPeriod - 1, flatSchedule.length - 1);
  const remainingPrincipal = flatSchedule[afterIdx] ? flatSchedule[afterIdx].remainingPrincipal : 0;

  // 提前还款金额不能超过剩余本金
  const actualPrepay = Math.min(prepayAmount, remainingPrincipal);
  const newPrincipal = round2(remainingPrincipal - actualPrepay);

  // 剩余期数
  const originalRemainingPeriods = totalMonths - prepayAfterPeriod;

  // 原始月供（用于缩短期限策略的月供保持）
  const originalMonthlyPayment = method === 'equalInstallment'
    ? original.monthlyPayment
    : (original.firstMonthPayment - (prepayAfterPeriod - 1) * original.monthlyDecrease);

  // 原始剩余利息
  let originalRemainingInterest = 0;
  for (let i = afterIdx + 1; i < flatSchedule.length; i++) {
    originalRemainingInterest += flatSchedule[i].interest;
  }
  originalRemainingInterest = round2(originalRemainingInterest);

  if (newPrincipal <= 0 || originalRemainingPeriods <= 0) {
    return {
      savedInterest: originalRemainingInterest,
      remainingPrincipalBefore: remainingPrincipal,
      remainingPrincipalAfter: 0,
      originalRemainingPeriods,
      newRemainingPeriods: 0,
      originalMonthlyPayment: round2(originalMonthlyPayment),
      newMonthlyPayment: 0,
      strategy,
      originalRemainingInterest,
      newRemainingInterest: 0
    };
  }

  let newRemainingPeriods = originalRemainingPeriods;
  let newMonthlyPayment = 0;
  let newRemainingInterest = 0;

  if (strategy === 'shorten') {
    // 缩短期限：月供不变，求新月数
    if (monthlyRate === 0) {
      newRemainingPeriods = Math.ceil(newPrincipal / originalMonthlyPayment);
    } else if (method === 'equalInstallment') {
      // 等额本息：n = log(月供 / (月供 - 新本金 × 月利率)) / log(1 + 月利率)
      const denom = originalMonthlyPayment - newPrincipal * monthlyRate;
      if (denom <= 0) {
        // 月供不足以支付利息，不会发生
        newRemainingPeriods = originalRemainingPeriods;
      } else {
        const n = Math.log(originalMonthlyPayment / denom) / Math.log(1 + monthlyRate);
        newRemainingPeriods = Math.ceil(n);
      }
    } else {
      // 等额本金：每月还固定本金 + 剩余本金 × 月利率
      // 月供递减，用平均估算比较复杂，这里用等额本息的近似
      // 更准确：每月本金 = 月供首月 - 利息首月 = 递减基数
      const fixedPrincipal = round2(principal / totalMonths);
      // 缩短期限后，新的固定本金 = newPrincipal / 新月数
      // 但月供的首月要保持不变（在当前已还时点的月供）
      // 即：newFixedPrincipal + newPrincipal * monthlyRate = currentMonthlyPayment
      const currentPayment = original.firstMonthPayment - (prepayAfterPeriod - 1) * original.monthlyDecrease;
      const newFixedPrincipal = round2(currentPayment - newPrincipal * monthlyRate);
      if (newFixedPrincipal <= 0) {
        newRemainingPeriods = 1;
      } else {
        newRemainingPeriods = Math.ceil(newPrincipal / newFixedPrincipal);
      }
    }

    // 确保不超过原始剩余期数
    newRemainingPeriods = Math.min(newRemainingPeriods, originalRemainingPeriods);
    if (newRemainingPeriods < 1) newRemainingPeriods = 1;

    // 计算新计划的剩余利息
    const newPlan = method === 'equalInstallment'
      ? calcEqualInstallment(newPrincipal, annualRate, newRemainingPeriods)
      : calcEqualPrincipal(newPrincipal, annualRate, newRemainingPeriods);
    newRemainingInterest = newPlan.totalInterest;
    newMonthlyPayment = method === 'equalInstallment'
      ? newPlan.monthlyPayment
      : newPlan.firstMonthPayment;

  } else {
    // 减少月供：期限不变，重新计算
    const newPlan = method === 'equalInstallment'
      ? calcEqualInstallment(newPrincipal, annualRate, originalRemainingPeriods)
      : calcEqualPrincipal(newPrincipal, annualRate, originalRemainingPeriods);
    newMonthlyPayment = method === 'equalInstallment'
      ? newPlan.monthlyPayment
      : newPlan.firstMonthPayment;
    newRemainingInterest = newPlan.totalInterest;
    newRemainingPeriods = originalRemainingPeriods;
  }

  const savedInterest = round2(originalRemainingInterest - newRemainingInterest);

  return {
    savedInterest,
    remainingPrincipalBefore: remainingPrincipal,
    remainingPrincipalAfter: newPrincipal,
    originalRemainingPeriods,
    newRemainingPeriods,
    originalMonthlyPayment: round2(originalMonthlyPayment),
    newMonthlyPayment: round2(newMonthlyPayment),
    strategy,
    originalRemainingInterest,
    newRemainingInterest: round2(newRemainingInterest)
  };
}

// ============================================================
// 利率浮动情景
// ============================================================

/**
 * 计算利率浮动对比（±0.25%、±0.5% 共 5 档）
 * 仅商贷部分浮动，公积金保持固定
 * @param {string} loanType - commercial / combo
 * @param {Object} params - { commercialAmount, commercialRate, fundAmount, fundRate, years }
 */
function calcRateScenarios(loanType, params) {
  const deltas = [-0.5, -0.25, 0, 0.25, 0.5];
  const totalMonths = params.years * 12;

  return deltas.map(delta => {
    const newCommercialRate = round2(params.commercialRate + delta);
    let equalInstallment, equalPrincipal;

    if (loanType === 'commercial') {
      const p = params.commercialAmount * 10000;
      equalInstallment = calcEqualInstallment(p, newCommercialRate, totalMonths);
      equalPrincipal = calcEqualPrincipal(p, newCommercialRate, totalMonths);
    } else {
      // combo：商贷浮动，公积金不变
      const commercialP = params.commercialAmount * 10000;
      const fundP = params.fundAmount * 10000;
      const combined = calcCombined(
        { principal: commercialP, annualRate: newCommercialRate, totalMonths },
        { principal: fundP, annualRate: params.fundRate, totalMonths }
      );
      equalInstallment = combined.equalInstallment;
      equalPrincipal = combined.equalPrincipal;
    }

    return {
      delta,
      rate: newCommercialRate,
      isCurrent: delta === 0,
      equalInstallment: {
        monthlyPayment: equalInstallment.monthlyPayment,
        totalInterest: equalInstallment.totalInterest
      },
      equalPrincipal: {
        firstMonthPayment: equalPrincipal.firstMonthPayment,
        totalInterest: equalPrincipal.totalInterest
      }
    };
  });
}

module.exports = {
  round2,
  calcEqualInstallment,
  calcEqualPrincipal,
  calcCombined,
  calcPrepayment,
  calcRateScenarios
};

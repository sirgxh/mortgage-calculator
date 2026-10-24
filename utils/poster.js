// utils/poster.js
// 使用 canvas 2d 绘制结果长图

/**
 * 生成海报图片
 * @param {Object} opts
 * @param {Object} opts.params - 贷款参数
 * @param {Object} opts.result - 计算结果
 * @param {string} opts.activeTab - equalInstallment / equalPrincipal
 * @param {Object} opts.exportOptions - 导出选项
 * @param {Object} opts.prepayResult - 提前还款结果（可选）
 * @param {string} opts.prepayStrategy - shorten / reduce
 * @param {boolean} opts.showRateCompare - 是否展示利率对比
 * @param {string} opts.canvasId - canvas 节点 id
 * @returns {Promise<string>} 临时文件路径
 */
function generatePoster(opts) {
  return new Promise((resolve, reject) => {
    const { params, result, activeTab, exportOptions, prepayResult, prepayStrategy, showRateCompare, canvasId } = opts;

    const query = wx.createSelectorQuery();
    query.select('#' + canvasId)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          reject(new Error('canvas 节点不存在'));
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        // 设计宽度 750（逻辑像素，内部按 dpr 缩放）
        const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2;
        const W = 750;

        // 计算内容高度
        let y = 0;
        const padding = 40;
        const cardRadius = 24;
        const lineHeight = 1.6;

        // --- 计算各区块高度 ---
        let hHeader = 180;
        let hParams = exportOptions.params ? 260 : 0;
        let hOverview = exportOptions.overview ? 360 : 0;
        let hRemaining = 0;
        const plan = activeTab === 'equalInstallment' ? result.equalInstallment : result.equalPrincipal;
        if (exportOptions.remaining && plan.remaining) {
          hRemaining = 240;
        }
        let hRateCompare = 0;
        if (exportOptions.rateCompare && showRateCompare && result.rateScenarios) {
          hRateCompare = 60 + result.rateScenarios.length * 64 + 20;
        }
        let hPrepay = 0;
        if (exportOptions.prepay && prepayResult) {
          hPrepay = 420;
        }
        let hDetail = 0;
        if (exportOptions.detail && exportOptions.detail !== 'none') {
          const detailMode = exportOptions.detail;
          let rows = 0;
          if (detailMode === 'first12') rows = 12;
          else if (detailMode === 'first36') rows = 36;
          else if (detailMode === 'first60') rows = 60;
          else if (detailMode === 'yearly') rows = params.years;
          hDetail = 80 + rows * 48 + 20;
          // 限制明细最多 60 行避免超长
          if (rows > 60) hDetail = 80 + 60 * 48 + 20;
        }

        let hFooter = 120;
        let hGap = 24;

        const totalH = hHeader + hParams + hOverview + hRemaining + hRateCompare + hPrepay + hDetail + hFooter
          + (hParams ? hGap : 0) + (hOverview ? hGap : 0) + (hRemaining ? hGap : 0)
          + (hRateCompare ? hGap : 0) + (hPrepay ? hGap : 0) + (hDetail ? hGap : 0);

        const canvasH = totalH + padding * 2;

        // 设置 canvas 尺寸
        canvas.width = W * dpr;
        canvas.height = canvasH * dpr;
        ctx.scale(dpr, dpr);

        // --- 背景 ---
        // 渐变背景
        const bgGrad = ctx.createLinearGradient(0, 0, 0, canvasH);
        bgGrad.addColorStop(0, '#EAF0FF');
        bgGrad.addColorStop(1, '#E4F4FF');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, canvasH);

        // 背景光斑（简化版）
        drawOrb(ctx, 100, 80, 200, 'rgba(123,167,255,.5)');
        drawOrb(ctx, 650, 120, 180, 'rgba(184,164,255,.5)');
        drawOrb(ctx, 80, canvasH - 300, 220, 'rgba(142,216,255,.4)');
        drawOrb(ctx, 680, canvasH - 200, 200, 'rgba(255,179,209,.35)');

        // --- 开始绘制内容 ---
        y = padding;

        // 标题
        y = drawHeader(ctx, y, W, padding, activeTab, plan);
        y += 16;

        // 贷款参数卡片
        if (exportOptions.params) {
          y = drawParamsCard(ctx, y, W, padding, params);
          y += hGap;
        }

        // 概览卡片
        if (exportOptions.overview) {
          y = drawOverviewCard(ctx, y, W, padding, activeTab, plan, result);
          y += hGap;
        }

        // 剩余还款
        if (hRemaining > 0) {
          y = drawRemainingCard(ctx, y, W, padding, plan.remaining);
          y += hGap;
        }

        // 利率浮动对比
        if (hRateCompare > 0) {
          y = drawRateCompareCard(ctx, y, W, padding, result.rateScenarios, activeTab);
          y += hGap;
        }

        // 提前还款
        if (hPrepay > 0) {
          y = drawPrepayCard(ctx, y, W, padding, prepayResult, prepayStrategy);
          y += hGap;
        }

        // 还款明细
        if (hDetail > 0) {
          y = drawDetailCard(ctx, y, W, padding, plan, exportOptions.detail, activeTab);
          y += hGap;
        }

        // 底部
        drawFooter(ctx, canvasH - 80, W, padding);

        // 导出为图片
        wx.canvasToTempFilePath({
          canvas,
          x: 0,
          y: 0,
          width: W,
          height: canvasH,
          destWidth: W * dpr,
          destHeight: canvasH * dpr,
          success: (res) => {
            resolve(res.tempFilePath);
          },
          fail: (err) => {
            reject(err);
          }
        });
      });
  });
}

// --- 辅助绘制函数 ---

function drawOrb(ctx, x, y, r, color) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawGlassCard(ctx, x, y, w, h) {
  ctx.save();
  // 玻璃背景
  ctx.fillStyle = 'rgba(255,255,255,.62)';
  drawRoundedRect(ctx, x, y, w, h, 24);
  ctx.fill();
  // 边框
  ctx.strokeStyle = 'rgba(255,255,255,.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 顶部高光
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.beginPath();
  ctx.moveTo(x + 24, y + 0.5);
  ctx.lineTo(x + w - 24, y + 0.5);
  ctx.lineTo(x + w - 30, y + 1);
  ctx.lineTo(x + 30, y + 1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHeader(ctx, y, W, padding, activeTab, plan) {
  const x = padding;
  const w = W - padding * 2;
  const h = 180;

  drawGlassCard(ctx, x, y, w, h);

  // 标签
  ctx.fillStyle = '#6E6E73';
  ctx.font = '500 24px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  const label = activeTab === 'equalInstallment' ? '等额本息 · 月供' : '等额本金 · 首月月供';
  ctx.fillText(label, x + 32, y + 56);

  // 金额
  ctx.fillStyle = '#1D1D1F';
  ctx.font = '700 64px -apple-system, "PingFang SC", sans-serif';
  const amount = activeTab === 'equalInstallment' ? plan.monthlyPayment : plan.firstMonthPayment;
  const amountStr = amount.toFixed(2);
  ctx.fillText(amountStr, x + 32, y + 130);

  // 单位
  ctx.fillStyle = '#6E6E73';
  ctx.font = '500 26px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText('元 / 月', x + 32 + ctx.measureText(amountStr).width + 12, y + 130);

  // 副文本
  ctx.fillStyle = '#9A9AA0';
  ctx.font = '400 22px -apple-system, "PingFang SC", sans-serif';
  const sub = activeTab === 'equalInstallment'
    ? '每月固定还款，利息占比逐月减少'
    : `每月递减 ${plan.monthlyDecrease.toFixed(2)} 元 · 末月 ${plan.lastMonthPayment.toFixed(2)} 元`;
  ctx.fillText(sub, x + 32, y + 162);

  return y + h;
}

function drawParamsCard(ctx, y, W, padding, params) {
  const x = padding;
  const w = W - padding * 2;
  let h = 40;

  // 先算行数
  const rows = [];
  if (params.loanType === 'commercial') {
    rows.push(['贷款类型', '商业贷款']);
    rows.push(['贷款金额', params.commercialAmount + ' 万元']);
    rows.push(['年利率', params.commercialRate + '%']);
  } else if (params.loanType === 'fund') {
    rows.push(['贷款类型', '公积金贷款']);
    rows.push(['贷款金额', params.fundAmount + ' 万元']);
    rows.push(['年利率', params.fundRate + '%']);
  } else {
    rows.push(['贷款类型', '组合贷款']);
    rows.push(['商贷金额', params.commercialAmount + ' 万元 @ ' + params.commercialRate + '%']);
    rows.push(['公积金金额', params.fundAmount + ' 万元 @ ' + params.fundRate + '%']);
  }
  rows.push(['贷款期限', params.years + ' 年（' + (params.years * 12) + ' 期）']);
  if (params.startMonth) {
    rows.push(['开始还贷', params.startMonth]);
  }

  h += rows.length * 52;

  drawGlassCard(ctx, x, y, w, h);

  // 标题
  ctx.fillStyle = '#6E6E73';
  ctx.font = '500 24px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('贷款参数', x + 32, y + 32);

  // 行
  let rowY = y + 60;
  rows.forEach((row, i) => {
    rowY += 52;
    // 分隔线
    if (i > 0) {
      ctx.strokeStyle = 'rgba(60,60,67,.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 32, rowY - 52 + 0.5);
      ctx.lineTo(x + w - 32, rowY - 52 + 0.5);
      ctx.stroke();
    }
    // key
    ctx.fillStyle = '#6E6E73';
    ctx.font = '400 26px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(row[0], x + 32, rowY + 8);
    // value
    ctx.fillStyle = '#1D1D1F';
    ctx.font = '500 26px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(row[1], x + w - 32, rowY + 8);
  });

  return y + h;
}

function drawOverviewCard(ctx, y, W, padding, activeTab, plan, result) {
  const x = padding;
  const w = W - padding * 2;
  const rows = [
    ['总利息', plan.totalInterest.toFixed(2) + ' 元'],
    ['本息总计', plan.totalPayment.toFixed(2) + ' 元'],
    ['贷款金额', result.totalPrincipal.toFixed(2) + ' 元'],
    ['贷款期限', (result.totalMonths / 12).toFixed(0) + ' 年（' + result.totalMonths + ' 期）']
  ];
  const h = 60 + rows.length * 56 + 20;

  drawGlassCard(ctx, x, y, w, h);

  ctx.fillStyle = '#6E6E73';
  ctx.font = '500 24px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('核心数据', x + 32, y + 32);

  let rowY = y + 64;
  rows.forEach((row, i) => {
    rowY += 56;
    if (i > 0) {
      ctx.strokeStyle = 'rgba(60,60,67,.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 32, rowY - 56 + 0.5);
      ctx.lineTo(x + w - 32, rowY - 56 + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#6E6E73';
    ctx.font = '400 26px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(row[0], x + 32, rowY + 8);
    ctx.fillStyle = i === 1 ? '#4A90FF' : '#1D1D1F';
    ctx.font = i === 1 ? '600 26px -apple-system, "PingFang SC", sans-serif' : '500 26px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(row[1], x + w - 32, rowY + 8);
  });

  return y + h;
}

function drawRemainingCard(ctx, y, W, padding, remaining) {
  const x = padding;
  const w = W - padding * 2;
  const rows = [
    ['已还期数', remaining.paidPeriods + ' 期'],
    ['剩余期数', remaining.remainingPeriods + ' 期'],
    ['剩余本金', remaining.remainingPrincipal.toFixed(2) + ' 元'],
    ['剩余利息', remaining.remainingInterest.toFixed(2) + ' 元']
  ];
  const h = 60 + rows.length * 56 + 20;

  drawGlassCard(ctx, x, y, w, h);

  ctx.fillStyle = '#6E6E73';
  ctx.font = '500 24px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('剩余还款情况', x + 32, y + 32);

  let rowY = y + 64;
  rows.forEach((row, i) => {
    rowY += 56;
    if (i > 0) {
      ctx.strokeStyle = 'rgba(60,60,67,.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 32, rowY - 56 + 0.5);
      ctx.lineTo(x + w - 32, rowY - 56 + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#6E6E73';
    ctx.font = '400 26px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(row[0], x + 32, rowY + 8);
    ctx.fillStyle = i === 2 ? '#4A90FF' : '#1D1D1F';
    ctx.font = i === 2 ? '600 26px -apple-system, "PingFang SC", sans-serif' : '500 26px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(row[1], x + w - 32, rowY + 8);
  });

  return y + h;
}

function drawRateCompareCard(ctx, y, W, padding, scenarios, activeTab) {
  const x = padding;
  const w = W - padding * 2;
  const h = 60 + scenarios.length * 56 + 24;

  drawGlassCard(ctx, x, y, w, h);

  ctx.fillStyle = '#6E6E73';
  ctx.font = '500 24px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('利率浮动对比', x + 32, y + 32);

  // 表头
  const colX1 = x + 32;
  const colX2 = x + w * 0.45;
  const colX3 = x + w - 32;

  let rowY = y + 64;
  ctx.fillStyle = '#9A9AA0';
  ctx.font = '400 22px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('利率', colX1, rowY + 4);
  ctx.textAlign = 'right';
  ctx.fillText(activeTab === 'equalInstallment' ? '月供' : '首月月供', colX2, rowY + 4);
  ctx.fillText('总利息', colX3, rowY + 4);

  rowY += 32;
  scenarios.forEach((sc, i) => {
    rowY += 56;
    // 分隔线
    ctx.strokeStyle = 'rgba(60,60,67,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 32, rowY - 56 + 0.5);
    ctx.lineTo(x + w - 32, rowY - 56 + 0.5);
    ctx.stroke();

    // 当前行高亮
    if (sc.isCurrent) {
      ctx.fillStyle = 'rgba(74,144,255,.08)';
      ctx.fillRect(x, rowY - 56, w, 56);
    }

    // 利率列
    ctx.textAlign = 'left';
    if (sc.isCurrent) {
      ctx.fillStyle = '#4A90FF';
      ctx.font = '600 24px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText('当前 ' + sc.rate.toFixed(2) + '%', colX1, rowY + 8);
    } else {
      const deltaStr = sc.delta > 0 ? '+' + sc.delta : sc.delta;
      ctx.fillStyle = '#6E6E73';
      ctx.font = '500 22px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText(deltaStr + '%', colX1, rowY + 8);
      ctx.fillStyle = '#1D1D1F';
      ctx.font = '500 24px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText(sc.rate.toFixed(2) + '%', colX1 + 80, rowY + 8);
    }

    // 月供列
    const monthly = activeTab === 'equalInstallment'
      ? sc.equalInstallment.monthlyPayment.toFixed(2)
      : sc.equalPrincipal.firstMonthPayment.toFixed(2);
    ctx.fillStyle = sc.isCurrent ? '#4A90FF' : '#1D1D1F';
    ctx.font = sc.isCurrent ? '600 24px -apple-system, "PingFang SC", sans-serif' : '500 24px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(monthly, colX2, rowY + 8);

    // 总利息列
    const interest = activeTab === 'equalInstallment'
      ? sc.equalInstallment.totalInterest.toFixed(0)
      : sc.equalPrincipal.totalInterest.toFixed(0);
    ctx.fillStyle = sc.isCurrent ? '#4A90FF' : '#1D1D1F';
    ctx.font = sc.isCurrent ? '600 24px -apple-system, "PingFang SC", sans-serif' : '500 24px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(interest, colX3, rowY + 8);
  });

  return y + h;
}

function drawPrepayCard(ctx, y, W, padding, prepayResult, strategy) {
  const x = padding;
  const w = W - padding * 2;
  const h = 420;

  drawGlassCard(ctx, x, y, w, h);

  // 标题
  ctx.fillStyle = '#6E6E73';
  ctx.font = '500 24px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('提前还款试算', x + 32, y + 32);

  // 节省利息（大字）
  ctx.fillStyle = '#6E6E73';
  ctx.font = '400 24px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('可节省利息', x + w / 2, y + 80);

  ctx.fillStyle = '#52C48E';
  ctx.font = '700 48px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(prepayResult.savedInterest.toFixed(2) + ' 元', x + w / 2, y + 140);

  // 明细行
  const rows = [
    ['还款前剩余本金', prepayResult.remainingPrincipalBefore.toFixed(2) + ' 元'],
    ['还款后剩余本金', prepayResult.remainingPrincipalAfter.toFixed(2) + ' 元']
  ];
  if (strategy === 'shorten') {
    rows.push(['原剩余期数', prepayResult.originalRemainingPeriods + ' 期']);
    rows.push(['新剩余期数', prepayResult.newRemainingPeriods + ' 期（缩短 ' + (prepayResult.originalRemainingPeriods - prepayResult.newRemainingPeriods) + ' 期）']);
  } else {
    rows.push(['原月供', prepayResult.originalMonthlyPayment.toFixed(2) + ' 元']);
    rows.push(['新月供', prepayResult.newMonthlyPayment.toFixed(2) + ' 元（减少 ' + (prepayResult.originalMonthlyPayment - prepayResult.newMonthlyPayment).toFixed(2) + ' 元）']);
  }

  let rowY = y + 180;
  rows.forEach((row, i) => {
    rowY += 56;
    if (i > 0) {
      ctx.strokeStyle = 'rgba(60,60,67,.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 32, rowY - 56 + 0.5);
      ctx.lineTo(x + w - 32, rowY - 56 + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#6E6E73';
    ctx.font = '400 24px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(row[0], x + 32, rowY + 8);
    ctx.fillStyle = i === 1 || i === 3 ? '#52C48E' : '#1D1D1F';
    ctx.font = (i === 1 || i === 3) ? '600 24px -apple-system, "PingFang SC", sans-serif' : '500 24px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(row[1], x + w - 32, rowY + 8);
  });

  return y + h;
}

function drawDetailCard(ctx, y, W, padding, plan, detailMode, activeTab) {
  const x = padding;
  const w = W - padding * 2;

  // 扁平化 schedule
  let flatSchedule = [];
  if (detailMode === 'yearly') {
    // 按年汇总模式
    const yearly = plan.yearlySummary || [];
    const maxRows = Math.min(yearly.length, 60);
    const h = 80 + maxRows * 48 + 24;

    drawGlassCard(ctx, x, y, w, h);

    ctx.fillStyle = '#6E6E73';
    ctx.font = '500 24px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('还款明细（按年汇总）', x + 32, y + 32);

    // 表头
    const colX1 = x + 32;
    const colX2 = x + w * 0.35;
    const colX3 = x + w * 0.58;
    const colX4 = x + w * 0.78;
    const colX5 = x + w - 32;

    let rowY = y + 68;
    ctx.fillStyle = '#9A9AA0';
    ctx.font = '400 20px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('年份', colX1, rowY + 2);
    ctx.textAlign = 'right';
    ctx.fillText('年还款', colX2, rowY + 2);
    ctx.fillText('本金', colX3, rowY + 2);
    ctx.fillText('利息', colX4, rowY + 2);
    ctx.fillText('剩余本金', colX5, rowY + 2);

    rowY += 24;
    for (let i = 0; i < maxRows; i++) {
      rowY += 48;
      if (i > 0) {
        ctx.strokeStyle = 'rgba(60,60,67,.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 32, rowY - 48 + 0.5);
        ctx.lineTo(x + w - 32, rowY - 48 + 0.5);
        ctx.stroke();
      }
      const yr = yearly[i];
      ctx.fillStyle = '#6E6E73';
      ctx.font = '400 22px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('第 ' + (yr.year + 1) + ' 年', colX1, rowY + 8);
      ctx.fillStyle = '#1D1D1F';
      ctx.font = '500 22px -apple-system, "PingFang SC", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(yr.totalPayment.toFixed(0), colX2, rowY + 8);
      ctx.fillText(yr.totalPrincipal.toFixed(0), colX3, rowY + 8);
      ctx.fillText(yr.totalInterest.toFixed(0), colX4, rowY + 8);
      ctx.fillStyle = '#9A9AA0';
      ctx.fillText(yr.remainingPrincipal.toFixed(0), colX5, rowY + 8);
    }

    return y + h;
  }

  // 按期明细模式
  flatSchedule = (plan.schedule || []).flat();
  let maxRows = flatSchedule.length;
  if (detailMode === 'first12') maxRows = Math.min(12, flatSchedule.length);
  else if (detailMode === 'first36') maxRows = Math.min(36, flatSchedule.length);
  else if (detailMode === 'first60') maxRows = Math.min(60, flatSchedule.length);
  maxRows = Math.min(maxRows, 60); // 限制最多 60 行

  const h = 80 + maxRows * 48 + 24;

  drawGlassCard(ctx, x, y, w, h);

  const titleMap = {
    first12: '还款明细（前 12 期）',
    first36: '还款明细（前 36 期）',
    first60: '还款明细（前 60 期）',
    all: '还款明细'
  };

  ctx.fillStyle = '#6E6E73';
  ctx.font = '500 24px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(titleMap[detailMode] || '还款明细', x + 32, y + 32);

  // 表头
  const colX1 = x + 32;
  const colX2 = x + w * 0.32;
  const colX3 = x + w * 0.54;
  const colX4 = x + w * 0.75;
  const colX5 = x + w - 32;

  let rowY = y + 68;
  ctx.fillStyle = '#9A9AA0';
  ctx.font = '400 20px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('期数', colX1, rowY + 2);
  ctx.textAlign = 'right';
  ctx.fillText('月供', colX2, rowY + 2);
  ctx.fillText('本金', colX3, rowY + 2);
  ctx.fillText('利息', colX4, rowY + 2);
  ctx.fillText('剩余本金', colX5, rowY + 2);

  rowY += 24;
  for (let i = 0; i < maxRows; i++) {
    rowY += 48;
    if (i > 0) {
      ctx.strokeStyle = 'rgba(60,60,67,.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 32, rowY - 48 + 0.5);
      ctx.lineTo(x + w - 32, rowY - 48 + 0.5);
      ctx.stroke();
    }
    const item = flatSchedule[i];
    ctx.fillStyle = '#6E6E73';
    ctx.font = '400 22px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(item.period, colX1, rowY + 8);
    ctx.fillStyle = '#1D1D1F';
    ctx.font = '500 22px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(item.payment.toFixed(2), colX2, rowY + 8);
    ctx.fillText(item.principal.toFixed(2), colX3, rowY + 8);
    ctx.fillText(item.interest.toFixed(2), colX4, rowY + 8);
    ctx.fillStyle = '#9A9AA0';
    ctx.fillText(item.remainingPrincipal.toFixed(0), colX5, rowY + 8);
  }

  return y + h;
}

function drawFooter(ctx, y, W, padding) {
  ctx.fillStyle = '#9A9AA0';
  ctx.font = '400 20px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('房贷计算器 · 结果仅供参考', W / 2, y);
}

module.exports = {
  generatePoster
};

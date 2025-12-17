const db = require('./database');

class AnalyticsService {
  // 格式化金额（从分转换为元）
  formatAmount(amount, currency = 'usd') {
    return (amount / 100).toFixed(2);
  }

  // 获取汇总统计
  getSummary(appId = null, startDate = null, endDate = null) {
    const stats = db.getStatistics(appId, startDate, endDate);

    // 按 app_id 组织数据
    const summary = {};

    // 处理交易数据
    stats.transactions.forEach(tx => {
      if (!summary[tx.app_id]) {
        summary[tx.app_id] = {
          app_id: tx.app_id,
          currencies: {}
        };
      }

      if (!summary[tx.app_id].currencies[tx.currency]) {
        summary[tx.app_id].currencies[tx.currency] = {
          currency: tx.currency,
          revenue: 0,
          fee: 0,
          net: 0,
          refunds: 0,
          transaction_count: 0,
          refund_count: 0
        };
      }

      const currencyData = summary[tx.app_id].currencies[tx.currency];
      currencyData.revenue = tx.total_amount;
      currencyData.fee = tx.total_fee;
      currencyData.net = tx.total_net;
      currencyData.transaction_count = tx.transaction_count;
    });

    // 处理退款数据
    stats.refunds.forEach(ref => {
      if (!summary[ref.app_id]) {
        summary[ref.app_id] = {
          app_id: ref.app_id,
          currencies: {}
        };
      }

      if (!summary[ref.app_id].currencies[ref.currency]) {
        summary[ref.app_id].currencies[ref.currency] = {
          currency: ref.currency,
          revenue: 0,
          fee: 0,
          net: 0,
          refunds: 0,
          transaction_count: 0,
          refund_count: 0
        };
      }

      const currencyData = summary[ref.app_id].currencies[ref.currency];
      currencyData.refunds = ref.total_refund_amount;
      currencyData.refund_count = ref.refund_count;
      // 调整净收入（减去退款）
      currencyData.net -= ref.total_refund_amount;
    });

    // 转换为数组格式并格式化金额
    const result = Object.values(summary).map(app => ({
      app_id: app.app_id,
      currencies: Object.values(app.currencies).map(c => ({
        currency: c.currency.toUpperCase(),
        revenue: this.formatAmount(c.revenue, c.currency),
        revenue_raw: c.revenue,
        fee: this.formatAmount(c.fee, c.currency),
        fee_raw: c.fee,
        net: this.formatAmount(c.net, c.currency),
        net_raw: c.net,
        refunds: this.formatAmount(c.refunds, c.currency),
        refunds_raw: c.refunds,
        transaction_count: c.transaction_count,
        refund_count: c.refund_count
      }))
    }));

    return result;
  }

  // 获取所有应用的列表
  getApps() {
    return db.getAppIds();
  }

  // 获取指定应用的详细统计
  getAppDetails(appId, startDate = null, endDate = null) {
    const stats = db.getStatistics(appId, startDate, endDate);

    if (stats.transactions.length === 0 && stats.refunds.length === 0) {
      return null;
    }

    return this.getSummary(appId, startDate, endDate)[0] || null;
  }

  // 获取时间范围统计（按天/周/月）
  getTimeSeriesData(appId = null, period = 'day', startDate = null, endDate = null) {
    // 这个功能可以后续扩展，需要更复杂的 SQL 查询
    // 目前返回基本的汇总数据
    return this.getSummary(appId, startDate, endDate);
  }
}

module.exports = new AnalyticsService();

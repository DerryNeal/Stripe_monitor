const Database = require('better-sqlite3');
const path = require('path');

class DatabaseService {
  constructor() {
    const dbPath = path.join(__dirname, '../../data/analytics.db');
    this.db = new Database(dbPath);
    this.init();
  }

  init() {
    // 创建交易表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        fee INTEGER DEFAULT 0,
        net INTEGER NOT NULL,
        status TEXT NOT NULL,
        customer_id TEXT,
        description TEXT,
        created_at INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_app_id ON transactions(app_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

      CREATE TABLE IF NOT EXISTS refunds (
        id TEXT PRIMARY KEY,
        charge_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        created_at INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_refunds_app_id ON refunds(app_id);
      CREATE INDEX IF NOT EXISTS idx_refunds_charge_id ON refunds(charge_id);
      CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON refunds(created_at);

      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_type TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        status TEXT NOT NULL,
        records_synced INTEGER DEFAULT 0,
        error_message TEXT
      );
    `);
  }

  // 插入或更新交易
  upsertTransaction(transaction) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO transactions
      (id, app_id, type, amount, currency, fee, net, status, customer_id, description, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      transaction.id,
      transaction.app_id,
      transaction.type,
      transaction.amount,
      transaction.currency,
      transaction.fee || 0,
      transaction.net,
      transaction.status,
      transaction.customer_id,
      transaction.description,
      transaction.created_at,
      JSON.stringify(transaction.metadata)
    );
  }

  // 批量插入交易
  batchUpsertTransactions(transactions) {
    const insert = this.db.transaction((txs) => {
      for (const tx of txs) {
        this.upsertTransaction(tx);
      }
    });
    return insert(transactions);
  }

  // 插入或更新退款
  upsertRefund(refund) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO refunds
      (id, charge_id, app_id, amount, currency, status, reason, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      refund.id,
      refund.charge_id,
      refund.app_id,
      refund.amount,
      refund.currency,
      refund.status,
      refund.reason,
      refund.created_at,
      JSON.stringify(refund.metadata)
    );
  }

  // 批量插入退款
  batchUpsertRefunds(refunds) {
    const insert = this.db.transaction((refs) => {
      for (const ref of refs) {
        this.upsertRefund(ref);
      }
    });
    return insert(refunds);
  }

  // 获取统计数据
  getStatistics(appId = null, startDate = null, endDate = null) {
    let whereConditions = ['status = ?'];
    let params = ['succeeded'];

    if (appId) {
      whereConditions.push('app_id = ?');
      params.push(appId);
    }

    if (startDate) {
      whereConditions.push('created_at >= ?');
      params.push(Math.floor(new Date(startDate).getTime() / 1000));
    }

    if (endDate) {
      whereConditions.push('created_at <= ?');
      params.push(Math.floor(new Date(endDate).getTime() / 1000));
    }

    const whereClause = whereConditions.join(' AND ');

    // 获取交易统计
    const transactionStats = this.db.prepare(`
      SELECT
        app_id,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        SUM(fee) as total_fee,
        SUM(net) as total_net,
        currency
      FROM transactions
      WHERE ${whereClause}
      GROUP BY app_id, currency
    `).all(...params);

    // 获取退款统计
    const refundParams = [...params];
    refundParams[0] = 'succeeded'; // 退款也使用 succeeded 状态

    const refundStats = this.db.prepare(`
      SELECT
        app_id,
        COUNT(*) as refund_count,
        SUM(amount) as total_refund_amount,
        currency
      FROM refunds
      WHERE status = ? ${appId ? 'AND app_id = ?' : ''} ${startDate ? 'AND created_at >= ?' : ''} ${endDate ? 'AND created_at <= ?' : ''}
      GROUP BY app_id, currency
    `).all(...refundParams);

    return {
      transactions: transactionStats,
      refunds: refundStats
    };
  }

  // 获取应用列表
  getAppIds() {
    const apps = this.db.prepare(`
      SELECT DISTINCT app_id
      FROM transactions
      WHERE app_id IS NOT NULL AND app_id != ''
      ORDER BY app_id
    `).all();

    return apps.map(a => a.app_id);
  }

  // 记录同步历史
  createSyncHistory(syncType) {
    const stmt = this.db.prepare(`
      INSERT INTO sync_history (sync_type, start_time, status)
      VALUES (?, ?, 'running')
    `);

    const result = stmt.run(syncType, Math.floor(Date.now() / 1000));
    return result.lastInsertRowid;
  }

  updateSyncHistory(id, status, recordsSynced, errorMessage = null) {
    const stmt = this.db.prepare(`
      UPDATE sync_history
      SET end_time = ?, status = ?, records_synced = ?, error_message = ?
      WHERE id = ?
    `);

    return stmt.run(
      Math.floor(Date.now() / 1000),
      status,
      recordsSynced,
      errorMessage,
      id
    );
  }

  // 获取最后同步时间
  getLastSyncTime(syncType) {
    const result = this.db.prepare(`
      SELECT MAX(end_time) as last_sync
      FROM sync_history
      WHERE sync_type = ? AND status = 'completed'
    `).get(syncType);

    return result?.last_sync || null;
  }

  close() {
    this.db.close();
  }
}

module.exports = new DatabaseService();

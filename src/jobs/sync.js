require('dotenv').config();
const cron = require('node-cron');
const stripeService = require('../services/stripe');
const db = require('../services/database');

class SyncScheduler {
  constructor() {
    this.isRunning = false;
    this.schedule = process.env.SYNC_CRON_SCHEDULE || '0 */6 * * *'; // 默认每6小时
  }

  start() {
    console.log(`\n📅 Sync scheduler started with schedule: ${this.schedule}`);
    console.log(`   Next sync will run according to cron schedule\n`);

    cron.schedule(this.schedule, async () => {
      if (this.isRunning) {
        console.log('⚠️  Previous sync still running, skipping this cycle');
        return;
      }

      this.isRunning = true;
      console.log(`\n⏰ Scheduled sync triggered at ${new Date().toISOString()}`);

      try {
        // 获取上次同步时间，从那时开始增量同步
        const lastSyncTime = db.getLastSyncTime('full_sync');
        const startDate = lastSyncTime ? new Date(lastSyncTime * 1000) : null;

        if (startDate) {
          console.log(`📊 Incremental sync from: ${startDate.toISOString()}`);
        } else {
          console.log('📊 Full sync (first time)');
        }

        await stripeService.fullSync(startDate);
        console.log('✅ Scheduled sync completed successfully\n');
      } catch (error) {
        console.error('❌ Scheduled sync failed:', error.message);
      } finally {
        this.isRunning = false;
      }
    });
  }

  // 手动触发同步
  async runNow() {
    if (this.isRunning) {
      console.log('⚠️  Sync already running');
      return false;
    }

    this.isRunning = true;
    try {
      await stripeService.fullSync();
      return true;
    } finally {
      this.isRunning = false;
    }
  }
}

// 如果直接运行此文件，执行一次性同步
if (require.main === module) {
  console.log('🚀 Running one-time sync...\n');

  stripeService.fullSync()
    .then(() => {
      console.log('\n✅ One-time sync completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ One-time sync failed:', err);
      process.exit(1);
    });
} else {
  // 作为模块导出
  module.exports = new SyncScheduler();
}

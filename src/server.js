require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const basicAuth = require('express-basic-auth');
const analyticsService = require('./services/analytics');
const stripeService = require('./services/stripe');
const syncScheduler = require('./jobs/sync');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// 认证中间件
const auth = basicAuth({
  users: {
    [process.env.AUTH_USERNAME || 'admin']: process.env.AUTH_PASSWORD || 'changeme'
  },
  challenge: true,
  realm: 'Stripe Analytics Dashboard',
  unauthorizedResponse: (req) => {
    return {
      success: false,
      error: 'Authentication required'
    };
  }
});

// Health check - 不需要认证
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// 所有其他路由都需要认证
app.use(auth);

app.use(express.static(path.join(__dirname, '../public')));

// API Routes

// 获取汇总统计
app.get('/api/stats/summary', (req, res) => {
  try {
    const { app_id, start_date, end_date } = req.query;
    const summary = analyticsService.getSummary(app_id, start_date, end_date);
    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Error getting summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取应用列表
app.get('/api/apps', (req, res) => {
  try {
    const apps = analyticsService.getApps();
    res.json({ success: true, data: apps });
  } catch (error) {
    console.error('Error getting apps:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取指定应用详情
app.get('/api/apps/:appId', (req, res) => {
  try {
    const { appId } = req.params;
    const { start_date, end_date } = req.query;
    const details = analyticsService.getAppDetails(appId, start_date, end_date);

    if (!details) {
      return res.status(404).json({ success: false, error: 'App not found or no data available' });
    }

    res.json({ success: true, data: details });
  } catch (error) {
    console.error('Error getting app details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 手动触发同步
app.post('/api/sync', async (req, res) => {
  try {
    const { start_date } = req.body;
    const startDate = start_date ? new Date(start_date) : null;

    // 异步执行同步，避免超时
    stripeService.fullSync(startDate).catch(err => {
      console.error('Sync error:', err);
    });

    res.json({
      success: true,
      message: 'Sync started in background. Check console for progress.'
    });
  } catch (error) {
    console.error('Error starting sync:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Stripe Analytics Server running on http://localhost:${PORT}`);
  console.log(`📊 Open http://localhost:${PORT} in your browser to view the dashboard\n`);

  // 启动定时同步任务
  syncScheduler.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down gracefully...');
  process.exit(0);
});

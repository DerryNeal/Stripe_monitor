# Stripe Analytics Dashboard

基于 Stripe metadata 的收支统计分析系统。支持多应用分别统计收入、手续费、退款等信息。

## ✨ 特性

- 📊 **多应用统计**: 通过 metadata 中的 `app_id` 区分不同应用的收支
- 💰 **完整财务数据**: 收入、手续费、退款、净收入一目了然
- 🔄 **自动同步**: 定时从 Stripe API 拉取最新数据
- 🎨 **可视化界面**: 简洁美观的 Web Dashboard
- 💾 **本地存储**: 使用 SQLite 存储数据，无需额外数据库
- 🌍 **多币种支持**: 自动识别和统计不同货币

## 📦 项目结构

```
stripe-analytics/
├── src/
│   ├── server.js              # Express 服务器主文件
│   ├── services/
│   │   ├── database.js        # SQLite 数据库服务
│   │   ├── stripe.js          # Stripe API 集成
│   │   └── analytics.js       # 统计分析逻辑
│   └── jobs/
│       └── sync.js            # 定时同步任务
├── public/
│   └── index.html             # Web 前端界面
├── data/
│   └── analytics.db           # SQLite 数据库（自动生成）
├── .env                       # 环境变量配置
├── .env.example               # 环境变量模板
└── package.json
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填入你的配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Stripe API Key (必填)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here

# 服务器端口（可选，默认 3000）
PORT=3000

# 定时同步时间（可选，默认每 6 小时）
# Cron 格式: 分 时 日 月 周
SYNC_CRON_SCHEDULE=0 */6 * * *

# 数据保留天数（可选，默认 90 天）
DATA_RETENTION_DAYS=90
```

### 3. 配置 Stripe Metadata

在你的两个程序中，所有 Stripe 支付操作都需要添加 metadata：

#### Charges API

```javascript
const charge = await stripe.charges.create({
  amount: 2000,
  currency: 'usd',
  source: 'tok_visa',
  metadata: {
    app_id: 'app1',  // 或 'app2'
    app_name: '我的应用 1'  // 可选
  }
});
```

#### Payment Intents API

```javascript
const paymentIntent = await stripe.paymentIntents.create({
  amount: 2000,
  currency: 'usd',
  metadata: {
    app_id: 'app1',
    app_name: '我的应用 1'
  }
});
```

### 4. 首次数据同步

启动服务器前，建议先执行一次手动同步：

```bash
npm run sync
```

这会从 Stripe 拉取所有历史数据（有 `app_id` metadata 的交易）。

### 5. 启动服务器

```bash
npm start
```

开发模式（自动重启）：

```bash
npm run dev
```

### 6. 访问 Dashboard

打开浏览器访问: `http://localhost:3000`

## 📖 使用说明

### Web Dashboard 功能

1. **应用筛选**: 选择查看特定应用或所有应用的统计
2. **日期筛选**: 选择时间范围查看特定期间的数据
3. **同步数据**: 点击"同步数据"按钮手动触发数据同步
4. **实时统计**:
   - 总收入
   - 手续费
   - 退款金额
   - 净收入（收入 - 手续费 - 退款）
   - 交易数量
   - 退款数量

### 定时同步

服务器启动后会自动按照 `.env` 中配置的时间定时同步数据。默认每 6 小时同步一次。

#### 修改同步频率

编辑 `.env` 中的 `SYNC_CRON_SCHEDULE`：

```env
# 每小时同步
SYNC_CRON_SCHEDULE=0 */1 * * *

# 每天凌晨 2 点同步
SYNC_CRON_SCHEDULE=0 2 * * *

# 每 30 分钟同步
SYNC_CRON_SCHEDULE=*/30 * * * *
```

Cron 格式说明：
```
┌───────────── 分钟 (0 - 59)
│ ┌───────────── 小时 (0 - 23)
│ │ ┌───────────── 日期 (1 - 31)
│ │ │ ┌───────────── 月份 (1 - 12)
│ │ │ │ ┌───────────── 星期 (0 - 6) (0 是周日)
│ │ │ │ │
* * * * *
```

### API 接口

#### 获取统计摘要

```http
GET /api/stats/summary?app_id=app1&start_date=2024-01-01&end_date=2024-12-31
```

参数（均可选）：
- `app_id`: 应用 ID
- `start_date`: 开始日期（YYYY-MM-DD）
- `end_date`: 结束日期（YYYY-MM-DD）

#### 获取应用列表

```http
GET /api/apps
```

#### 获取单个应用详情

```http
GET /api/apps/:appId?start_date=2024-01-01&end_date=2024-12-31
```

#### 手动触发同步

```http
POST /api/sync
Content-Type: application/json

{
  "start_date": "2024-01-01"  // 可选，从指定日期开始同步
}
```

## 🔧 常见问题

### Q: 为什么看不到数据？

A: 请确保：
1. 已经运行过 `npm run sync` 进行首次数据同步
2. 你的 Stripe 交易中包含 `metadata.app_id` 字段
3. Stripe API Key 配置正确

### Q: 如何给现有交易添加 metadata？

A: Stripe 不支持修改已创建交易的 metadata。建议从现在开始在新交易中添加 metadata。历史数据可以通过其他字段（如 customer_id, description）来区分。

### Q: 手续费为什么显示 0？

A: 确保同步时展开了 `balance_transaction` 字段。程序已自动处理，如果仍显示 0，可能是测试模式下的交易。

### Q: 支持实时数据吗？

A: 当前使用定时同步方式。虽然 Stripe 提供 webhook，但 webhook 不适合用于统计（因为可能丢失或重复）。建议根据需要调整同步频率。

### Q: 数据存储在哪里？

A: 数据存储在 `data/analytics.db` SQLite 数据库文件中。可以使用任何 SQLite 客户端查看。

## 🛠️ 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite + better-sqlite3
- **Stripe**: stripe npm package
- **定时任务**: node-cron
- **前端**: 原生 HTML/CSS/JavaScript

## 📝 License

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## ⚠️ 注意事项

1. **API Key 安全**:
   - 不要将 `.env` 文件提交到 git
   - 生产环境使用 `sk_live_` 开头的 Live Key
   - 确保服务器有适当的访问控制

2. **Stripe API 限制**:
   - 注意 Stripe API 的调用频率限制
   - 大量数据同步可能需要较长时间

3. **数据备份**:
   - 定期备份 `data/analytics.db` 文件
   - 重要数据建议额外存储

4. **Metadata 规范**:
   - 建议在两个应用中使用统一的 `app_id` 命名规则
   - 如 `app1`, `app2` 或 `my_app_name_1`, `my_app_name_2`

## 📞 支持

如有问题，请提交 GitHub Issue。

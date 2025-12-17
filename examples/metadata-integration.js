/**
 * Stripe Metadata 集成示例
 *
 * 在你的两个应用中添加这样的 metadata 配置，
 * 以便统计程序能够区分不同应用的收支
 */

// ============================================
// 示例 1: 使用 Charges API (旧版)
// ============================================

const stripe = require('stripe')('sk_test_...');

async function createCharge() {
  try {
    const charge = await stripe.charges.create({
      amount: 2000, // $20.00
      currency: 'usd',
      source: 'tok_visa', // 测试 token
      description: 'Example charge',

      // 关键: 添加 metadata
      metadata: {
        app_id: 'app1',           // 必填: 应用标识
        app_name: 'My App 1',     // 可选: 应用名称
        // 你还可以添加其他自定义字段
        user_id: '12345',
        order_id: 'ORD-001'
      }
    });

    console.log('Charge created:', charge.id);
    return charge;
  } catch (error) {
    console.error('Error creating charge:', error);
  }
}

// ============================================
// 示例 2: 使用 Payment Intents API (推荐)
// ============================================

async function createPaymentIntent() {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 5000, // $50.00
      currency: 'usd',
      payment_method_types: ['card'],
      description: 'Example payment',

      // 关键: 添加 metadata
      metadata: {
        app_id: 'app2',           // 必填: 应用标识
        app_name: 'My App 2',     // 可选: 应用名称
        environment: 'production',
        user_email: 'user@example.com'
      }
    });

    console.log('PaymentIntent created:', paymentIntent.id);
    return paymentIntent;
  } catch (error) {
    console.error('Error creating payment intent:', error);
  }
}

// ============================================
// 示例 3: Express 路由集成
// ============================================

const express = require('express');
const app = express();

app.post('/api/create-payment', async (req, res) => {
  const { amount, currency, userId } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata: {
        app_id: process.env.APP_ID || 'app1',  // 从环境变量读取
        app_name: process.env.APP_NAME || 'My Application',
        user_id: userId,
        created_at: new Date().toISOString()
      }
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// 示例 4: Subscription (订阅) 中使用
// ============================================

async function createSubscription(customerId, priceId) {
  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],

      // Subscription 本身的 metadata
      metadata: {
        app_id: 'app1',
        app_name: 'Subscription App',
        plan_type: 'premium'
      }
    });

    console.log('Subscription created:', subscription.id);
    return subscription;
  } catch (error) {
    console.error('Error creating subscription:', error);
  }
}

// ============================================
// 示例 5: 使用 Stripe Checkout
// ============================================

async function createCheckoutSession() {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'T-shirt',
            },
            unit_amount: 2000,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',

      // Payment Intent 的 metadata
      payment_intent_data: {
        metadata: {
          app_id: 'app1',
          app_name: 'E-commerce App',
          session_type: 'checkout'
        }
      }
    });

    return session;
  } catch (error) {
    console.error('Error creating checkout session:', error);
  }
}

// ============================================
// 重要提示
// ============================================

/**
 * 1. app_id 命名规范:
 *    - 使用简单的字符串标识: 'app1', 'app2'
 *    - 或使用描述性名称: 'ecommerce', 'saas_platform'
 *    - 保持一致性，在同一个应用中始终使用相同的 app_id
 *
 * 2. Metadata 限制:
 *    - 最多 50 个键值对
 *    - 键最长 40 字符
 *    - 值最长 500 字符
 *    - 总大小不超过 50KB
 *
 * 3. 最佳实践:
 *    - 在应用启动时从环境变量读取 APP_ID
 *    - 为所有支付操作添加统一的 metadata
 *    - 记录足够的信息以便后续分析
 *    - 不要在 metadata 中存储敏感信息
 *
 * 4. 测试建议:
 *    - 创建测试支付后，检查 Stripe Dashboard 中的 metadata
 *    - 确保 app_id 正确显示
 *    - 运行 npm run sync 验证数据能被正确拉取
 */

module.exports = {
  createCharge,
  createPaymentIntent,
  createSubscription,
  createCheckoutSession
};

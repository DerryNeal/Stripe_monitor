require('dotenv').config();
const Stripe = require('stripe');
const db = require('./database');

class StripeService {
  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is required in .env file');
    }
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  // 从 Stripe 对象中提取 app_id
  extractAppId(stripeObject) {
    return stripeObject.metadata?.app_id || null;
  }

  // 同步 Charges（支付成功的交易）
  async syncCharges(startDate = null) {
    console.log('Syncing charges...');
    const syncId = db.createSyncHistory('charges');

    try {
      const params = {
        limit: 100,
        expand: ['data.balance_transaction']
      };

      // 如果有起始日期，使用它
      if (startDate) {
        params.created = { gte: Math.floor(startDate / 1000) };
      }

      let hasMore = true;
      let startingAfter = null;
      let totalSynced = 0;

      while (hasMore) {
        if (startingAfter) {
          params.starting_after = startingAfter;
        }

        const charges = await this.stripe.charges.list(params);

        const transactions = charges.data
          .filter(charge => this.extractAppId(charge)) // 只处理有 app_id 的交易
          .map(charge => ({
            id: charge.id,
            app_id: this.extractAppId(charge),
            type: 'charge',
            amount: charge.amount,
            currency: charge.currency,
            fee: charge.balance_transaction?.fee || 0,
            net: charge.balance_transaction?.net || charge.amount,
            status: charge.status,
            customer_id: charge.customer,
            description: charge.description,
            created_at: charge.created,
            metadata: charge.metadata
          }));

        if (transactions.length > 0) {
          db.batchUpsertTransactions(transactions);
          totalSynced += transactions.length;
        }

        hasMore = charges.has_more;
        if (hasMore && charges.data.length > 0) {
          startingAfter = charges.data[charges.data.length - 1].id;
        }

        console.log(`Synced ${totalSynced} charges so far...`);
      }

      db.updateSyncHistory(syncId, 'completed', totalSynced);
      console.log(`Charges sync completed. Total: ${totalSynced}`);
      return totalSynced;

    } catch (error) {
      console.error('Error syncing charges:', error.message);
      db.updateSyncHistory(syncId, 'failed', 0, error.message);
      throw error;
    }
  }

  // 同步 PaymentIntents（现代支付方式）
  async syncPaymentIntents(startDate = null) {
    console.log('Syncing payment intents...');
    const syncId = db.createSyncHistory('payment_intents');

    try {
      const params = {
        limit: 100
      };

      if (startDate) {
        params.created = { gte: Math.floor(startDate / 1000) };
      }

      let hasMore = true;
      let startingAfter = null;
      let totalSynced = 0;

      while (hasMore) {
        if (startingAfter) {
          params.starting_after = startingAfter;
        }

        const paymentIntents = await this.stripe.paymentIntents.list(params);

        const transactions = paymentIntents.data
          .filter(pi => pi.status === 'succeeded' && this.extractAppId(pi))
          .map(pi => {
            // 获取最新的 charge
            const latestCharge = pi.latest_charge;
            let fee = 0;
            let net = pi.amount;

            // 如果有 charge 且已展开，获取 fee 信息
            if (latestCharge && typeof latestCharge === 'object') {
              fee = latestCharge.balance_transaction?.fee || 0;
              net = latestCharge.balance_transaction?.net || pi.amount;
            }

            return {
              id: pi.id,
              app_id: this.extractAppId(pi),
              type: 'payment_intent',
              amount: pi.amount,
              currency: pi.currency,
              fee: fee,
              net: net,
              status: pi.status,
              customer_id: pi.customer,
              description: pi.description,
              created_at: pi.created,
              metadata: pi.metadata
            };
          });

        if (transactions.length > 0) {
          db.batchUpsertTransactions(transactions);
          totalSynced += transactions.length;
        }

        hasMore = paymentIntents.has_more;
        if (hasMore && paymentIntents.data.length > 0) {
          startingAfter = paymentIntents.data[paymentIntents.data.length - 1].id;
        }

        console.log(`Synced ${totalSynced} payment intents so far...`);
      }

      db.updateSyncHistory(syncId, 'completed', totalSynced);
      console.log(`Payment intents sync completed. Total: ${totalSynced}`);
      return totalSynced;

    } catch (error) {
      console.error('Error syncing payment intents:', error.message);
      db.updateSyncHistory(syncId, 'failed', 0, error.message);
      throw error;
    }
  }

  // 同步 Refunds（退款）
  async syncRefunds(startDate = null) {
    console.log('Syncing refunds...');
    const syncId = db.createSyncHistory('refunds');

    try {
      const params = {
        limit: 100
      };

      if (startDate) {
        params.created = { gte: Math.floor(startDate / 1000) };
      }

      let hasMore = true;
      let startingAfter = null;
      let totalSynced = 0;

      while (hasMore) {
        if (startingAfter) {
          params.starting_after = startingAfter;
        }

        const refunds = await this.stripe.refunds.list(params);

        // 需要获取每个 refund 对应的 charge 来获取 app_id
        const refundData = [];

        for (const refund of refunds.data) {
          try {
            // 获取关联的 charge 以获得 app_id
            const charge = await this.stripe.charges.retrieve(refund.charge);
            const appId = this.extractAppId(charge);

            if (appId) {
              refundData.push({
                id: refund.id,
                charge_id: refund.charge,
                app_id: appId,
                amount: refund.amount,
                currency: refund.currency,
                status: refund.status,
                reason: refund.reason,
                created_at: refund.created,
                metadata: refund.metadata
              });
            }
          } catch (err) {
            console.error(`Error fetching charge for refund ${refund.id}:`, err.message);
          }
        }

        if (refundData.length > 0) {
          db.batchUpsertRefunds(refundData);
          totalSynced += refundData.length;
        }

        hasMore = refunds.has_more;
        if (hasMore && refunds.data.length > 0) {
          startingAfter = refunds.data[refunds.data.length - 1].id;
        }

        console.log(`Synced ${totalSynced} refunds so far...`);
      }

      db.updateSyncHistory(syncId, 'completed', totalSynced);
      console.log(`Refunds sync completed. Total: ${totalSynced}`);
      return totalSynced;

    } catch (error) {
      console.error('Error syncing refunds:', error.message);
      db.updateSyncHistory(syncId, 'failed', 0, error.message);
      throw error;
    }
  }

  // 同步 Checkout Sessions（WHMCS 使用的方式）
  async syncCheckoutSessions(startDate = null) {
    console.log('Syncing checkout sessions...');
    const syncId = db.createSyncHistory('checkout_sessions');

    try {
      const params = {
        limit: 100,
        expand: [
          'data.payment_intent',
          'data.payment_intent.latest_charge',
          'data.payment_intent.latest_charge.balance_transaction'
        ]
      };

      if (startDate) {
        params.created = { gte: Math.floor(startDate / 1000) };
      }

      let hasMore = true;
      let startingAfter = null;
      let totalSynced = 0;

      while (hasMore) {
        if (startingAfter) {
          params.starting_after = startingAfter;
        }

        const sessions = await this.stripe.checkout.sessions.list(params);

        const transactions = [];

        for (const session of sessions.data) {
          // 只处理已支付的 session，且有 app_id metadata
          if (session.payment_status === 'paid' && session.metadata?.app_id) {
            const paymentIntent = session.payment_intent;

            // 如果 payment_intent 是字符串，需要展开获取
            let amount = 0;
            let fee = 0;
            let net = 0;
            let currency = session.currency;
            let chargeId = session.id;

            if (typeof paymentIntent === 'object' && paymentIntent !== null) {
              amount = paymentIntent.amount;
              currency = paymentIntent.currency;
              chargeId = paymentIntent.id;

              // 尝试从 latest_charge 获取费用信息
              let latestCharge = paymentIntent.latest_charge;

              // 如果 latest_charge 是字符串 ID，需要展开
              if (typeof latestCharge === 'string') {
                try {
                  latestCharge = await this.stripe.charges.retrieve(latestCharge, {
                    expand: ['balance_transaction']
                  });
                } catch (err) {
                  console.error(`Failed to retrieve charge ${latestCharge}:`, err.message);
                }
              }

              if (typeof latestCharge === 'object' && latestCharge !== null) {
                let balanceTransaction = latestCharge.balance_transaction;

                // 如果 balance_transaction 是字符串 ID，需要展开
                if (typeof balanceTransaction === 'string') {
                  try {
                    balanceTransaction = await this.stripe.balanceTransactions.retrieve(balanceTransaction);
                  } catch (err) {
                    console.error(`Failed to retrieve balance transaction ${balanceTransaction}:`, err.message);
                  }
                }

                if (typeof balanceTransaction === 'object' && balanceTransaction !== null) {
                  // balance_transaction 的 fee 和 net 使用结算货币（如 GBP）
                  // 需要将其转换为交易货币，或者单独存储
                  // 这里我们将 fee 和 net 按比例转换为交易货币
                  const settlementCurrency = balanceTransaction.currency;
                  const settlementAmount = balanceTransaction.amount;
                  const settlementFee = balanceTransaction.fee || 0;
                  const settlementNet = balanceTransaction.net || 0;

                  // 计算转换比例: 交易金额 / 结算金额
                  const conversionRate = settlementAmount > 0 ? amount / settlementAmount : 1;

                  // 将 fee 和 net 转换为交易货币
                  fee = Math.round(settlementFee * conversionRate);
                  net = Math.round(settlementNet * conversionRate);

                  console.log(`Balance conversion: ${settlementFee} ${settlementCurrency} fee = ${fee} ${currency} (rate: ${conversionRate.toFixed(4)})`);
                } else {
                  net = amount;
                }
              } else {
                net = amount;
              }
            } else {
              // 如果没有展开，使用 session 中的金额
              amount = session.amount_total || 0;
              net = amount;
            }

            transactions.push({
              id: chargeId,
              app_id: session.metadata.app_id,
              type: 'checkout_session',
              amount: amount,
              currency: currency,
              fee: fee,
              net: net,
              status: 'succeeded',
              customer_id: session.customer,
              description: session.metadata.invoice_id ? `Invoice #${session.metadata.invoice_id}` : null,
              created_at: session.created,
              metadata: session.metadata
            });
          }
        }

        if (transactions.length > 0) {
          db.batchUpsertTransactions(transactions);
          totalSynced += transactions.length;
        }

        hasMore = sessions.has_more;
        if (hasMore && sessions.data.length > 0) {
          startingAfter = sessions.data[sessions.data.length - 1].id;
        }

        console.log(`Synced ${totalSynced} checkout sessions so far...`);
      }

      db.updateSyncHistory(syncId, 'completed', totalSynced);
      console.log(`Checkout sessions sync completed. Total: ${totalSynced}`);
      return totalSynced;

    } catch (error) {
      console.error('Error syncing checkout sessions:', error.message);
      db.updateSyncHistory(syncId, 'failed', 0, error.message);
      throw error;
    }
  }

  // 执行完整同步
  async fullSync(startDate = null) {
    console.log('Starting full sync...');
    const startTime = Date.now();

    try {
      const checkoutSessionsCount = await this.syncCheckoutSessions(startDate);
      const chargesCount = await this.syncCharges(startDate);
      const paymentIntentsCount = await this.syncPaymentIntents(startDate);
      const refundsCount = await this.syncRefunds(startDate);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\nFull sync completed in ${duration}s`);
      console.log(`- Checkout Sessions: ${checkoutSessionsCount}`);
      console.log(`- Charges: ${chargesCount}`);
      console.log(`- Payment Intents: ${paymentIntentsCount}`);
      console.log(`- Refunds: ${refundsCount}`);

      return {
        checkoutSessions: checkoutSessionsCount,
        charges: chargesCount,
        paymentIntents: paymentIntentsCount,
        refunds: refundsCount,
        duration
      };
    } catch (error) {
      console.error('Full sync failed:', error);
      throw error;
    }
  }
}

module.exports = new StripeService();

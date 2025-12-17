#!/bin/bash

# Stripe Analytics 快速启动脚本

echo "======================================="
echo "  Stripe Analytics Dashboard Setup"
echo "======================================="
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"
echo ""

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "⚠️  未找到 .env 文件"
    echo "📝 正在从 .env.example 创建 .env..."
    cp .env.example .env
    echo ""
    echo "⚠️  请编辑 .env 文件并填入你的 Stripe API Key:"
    echo "   nano .env"
    echo ""
    echo "按回车键继续安装依赖..."
    read
else
    echo "✅ .env 文件已存在"
    echo ""
fi

# 安装依赖
echo "📦 正在安装依赖包..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi

echo ""
echo "✅ 依赖安装完成"
echo ""

# 检查 Stripe Key
if grep -q "sk_test_your_stripe_secret_key_here" .env; then
    echo "⚠️  警告: 你的 .env 文件中还是示例的 Stripe API Key"
    echo "   请先配置正确的 API Key，然后运行:"
    echo ""
    echo "   npm run sync    # 同步历史数据"
    echo "   npm start       # 启动服务器"
    echo ""
else
    echo "======================================="
    echo "  安装完成！"
    echo "======================================="
    echo ""
    echo "接下来的步骤:"
    echo ""
    echo "1. 首次同步数据（可选但推荐）:"
    echo "   npm run sync"
    echo ""
    echo "2. 启动服务器:"
    echo "   npm start"
    echo ""
    echo "3. 打开浏览器访问:"
    echo "   http://localhost:3000"
    echo ""
    echo "======================================="
fi

# Orchestra 安装指南

**版本**: v1.0.0  
**最后更新**: 2026-04-04

---

## 🚀 快速安装

### 方式 1：从 GitHub 安装（推荐）

```bash
# 克隆仓库
git clone https://github.com/openclaw/orchestra.git
cd orchestra

# 安装依赖
npm install
```

### 方式 2：从 npm 安装（待发布）

```bash
npm install orchestra
```

---

## 🔧 配置环境变量

Orchestra 需要配置 AI API Key 才能工作。

### 1. 获取 API Key

**推荐**：阿里云百炼（通义千问）
- 访问：https://bailian.console.aliyun.com/
- 注册/登录账号
- 创建 API Key
- 复制 Key

### 2. 设置环境变量

**Linux/macOS**：
```bash
export ORCHESTRA_API_KEY="sk-你的 API Key"
export ORCHESTRA_MODEL="qwen3.5-plus"

# 永久生效（添加到 ~/.bashrc 或 ~/.zshrc）
echo 'export ORCHESTRA_API_KEY="sk-xxx"' >> ~/.bashrc
echo 'export ORCHESTRA_MODEL="qwen3.5-plus"' >> ~/.bashrc
source ~/.bashrc
```

**Windows**：
```cmd
setx ORCHESTRA_API_KEY "sk-你的 API Key"
setx ORCHESTRA_MODEL "qwen3.5-plus"
```

**或使用 .env 文件**：
```bash
# 创建 .env 文件
cat > .env << EOF
ORCHESTRA_API_KEY=sk-你的 API Key
ORCHESTRA_MODEL=qwen3.5-plus
EOF
```

---

## ✅ 验证安装

### 1. 测试模块加载

```bash
cd orchestra
node -e "const Orchestra = require('./index.js'); console.log('✅ 加载成功')"
```

### 2. 运行测试脚本

```bash
# 运行全模块测试
node test-all.js

# 运行快速测试
node test-quick.js
```

### 3. 测试 AI 调用

```bash
# 测试真实 AI 调用（需要 API Key）
node test-real-ai.js
```

---

## 📖 使用示例

### 基础用法

```javascript
const Orchestra = require('./index.js');

// 创建实例
const orchestra = new Orchestra({
  model: 'qwen3.5-plus',
  verbose: true,
  maxConcurrent: 3
});

// 执行任务
const result = await orchestra.run('设计一个抽卡系统');
console.log(result);
```

### 使用 Gateway（推荐）

```javascript
const { Gateway } = require('./index.js');

const gateway = new Gateway({
  model: 'qwen3.5-plus',
  verbose: true,
  maxConcurrent: 5,
  timeout: 3600000  // 1 小时
});

// 执行工作流
const result = await gateway.execute({
  task: '设计一个宠物养成系统',
  agents: ['AI 主策划', 'AI 数值策划', 'AI 系统策划']
});
```

---

## 📋 依赖说明

### 必需依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `ws` | ^8.20.0 | WebSocket 支持 |
| `openclaw` | >=1.0.0 | OpenClaw API（peerDependency） |

### 开发依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `typescript` | ^5.3.2 | 类型定义（可选） |
| `ts-node` | ^10.9.1 | TypeScript 运行（可选） |
| `jest` | ^29.7.0 | 单元测试 |

---

## 🔍 故障排查

### 问题 1：模块加载失败

**错误**：`Cannot find module 'orchestra'`

**解决**：
```bash
# 检查是否在正确的目录
ls -la index.js

# 重新安装依赖
npm install
```

### 问题 2：API Key 未配置

**错误**：`未配置 API Key`

**解决**：
```bash
# 检查环境变量
echo $ORCHESTRA_API_KEY

# 设置环境变量
export ORCHESTRA_API_KEY="sk-xxx"
```

### 问题 3：依赖安装失败

**错误**：`npm install` 失败

**解决**：
```bash
# 清理缓存
npm cache clean --force

# 删除 node_modules
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

---

## 📚 下一步

- [README.md](./README.md) - 完整文档
- [USAGE.md](./USAGE.md) - 使用指南
- [QUICKSTART.md](./QUICKSTART.md) - 快速开始
- [examples/](./examples/) - 示例代码

---

## 🆘 获取帮助

- **GitHub Issues**: https://github.com/openclaw/orchestra/issues
- **文档**: https://github.com/openclaw/orchestra#readme

---

**Made with ❤️ for OpenClaw Community**

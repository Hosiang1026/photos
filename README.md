# photos

博客图床 / 静态相册。向 `resources/` 下相册目录放入图片，`tool.js` 扫描生成 `photos.json`，前端读取展示；推送到 `source` 分支后由 GitHub Actions 部署到 Pages（`master`）。

作者：[吉祥草](https://www.hosiang.cn)（狂欢马克思）  
仓库：`Hosiang1026/photos`

## 调用链

```
本地：npm i →（加密相册先 encrypt）→ node tool.js
  扫描 resources/ 子目录（相册）
  → 写 resources/photos.json
  → 前端 fetch photos.json → 相册列表 / 详情 / 灯箱

CI（push source / workflow_dispatch）
  checkout → npm ci → node tool.js
  → 发布 ./resources → 分支 master
```

## 目录

| 路径 | 作用 |
| ---- | ---- |
| `tool.js` | 扫描相册目录，生成 `resources/photos.json` |
| `encrypt-album.js` | 加密相册：明文图 → `.enc` + `.crypto.json` |
| `package.json` | `npm test` / `npm run build` = `node tool.js`；`npm run encrypt` 加密 diary |
| `resources/` | GitHub Pages 发布根目录 |
| `resources/index.html` | 相册列表 |
| `resources/album.html` | 相册详情 |
| `resources/app.js` / `app.css` | 前端逻辑与样式 |
| `resources/photos.json` | 相册索引（由 `tool.js` 生成） |
| `resources/image/` | 日常生活 |
| `resources/picture/` | 文字配图 |
| `resources/system/` | 网站图片 |
| `resources/diary/` | 加密相册（只提交 `.enc` 与 `.crypto.json`） |
| `.github/workflows/deploy.yml` | `source` → 生成 JSON → 部署 `master` |

---

## 加密相册（原图加密）

仓库公开，加密相册**不能**提交明文原图。流程：本地用密码加密 → 只提交乱码文件 → 网页输对密码后浏览器解密显示。

### 步骤

1. 把原图放进 `resources/diary/`（明文，勿提交）
2. 加密（会生成 `.enc`，并可用 `--remove` 删明文）：

```bash
npm i
node encrypt-album.js --dir resources/diary --password 你的密码 --remove
```

或：

```bash
npm run encrypt -- --password 你的密码
```

（`npm run encrypt` 已带 `--dir resources/diary --remove`）

3. 生成索引并检查：

```bash
node tool.js
```

4. 提交并推送 `source`（确保没有明文 jpg/png 等）

### 产物

| 文件 | 说明 |
| ---- | ---- |
| `resources/diary/*.enc` | 加密后的图片（可提交） |
| `resources/diary/.crypto.json` | salt / 校验信息（可提交，不含密码明文） |
| 明文原图 | 加密后删除；已被 `.gitignore` 忽略 |

### 网页使用

- 列表页加密相册封面为锁；点开需输入加密时的密码
- 密码正确：会话内解锁，封面与详情图解密显示
- 密码错误：无法解密

### 追加图片

1. 再把新原图放入 `resources/diary/`
2. 用**同一密码**再跑一遍 `encrypt-album.js`（已有 `.crypto.json` 时密码必须一致）
3. `node tool.js` 后提交 `.enc`

### 注意

- 密码只在你本地使用，不要写进仓库 / CI Secrets
- 当前密码为你本地设定的值；改密码需用新密码重新加密全部图片
- 若明文曾推送过 Git，需清理历史，否则旧提交仍可看到原图

---

## 相册扫描（tool.js）

- 列出 `resources/` 下子目录为相册
- 显示名优先 `albumNameMap`，否则用目录名

| 目录名 | 显示名 |
| ------ | ------ |
| `image` | 日常生活 |
| `picture` | 文字配图 |
| `system` | 网站图片 |
| `diary` | 加密相册 |

- 名称含「密」或存在 `.crypto.json` → 加密相册：只收录 `.enc`，写入 `encrypted` + `crypto`
- 普通相册：只收录图片，忽略 `.enc`
- `thumbnail` 形如 `/photos/<目录>/<文件名>`

---

## 本地使用

```bash
npm ci
# 普通相册：图片放入 resources/<目录>/
# 加密相册：见上方「加密相册」
node tool.js
# 静态服务打开 resources/（如 npx serve resources）
```

---

## 部署

| 项 | 值 |
| -- | -- |
| 触发 | `push` → `source`，或 `workflow_dispatch` |
| 生成 | `node tool.js` |
| 发布目录 | `./resources` |
| 发布分支 | `master` |

工作流：`.github/workflows/deploy.yml`。

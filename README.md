# Stella 的数学工作台

纯前端单页应用，双击 `index.html` 就能用；数据默认只存在本机，可选接入 Supabase 在设备之间同步。

---

## 一、打开

- 直接双击 `index.html`（`file://`）即可，不需要装任何东西、不需要联网。
- 想放到手机/另一台电脑随手打开：见下面「四、部署到 GitHub Pages」。

## 二、数据存在哪

| 层 | 位置 | 作用 |
| --- | --- | --- |
| 主存 | `localStorage` · `stella_math_workbench_v1` | 每次改动立刻写入，刷新不丢 |
| 冗余 | `IndexedDB` · `stella_wb / kv / db` | localStorage 被清、容量写满时兜底，重开后自动找回 |
| 云端（可选） | Supabase 表 `wb_snapshots` | 一个账号一行，存整份数据，多设备同步 |

**只要不填 Supabase，就是纯本地模式**：数据不上传任何服务器。顶栏会显示虚线的「仅本地」，设置页也会写明。

## 三、开启云端同步（三步）

1. 打开 [supabase.com](https://supabase.com) 新建一个免费项目。
2. 左侧 **SQL Editor** → 粘贴 [`supabase/schema.sql`](supabase/schema.sql) 全文 → **Run**。
   （也可以在「设置 → 云端同步 → 建表 SQL」里点「复制 SQL」。）
3. 项目 **Settings → API** 复制 **Project URL** 和 **anon public key**，连同邮箱密码填进「设置 → 云端同步」→ 点「登录并开启同步」。

> 账号：点「注册新账号」，或到 Supabase → **Authentication → Users → Add user**（勾 Auto Confirm 可免邮箱验证）。
> 自己一个人用的话，建议在 Authentication → Providers → Email 里关掉 *Enable sign-ups*，避免别人注册。

之后：

- 顶栏出现绿色 **已同步 · 22:14**，改动约 1 秒后自动上传；
- 另一台电脑填同一组 URL / key / 账号登录即可看到全部数据；
- 新电脑第一次登录会**自动以云端为准**；如果这台电脑本来就有内容，会弹窗让你选保留哪一边；
- 两台设备都改过时**不会自动覆盖**，会停在橙色「待合并」，点开选择保留哪一边，可先导出本机备份。

## 四、换一台电脑（或手机）怎么登录

云端项目只需在**老电脑上配置一次**，新电脑不用再建项目、不用再跑 SQL，只要把「地址 + 钥匙 + 账号」填一遍。

**① 先把工作台放到那台电脑**

- 推荐：按下一节部署到 GitHub Pages，新电脑直接用同一个链接打开（手机也一样）。
- 或者：把整个文件夹（AirDrop / U 盘 / iCloud）拷过去，双击 `index.html`。
- ⚠️ 一台电脑固定用一种方式（都用链接，或都用双击），不要混着用。

**② 打开 → 设置 → 云端同步**

- **Project URL** 与 **anon public key** 填**同一个** Supabase 项目的（Settings → API 里能再复制一次）。
  > 这两栏存在**本机浏览器**里，不会跟着云端同步——因为登录前就要用到它，所以新电脑必须手填一次。
- 设备名改成比如 `MacBook · Safari`，方便在冲突弹窗里认出是哪台改的。
- **登录邮箱 + 密码** 填老电脑上那套 → 点 **「登录并开启同步」**。

**③ 第一次登录会发生什么**

| 新电脑的状态 | 结果 |
| --- | --- |
| 全新打开、没动过数据 | 提示「已把云端数据同步到本机」，**自动以云端为准**，不用选 |
| 已经建过学生/班级，或先改过东西 | 弹「云端已有数据，保留哪一边？」→ 选 **「用云端覆盖本机」** |
| 云端还没有数据 | 把本机数据上传上去（`push-init`） |

**④ 确认接上了**

- 顶栏右侧的标记从虚线 **仅本地 / 未登录** 变成绿色 **已同步 · 时:分**；
- 设置页「云端同步」卡片右上角徽标同步变成 **已同步**；
- 对一下学生数、班级数、试卷分析条数是不是老电脑上的数量。

**⑤ 以后换机前的小习惯**

- 老电脑改完，看一眼顶栏确认是绿色**已同步**（不是「同步中」「离线」「待合并」），等 1~2 秒再关页面；
- 新电脑登录成功、数据拉下来之后再开始改，避免两边同时改触发「待合并」；
- 只想在这台机器上用、不想上传：点 **「退出登录」**，顶栏会回到虚线「仅本地」，数据仍全部留在本机。

## 五、部署到 GitHub Pages（可选）

```bash
git init && git add . && git commit -m "workbench"
git remote add origin git@github.com:<你的用户名>/<仓库名>.git
git push -u origin main
```

仓库 **Settings → Pages** → Source 选 `main` / `root` → 保存，几十秒后得到 `https://<用户名>.github.io/<仓库名>/`。

> ⚠️ `file://` 与 `https://` 是**两个不同的浏览器源**，本地缓存各自独立。同一台电脑建议固定用一种方式打开，否则会出现两个副本靠云端合并的情况。

## 六、常见问题

| 现象 | 处理 |
| --- | --- |
| 提示「云端还没有建表」 | 没执行 `supabase/schema.sql`，去 SQL Editor 跑一遍 |
| 提示「邮箱还没验证」 | 到邮箱点确认链接，或在 Supabase 关闭 *Confirm email* |
| 提示「网络不可达」 | 检查网络；公司/校园网可能拦截 `*.supabase.co` |
| 提示「本地存储空间不足」 | 图片太多：导出一份 JSON 备份后删掉旧的试卷截图（IndexedDB 里仍有副本，但同步需要能序列化） |
| 同步一直「待合并」 | 两台设备都改过，选一份保留即可；不确定就先「导出本机备份」 |
| 新电脑登录后还是空的 | 先看顶栏是不是「已同步」；仍是「未登录」说明密码没填/没点登录。登录成功却为空，多半是云端那条快照还没上传过——回老电脑确认顶栏是绿色「已同步」 |
| 密码忘了 | 工作台没有「找回密码」入口。到 Supabase → **Authentication → Users**，找到那个邮箱点重置密码。注意：**别新建一个用户来代替它**，云端数据是按 user_id 隔离的，新用户看到的是一份空库 |
| 关掉浏览器再打开数据没了 | 到「设置 → 本地数据」看大小是否为 0；若 localStorage 被清，重开时会自动从 IndexedDB 恢复 |

## 七、目录

```
index.html                 入口
assets/css/style.css       全部样式
assets/js/
  store.js                 数据模型 / localStorage + IndexedDB
  idb.js                   IndexedDB 冗余缓存
  sync.js                  Supabase 同步（Auth + REST）
  xlsx.js                  Excel/CSV 解析、下载、Word 导出
  ui.js  charts.js  md.js  组件 / 图表 / Markdown
  ai.js                    可选的 AI 接口（不填也能用）
  paperio.js               试卷分析结果解析
  kb.js                    课程体系 × 知识点库
  page-*.js                9 个页面
supabase/schema.sql        建表脚本
```
